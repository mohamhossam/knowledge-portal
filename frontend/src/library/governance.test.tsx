import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDocument } from "../api/client";
import type { DocumentContext } from "./documentContext";
import { SearchPage } from "./SearchPage";
import { VersionsPage } from "./VersionsPage";

class NoResize {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", NoResize));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const amina = { id: { value: "fake-owner" }, display_name: "Amina Owner", email: null };

function documentWithBuild(extra: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id: "d", title: "Coverage", owner: amina, version: 7, can_edit: true, is_owner: true,
    published_id: "live", review_fingerprint: "f", build_fingerprint: "b",
    versions: [{ id: "v1", number: 1, filename: "coverage.txt", stage: "ready_for_review", attempt: 1, uploaded_at: "2026-10-01T00:00:00Z", uploaded_by: amina, revisions: [{ id: "r1" }], blocking_warnings: [] }],
    publications: [
      { id: "live", version_id: "v1", revision_id: "r1", chunking_policy: "structure", approved_by: amina, approved_at: "2026-10-01T00:00:00Z", activated_at: "2026-10-01T00:00:00Z", built_at: "2026-10-01T00:00:00Z", withdrawn_at: null, requires_activation: false, indexing_attempts: 1, chunk_count: 4, replaces_publication_id: null },
      { id: "build", version_id: "v1", revision_id: "r1", chunking_policy: "table-fields-512-768-v2", approved_by: amina, approved_at: "2026-10-02T00:00:00Z", activated_at: null, built_at: "2026-10-02T00:00:00Z", withdrawn_at: null, requires_activation: true, indexing_attempts: 1, chunk_count: 9, chunk_manifest: "m".repeat(64), replaces_publication_id: "live" },
    ],
    ...extra,
  } as unknown as LibraryDocument;
}

function renderVersions(document: LibraryDocument) {
  const activate = vi.fn();
  vi.spyOn(api, "dependencies").mockResolvedValue({ items: [{ proposal_id: "p1", requirement_id: "req-1", requirement_title: "Fibre bundle ordering" }], next_offset: null } as never);
  const mutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  const context = {
    document,
    hook: { build: mutation, activate: { ...mutation, mutate: activate }, discard: mutation, retryIndexing: mutation, reload: vi.fn() },
    review: { key: "k", drafts: {}, summary: "" },
    setReview: vi.fn(),
    dirty: 0,
    announce: vi.fn(),
  } as unknown as DocumentContext;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="*" element={<VersionsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { activate };
}

describe("VersionsPage", () => {
  it("lists the files and what was published, and activates the index for tables only through its consequence panel", async () => {
    const { activate } = renderVersions(documentWithBuild());
    expect(screen.getByRole("table", { name: "Files uploaded, newest first" })).toHaveTextContent("coverage.txt");
    expect(screen.getAllByText("In service").length).toBeGreaterThan(0);
    expect(screen.getByText("Built; waiting to be activated")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Activate it…" }));
    const panel = screen.getByRole("region", { name: "Activate the search index for tables" });
    // The consequence comes before the verb (§5): who cites it now (only those you can see), then the button.
    expect(await within(panel).findByText(/requirement you can see cites the version in service/)).toHaveTextContent("Their owners are told the source changed");
    expect(activate).not.toHaveBeenCalled();
    await userEvent.click(within(panel).getByRole("button", { name: "Activate it" }));
    expect(activate).toHaveBeenCalledWith({ buildId: "build", manifest: "m".repeat(64) }, expect.anything());
  });

  it("offers only to discard a build whose source moved on, and asks before discarding", async () => {
    const stale = documentWithBuild({
      versions: [{ ...documentWithBuild().versions[0]!, revisions: [{ id: "r1" }, { id: "r2" }] }] as never,
    });
    renderVersions(stale);
    expect(screen.getByText(/The review was saved again since this build\. Discard it and build again\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate it…" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard it…" }));
    const panel = screen.getByRole("region", { name: "Discard the search index for tables" });
    expect(panel).toHaveTextContent("It can't be brought back");
    expect(within(panel).getByRole("button", { name: "Discard it" })).toBeInTheDocument();
  });
});

describe("SearchPage", () => {
  const chunk = (id: string, locations: string[]) => ({
    id, document_id: "d", document_title: "Coverage", version_number: 2, location: "Line 1", heading_path: [],
    block_id: id, language: "en", original_text: `Passage ${id}`, context_text: `Line 0
Before.

Line 1
Passage ${id}.`, context_locations: locations,
    field_context: "",
  });

  it("searches from the address, shows exact passages, and offers surrounding text only when it reaches beyond the passage", async () => {
    const search = vi.spyOn(api, "search").mockResolvedValue([chunk("a", ["Line 1", "Line 2"]), chunk("b", ["Line 1"])] as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/library/search?q=coverage"]}><SearchPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("searchbox", { name: "Words from a policy" })).toHaveValue("coverage");
    expect(await screen.findByText(/2 passages from 1 document for/)).toHaveTextContent("2 passages from 1 document for 'coverage', best first.");
    expect(search).toHaveBeenCalledWith("coverage");
    // A result opens its document at that passage.
    expect(screen.getAllByRole("link", { name: /Open at the passage/ })[0]).toHaveAttribute("href", "/library/d#passage-a");
    const toggles = screen.getAllByRole("button", { name: /surrounding text/ });
    expect(toggles).toHaveLength(1);
    fireEvent.click(toggles[0]!);
    expect(screen.getByText("Before.")).toBeInTheDocument();
    expect(screen.getByText("Passage a.")).toHaveClass("lib-context__cited");
  });
});

describe("CitationsPage", () => {
  it("shows proposals and source impact with rows, linking each requirement into requirement work", async () => {
    const citation = { version_number: 1, location: "Line 2", publication_id: "old" };
    vi.spyOn(api, "dependencies").mockResolvedValue({
      items: [{
        requirement_id: "req-1", requirement_title: "Fibre bundle ordering", proposal_id: "p1", statement: "Confirm coverage first.",
        status: "accepted", current_analysis: true, round_number: 2, publication_current: false, citation,
      }],
      next_offset: null,
    } as never);
    vi.spyOn(api, "sourceImpact").mockResolvedValue({
      items: [{
        dependency: {
          id: "dep-1", requirement_id: "req-1", requirement_title: "Fibre bundle ordering", target_kind: "story",
          statement: "As a seller I confirm coverage.", active: true, lineage: { citation, via: ["Feature: Ordering"] },
        },
        publication_current: false, needs_review: true, publication_state: "3:withdrawn",
        decisions: [{ decision: "retain_historical", reason: "Earlier rollout.", actor: amina, recorded_at: "2026-10-02T00:00:00Z" }],
      }],
      next_offset: null,
    } as never);
    const { CitationsPage } = await import("./CitationsPage");
    const context = { document: documentWithBuild(), hook: {}, review: {}, setReview: vi.fn(), dirty: 0 } as unknown as DocumentContext;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Routes>
            <Route element={<Outlet context={context} />}>
              <Route path="*" element={<CitationsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Cites a replaced version; its owner should reconcile it.")).toBeInTheDocument();
    // A link into Requirement AI says it leaves the portal.
    expect(screen.getAllByRole("link", { name: "Fibre bundle ordering (opens Requirement AI)" })[0]).toHaveAttribute("href", "/requirements/req-1");
    expect(await screen.findByText("Source changed; awaiting its owner")).toBeInTheDocument();
    expect(screen.getByText("Feature: Ordering").closest("span")).toHaveTextContent("Through Feature: Ordering · version 1, Line 2");
    expect(screen.getByText("Earlier rollout.").closest("td")).toHaveTextContent(/^Kept by Amina Owner, 2 Oct 2026/);
    expect(screen.getByText(/1 item waits for that decision/)).toBeInTheDocument();
  });
});
