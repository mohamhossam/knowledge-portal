/**
 * The diagrams (UX rebuild plan, phases 2 to 4) by keyboard: who calls whom
 * from a system's row to its record, one system in context full width, and the
 * library's lifecycle as its state filter.
 */
import { expect, settled, test } from "./fixtures";

test("who calls whom by keyboard: Tab to a system's row, Enter picks it, its summary leads to its record", async ({ page }) => {
  // The whole-estate map gave way to the Systems tab's matrices (catalogue merge, step 5); its address leads there.
  await page.goto("architecture/map");
  await settled(page);
  await expect(page).toHaveURL(/\/architecture\?view=interfaces/);
  const matrix = page.getByRole("region", { name: "Interface matrix (scrolls when narrow)" });
  const row = matrix.locator("tbody th[scope=row] button").first();
  const name = (await row.locator("span").first().textContent()) ?? "";
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-pressed", "true");
  const summary = page.getByRole("complementary", { name });
  await summary.getByRole("link", { name: `Open the full record of ${name}` }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/architecture\/systems\//);
  await expect(page.getByRole("heading", { name: "In context" })).toBeVisible();
});

test("a system's record opens its context full width, its table one press away", async ({ page }) => {
  await page.goto("architecture/systems/cwom");
  await settled(page);
  await page.getByRole("link", { name: "Open it full width" }).click();
  await expect(page).toHaveURL(/\/architecture\/map\?system=cwom/);
  await page.getByRole("button", { name: "Show as table" }).click();
  await expect(page.getByRole("table", { name: "CWOM in context" }).getByRole("rowheader", { name: "RTF" })).toBeVisible();
});

test("the library's lifecycle filters the list, pressed state and all", async ({ page }) => {
  await page.goto("library");
  await settled(page);
  const lifecycle = page.getByRole("group", { name: "Show documents by state" });
  const review = lifecycle.getByRole("button", { name: /^Ready for review/ });
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/status=review/);
  await expect(review).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/status=/);
});
