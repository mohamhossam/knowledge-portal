import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDocument } from "../api/client";
import { ApiError } from "../api/errors";
import { checkAxeAfterEach } from "../test/axe";
import { CitationsPage } from "./CitationsPage";
import { DocumentPage, MainPage } from "./DocumentPage";

checkAxeAfterEach();

class NoResize {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  Element.prototype.scrollIntoView = vi.fn();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const amina = { id: { value: "fake-owner" }, display_name: "Amina Owner", email: null };

const block = (id: string, ordinal: number, label: string, text: string, section = "Worksheet 1") => ({
  id, ordinal, kind: "worksheet_range", label, section_path: [section], text, content_fingerprint: `fp-${id}`, asset_id: null,
});

const BLOCKS = [
  block("b1", 1, "Worksheet 1!1:1", "A1=Product | B1=Segment"),
  block("b2", 2, "Worksheet 1!2:2", "A2=Bundle 1 | B2=SMB"),
  block("b3", 3, "Worksheet 1!3:3", "A3=Bundle 2 | B3=Enterprise"),
  block("b4", 4, "Worksheet 2!1:1", "A1=Floor price", "Hidden worksheet: Worksheet 2"),
];

type Saved = { block_id: string; text: string; included: boolean; exclusion_reason: string | null };

function matrix({ revisions = [] as { id: string; passages: Saved[] }[], extra = {} as Partial<LibraryDocument> } = {}): LibraryDocument {
  return {
    id: "d", title: "Product matrix", owner: amina, version: 4, can_edit: true, is_owner: true,
    published_id: null, publications: [], review_fingerprint: revisions.length ? "f" : null, build_fingerprint: null, review: null, citations: 0,
    acting_as_admin: null, newest: null,
    versions: [{
      id: "v1", number: 1, stage: "ready_for_review", filename: "matrix.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      attempt: 1, uploaded_at: "2026-10-07T09:00:00Z", uploaded_by: amina, error: null, blocks: BLOCKS,
      warning_details: [
        { code: "check", severity: "warning", message: "Check this row.", block_id: "b3" },
        { code: "hidden_worksheet", severity: "warning", message: "Worksheet 2 is hidden.", block_id: "b4" },
      ],
      warnings: ["Check this row.", "Worksheet 2 is hidden."], blocking_warnings: [], revisions,
    }],
    ...extra,
  } as unknown as LibraryDocument;
}

function openDocument(document: LibraryDocument, path = "/library/d") {
  vi.spyOn(api, "libraryDocument").mockResolvedValue(document);
  vi.spyOn(api, "dependencies").mockResolvedValue({ items: [], next_offset: null } as never);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <main>
          <Routes>
            <Route path="library/:documentId" element={<DocumentPage />}>
              <Route index element={<MainPage />} />
              <Route path="cited-by" element={<CitationsPage />} />
            </Route>
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const grid = () => screen.getByRole("grid", { name: /Passages of version 1/ });
const cell = (where: string) => within(grid()).getByRole("rowheader", { name: new RegExp(`^${where}`) });
const progress = () => screen.getByRole("region", { name: "Review progress" });

// Keyboard journeys type key by key: about 1 s each idle, up to 8 s on a busy machine.
// The limit catches hangs, not slowness (main has the same at suite level, 4b2b5f4).
describe("the review desk", { timeout: 20_000 }, () => {
  it("moves with j and k, marks what it passes as seen, and shows the passage beside the list", async () => {
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(cell("Sheet 1, row 1"));
    expect(cell("Sheet 1, row 1")).toHaveFocus();
    await waitFor(() => expect(progress()).toHaveTextContent("Seen 1 of 4"), { timeout: 3000 });
    await userEvent.keyboard("j");
    await waitFor(() => expect(cell("Sheet 1, row 2")).toHaveFocus());
    // Seen once a passage stays current for a moment (GATE 8.2), not on the way through.
    await waitFor(() => expect(progress()).toHaveTextContent("Seen 2 of 4"), { timeout: 3000 });
    // The row as labelled cells, under its sheet's headings (backlog O-3).
    expect(screen.getByRole("complementary", { name: "Passage 2" })).toHaveTextContent("Product Bundle 1Segment SMB");
    await userEvent.keyboard("k");
    await waitFor(() => expect(cell("Sheet 1, row 1")).toHaveFocus());
  });

  it("goes with n to the next flagged passage not seen yet, before the next not seen (backlog O-1)", async () => {
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    // Each stop is looked at (held for a moment), as a reviewer does, before moving on.
    const held = (count: number) => waitFor(() => expect(progress()).toHaveTextContent(`Seen ${count} of 4`), { timeout: 3000 });
    await userEvent.click(cell("Sheet 1, row 1"));
    await held(1);
    await userEvent.keyboard("n");
    await waitFor(() => expect(cell("Sheet 1, row 3")).toHaveFocus());
    await held(2);
    await userEvent.keyboard("n");
    await waitFor(() => expect(cell("Sheet 2 \\(hidden\\), row 1")).toHaveFocus());
    await held(3);
    await userEvent.keyboard("n");
    await waitFor(() => expect(cell("Sheet 1, row 2")).toHaveFocus());
    await held(4);
    await userEvent.keyboard("n");
    expect(await screen.findByText("Every flagged passage and every other passage has been seen.")).toBeInTheDocument();
  });

  it("counts a passage as seen only once it stays current for a moment (GATE 8.2)", async () => {
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(cell("Sheet 1, row 1"));
    await userEvent.keyboard("jjj");
    await waitFor(() => expect(cell("Sheet 2 \\(hidden\\), row 1")).toHaveFocus());
    // Passing through rows 1 to 3 didn't count; the row it stopped on does, after a moment.
    await waitFor(() => expect(progress()).toHaveTextContent("Seen 1 of 4"), { timeout: 3000 });
    expect(cell("Sheet 1, row 2")).toHaveTextContent("not seen");
  });

  it("excludes with x, takes the reason, and goes back to the row with Enter", async () => {
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(cell("Sheet 1, row 2"));
    await userEvent.keyboard("x");
    const reason = await screen.findByRole("textbox", { name: /Why exclude it\?/ });
    await waitFor(() => expect(reason).toHaveFocus());
    await userEvent.type(reason, "Duplicate row{Enter}");
    await waitFor(() => expect(cell("Sheet 1, row 2")).toHaveFocus());
    expect(cell("Sheet 1, row 2").closest("tr")).toHaveTextContent("Excluded: Duplicate row");
    expect(progress()).toHaveTextContent("1 unsaved change");
    await userEvent.keyboard("i");
    expect(progress()).toHaveTextContent("0 unsaved changes");
  });

  it("selects with Space and Shift+↓, then excludes the set with one reason, shown before it commits", async () => {
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(cell("Sheet 1, row 1"));
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    const bar = await screen.findByRole("region", { name: "Selection" });
    expect(bar).toHaveTextContent("2 passages selected");
    await userEvent.click(within(bar).getByRole("button", { name: "Exclude 2 passages…" }));
    const panel = screen.getByRole("region", { name: "Exclude 2 passages" });
    expect(within(panel).getByRole("list", { name: "Passages to exclude" })).toHaveTextContent("Sheet 1, row 1");
    await userEvent.type(within(panel).getByRole("textbox", { name: /Why exclude them\?/ }), "Not policy");
    await userEvent.click(within(panel).getByRole("button", { name: "Exclude 2 passages" }));
    expect(progress()).toHaveTextContent("2 unsaved changes");
    expect(screen.getByText("Excluded 2 passages. Save to keep it.")).toBeInTheDocument();
  });

  it("selects a whole sheet at once (backlog O-2)", async () => {
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(screen.getByRole("button", { name: "Select a location…" }));
    await userEvent.selectOptions(screen.getByLabelText("Select a location"), "Sheet 1");
    await userEvent.click(screen.getByRole("button", { name: "Select 3 passages" }));
    expect(screen.getByRole("region", { name: "Selection" })).toHaveTextContent("3 passages selected");
  });

  it("saves with Ctrl+Enter from anywhere on the desk; then Approve is available and unsaved counts from that save (2.5)", async () => {
    const saved = matrix({
      revisions: [{ id: "r1", passages: [
        { block_id: "b1", text: "A1=Product | B1=Segment", included: true, exclusion_reason: null },
        { block_id: "b2", text: "A2=Bundle 1 | B2=SMB", included: false, exclusion_reason: "Duplicate row" },
        { block_id: "b3", text: "A3=Bundle 2 | B3=Enterprise", included: true, exclusion_reason: null },
        { block_id: "b4", text: "A1=Floor price", included: false, exclusion_reason: "Hidden worksheet: not selected for publication." },
      ] }],
    });
    const review = vi.spyOn(api, "review").mockResolvedValue(saved);
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    const approve = screen.getByRole("button", { name: "Approve and publish…" });
    expect(approve).toHaveAttribute("aria-disabled", "true");
    expect(approve).toHaveAccessibleDescription("Save your review first.");

    await userEvent.click(cell("Sheet 1, row 2"));
    await userEvent.keyboard("x");
    await userEvent.type(await screen.findByRole("textbox", { name: /Why exclude it\?/ }), "Duplicate row");
    const summary = screen.getByRole("textbox", { name: /Review summary/ });
    await userEvent.type(summary, "Checked every row{Control>}{Enter}{/Control}");
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    const body = review.mock.calls[0]![2];
    expect(body.explanation).toBe("Checked every row");
    expect(body.passages.find((item) => item.block_id === "b2")).toMatchObject({ included: false, exclusion_reason: "Duplicate row" });

    expect(await screen.findByText(/^Saved at \d\d:\d\d\./)).toBeInTheDocument();
    expect(progress()).toHaveTextContent("0 unsaved changes");
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve and publish…" })).not.toHaveAttribute("aria-disabled"));
    // A change after the save is counted against the save, not against the first read.
    await userEvent.click(cell("Sheet 1, row 3"));
    await userEvent.keyboard("x");
    expect(progress()).toHaveTextContent("1 unsaved change");
    expect(screen.getByRole("button", { name: "Approve and publish…" })).toHaveAccessibleDescription("Save your changes first.");
  });

  it("asks for what is missing instead of saving", async () => {
    const review = vi.spyOn(api, "review");
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(screen.getByRole("button", { name: "Save review" }));
    expect(review).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /Review summary/ })).toHaveFocus();
    expect(screen.getByText(/Not saved yet: Write a review summary\./)).toBeInTheDocument();
  });

  it("publishes through its consequence panel: what becomes citable, then what you looked at, then the verb", async () => {
    const saved = matrix({ revisions: [{ id: "r1", passages: BLOCKS.map((item) => ({ block_id: item.id, text: item.text, included: item.id !== "b4", exclusion_reason: item.id === "b4" ? "Hidden" : null })) }] });
    const approve = vi.spyOn(api, "approve").mockResolvedValue({ ...saved, publications: [{ id: "p", version_id: "v1", revision_id: "r1", fingerprint: "f", withdrawn_at: null, activated_at: null, built_at: null, requires_activation: false, indexing_attempts: 0, approved_at: "2026-10-08T09:00:00Z", approved_by: amina }] } as unknown as LibraryDocument);
    openDocument(saved);
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(screen.getByRole("button", { name: "Approve and publish…" }));
    const panel = screen.getByRole("region", { name: "Publish version 1" });
    const text = panel.textContent ?? "";
    expect(text).toContain("Requirement work can cite its 3 passages once they are indexed.");
    expect(text.indexOf("You looked at")).toBeLessThan(text.indexOf("Publish version 1", text.indexOf("You looked at")));
    await userEvent.click(within(panel).getByRole("button", { name: "Publish version 1" }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith("d", "v1", { expected_version: 4, revision_id: "r1", fingerprint: "f" }));
    const said = await screen.findByText("Published. Requirement work can cite it once it is indexed; Jobs shows the indexing.");
    await waitFor(() => expect(said).toHaveFocus());
  });

  it("marks the passages seen on their rows, and goes past the 200 rows shown with j and End (area 2 critique)", async () => {
    const many = Array.from({ length: 205 }, (_, index) => block(`m${index + 1}`, index + 1, `Line ${index + 1}`, `Passage text ${index + 1}`, ""));
    const document = matrix();
    document.versions[0]!.blocks = many as never;
    document.versions[0]!.warning_details = [];
    openDocument(document);
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    expect(within(grid()).getAllByRole("row")).toHaveLength(201);
    await userEvent.click(within(grid()).getByRole("rowheader", { name: /^Line 1(,|$)/ }));
    // Seen is said on the row: the hidden "not seen" goes once the passage has been looked at.
    await waitFor(() => expect(within(grid()).getByRole("rowheader", { name: /^Line 1(,|$)/ })).not.toHaveTextContent("not seen"), { timeout: 3000 });
    expect(within(grid()).getByRole("rowheader", { name: /^Line 2(,|$)/ })).toHaveTextContent("not seen");
    await userEvent.keyboard("{End}");
    await waitFor(() => expect(within(grid()).getByRole("rowheader", { name: /^Line 205(,|$)/ })).toHaveFocus());
    expect(within(grid()).getAllByRole("row")).toHaveLength(206);
  });

  it("opens every shortcut in Help without leaving the desk", async () => {
    const opened = vi.fn();
    window.addEventListener("knowledge-portal:shortcuts", opened);
    openDocument(matrix());
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await userEvent.click(screen.getByRole("button", { name: "All shortcuts" }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("knowledge-portal:shortcuts", opened);
  });

  it("opens at the passage a search result names, focused (2.4)", async () => {
    openDocument(matrix(), "/library/d#passage-b3");
    await screen.findByRole("grid", { name: /Passages of version 1/ });
    await waitFor(() => expect(cell("Sheet 1, row 3")).toHaveFocus());
    expect(screen.getByRole("complementary", { name: "Passage 3" })).toHaveTextContent("seen");
  });
});

describe("withdraw and return to service", { timeout: 20_000 }, () => {
  const inService = (): LibraryDocument => {
    const document = matrix({ revisions: [{ id: "r1", passages: BLOCKS.map((item) => ({ block_id: item.id, text: item.text, included: true, exclusion_reason: null })) }] });
    return { ...document, published_id: "p", publications: [{ id: "p", version_id: "v1", revision_id: "r1", fingerprint: "f", withdrawn_at: null, activated_at: "2026-10-08T09:00:00Z", built_at: "2026-10-08T09:00:00Z", requires_activation: false, indexing_attempts: 1, chunk_count: 4, approved_at: "2026-10-08T09:00:00Z", approved_by: amina, chunking_policy: "structure" }] } as unknown as LibraryDocument;
  };

  it("says who cites it before the button that withdraws it, and needs a reason (2.3)", async () => {
    openDocument(inService());
    vi.spyOn(api, "dependencies").mockResolvedValue({
      items: [{ proposal_id: "p1", requirement_id: "r1", requirement_title: "Fibre bundle order" }], next_offset: null,
    } as never);
    const withdraw = vi.spyOn(api, "withdraw").mockResolvedValue(inService());
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw…" }));
    const panel = screen.getByRole("region", { name: "Withdraw 'Product matrix'" });
    const cites = await within(panel).findByText(/requirement you can see cites it now/);
    const button = within(panel).getByRole("button", { name: "Withdraw 'Product matrix'" });
    expect(cites.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(button);
    expect(withdraw).not.toHaveBeenCalled();
    await userEvent.type(within(panel).getByRole("textbox", { name: /Why is it no longer safe/ }), "Superseded by the new policy");
    await userEvent.click(button);
    await waitFor(() => expect(withdraw).toHaveBeenCalledWith("d", { expected_version: 4, reason: "Superseded by the new policy" }));
  });

  it("says the count is unknown, not zero, when Requirement AI doesn't answer", async () => {
    openDocument(inService());
    vi.spyOn(api, "dependencies").mockRejectedValue(new ApiError(502, "Requirement AI is unreachable."));
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw…" }));
    expect(await screen.findByText(/The count is unknown, not zero\./)).toBeInTheDocument();
  });

  it("returns a withdrawn document to service by publishing its last approved review again", async () => {
    const live = inService();
    const withdrawn = { ...live, published_id: null, publications: [{ ...live.publications[0]!, withdrawn_at: "2026-10-08T10:00:00Z", withdrawn_by: amina, withdrawal_reason: "ADSL retired" }] } as LibraryDocument;
    const approve = vi.spyOn(api, "approve").mockResolvedValue(live);
    openDocument(withdrawn);
    await userEvent.click(await screen.findByRole("button", { name: "Return to service…" }));
    const panel = screen.getByRole("region", { name: "Return 'Product matrix' to service" });
    expect(panel).toHaveTextContent("ADSL retired");
    await userEvent.click(within(panel).getByRole("button", { name: "Return to service" }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith("d", "v1", { expected_version: 4, revision_id: "r1", fingerprint: "f" }));
  });
});
