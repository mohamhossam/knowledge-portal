/**
 * The draft's main task, keyboard only: on Decide, into the grid, to the next
 * suggestion that needs a decision, into its pane and back, then reject it
 * from the grid. It changes the seeded draft, so it runs after every other
 * spec (playwright.config.ts, project "journeys").
 */
import { expect, settled, test } from "./fixtures";
import { seeded } from "./routes";

test("keyboard only: find a suggestion, read it in the pane, come back and reject it", async ({ page }) => {
  const { draft } = await seeded();
  test.skip(!draft, "this seed has no draft");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`architecture/versions/${draft}/decide`);
  await settled(page);

  const progress = page.getByRole("region", { name: "Decisions so far" });
  const rejected = async () => Number((await progress.textContent())?.match(/([\d,]+) rejected/)?.[1]?.replace(/,/g, "") ?? NaN);
  const before = await rejected();

  // Into the grid (its one tab stop), then n: the next suggestion that needs a decision.
  const grid = page.locator(".draft-desk [data-cell-focus][tabindex='0']");
  await grid.focus();
  await page.keyboard.press("n");
  const row = (await page.locator(":focus").textContent()) ?? "";
  expect(row).not.toBe("");

  // Enter reads it in the pane; Esc comes back to the same row.
  await page.keyboard.press("Enter");
  await expect(page.locator(".ds-split__pane :focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(":focus")).toHaveText(row);

  // r rejects it from the grid; the count says so.
  await page.keyboard.press("r");
  await expect.poll(rejected).toBe(before + 1);
});
