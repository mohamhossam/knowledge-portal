/**
 * Route accessibility (redesign Phase 7): axe on every route of the seeded
 * stack, WCAG 2.0/2.1/2.2 A and AA. Serious and critical issues block, as a
 * ratchet: a route fails only on a rule id that isn't in a11y-baseline.json.
 * Redesigned routes (routes.ts `REDESIGNED`) get no allowance at all.
 *
 *   A11Y_UPDATE_BASELINE=1 npx playwright test a11y --workers=1
 *
 * rewrites the baseline from what is found; it should only ever shrink.
 */
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, settled, test } from "./fixtures";
import { REDESIGNED, ROUTES, seeded } from "./routes";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BASELINE = fileURLToPath(new URL("./a11y-baseline.json", import.meta.url));
const updating = process.env.A11Y_UPDATE_BASELINE === "1";

type Baseline = Record<string, string[]>;

function load(): Baseline {
  return existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline) : {};
}

function save(baseline: Baseline) {
  const sorted = Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
}

for (const route of ROUTES) {
  test(`${route.key}: no new serious or critical accessibility issue`, async ({ page }, info) => {
    // axe over a full review desk (200 passages rendered) takes 15 s idle and more on a busy
    // machine; the limit catches hangs, not slowness.
    test.setTimeout(90_000);
    const path = route.path(await seeded());
    test.skip(path === undefined, "this seed has no such record");
    await page.goto(path!);
    await settled(page);
    // A signed-in page, not the sign-in screen or the "not an admin" state.
    const title = (await page.locator("h1").first().textContent()) ?? "";
    info.annotations.push({ type: "h1", description: title });
    expect(title).not.toMatch(/opening the knowledge portal|sign in|knowledge admins/i);

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    const found = [...new Set(blocking.map((violation) => violation.id))].sort();

    if (updating) {
      if (info.config.workers !== 1) throw new Error("Update the baseline with --workers=1, so writes don't race.");
      const baseline = load();
      if (found.length && !REDESIGNED.includes(route.key)) baseline[route.key] = found;
      else delete baseline[route.key];
      save(baseline);
      return;
    }

    const allowed = new Set(REDESIGNED.includes(route.key) ? [] : load()[route.key] ?? []);
    const fixed = [...allowed].filter((id) => !found.includes(id));
    if (fixed.length) info.annotations.push({ type: "baseline can shrink", description: `${fixed.join(", ")} no longer found here` });

    const fresh = blocking.filter((violation) => !allowed.has(violation.id));
    const detail = fresh.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join("\n  ")}`).join("\n");
    expect(fresh.map((violation) => violation.id), detail).toEqual([]);
  });
}
