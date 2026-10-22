/**
 * Historic requirements lived under the requirement workbench, which went when the portal
 * stopped showing requirement work's data (ADR-0126). Their old addresses still open them.
 */
import { expect, settled, test } from "./fixtures";
import * as mocks from "./mocks";

test("an old historic requirements address opens the list at its new one", async ({ page }) => {
  await page.goto("requirement-knowledge/historic");
  await expect(page).toHaveURL(/\/historic$/);
});

test("an old historic record's address opens the same record", async ({ page }) => {
  await mocks.historic(page);
  await page.goto("requirement-knowledge/historic/h1");
  await settled(page);
  await expect(page).toHaveURL(/\/historic\/h1$/);
  await expect(page.getByText(/XGPON bundles \(2024\)/).first()).toBeVisible();
});
