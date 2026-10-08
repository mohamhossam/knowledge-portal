#!/usr/bin/env node
/**
 * Bundle budget (redesign Phase 7): the main chunk may grow at most 10% over
 * the Phase 0 baseline (docs/redesign/01-baseline.md: 900.79 kB minified, as
 * Vite reports it, 1 kB = 1000 bytes). Run after `npm run build`.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_KB = 900.79;
const LIMIT_KB = Math.round(BASELINE_KB * 1.1 * 100) / 100;

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
let html;
try {
  html = readFileSync(join(dist, "index.html"), "utf8");
} catch {
  console.error("bundle-budget: no dist/index.html. Run `npm run build` first.");
  process.exit(1);
}
// The entry chunk is the module script index.html loads.
const entry = html.match(/<script[^>]+type="module"[^>]+src="[^"]*\/(assets\/[^"]+\.js)"/)?.[1];
if (!entry) {
  console.error("bundle-budget: couldn't find the entry script in dist/index.html.");
  process.exit(1);
}
const kb = statSync(join(dist, entry)).size / 1000;
const delta = (kb / BASELINE_KB - 1) * 100;
const line = `bundle-budget: ${entry} is ${kb.toFixed(2)} kB (baseline ${BASELINE_KB} kB, ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%; limit ${LIMIT_KB} kB).`;
if (kb > LIMIT_KB) {
  console.error(`${line}\n  Over budget: split a route with lazy(), or drop a dependency.`);
  process.exit(1);
}
console.log(line);
