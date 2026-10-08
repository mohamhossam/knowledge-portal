/**
 * Plan 02 criterion 2.2, keyboard only (T2): on the eligibility matrix, find
 * the hidden sheet's passages, exclude them with a reason, save, publish and
 * confirm. It publishes, so it works on its own copy of the seeded file and
 * runs after every other spec (playwright.config.ts, project "journeys"):
 * the seeded document stays waiting for review for the routes that show it.
 */
import { apiUrl, OWNER } from "./env";
import { expect, settled, test } from "./fixtures";
import { seeded } from "./routes";

type Version = { id: string; number: number; stage: string };
type Document = { id: string; versions: Version[] };

async function copyOfTheMatrix(request: import("@playwright/test").APIRequestContext, from: string): Promise<string> {
  const source = (await (await request.get(`${apiUrl}/library/documents/${from}`, { headers: OWNER })).json()) as Document;
  const version = source.versions.at(-1)!;
  const file = await (await request.get(`${apiUrl}/library/documents/${from}/versions/${version.id}/original`, { headers: OWNER })).body();
  const created = await request.post(`${apiUrl}/library/ingestions`, {
    headers: OWNER,
    multipart: {
      file: { name: "eligibility.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: file },
      title: `Product eligibility matrix (T2 copy ${Date.now()})`,
      idempotency_key: crypto.randomUUID(),
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as Document;
  // Scanned and read offline: wait until it is ready for review.
  await expect.poll(async () => {
    const document = (await (await request.get(`${apiUrl}/library/documents/${id}`, { headers: OWNER })).json()) as Document;
    return document.versions.at(-1)?.stage;
  }, { timeout: 60_000 }).toBe("ready_for_review");
  return id;
}

test("2.2 keyboard only: exclude the hidden sheet with a reason, save, publish and confirm", async ({ page, request }) => {
  const { reviewDocument } = await seeded();
  test.skip(!reviewDocument, "this seed has no eligibility matrix");
  const id = await copyOfTheMatrix(request, reviewDocument!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`library/${id}`);
  await settled(page);

  // Into the grid (its one tab stop), then n: the next flagged passage not seen yet.
  await page.locator(".lib-desk [data-cell-focus][tabindex='0']").focus();
  await page.keyboard.press("n");
  await expect(page.locator(":focus")).toHaveText(/^Sheet 2 \(hidden\)/);
  // x excludes (it already is: a hidden sheet starts excluded) and takes the reason; Enter goes back.
  await page.keyboard.press("x");
  await expect(page.locator(":focus")).toHaveAttribute("name", "desk-reason");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Internal pricing: not for publication.");
  await page.keyboard.press("Enter");
  await expect(page.locator(":focus")).toHaveText(/^Sheet 2 \(hidden\)/);
  // The sheet's row, the next one down.
  await page.keyboard.press("j");
  await expect(page.locator(":focus")).toHaveText(/^Sheet 2 \(hidden\), row 1/);
  await page.keyboard.press("x");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Internal pricing: not for publication.");
  await page.keyboard.press("Enter");

  // Ctrl+Enter saves from the desk; without a summary it asks for one, in its field.
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(":focus")).toHaveAttribute("name", "desk-summary");
  await page.keyboard.type("Checked the hidden sheet; its pricing row stays out.");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText(/^Saved at \d\d:\d\d\./)).toBeVisible();

  // Publish: Tab to the button, Enter opens the consequence panel, Tab to the verb, Enter confirms.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Approve and publish…");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: "Publish version 1" });
  await expect(panel).toContainText("You looked at");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Publish version 1");
  await page.keyboard.press("Enter");
  const said = page.getByText("Published. Requirement work can cite it once it is indexed; Jobs shows the indexing.");
  await expect(said).toBeFocused();
});
