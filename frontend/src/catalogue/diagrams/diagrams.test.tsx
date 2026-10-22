import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Offering, type Release } from "../../api/client";
import { checkAxeAfterEach } from "../../test/axe";
import { catalogue } from "../catalogue";
import { MapPage } from "../MapPage";
import type { CatalogueContext } from "../useCatalogue";
import { capabilityMap, connectionsFlow, offeringStructure, systemContext, versionTimeline } from "./build";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

const capability = (id: string, name: string, domain_id: string | null) => ({ id, name, domain_id, triggers: [] });
const system = (id: string, name: string, extra: object = {}) => ({
  id, name, aliases: [], capabilities: [], components: [], constraints: [], ...extra,
});

const release = (extra: Partial<Release> = {}) => ({
  id: "live", name: "September", revision: 1, status: "published", documents: [],
  published_at: "2026-10-03T00:00:00Z", published_by: "fake-owner",
  landscape_domains: [{ id: "orchestration", name: "Order orchestration", parent_id: null }],
  capability_domains: [{ id: "fulfilment", name: "Fulfilment", parent_id: null }, { id: "billing", name: "Billing", parent_id: null }],
  systems: [
    system("rtf", "RTF", { landscape_domain_id: "orchestration" }),
    system("cwom", "CWOM", { landscape_domain_id: "orchestration", capabilities: [capability("c1", "Order orchestration", "fulfilment")] }),
    system("wfm", "WFM", { capabilities: [capability("c2", "Field work", null)] }),
    system("bscs", "BSCS", { capabilities: [capability("c3", "Rating", "billing")] }),
    system("edms", "EDMS"),
  ],
  relationships: [
    { source_system_id: "rtf", target_system_id: "cwom", kind: "orchestrates", description: "Fixed orders" },
    { source_system_id: "cwom", target_system_id: "wfm", kind: "orchestrates", description: "Work orders" },
    { source_system_id: "cwom", target_system_id: "bscs", kind: "unspecified", description: "Charges" },
  ],
  ...extra,
}) as unknown as Release;

describe("connectionsFlow", () => {
  it("draws the connected systems, each connection from the one that depends, and counts the rest", () => {
    const flow = connectionsFlow(release(), { href: (id) => `/s/${id}` });
    expect(flow.nodes.map((node) => node.label)).toEqual(["BSCS", "CWOM", "RTF", "WFM"]);
    expect(flow.nodes.find((node) => node.id === "cwom")).toMatchObject({ detail: "Order orchestration", href: "/s/cwom" });
    expect(flow.edges).toContainEqual({ from: "rtf", to: "cwom", label: "orchestrates", dashed: false });
    // A connection whose kind its source left unsaid is dashed, and says so in its label.
    expect(flow.edges).toContainEqual({ from: "cwom", to: "bscs", label: "depends on", dashed: true });
    expect(flow.unconnected).toBe(1);
  });

  it("marks an order's systems, and keeps one in even when it connects to nothing", () => {
    const flow = connectionsFlow(release(), { highlight: new Set(["cwom", "edms"]) });
    expect(flow.nodes.find((node) => node.id === "edms")).toMatchObject({ tone: "subject", status: "In this order" });
    expect(flow.nodes.find((node) => node.id === "rtf")?.tone).toBeUndefined();
  });
});

describe("systemContext", () => {
  it("puts what depends on a system on its left and what it depends on on its right", () => {
    const { nodes, edges } = systemContext(release(), "cwom", { owned: new Set(["cwom", "rtf"]) });
    expect(nodes.find((node) => node.id === "cwom")).toMatchObject({ lane: "system", tone: "subject" });
    expect(nodes.find((node) => node.id === "in:rtf")).toMatchObject({ lane: "callers", label: "RTF" });
    expect(nodes.find((node) => node.id === "out:wfm")).toMatchObject({ lane: "called", tone: "gap", status: "No squad" });
    expect(edges).toContainEqual({ from: "in:rtf", to: "cwom", label: "orchestrates", dashed: false });
  });

  it("draws a system on both sides when it both depends and is depended on", () => {
    const loop = release({
      relationships: [
        { source_system_id: "cwom", target_system_id: "rtf", kind: "calls_api", description: "" },
        { source_system_id: "rtf", target_system_id: "cwom", kind: "orchestrates", description: "" },
      ] as Release["relationships"],
    });
    expect(systemContext(loop, "cwom").nodes.map((node) => node.id)).toEqual(["cwom", "in:rtf", "out:rtf"]);
  });

  it("says so on a side with nothing on it, rather than leave the column blank", () => {
    const one = release({
      relationships: [{ source_system_id: "cwom", target_system_id: "rtf", kind: "calls_api", description: "" }] as Release["relationships"],
    });
    expect(systemContext(one, "cwom").nodes.find((node) => node.lane === "callers")).toMatchObject({ label: "Nothing depends on it", tone: "muted" });
  });
});

describe("capabilityMap", () => {
  it("files each capability under its business area, with the system that has it, and keeps the unfiled", () => {
    const map = capabilityMap(release());
    expect(map.lanes.map((lane) => lane.label)).toEqual(["Fulfilment", "Billing", "In no business area"]);
    expect(map.nodes.find((node) => node.label === "Rating")).toMatchObject({ lane: "billing", detail: "BSCS" });
    expect(map.nodes.find((node) => node.label === "Field work")).toMatchObject({ lane: "unfiled", detail: "WFM" });
  });
});

describe("offeringStructure", () => {
  const offering = {
    id: "fibre", name: "Business fibre", family: null,
    order_types: [
      { code: "NEW", name: "New connection", enabled: true, channels: [] },
      { code: "MOD", name: "Change speed", enabled: true, channels: [] },
      { code: "OLD", name: "Legacy move", enabled: false, channels: [] },
    ],
    components: [
      { id: "line", name: "Fibre line", responsibilities: [{ system_id: "cwom", role: "FULFILS", order_types: [], description: "" }] },
      { id: "router", name: "Router", mandatory: false, responsibilities: [] },
    ],
  } as unknown as Offering;

  it("shows each order type's journey or its gap, the parts, and who delivers each part", () => {
    const journeys = [{ id: "j1", product_id: "fibre", order_type_code: "NEW" }] as unknown as NonNullable<Release["journeys"]>;
    const { nodes, edges } = offeringStructure(offering, journeys, (id) => id.toUpperCase(), { journey: (id) => `/j/${id}` });
    expect(nodes.find((node) => node.id === "order:NEW")).toMatchObject({ status: "Has a journey", href: "/j/j1" });
    expect(nodes.find((node) => node.id === "order:MOD")).toMatchObject({ status: "No journey", tone: "gap" });
    expect(nodes.find((node) => node.id === "order:OLD")).toMatchObject({ status: "Not offered", tone: "muted" });
    expect(nodes.find((node) => node.id === "part:router")).toMatchObject({ detail: "Optional", tone: "gap", status: "No system named" });
    expect(edges).toContainEqual({ from: "part:line", to: "system:cwom", label: "fulfils" });
  });
});

describe("versionTimeline", () => {
  it("runs oldest first, drafts last, each version pointing at the next", () => {
    const releases = [
      release({ id: "draft", name: "October", status: "draft", published_at: null }),
      release({ id: "live", name: "September" }),
      release({ id: "first", name: "Initial", published_at: "2026-01-01T00:00:00Z" }),
    ];
    const { nodes, edges } = versionTimeline(releases, "live");
    expect(nodes.map((node) => [node.label, node.status])).toEqual([["Initial", "Replaced"], ["September", "In service"], ["October", "In preparation"]]);
    expect(edges).toEqual([{ from: "first", to: "live" }, { from: "live", to: "draft" }]);
  });
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
}

function renderMap(path: string) {
  vi.spyOn(api, "changeRequests").mockResolvedValue([] as never);
  const context: CatalogueContext = { book: catalogue(release()), base: "/architecture", inService: true, actorName: () => "Amina Owner" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="map" element={<MapPage />} />
            <Route path="systems/:systemId" element={<p>A system's record</p>} />
          </Route>
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MapPage", () => {
  it("draws how systems connect, with every connection and what it is for one press away", async () => {
    renderMap("/architecture/map");
    expect(screen.getByRole("heading", { level: 1, name: "Map" })).toBeInTheDocument();
    const flow = screen.getByRole("group", { name: "How systems connect" });
    expect(within(flow).getByRole("link", { name: "CWOM, Order orchestration" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const table = screen.getByRole("table", { name: "Every connection between systems in this version" });
    expect(within(table).getByText("Work orders")).toBeInTheDocument();
  });

  it("opens a system's record in the app when its node is pressed", async () => {
    renderMap("/architecture/map");
    await userEvent.click(within(screen.getByRole("group", { name: "How systems connect" })).getByRole("link", { name: "WFM" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/architecture/systems/wfm");
  });

  it("reads what systems do by business area under its own lens, kept in the address", async () => {
    renderMap("/architecture/map");
    await userEvent.click(screen.getByRole("tab", { name: "What systems do" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/architecture/map?lens=capabilities");
    expect(within(screen.getByRole("group", { name: "What systems do, by business area" })).getByRole("link", { name: "Rating, BSCS" })).toBeInTheDocument();
  });
});
