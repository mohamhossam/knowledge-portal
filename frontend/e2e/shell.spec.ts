/**
 * The shell on every route (redesign area 1, plan 01 §10): the same three
 * utilities in the same place (WCAG 3.2.3, 3.2.6), the skip link first, and
 * focus on the new page's h1 after a navigation (interaction model §1).
 */
import { expect, settled, test } from "./fixtures";
import { ROUTES, seeded } from "./routes";

test("every route has Jobs, Help and Account in the masthead, in that order, and the skip link first", async ({ page }) => {
  // It opens every route in turn (34 since area 2, some loading their own chunk): more than one page's time.
  test.slow();
  const ids = await seeded();
  for (const route of ROUTES) {
    const path = route.path(ids);
    if (path === undefined) continue;
    await page.goto(path);
    await settled(page);
    const utilities = page.getByRole("banner").getByRole("button");
    await expect(utilities, route.key).toHaveText([/^Jobs/, "Help", /Amina Owner/]);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus"), route.key).toHaveText("Skip to content");
  }
});

test("a rail link moves focus to the new page's h1, rebuilt or not", async ({ page }) => {
  await page.goto("");
  await settled(page);
  for (const [label, title] of [["Library", "Library"], ["Your work", "Your work"], ["Catalogue", "Architecture catalogue"]] as const) {
    await page.getByRole("navigation", { name: "Areas" }).getByRole("link", { name: new RegExp(`^${label}`) }).click();
    await settled(page);
    await expect(page.locator(":focus")).toHaveRole("heading");
    await expect(page.locator(":focus")).toContainText(title);
  }
});
