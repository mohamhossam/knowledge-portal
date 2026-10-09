/**
 * The library (redesign area 2, plan 02 §10) on the seeded stack. Read-only:
 * nothing here changes the seed (the keyboard journey that publishes is
 * library-journey.spec.ts, which runs last on its own copy).
 */
import { expect, settled, test } from "./fixtures";
import { seeded } from "./routes";

/** Masthead + the grid's sticky head + the save bar, as a share of the view's height (decided at GATE 8.1). */
async function chrome(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const height = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0;
    // A header cell, not the <thead>: the cells stick; the head's own box scrolls away.
    const head = document.querySelector(".lib-desk .ds-table thead th")?.getBoundingClientRect();
    const foot = document.querySelector(".lib-desk .ds-stickyfoot")?.getBoundingClientRect();
    const rows = [...document.querySelectorAll(".lib-desk .ds-table tbody tr")].filter((row) => {
      const box = row.getBoundingClientRect();
      return head && foot && box.top >= head.bottom - 1 && box.bottom <= foot.top + 1;
    }).length;
    const share = (height(".ds-masthead") + height(".lib-desk .ds-table thead th") + height(".lib-desk .ds-stickyfoot")) / window.innerHeight;
    return { rows, share, saveBarLines: Math.round(height(".lib-desk .lib-savebar__row") / height(".lib-desk #desk-approve")) };
  });
}

for (const [width, height] of [[1440, 900], [1280, 800]] as const) {
  test(`2.1 the review desk at ${width}×${height}: chrome at most 15% of the height, the save bar on one line`, async ({ page }) => {
    const { reviewDocument } = await seeded();
    test.skip(!reviewDocument, "this seed has no document waiting for review");
    await page.setViewportSize({ width, height });
    await page.goto(`library/${reviewDocument}`);
    await settled(page);
    // Scrolled into the passages, as a reviewer works: the head and the save bar stay, the page's head goes.
    await page.locator(".lib-desk .ds-table tbody tr").nth(20).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    const measured = await chrome(page);
    test.info().annotations.push({ type: "measured", description: JSON.stringify(measured) });
    expect(measured.share).toBeLessThanOrEqual(0.15);
    expect(measured.saveBarLines).toBe(1);
    if (width === 1440) expect(measured.rows).toBeGreaterThanOrEqual(10);
  });
}

test("2.3 withdraw says who cites it (or that the count is unknown) before the button that withdraws", async ({ page }) => {
  const { serviceDocument } = await seeded();
  test.skip(!serviceDocument, "this seed has no document in service");
  await page.goto(`library/${serviceDocument}`);
  await settled(page);
  await page.getByRole("button", { name: "Withdraw…" }).click();
  const panel = page.getByRole("region", { name: /^Withdraw '/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/cites? it now|unknown, not zero/)).toBeVisible();
  // Reading order: the panel's text, as the accessibility tree reads it, names who depends on it first.
  const text = (await panel.textContent()) ?? "";
  const affected = text.search(/cites? it now|unknown, not zero/);
  const verb = text.lastIndexOf("Withdraw '");
  expect(affected).toBeGreaterThan(-1);
  expect(affected).toBeLessThan(verb);
  // The safe default closes it and hands focus back.
  await page.getByRole("button", { name: "Keep it in service" }).click();
  await expect(page.getByRole("button", { name: "Withdraw…" })).toBeFocused();
});

test("2.4 a search result opens its document at that passage, focused", async ({ page }) => {
  await page.goto("library/search?q=coverage");
  await settled(page);
  const first = page.getByRole("link", { name: /^Open at the passage/ }).first();
  const quote = await page.locator(".lib-results blockquote").first().textContent();
  await first.click();
  await settled(page);
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("id", /^passage-/);
  await expect(focused.locator("xpath=ancestor::tr")).toContainText((quote ?? "").trim().slice(0, 40));
});

test("A3 the document's pages: each link moves focus to the page's h1", async ({ page }) => {
  const { serviceDocument } = await seeded();
  test.skip(!serviceDocument, "this seed has no document in service");
  await page.goto(`library/${serviceDocument}`);
  await settled(page);
  for (const name of ["Versions", "Cited by", "Ownership", "Overview"]) {
    await page.getByRole("navigation", { name: "This document" }).getByRole("link", { name }).click();
    await settled(page);
    await expect(page.locator(":focus")).toHaveRole("heading");
    await expect(page.getByRole("navigation", { name: "This document" }).getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
});
