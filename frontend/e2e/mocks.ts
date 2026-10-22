/**
 * Records the seeded stack cannot hold, served to one page by the browser, so the axe suite
 * covers every page (review recommendation 15) without changing the shared seed:
 *
 * - a historic requirement needs a Word BRD read from Azure DevOps;
 * - an evidence passage's id is a hash of the index;
 * - the seeded versions register no sources.
 *
 * Each mock answers only its own request; everything else reaches the API.
 */
import type { Page, Route } from "@playwright/test";

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const at = (path: string) => (url: URL) => url.pathname.endsWith(path);

/**
 * Answers the API's request for `path`. A page's own address can end the same way (the
 * evidence page's does), so the document load passes through untouched.
 */
async function api(page: Page, path: string, answer: (route: Route) => Promise<void>): Promise<void> {
  await page.route(at(path), (route) =>
    ["fetch", "xhr"].includes(route.request().resourceType()) ? answer(route) : route.fallback(),
  );
}

const AMINA = { id: "fake-owner", display_name: "Amina Owner" };

const HISTORIC = {
  id: "h1",
  title: "XGPON bundles (2024)",
  status: "draft",
  version: 3,
  created_at: "2026-10-06T09:00:00Z",
  created_by: AMINA,
  brds: 1,
  brds_reading: 0,
  brds_failed: 0,
  work_items: 0,
  run_status: null,
  run_failure: null,
  refresh_waiting: false,
  published_at: null,
  withdrawn_at: null,
};

/** One historic requirement, read and waiting for its Azure DevOps breakdown. */
export async function historic(page: Page): Promise<void> {
  await api(page, "/historic-requirements", (route) =>
    json(route, { items: [HISTORIC], next_offset: null, counts: { draft: 1, published: 0, withdrawn: 0, refresh_waiting: 0 } }),
  );
  await api(page, "/historic-requirements/h1", (route) =>
    json(route, {
      ...HISTORIC,
      brd_files: [{
        id: "b1", filename: "XGPON_bundles.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes: 10_240, checksum: "c", uploaded_at: "2026-10-06T09:00:00Z", uploaded_by: AMINA, stage: "read", error: null,
        warnings: [], passages: [{ block_id: "p1", label: "paragraph 1", section_path: [], text: "Delivered as Epic 48213." }],
      }],
      root_ids: [],
      suggestions: [{ work_item_id: 48213, block_id: "p1", label: "paragraph 1", quote: "Delivered as Epic 48213." }],
      run: null,
      breakdown: null,
      pending_refresh: null,
      publications: [],
      withdrawal: null,
      blockers: ["Its breakdown has not been read from Azure DevOps."],
    }),
  );
  await api(page, "/historic-requirements/h1/shared-roots", (route) => json(route, { items: [] }));
}

/** An evidence passage of the draft, by an id the test names. */
export async function evidence(page: Page, chunkId: string): Promise<void> {
  await api(page, `/evidence/${chunkId}`, (route) =>
    json(route, {
      id: chunkId,
      source_label: "Integration design (sample)",
      location: "§4.1 › Table 2, row 3",
      text: "CWOM tracks every business order from capture to activation.",
      document_version_id: null,
    }),
  );
}

/** The version in service with a source in its register, so its governance record opens. */
export async function governance(page: Page): Promise<void> {
  await api(page, "/architecture-knowledge/releases/active", async (route) => {
    const response = await route.fetch();
    const release = (await response.json()) as Record<string, unknown>;
    await json(route, {
      ...release,
      sources: [{
        id: "sdd", title: "Solution design document", level: "L2", short: "SDD v2.3", version: "2.3",
        file: "sdd.docx", supplied: true, authority: "Architecture team", scope: "Business Pro Plus", boundary: null, accepted: [],
      }],
    });
  });
}
