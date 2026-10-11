/**
 * Requirements area keyboard journey (UX rebuild, phase 3): the overview address shows
 * Requirements in place, starting at the skip link; the area's sub-navigation reaches
 * Findings; and on Historic the import form opens from the list's head, takes focus, and on
 * Escape hands it back. It changes nothing, but runs with the journeys (playwright.config.ts,
 * project "journeys").
 */
import { expect, settled, test } from "./fixtures";

test("keyboard only: from the overview to findings, then open and close the BRD import", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("requirement-knowledge");
  await settled(page);
  await expect(page).toHaveURL(/\/requirement-knowledge$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Requirements/);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Skip to content");

  // The area's sub-navigation: Findings, by keyboard.
  const subnav = page.getByRole("navigation", { name: "Requirement knowledge" });
  const findings = subnav.getByRole("link", { name: /^Findings/ });
  await findings.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/requirement-knowledge\/findings$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Findings/);
  await expect(subnav.getByRole("link", { name: /^Findings/ })).toHaveAttribute("aria-current", "page");

  // Historic: the list head's Import BRDs opens the form, which takes focus.
  await subnav.getByRole("link", { name: /^Historic/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/requirement-knowledge\/historic$/);
  await settled(page);
  const open = page.getByRole("button", { name: "Import BRDs", expanded: false });
  await open.focus();
  await page.keyboard.press("Enter");
  const form = page.getByRole("form", { name: "Import old BRDs" });
  await expect(form).toBeVisible();
  await expect(page.locator(":focus")).toHaveText("Import old BRDs");

  // Nothing chosen yet: the verb says why it waits. Escape closes and focus comes back.
  await expect(form.getByRole("button", { name: /^Import/ })).toHaveAccessibleDescription(/Choose the BRDs first\./);
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveText("Import BRDs");
});
