/**
 * Area 5 keyboard journey ("Which system does this, and how does an order run
 * through it"): find a system from the catalogue by name, open its record
 * (focus lands on it), then read a journey and switch it from the swimlane to
 * the flowchart with the arrow keys. It changes nothing; it sits with the
 * journeys so the seed's draft has already been read (playwright.config.ts).
 */
import { expect, settled, test } from "./fixtures";
import { seeded } from "./routes";

test("keyboard only: find a system, open its record, then read a journey as a flowchart", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("architecture");
  await settled(page);

  // Into the find field; the count says how many systems match.
  await page.getByLabel("Find a system").focus();
  await page.keyboard.type("CWOM");
  await expect(page.getByText(/^1 system of \d+$/)).toBeVisible();

  // Tab on to the one system left in the list, past the filter.
  const list = page.getByRole("region", { name: "Systems", exact: true });
  const link = list.getByRole("link", { name: /^CWOM/ });
  for (let step = 0; step < 12 && !(await link.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(link).toBeFocused();

  // Enter opens its record beside the list; focus moves to the record's name and the row says it is open.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/architecture\/systems\/[^/?]+/);
  await expect(page.locator(":focus")).toHaveText("CWOM");
  await expect(page.getByRole("article", { name: "CWOM" })).toBeVisible();
  await expect(link).toHaveAttribute("aria-current", "page");

  // A journey reads as a swimlane first; the arrow keys move to the flowchart.
  const { journey } = await seeded();
  test.skip(!journey, "this seed has no journey");
  await page.goto(`architecture/journeys/${journey}`);
  await settled(page);
  const swimlane = page.getByRole("tab", { name: "Swimlane" });
  await expect(swimlane).toHaveAttribute("aria-selected", "true");
  await swimlane.focus();
  await page.keyboard.press("ArrowRight");
  const flowchart = page.getByRole("tab", { name: "Flowchart" });
  await expect(flowchart).toBeFocused();
  await expect(flowchart).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/view=flowchart/);
  await expect(page.getByRole("region", { name: /^Flowchart of .*\(scrolls sideways\)$/ })).toBeVisible();
});
