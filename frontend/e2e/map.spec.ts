/**
 * The diagrams (UX rebuild plan, phases 2 to 4) by keyboard: one tab stop into
 * a diagram, the arrow keys between its nodes, Enter to open one, and the
 * library's lifecycle as its state filter.
 */
import { expect, settled, test } from "./fixtures";

test("the map: Tab enters the flow once, arrows move between systems, Enter opens a record in the app", async ({ page }) => {
  await page.goto("architecture/map");
  await settled(page);
  const flow = page.getByRole("group", { name: "How systems connect" });
  await flow.getByRole("link").first().focus();
  const first = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await page.keyboard.press("ArrowRight");
  const next = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  expect(next).not.toBe(first);
  // Only the node in hand is a tab stop: Tab leaves the drawing.
  await expect(flow.locator('[tabindex="0"]')).toHaveCount(1);
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
