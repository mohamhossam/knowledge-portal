import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { catalogue } from "./catalogue";
import { EvidencePage } from "./EvidencePage";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const release = {
  id: "live", name: "September", revision: 1, status: "published", published_at: "2026-10-03T00:00:00Z",
  published_by: "fake-owner", relationships: [],
  systems: [{ id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [], constraints: [] }],
  documents: [{ id: "doc-1", title: "BPP design", filename: "design.docx", mime_type: "x", language: "en" }],
} as unknown as Release;

function renderPassage(evidence: object) {
  vi.spyOn(api, "evidence").mockResolvedValue(evidence as never);
  const context: CatalogueContext = { book: catalogue(release), base: "/architecture", inService: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/architecture/evidence/p1"]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="evidence/:chunkId" element={<EvidencePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const passage = {
  id: "p1", source_label: "BPP design", location: "paragraphs 10–12", document_version_id: "doc-1",
  text: "BPP design / Fulfilment\nCWOM asks ECM for the router model.",
};

describe("EvidencePage", () => {
  it("names the catalogue entries a section-v4 passage mentions and where its text repeats", async () => {
    renderPassage({
      ...passage, role: "parent", aliases: ["paragraphs 30–32"],
      mentions: [{ entity: "system", entity_id: "cwom", name: "CWOM" }],
    });
    expect(await screen.findByText("Names in the catalogue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CWOM" })).toHaveAttribute("href", "/architecture/systems/cwom");
    expect(screen.getByText("paragraphs 30–32")).toBeInTheDocument();
  });

  it("adds nothing for a passage of an older index", async () => {
    renderPassage(passage);
    expect(await screen.findByText(/paragraphs 10–12/)).toBeInTheDocument();
    expect(screen.queryByText("Names in the catalogue")).not.toBeInTheDocument();
  });
});
