import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { catalogue } from "./catalogue";
import { SystemsPage } from "./SystemsPage";
import type { CatalogueContext } from "./useCatalogue";
import { VersionsPage } from "./VersionsPage";

afterEach(() => vi.restoreAllMocks());

const system = (id: string, name: string, extra: object = {}) => ({
  id, name, aliases: [], capabilities: [], components: [], constraints: [], ...extra,
});

const release = (id: string, extra: Partial<Release> = {}) => ({
  id, name: id === "live" ? "September" : "Initial", revision: 1, status: "published", documents: [],
  published_at: id === "live" ? "2026-10-03T00:00:00Z" : "2026-01-01T00:00:00Z", published_by: "fake-owner",
  systems: [system("rtf", "RTF"), system("cwom", "CWOM", { aliases: ["fixed order orchestration"] }), system("wfm", "WFM")],
  relationships: [
    { source_system_id: "rtf", target_system_id: "cwom", kind: "orchestrates", description: "Fixed orders" },
    { source_system_id: "cwom", target_system_id: "wfm", kind: "orchestrates", description: "Work orders" },
  ],
  ...extra,
}) as unknown as Release;

function renderAt(path: string, routes: React.ReactNode, active = release("live")) {
  vi.spyOn(api, "systemOwnership").mockResolvedValue({ system_id: "x", squads: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "organisation").mockResolvedValue({ people: [], squads: [], products: [], value_streams: [] } as never);
  const context: CatalogueContext = { book: catalogue(active), base: "/architecture", inService: true, actorName: () => "Amina Owner" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>{routes}</Route>
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

describe("SystemsPage", () => {
  it("lists every connection until a system is chosen", () => {
    renderAt("/architecture", systemRoutes);
    expect(screen.getByRole("heading", { name: /^Connections/ })).toBeInTheDocument();
    expect(screen.getByText("2 connections between 3 systems.", { exact: false })).toBeInTheDocument();
  });

  it("finds a system by an alias and says so", () => {
    renderAt("/architecture", systemRoutes);
    fireEvent.change(screen.getByLabelText("Find a system"), { target: { value: "fixed order" } });
    const index = screen.getByRole("region", { name: "Systems" });
    expect(within(index).getAllByRole("link")).toHaveLength(1);
    expect(within(index).getByText("Also called “fixed order orchestration”")).toBeInTheDocument();
    expect(screen.getByText("1 system of 3")).toBeInTheDocument();
  });

  it("follows a connection, lights the way back, and moves focus to the new record", async () => {
    renderAt("/architecture/systems/cwom", systemRoutes);
    expect(screen.getByText("Orchestrated by CWOM")).toBeInTheDocument();
    expect(screen.getByText("Orchestrates CWOM")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("article")).getByRole("link", { name: "WFM" }));
    const title = await screen.findByRole("heading", { level: 2, name: "WFM" });
    expect(title).toHaveFocus();
    expect(within(within(screen.getByRole("article")).getByRole("link", { name: "CWOM" }).closest("tr")!).getByText("Where you came from")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Systems" })).getByRole("link", { name: /^WFM/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Back to CWOM" })).toBeInTheDocument();
  });
});

describe("VersionsPage", () => {
  const mockVersions = () => {
    vi.spyOn(api, "releases").mockResolvedValue([release("old"), release("live")]);
    vi.spyOn(api, "releaseAudit").mockResolvedValue([]);
    vi.spyOn(api, "changeRequests").mockResolvedValue([]);
    vi.spyOn(api, "mappingImpact").mockResolvedValue({
      active_release_id: "live", requirements: 5, features: 0, stories: 0, outdated_requirements: 2, outdated_features: 0, outdated_stories: 0,
    });
    vi.spyOn(api, "releaseChanges").mockResolvedValue({
      base_release_id: "live", draft_release_id: "old",
      changes: [{ item: "relationship", change: "removed", key: "k", label: "K", fields: [] }],
    });
  };

  it("lists every version newest first, each with its state, and says what waits from Requirement AI", async () => {
    mockVersions();
    renderAt("/architecture/versions", <Route path="versions" element={<VersionsPage />} />);
    const list = within(await screen.findByRole("list", { name: "Catalogue versions, newest first" }));
    const rows = list.getAllByRole("link");
    expect(rows.map((row) => row.querySelector(".ds-records__name")!.textContent)).toEqual(["September", "Initial"]);
    expect(rows[0]).toHaveTextContent("In service");
    expect(rows[1]).toHaveTextContent("Replaced");
    expect(rows[1]).toHaveAttribute("href", "/architecture/versions?version=old");
    expect(await screen.findByText("No change request has come from Requirement AI yet.")).toBeInTheDocument();
  });

  it("puts a replaced version back only with a reason, naming what it would change", async () => {
    mockVersions();
    const activate = vi.spyOn(api, "activateRelease").mockResolvedValue(release("old"));
    renderAt("/architecture/versions?version=old", <Route path="versions" element={<VersionsPage />} />);

    expect(await screen.findByRole("heading", { level: 2, name: "Initial" })).toBeInTheDocument();
    expect(screen.getByText("Nothing was published before it: it is the first version.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Put it back in service…" }));
    expect(await screen.findByText(/it would remove 1 connection/)).toBeInTheDocument();
    expect(await screen.findByText(/3 requirements mapped with the version in service/)).toBeInTheDocument();
    const putBack = screen.getByRole("button", { name: "Put it back in service" });
    // Without a reason nothing happens; the field says what it needs.
    fireEvent.click(putBack);
    expect(activate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Why it goes back")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("Why it goes back"), { target: { value: "September broke billing mapping" } });
    fireEvent.click(putBack);
    await waitFor(() => expect(activate).toHaveBeenCalledWith("old", "September broke billing mapping"));
    expect(await screen.findByText("‘Initial’ is in service again.")).toBeInTheDocument();
  });
});

