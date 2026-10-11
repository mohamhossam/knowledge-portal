#!/usr/bin/env node
/**
 * Legacy CSS ratchet: the global stylesheets in `src/styles/` may only shrink.
 *
 * Screens move onto the design system (`src/design/`) one area at a time, and
 * an area's own layout lives beside it. `legacy-css.json` records the lines
 * each legacy stylesheet had; a file may only go down, and no new file may
 * appear in `src/styles/`. When a file shrinks, record it with --update.
 *
 *   node scripts/legacy-css.mjs            check
 *   node scripts/legacy-css.mjs --update   rewrite the record (counts may only fall)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const styles = join(root, "src", "styles");
const recordPath = join(root, "scripts", "legacy-css.json");

/** Lines that carry CSS: blank lines and comments don't count. */
function lines(file) {
  const text = readFileSync(join(styles, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return text.split("\n").filter((line) => line.trim()).length;
}

const now = Object.fromEntries(
  readdirSync(styles)
    .filter((name) => name.endsWith(".css"))
    .sort()
    .map((name) => [name, lines(name)]),
);
const record = JSON.parse(readFileSync(recordPath, "utf8"));
const grew = Object.entries(now)
  .filter(([name, count]) => count > (record[name] ?? 0))
  .map(([name, count]) => `${name}: ${record[name] ?? 0} → ${count}`);

if (grew.length) {
  console.error(
    "legacy-css: the legacy stylesheets may only shrink. Put new styles in the design system\n" +
      `or in the area's own stylesheet beside its components:\n  ${grew.join("\n  ")}`,
  );
  process.exit(1);
}

const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
if (process.argv.includes("--update")) {
  writeFileSync(recordPath, `${JSON.stringify(now, null, 2)}\n`);
  console.log(`legacy-css: record rewritten, ${total(now)} lines in ${Object.keys(now).length} files.`);
} else {
  const shrank = Object.keys(record).filter((name) => (now[name] ?? 0) < record[name]);
  console.log(`legacy-css: ok. ${total(now)} legacy lines in ${Object.keys(now).length} files.`);
  if (shrank.length) console.log(`  Shrank (run with --update to record): ${shrank.join(", ")}`);
}
