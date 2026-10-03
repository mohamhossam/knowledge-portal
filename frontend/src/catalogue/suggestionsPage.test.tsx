import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release, type Suggestion } from "../api/client";
import { catalogue } from "./catalogue";
import { SuggestionsPage } from "./SuggestionsPage";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const draft = {
  id: "d", name: "October", revision: 3, status: "draft", relationships: [],
  documents: [{ id: "v1", title: "Integration design", filename: "design.txt", language: "en", mime_type: "text/plain", uploaded_by: "fake-owner" }],
  systems: [
    { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [{ id: "milestones", name: "Milestone tracker", aliases: [] }], constraints: [] },
    { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
} as unknown as Release;

const base = (id: string, content: Partial<Suggestion["content"]>, extra: Partial<Suggestion> = {}) => ({
  id, document_version_id: "v1", citations: [{ location: "line 1", quote: "System: x" }], match: "new", status: "proposed",
  edited: false, model: "fake", prompt_version: "1", created_at: "", decided_by: null, decided_at: null, basis: "stated",
  rationale: null, possible_matches: [], system_name: null, target_system_name: null,
  content: { kind: "system", system_id: "x", name: "", aliases: [], triggers: [], text: "", ...content },
  ...extra,
}) as Suggestion;

const suggestions = [
  base("hub", { kind: "system", system_id: "order-hub", name: "Order Hub" }),
  base("store", { kind: "constraint", system_id: "cwom", text: "Nights only" }, { system_name: "CWOM" }),
  base("cap", { kind: "capability", system_id: "cwom", capability_id: "tracking", name: "Tracking", triggers: ["track orders"] }, { system_name: "CWOM" }),
  base("crm", { kind: "system", system_id: "dynamics-crm", name: "Dynamics CRM" }, {
    possible_matches: [{ role: "system", written_as: "Dynamics CRM", system_id: "bcrm", system_name: "BCRM", reason: "Similar name to BCRM." }],
  }),
];

function renderPage() {
  vi.spyOn(api, "suggestions").mockResolvedValue({ release_id: "d", release_revision: 3, suggestions, runs: [] } as never);
  vi.spyOn(api, "extractions").mockResolvedValue([]);
  let revision = 3;
  const decide = vi.spyOn(api, "decide").mockImplementation(async () => ({ ...draft, revision: ++revision }) as Release);
  const context: CatalogueContext = { book: catalogue(draft), base: "/architecture/versions/d", inService: false, actorName: () => "Amina Owner" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/s"]}>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="s" element={<SuggestionsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { decide };
}

const rowOf = (text: string) => screen.getByText(text).closest("tr")!;

describe("SuggestionsPage", () => {
  it("groups by system, new first, and accepts the ready ones in sequence from the keyboard", async () => {
    const { decide } = renderPage();
    await screen.findByText("Adds the system Order Hub");
    const heads = screen.getAllByRole("columnheader").filter((cell) => cell.closest(".galley__head")).map((cell) => cell.textContent);
    expect(heads[0]).toContain("New system");
    expect(heads.at(-1)).toContain("CWOM");

    fireEvent.keyDown(rowOf("Adds the system Order Hub"), { key: "a" });
    fireEvent.keyDown(rowOf("Adds the constraint “Nights only”"), { key: "a" });
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
    // Each decision carries the revision the one before it returned.
    expect(decide.mock.calls[0]).toEqual(["d", "hub", { expected_revision: 3, accept: true, content: null }]);
    expect(decide.mock.calls[1]).toEqual(["d", "store", { expected_revision: 4, accept: true, content: null }]);
  });

  it("opens a possible match instead of accepting it, and links the system chosen", async () => {
    const { decide } = renderPage();
    await screen.findByText("Adds the system Dynamics CRM");
    fireEvent.keyDown(rowOf("Adds the system Dynamics CRM"), { key: "a" });
    const detail = await screen.findByText("Is “Dynamics CRM” a system the draft already has?");
    const decision = detail.closest(".decision") as HTMLElement;
    const accept = within(decision).getByRole("button", { name: "Accept" });
    expect(accept).toBeDisabled();
    fireEvent.click(within(decision).getByLabelText(/Yes, it is/));
    fireEvent.click(accept);
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0]![2]).toMatchObject({ accept: true, content: { kind: "system", system_id: "bcrm", name: "Dynamics CRM" } });
  });

  it("edits a capability's phrases, then accepts it as edited", async () => {
    const { decide } = renderPage();
    await screen.findByText(/Adds the capability Tracking/);
    fireEvent.keyDown(rowOf("Adds the capability Tracking, matched by “track orders”"), { key: "e" });
    const phrases = await screen.findByLabelText(/Matched by/);
    fireEvent.change(phrases, { target: { value: "track orders\n  order milestones  \n" } });
    fireEvent.change(screen.getByLabelText("Delivered by the component"), { target: { value: "milestones" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept as edited" }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0]![2]).toMatchObject({
      accept: true,
      content: { kind: "capability", system_id: "cwom", component_id: "milestones", triggers: ["track orders", "order milestones"] },
    });
  });

  it("rejects from the keyboard", async () => {
    const { decide } = renderPage();
    await screen.findByText("Adds the system Order Hub");
    fireEvent.keyDown(rowOf("Adds the system Order Hub"), { key: "r" });
    await waitFor(() => expect(decide).toHaveBeenCalledWith("d", "hub", { expected_revision: 3, accept: false, content: null }));
  });
});
