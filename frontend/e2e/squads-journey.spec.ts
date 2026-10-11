/**
 * Area 4 keyboard journey (journey 3, "Give a system to a squad"): open the
 * grid on one product's systems with no squad, select them all, give them to
 * the suggested squad in one save, and land on the outcome. It changes the
 * seed, so it runs after every route has been checked as seeded
 * (playwright.config.ts, project "journeys").
 */
import { expect, settled, test } from "./fixtures";

test("keyboard only: give a product's systems with no squad to the suggested squad in one save", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("squads?show=none&product=fibre-ordering");
  await settled(page);
  const grid = page.getByRole("table", { name: /^Systems ·/ });
  const before = await grid.getByRole("rowheader").count();
  test.skip(before === 0, "this seed leaves no system of the fibre product without a squad");

  // Select every system shown, from the button above the grid.
  await page.getByRole("button", { name: /^Select the \d+ systems? shown$/ }).focus();
  await page.keyboard.press("Enter");
  const bar = page.getByRole("region", { name: "Selection" });
  await expect(bar).toContainText(`${before} system${before === 1 ? "" : "s"} selected`);

  await expect(page.locator(":focus")).toHaveText(/^Clear the \d+ systems? shown$/);

  // Tab on past each row (its box and its link) to the selection bar's action.
  const give = bar.getByRole("button", { name: "Give to a squad…" });
  for (let step = 0; step < before * 3 + 5 && !(await give.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(give).toBeFocused();
  // It opens the panel; focus lands on the squad, with the suggestion chosen.
  await page.keyboard.press("Enter");
  const panel = page.getByRole("form", { name: /^Give \d+ systems? to a squad$/ });
  await expect(page.locator(":focus")).toHaveAccessibleName("Squad");
  await expect(page.locator(":focus")).toHaveAccessibleDescription(/^Suggested: Sales squad \(sample\), because it runs/);

  // Role: Developer, typed on the select; the person stays an open seat.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAccessibleName("Role on each");
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
