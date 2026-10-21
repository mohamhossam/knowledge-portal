#!/usr/bin/env node
/**
 * Brand lint (redesign Phase 7, CLAUDE.md § Redesign epic): colours live in
 * the token layers only.
 *
 * Fails when
 *   - a raw colour (hex — with or without "#" in scripts —, rgb(), hsl(),
 *     oklch(), lab(), lch(), color(), or a named colour in a CSS value)
 *     appears outside the token files, or
 *   - an e& primitive (`--eand-*`) is read outside the semantic layer, or
 *     declared outside the primitive layer, or
 *   - a colour-valued primitive token is read outside the semantic layer,
 *     so a component cannot reach `--rust-600` around the semantic names.
 *
 * A ratchet for the legacy screens: `brand-lint-legacy.json` lists the files
 * that already had raw colours when the lint arrived, with their count. Such
 * a file may only go down; any other file must have none. Phase 8 removes
 * files from the list as their areas are rebuilt; Phase 9 empties it.
 *
 *   node scripts/brand-lint.mjs            check
 *   node scripts/brand-lint.mjs --update   rewrite the legacy list (counts may only fall)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const legacyPath = join(root, "scripts", "brand-lint-legacy.json");

/** The only files that may hold raw colour values: the primitive layer, and
 * the document exports' frozen copy of it (Word and rasterised SVG cannot
 * read CSS custom properties). */
const TOKEN_FILES = new Set(["src/design/tokens/primitive.css", "src/explorer/document/palette.ts"]);
const PRIMITIVE_LAYER = "src/design/tokens/primitive.css";
const SEMANTIC_LAYER = "src/design/tokens/semantic.css";

const HEX_CSS = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g;
// In scripts, a whole quoted colour counts, with or without "#": WordML and
// canvas APIs take bare "B3122B" strings, which is how red once slipped out.
const HEX_TS = /["'`]#?(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})["'`]|["'`]#(?:[0-9a-fA-F]{3,4})["'`]/g;
const FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(\s*[\d.a-z%]/g;
// Named colours in a CSS value position ("currentcolor", "transparent" and
// "inherit" stay fine; "white"/"black" in prose or class names don't match).
const NAMED_CSS = /:\s*(?:red|blue|green|yellow|orange|purple|pink|brown|black|white|gr[ae]y|cyan|magenta|lime|maroon|navy|olive|teal|silver|gold|crimson|salmon|coral|tomato|khaki|plum|orchid|beige|ivory|azure|lavender|turquoise|violet|indigo)\s*[;!}]/g;
const EAND_READ = /var\(\s*--eand-[\w-]+/g;
const EAND_DECLARE = /(^|[\s;{])--eand-[\w-]+\s*:/gm;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(css|tsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function stripComments(text, css) {
  const block = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  return css ? block : block.replace(/(^|[^:"'`])\/\/.*$/gm, (line, lead) => lead + " ".repeat(line.length - lead.length));
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

// Primitive tokens whose value is a colour: components must reach them only
// through the semantic layer, like the e& primitives.
const primitiveCss = readFileSync(join(root, PRIMITIVE_LAYER), "utf8");
const COLOUR_VALUE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;
const colourPrimitives = new Set(
  [...primitiveCss.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .filter(([, , value]) => COLOUR_VALUE.test(value))
    .map(([, tokenName]) => tokenName),
);

const colourFindings = new Map();
const eandFindings = [];
for (const path of files(src)) {
  const name = relative(root, path).split(sep).join("/");
  const css = name.endsWith(".css");
  const text = stripComments(readFileSync(path, "utf8"), css);
  if (!TOKEN_FILES.has(name)) {
    const hits = [
      ...text.matchAll(css ? HEX_CSS : HEX_TS),
      ...text.matchAll(FUNCTION),
      ...(css ? text.matchAll(NAMED_CSS) : []),
    ];
    if (hits.length) colourFindings.set(name, hits.map((hit) => ({ line: lineOf(text, hit.index), value: hit[0] })));
  }
  if (name !== SEMANTIC_LAYER && name !== PRIMITIVE_LAYER) {
    for (const hit of text.matchAll(EAND_READ)) eandFindings.push(`${name}:${lineOf(text, hit.index)} — ${hit[0]}) read outside the semantic layer`);
    for (const hit of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (colourPrimitives.has(hit[1]) && !hit[1].startsWith("--eand-"))
        eandFindings.push(`${name}:${lineOf(text, hit.index)} — ${hit[1]} is a colour primitive; read it through a semantic token`);
    }
  }
  if (name !== PRIMITIVE_LAYER) {
    for (const hit of text.matchAll(EAND_DECLARE)) eandFindings.push(`${name}:${lineOf(text, hit.index)} — e& primitive declared outside the primitive layer`);
  }
}

const legacy = existsSync(legacyPath) ? JSON.parse(readFileSync(legacyPath, "utf8")) : {};

if (process.argv.includes("--update")) {
  const next = {};
  const grew = [];
  for (const [name, hits] of [...colourFindings].sort(([a], [b]) => a.localeCompare(b))) {
    if (legacy[name] === undefined || hits.length > legacy[name]) grew.push(`${name}: ${legacy[name] ?? 0} → ${hits.length}`);
    next[name] = hits.length;
  }
  if (grew.length && !process.argv.includes("--first-run")) {
    console.error(`Refusing to grow the legacy list (use tokens instead):\n  ${grew.join("\n  ")}`);
    process.exit(1);
  }
  writeFileSync(legacyPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`brand-lint: legacy list rewritten, ${Object.keys(next).length} files, ${Object.values(next).reduce((a, b) => a + b, 0)} raw colours.`);
  process.exit(0);
}

const problems = [...eandFindings];
for (const [name, hits] of colourFindings) {
  const allowed = legacy[name] ?? 0;
  if (hits.length > allowed) {
    const shown = hits.slice(0, 5).map((hit) => `${name}:${hit.line} — raw colour ${hit.value}`);
    problems.push(`${name}: ${hits.length} raw colours (allowed ${allowed}). Use a semantic or component token.\n    ${shown.join("\n    ")}`);
  }
}
const shrinkable = Object.entries(legacy).filter(([name, count]) => (colourFindings.get(name)?.length ?? 0) < count);

if (problems.length) {
  console.error(`brand-lint: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`brand-lint: ok. Legacy raw colours: ${[...colourFindings.values()].reduce((sum, hits) => sum + hits.length, 0)} in ${colourFindings.size} files.`);
if (shrinkable.length) console.log(`  The legacy list can shrink (run with --update): ${shrinkable.map(([name]) => name).join(", ")}`);
