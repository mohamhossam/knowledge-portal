/**
 * The desks and benches fill one screen and scroll their own lists. A visually hidden label
 * (absolute) whose containing block lay outside a list's scroll once stretched the page to
 * thousands of pixels under the desk, so focusing into the pane scrolled the whole window
 * (2026-10-22 critique). Each page here stays about one screen tall.
 */
import { expect, settled, test } from "./fixtures";
import { seeded } from "./routes";

const PAGES: { key: string; path: (ids: Awaited<ReturnType<typeof seeded>>) => string | undefined }[] = [
  { key: "the library review desk", path: (ids) => ids.reviewDocument && `library/${ids.reviewDocument}` },
  { key: "the draft's decide desk", path: (ids) => ids.draft && `architecture/versions/${ids.draft}/decide` },
  { key: "the systems bench", path: (ids) => ids.system && `architecture/systems/${ids.system}` },
];

for (const item of PAGES) {
  test(`${item.key} does not stretch the page past the screen`, async ({ page }) => {
    const path = item.path(await seeded());
    expect(path, `the seed has no record for ${item.key}`).toBeDefined();
    await page.goto(path!);
    await settled(page);
    const { height, screen } = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, screen: innerHeight }));
    // A desk keeps a minimum list height, so on a short screen it may run a little past the fold;
    // a list's worth of rows (6,749px on the review desk before the fix) may not.
    expect(height).toBeLessThan(screen * 1.5);
  });
}
