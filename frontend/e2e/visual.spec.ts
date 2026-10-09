/**
 * Visual regression for redesigned routes (redesign Phase 7): each route in
 * routes.ts `REDESIGNED`, at 1280 and 1920 wide, light and dark. Baselines are
 * committed per area under e2e/__screenshots__ (`--update-snapshots` at the
 * area's gate, after the screenshots are reviewed).
 */
import { expect, settled, test } from "./fixtures";
import { REDESIGNED, ROUTES, seeded } from "./routes";

const WIDTHS = [1280, 1920] as const;
const THEMES = ["light", "dark"] as const;

const redesigned = ROUTES.filter((route) => REDESIGNED.includes(route.key));

test("redesigned routes are listed", () => {
  test.skip(redesigned.length === 0, "No route is redesigned yet; Phase 8 adds them to REDESIGNED.");
  expect(redesigned.length).toBe(REDESIGNED.length);
});

for (const route of redesigned) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`${route.key} at ${width}, ${theme}`, async ({ page }) => {
        const path = route.path(await seeded());
        test.skip(path === undefined, "this seed has no such record");
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.goto(path!);
        await settled(page);
        await expect(page).toHaveScreenshot(`${route.key}-${width}-${theme}.png`, {
          fullPage: !route.viewOnly,
          mask: (route.mask ?? []).map((selector) => page.locator(selector)),
        });
      });
    }
  }
}
