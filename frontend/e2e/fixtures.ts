/** Every e2e page signs in as the seeded admin persona (the fake identity mode). */
import { expect, test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => sessionStorage.setItem("knowledge-portal.fake-actor", "fake-owner"));
    await provide(page);
  },
});

export { expect };

/**
 * Waits until the route has rendered its own page: past the boot screen
 * ("Opening the knowledge portal", while sign-in resolves), the network idle,
 * and an h1 attached.
 */
export async function settled(page: import("@playwright/test").Page) {
  const heading = page.locator("h1").first();
  await heading.waitFor({ state: "attached" });
  await expect(heading).not.toHaveText(/opening the knowledge portal/i, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}
