import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { catalogue } from "./catalogue";
import { SystemsPage } from "./SystemsPage";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const system = (id: string, name: string, extra: object = {}) => ({ id, name, aliases: [], capabilities: [], components: [], constraints: [], ...extra });

const draft = (extra: Partial<Release> = {}) => ({
  id: "d", name: "October", revision: 5, built_revision: 5, status: "draft", documents: [], index_profile: "p",
  systems: [system("cwom", "CWOM", { description: "Orchestrates orders." }), system("bscs", "BSCS")],
  relationships: [],
  ...extra,
}) as unknown as Release;

function renderAt(release: Release, path: string, routes: ReactNode) {
  vi.spyOn(api, "systemOwnership").mockResolvedValue({ system_id: "x", squads: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "organisation").mockResolvedValue({ people: [], squads: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "buildJob").mockResolvedValue(null);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({
    active_release_id: "live", requirements: 7, features: 0, stories: 0, outdated_requirements: 2, outdated_features: 0, outdated_stories: 0,
  });
  vi.spyOn(api, "releaseChanges").mockResolvedValue({ base_release_id: "live", draft_release_id: "d", changes: [] });
  vi.spyOn(api, "suggestions").mockResolvedValue({ release_id: "d", release_revision: 5, suggestions: [], runs: [] } as never);
  const context: CatalogueContext = {
    book: catalogue(release), base: "/architecture/versions/d", inService: false, editable: true, actorName: () => "Amina Owner",
  };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture/versions/d" element={<Outlet context={context} />}>{routes}</Route>
          <Route path="architecture" element={<p>In service now</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const systemRoutes = (
  <>
    <Route index element={<SystemsPage />} />
    <Route path="systems/:systemId" element={<SystemsPage />} />
  </>
);

describe("hand edits on a system's sheet", () => {
  it("edits a system in place and saves it with the draft's revision", async () => {
    const save = vi.spyOn(api, "saveSystem").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit this system" }));
    fireEvent.change(screen.getByLabelText("What it is"), { target: { value: "Orchestrates fixed-line orders." } });
    fireEvent.click(screen.getByRole("button", { name: "Save the system" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]).toEqual([
      "d", "cwom", { expected_revision: 5, system: expect.objectContaining({ id: "cwom", description: "Orchestrates fixed-line orders." }) },
    ]);
  });

  it("adds a dependency to the whole draft", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Add a dependency" }));
    const panel = screen.getByRole("form", { name: /Add a dependency of CWOM/ });
    const add = within(panel).getByRole("button", { name: "Add the dependency" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(panel).getByLabelText("Depends on"), { target: { value: "bscs" } });
    fireEvent.change(within(panel).getByLabelText(/For what/), { target: { value: "Order closure updates billing." } });
    fireEvent.click(add);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![1]).toMatchObject({
      expected_revision: 5,
      relationships: [{ source_system_id: "cwom", target_system_id: "bscs", kind: "calls_api", description: "Order closure updates billing." }],
    });
  });

  it("adds a second connection to the same system for something else, and refuses the same words", async () => {
    const billing = { source_system_id: "cwom", target_system_id: "bscs", kind: "calls_api" as const, description: "Order closure updates billing." };
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft({ relationships: [billing] }), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Add a dependency" }));
    const panel = screen.getByRole("form", { name: /Add a dependency of CWOM/ });
    const add = within(panel).getByRole("button", { name: "Add the dependency" });
    fireEvent.change(within(panel).getByLabelText("Depends on"), { target: { value: "bscs" } });
    fireEvent.change(within(panel).getByLabelText(/For what/), { target: { value: "order closure updates billing." } });
    expect(add).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(panel).getByLabelText(/For what/), { target: { value: "Reads the account balance." } });
    fireEvent.click(add);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![1].relationships).toHaveLength(2);
  });
});
