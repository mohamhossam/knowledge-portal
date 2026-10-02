import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDocument } from "../api/client";
import type { DocumentContext } from "./documentContext";
import { SearchPage } from "./SearchPage";
import { VersionsPage } from "./VersionsPage";

afterEach(() => vi.restoreAllMocks());

const amina = { id: { value: "fake-owner" }, display_name: "Amina Owner", email: null };

function documentWithBuild(extra: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id: "d", title: "Coverage", owner: amina, version: 7, can_edit: true,
    published_id: "live", review_fingerprint: "f", build_fingerprint: "b",
    versions: [{ id: "v1", number: 1, revisions: [{ id: "r1" }], blocking_warnings: [] }],
    publications: [
      { id: "live", version_id: "v1", revision_id: "r1", chunking_policy: "structure", approved_by: amina, approved_at: "2026-10-01T00:00:00Z", activated_at: "2026-10-01T00:00:00Z", built_at: "2026-10-01T00:00:00Z", withdrawn_at: null, requires_activation: false, indexing_attempts: 1, chunk_count: 4, replaces_publication_id: null },
      { id: "build", version_id: "v1", revision_id: "r1", chunking_policy: "table-fields-512-768-v2", approved_by: amina, approved_at: "2026-10-02T00:00:00Z", activated_at: null, built_at: "2026-10-02T00:00:00Z", withdrawn_at: null, requires_activation: true, indexing_attempts: 1, chunk_count: 9, chunk_manifest: "m".repeat(64), replaces_publication_id: "live" },
    ],
    ...extra,
  } as unknown as LibraryDocument;
}

function renderVersions(document: LibraryDocument) {
  const activate = vi.fn();
  const mutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  const context = {
    document,
    hook: { build: mutation, activate: { ...mutation, mutate: activate }, discard: mutation, retryIndexing: mutation, reload: vi.fn() },
    review: { key: "k", drafts: {}, summary: "" },
    setReview: vi.fn(),
    dirty: 0,
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
  it("lists every search version, and activates a build only once its consequence is acknowledged", () => {
    const { activate } = renderVersions(documentWithBuild());
    expect(screen.getAllByText("In service").length).toBeGreaterThan(0);
    expect(screen.getByText("Built, awaiting activation")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Activate this version" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I understand that requirements citing/));
    fireEvent.click(button);
    expect(activate).toHaveBeenCalledWith({ buildId: "build", manifest: "m".repeat(64) });
  });

  it("offers only to discard a build whose source moved on", () => {
    const stale = documentWithBuild({
      versions: [{ id: "v1", number: 1, revisions: [{ id: "r1" }, { id: "r2" }], blocking_warnings: [] }] as never,
    });
    renderVersions(stale);
    expect(screen.getByRole("alert")).toHaveTextContent("The review was saved again since this build.");
    expect(screen.queryByRole("button", { name: "Activate this version" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard it" })).toBeInTheDocument();
  });
});

describe("SearchPage", () => {
  const chunk = (id: string, locations: string[]) => ({
    id, document_id: "d", document_title: "Coverage", version_number: 2, location: "Line 1", heading_path: [],
    original_text: `Passage ${id}`, context_text: `Line 0
Before.

Line 1
Passage ${id}.`, context_locations: locations,
    field_context: "",
  });

  it("shows exact passages, and offers surrounding text only when it reaches beyond the passage", async () => {
    vi.spyOn(api, "search").mockResolvedValue([chunk("a", ["Line 1", "Line 2"]), chunk("b", ["Line 1"])] as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><SearchPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("What are you looking for?"), { target: { value: "coverage" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("2 passages from 1 document, best first.")).toBeInTheDocument();
    const toggles = screen.getAllByRole("button", { name: /surrounding text/ });
    expect(toggles).toHaveLength(1);
    fireEvent.click(toggles[0]!);
    expect(screen.getByText("Before.")).toBeInTheDocument();
    expect(screen.getByText("Passage a.").closest(".context-place")).toHaveClass("is-cited");
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
    expect(screen.getAllByRole("link", { name: "Fibre bundle ordering" })[0]).toHaveAttribute("href", "/requirements/req-1");
    expect(await screen.findByText("Source changed; awaiting its owner")).toBeInTheDocument();
    expect(screen.getByText(/Through Feature: Ordering/)).toBeInTheDocument();
    expect(screen.getByText(/Kept by Amina Owner/)).toBeInTheDocument();
    expect(screen.getByText(/1 item waits for that decision/)).toBeInTheDocument();
  });
});
