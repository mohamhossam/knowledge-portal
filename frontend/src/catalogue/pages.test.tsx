import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { catalogue } from "./catalogue";
import { SystemsPage } from "./SystemsPage";
import type { CatalogueContext } from "./useCatalogue";
import { VersionsPage } from "./VersionsPage";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

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

function renderAt(path: string, routes: React.ReactNode, active = release("live"), squads: object[] = []) {
  vi.spyOn(api, "systemOwnership").mockImplementation(async (id) =>
    ({ system_id: id, squads: squads.filter((squad) => (squad as { resources: { system_id: string }[] }).resources.some((seat) => seat.system_id === id)), products: [], value_streams: [] }) as never);
  vi.spyOn(api, "organisation").mockResolvedValue({ people: [], squads, products: [], value_streams: [] } as never);
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
  it("counts the connections until a system is chosen, and points to the map", () => {
    renderAt("/architecture", systemRoutes);
    expect(screen.getByText("2 connections between systems in this version.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See the map/ })).toHaveAttribute("href", "/architecture/map");
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
    fireEvent.click(within(screen.getByRole("table", { name: "Depends on: CWOM" })).getByRole("link", { name: "WFM" }));
    const title = await screen.findByRole("heading", { level: 2, name: "WFM" });
    expect(title).toHaveFocus();
    expect(within(within(screen.getByRole("table", { name: "Used by: WFM" })).getByRole("link", { name: "CWOM" }).closest("tr")!).getByText("Where you came from")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Systems" })).getByRole("link", { name: /^WFM/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Back to CWOM" })).toBeInTheDocument();
  });
});

describe("SystemsPage sources of what a system does", () => {
  it("says where each capability and component comes from, and when nothing says so", () => {
    const sourced = release("live", {
      systems: [system("cwom", "CWOM", {
        capabilities: [
          { id: "tracking", name: "Order tracking", triggers: ["track orders"], confidence: "confirmed", source: "SDD v2.3 · §4.1", accepted: [] },
          { id: "billing", name: "Billing", triggers: ["bill"], accepted: [] },
        ],
        components: [{ id: "milestones", name: "Milestone tracker", aliases: [], confidence: "inferred", source: "Integration design · Figure 3", accepted: [] }],
      })] as unknown as Release["systems"],
      relationships: [],
    });
    renderAt("/architecture/systems/cwom", systemRoutes, sourced);

    const capabilities = screen.getByRole("table", { name: "Capabilities of CWOM" });
    const tracking = within(capabilities).getByRole("rowheader", { name: /Order tracking/ }).closest("tr")!;
    expect(tracking).toHaveTextContent("Confirmed");
    expect(tracking).toHaveTextContent("SDD v2.3 · §4.1");
    expect(within(capabilities).getByRole("rowheader", { name: /Billing/ }).closest("tr")).toHaveTextContent("Not stated");
    const milestones = within(screen.getByRole("table", { name: "Components of CWOM" })).getByRole("rowheader", { name: /Milestone tracker/ }).closest("tr")!;
    expect(milestones).toHaveTextContent("Inferred");
    expect(milestones).toHaveTextContent("Integration design · Figure 3");
  });
});

describe("SystemsPage gaps and owners", () => {
  const fulfilment = { id: "fulfilment", name: "Fulfilment squad", value_stream_id: "vs", resources: [{ system_id: "cwom", role: "system_contact", person_id: "p1" }] };

  it("says a gap most systems share once, above the list, instead of on every row", async () => {
    renderAt("/architecture", systemRoutes, release("live"), [fulfilment]);
    expect(await screen.findByText("Missing on most systems: concept (all), interfaces (all), squad (2), source (all).")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Systems" })).queryByText(/gaps?$/)).toBeNull();
  });

  it("names the squad that runs a system in the record's head, as Ownership does", async () => {
    renderAt("/architecture/systems/cwom", systemRoutes, release("live"), [fulfilment]);
    const runBy = screen.getByText("Run by").nextElementSibling as HTMLElement;
    await waitFor(() => expect(runBy).toHaveTextContent("Fulfilment squad"));
  });
});

describe("VersionsPage", () => {
  const mockVersions = () => {
    vi.spyOn(api, "releases").mockResolvedValue([release("old"), release("live")]);
    vi.spyOn(api, "releaseAudit").mockResolvedValue([]);
    vi.spyOn(api, "changeRequests").mockResolvedValue([]);
    vi.spyOn(api, "releaseChanges").mockResolvedValue({
      base_release_id: "live", draft_release_id: "old",
      changes: [{ item: "relationship", change: "removed", key: "k", label: "K", fields: [] }],
    });
  };

  it("lists every version newest first, each with its state, and says what change requests wait", async () => {
    mockVersions();
    renderAt("/architecture/versions", <Route path="versions" element={<VersionsPage />} />);
    const list = within(await screen.findByRole("list", { name: "Catalogue versions, newest first" }));
    const rows = list.getAllByRole("link");
    expect(rows.map((row) => row.querySelector(".ds-records__name")!.textContent)).toEqual(["September", "Initial"]);
    expect(rows[0]).toHaveTextContent("In service");
    expect(rows[1]).toHaveTextContent("Replaced");
    expect(rows[1]).toHaveAttribute("href", "/architecture/versions?version=old");
    expect(await screen.findByText("No change request has come from a connected app yet.")).toBeInTheDocument();
  });

  it("carries the change requests in the draft's record, where they are read into", async () => {
    mockVersions();
    vi.mocked(api.releases).mockResolvedValue([release("next", { status: "draft", name: "October" } as Partial<Release>), release("old"), release("live")]);
    renderAt("/architecture/versions?version=next", <Route path="versions" element={<VersionsPage />} />);
    const record = within(await screen.findByRole("article", { name: "October" }));
    expect(record.getByRole("heading", { level: 3, name: "Change requests" })).toBeInTheDocument();
    expect(await record.findByText("No change request has come from a connected app yet.")).toBeInTheDocument();
  });

  it("puts a replaced version back only with a reason, naming what it would change", async () => {
    mockVersions();
    const activate = vi.spyOn(api, "activateRelease").mockResolvedValue(release("old"));
    renderAt("/architecture/versions?version=old", <Route path="versions" element={<VersionsPage />} />);

    expect(await screen.findByRole("heading", { level: 2, name: "Initial" })).toBeInTheDocument();
    expect(screen.getByText("Nothing was published before it: it is the first version.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Put it back in service…" }));
    expect(await screen.findByText(/it would remove 1 connection/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Put ‘Initial’ back in service" })).toHaveTextContent("Requirements would be mapped against ‘Initial’ from then on.");
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

