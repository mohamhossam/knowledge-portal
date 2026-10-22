/**
 * Route accessibility: axe on every route of the seeded stack, WCAG
 * 2.0/2.1/2.2 A and AA. Every route is on the design system, so a serious or
 * critical issue on any of them blocks.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, settled, test } from "./fixtures";
import { ROUTES, seeded } from "./routes";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** axe's serious and critical violations on the page as it stands. */
async function blockingIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  const detail = blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join("\n  ")}`).join("\n");
  return { ids: blocking.map((violation) => violation.id), detail };
}

for (const route of ROUTES) {
  test(`${route.key}: no serious or critical accessibility issue`, async ({ page }, info) => {
    // axe over a full review desk (200 passages rendered) takes 15 s idle and more on a busy
    // machine; the limit catches hangs, not slowness.
    test.setTimeout(90_000);
    const path = route.path(await seeded());
    // A route whose record the seed lacks fails rather than skips: a skip read as a pass
    // (review recommendation 15).
    expect(path, `the seed has no record for ${route.key}`).toBeDefined();
    await route.prepare?.(page);
    await page.goto(path!);
    await settled(page);
    // A signed-in page, not the sign-in screen or the "not an admin" state.
    const title = (await page.locator("h1").first().textContent()) ?? "";
    info.annotations.push({ type: "h1", description: title });
    expect(title).not.toMatch(/opening the knowledge portal|sign in|knowledge admins/i);
    if (route.shows) await expect(page.getByText(route.shows).filter({ visible: true }).first()).toBeVisible();

    const { ids, detail } = await blockingIssues(page);
    expect(ids, detail).toEqual([]);
  });
}

/**
 * The states no admin route reaches (review recommendation 15): the explorer a signed-in reader
 * without the role gets, the page that says the portal is for admins, the sign-in page, and
 * the shell with its sidebar collapsed to icons.
 */
const STATES: { key: string; path: string; heading: RegExp; prepare: (page: Page) => Promise<unknown> }[] = [
  {
    key: "reader-explorer",
    path: "explorer",
    heading: /product architecture explorer/i,
    prepare: (page) => page.addInitScript(() => sessionStorage.setItem("knowledge-portal.fake-actor", "fake-observer")),
  },
  {
    key: "no-access",
    path: "library",
    heading: /this portal is for knowledge admins/i,
    prepare: (page) => page.addInitScript(() => sessionStorage.setItem("knowledge-portal.fake-actor", "fake-observer")),
  },
  {
    key: "sign-in",
    path: "",
    heading: /sign in to the knowledge portal|your session has ended/i,
    // Offline sign-in picks a persona by itself: the page shows when who you are can't be read.
    prepare: (page) =>
      page.route((url) => url.pathname.endsWith("/identity/me"), (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ code: "authentication_required", message: "Sign in again.", correlation_id: "e2e" }),
        }),
      ),
  },
  {
    key: "collapsed-sidebar",
    path: "",
    heading: /./,
    prepare: (page) => page.addInitScript(() => localStorage.setItem("knowledge-portal.sidebar", "collapsed")),
  },
];

for (const state of STATES) {
  test(`${state.key}: no serious or critical accessibility issue`, async ({ page }) => {
    await state.prepare(page);
    await page.goto(state.path);
    const heading = page.locator("h1").first();
    await expect(heading).toHaveText(state.heading, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const { ids, detail } = await blockingIssues(page);
    expect(ids, detail).toEqual([]);
  });
}
