/**
 * Area 4 keyboard journeys (journey 3, "Give a system to a squad"), on the
 * Ownership workbench (UX rebuild, phase 3): find a system with no squad in
 * the list, open its record and give it to a squad in place; and, from a
 * product's record, give its systems with no squad to the suggested squad in
 * one save with Assign several. They change the seed, so they run after every
 * route has been checked as seeded (playwright.config.ts, project "journeys").
 */
import { expect, settled, test } from "./fixtures";

const tabTo = async (page: import("@playwright/test").Page, target: import("@playwright/test").Locator, limit = 20) => {
  for (let step = 0; step < limit && !(await target.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
};

test("keyboard only: find a system with no squad, open its record and give it to a squad in place", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("squads");
  await settled(page);

  // Into the list's find field; the count says how many systems match.
  const list = page.getByRole("region", { name: "Systems" });
  await list.getByLabel("Find a system").focus();
  await page.keyboard.type("ADFS");
  await expect(list.getByText(/^1 system of \d+$/)).toBeVisible();
  const row = list.getByRole("link", { name: /^ADFS/ });
  test.skip(!(await row.textContent())?.includes("No squad"), "this seed already gives ADFS to a squad");

  // Tab on past the filters to the list's one row; Enter opens its record and focus moves to its name.
  await tabTo(page, row);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/squads\/systems\/adfs(\?|$)/);
  await expect(page.locator(":focus")).toHaveText("ADFS");
  await expect(row).toHaveAttribute("aria-current", "page");
  const record = page.getByRole("article", { name: "ADFS" });
  await expect(record).toContainText("No squad runs it yet.");

  // The record's action opens the give form in place; focus lands on the squad.
  await tabTo(page, record.getByRole("button", { name: "Give it to a squad" }));
  await page.keyboard.press("Enter");
  const panel = page.getByRole("form", { name: "Give 1 system to a squad" });
  await expect(page.locator(":focus")).toHaveAccessibleName("Squad");
  await page.keyboard.type("Care");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAccessibleName("Role");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAccessibleName("Person");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Give 1 system to Care squad (sample)");
  await page.keyboard.press("Enter");

  // Focus lands on the outcome; the record now says who runs it, and the row loses its tag.
  await expect(page.locator(":focus")).toHaveText("Gave 1 system to Care squad (sample).");
  await expect(panel).toHaveCount(0);
  await expect(record.getByRole("table", { name: "Squads that run ADFS" })).toContainText("Care squad (sample)");
  await expect(row).not.toContainText("No squad");
});

test("keyboard only: give a product's systems with no squad to the suggested squad in one save", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("squads/products/fibre-ordering");
  await settled(page);
  const give = page.getByRole("link", { name: /^Give (the|the \d+) systems? with no squad to a squad/ });
  test.skip((await give.count()) === 0, "this seed leaves no system of the fibre product without a squad");

  // The product's record opens Assign several on its systems with no squad.
  await give.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/squads\/assign\?show=none&product=fibre-ordering$/);
  await settled(page);
  const grid = page.getByRole("table", { name: /^Systems ·/ });
  const before = await grid.getByRole("rowheader").count();
  expect(before).toBeGreaterThan(0);

  // Select every system shown, from the button above the grid.
  await page.getByRole("button", { name: /^Select the \d+ systems? shown$/ }).focus();
  await page.keyboard.press("Enter");
  const bar = page.getByRole("region", { name: "Selection" });
  await expect(bar).toContainText(`${before} system${before === 1 ? "" : "s"} selected`);

  await expect(page.locator(":focus")).toHaveText(/^Clear the \d+ systems? shown$/);

  // Tab on past each row (its box and its link) to the selection bar's action.
  await tabTo(page, bar.getByRole("button", { name: "Give to a squad…" }), before * 3 + 5);
  // It opens the panel; focus lands on the squad, with the suggestion chosen.
  await page.keyboard.press("Enter");
  const panel = page.getByRole("form", { name: /^Give \d+ systems? to a squad$/ });
  await expect(page.locator(":focus")).toHaveAccessibleName("Squad");
  await expect(page.locator(":focus")).toHaveAccessibleDescription(/^Suggested: Sales squad \(sample\), because it runs/);

  // Role: Developer, typed on the select; the person stays an open seat.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAccessibleName(before === 1 ? "Role" : "Role on each");
  await page.keyboard.type("Developer");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAccessibleName("Person");
  await expect(panel).toContainText("left open");

  // Tab to the verb, Enter gives them all in one save.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText(/^Give \d+ systems? to Sales squad \(sample\)$/);
  await page.keyboard.press("Enter");
  await expect(page.locator(":focus")).toHaveText(new RegExp(`^Gave ${before} systems? to Sales squad \\(sample\\)\\.$`));
  await expect(panel).toHaveCount(0);
  await expect(grid.getByRole("rowheader")).toHaveCount(0);
  await expect(grid).toContainText("No system matches these filters.");
});
