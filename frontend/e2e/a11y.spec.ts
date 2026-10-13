/**
 * Route accessibility: axe on every route of the seeded stack, WCAG
 * 2.0/2.1/2.2 A and AA. Every route is on the design system, so a serious or
 * critical issue on any of them blocks.
 */
import AxeBuilder from "@axe-core/playwright";

import { expect, settled, test } from "./fixtures";
import { ROUTES, seeded } from "./routes";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const route of ROUTES) {
  test(`${route.key}: no serious or critical accessibility issue`, async ({ page }, info) => {
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
    const detail = blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join("\n  ")}`).join("\n");
    expect(blocking.map((violation) => violation.id), detail).toEqual([]);
  });
}
