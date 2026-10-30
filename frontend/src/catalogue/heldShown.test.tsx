import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { checkAxeAfterEach } from "../test/axe";
import { catalogue } from "./catalogue";
import { OfferingsPage } from "./OfferingsPage";
import { SystemsPage } from "./SystemsPage";
import type { CatalogueContext } from "./useCatalogue";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

const OFFERING = EXPLORED.products![0]!;

/** The explorer's version, holding what the edits write: each of these was edited but shown nowhere. */
const RELEASE = {
  ...EXPLORED,
  revision: 2,
  status: "draft",
  documents: [],
  capability_domains: [{ id: "fulfilment", name: "Fulfilment", accepted: [] }],
  systems: EXPLORED.systems.map((system) =>
    system.id === "cwom" ? { ...system, capabilities: [{ id: "orchestrate", name: "Orchestrate orders", triggers: ["orchestrate"], domain_id: "fulfilment", accepted: [] }] } : system,
  ),
  interfaces: [
    {
      id: "if-orders", name: "Order API", system_id: "cwom", style: "api", description: "Takes channel orders.", source: "SDD §8", confidence: "confirmed",
      consumer_ids: [], open_api_ids: [], entity_ids: [], relays: [], accepted: [],
    },
  ],
  products: [
    {
      ...OFFERING,
      purpose: "One bill for internet and security.",
      order_types: OFFERING.order_types.map((type) => ({ ...type, stage: "join" })),
      plans: [{ name: "Business Pro Plus 200", description: "For small offices.", characteristics: [], accepted: [] }],
      components: OFFERING.components.map((part, index) =>
        index === 0
          ? { ...part, hub: true, description: "The router every other part plugs into.", responsibilities: part.responsibilities.map((item) => ({ ...item, description: "Provisions it." })) }
          : part,
      ),
      tracking: { ...OFFERING.tracking!, fallout: [{ trigger: "Coverage fails", system_id: "cwom" }] },
    },
  ],
  portfolio: [
    { id: "smb", name: "SMB", level: "business unit", description: "Small and medium businesses.", source: "Portfolio deck p.2", confidence: "confirmed", deprecated: false, accepted: [] },
    { id: "old", name: "Legacy", level: "family", parent_id: "smb", deprecated: true, replaced_by: "smb", accepted: [] },
  ],
  realisations: [
    { id: "cfs-internet", name: "Internet CFS", layer: "cfs", description: "The customer-facing internet service.", source: "SDD §5", aliases: [], system_ids: [], realised_by: [], rules: [], accepted: [] },
  ],
} as unknown as Release;

function renderAt(path: string, routes: ReactNode) {
  vi.spyOn(api, "changeRequests").mockResolvedValue([] as never);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({ outdated_requirements: 0 } as never);
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
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

const offerings = (
  <>
    <Route path="offerings" element={<OfferingsPage />} />
    <Route path="offerings/:offeringId" element={<OfferingsPage />} />
  </>
);

describe("a system's record shows what its edits hold", () => {
  it("says a capability's business area, and an interface's description and source", () => {
    renderAt("/architecture/systems/cwom", <Route path="systems/:systemId" element={<SystemsPage />} />);
    const capability = screen.getByRole("rowheader", { name: /Orchestrate orders/ });
    expect(within(capability).getByText(/Business area:/)).toHaveTextContent("Business area: Fulfilment");
    // The row is headed by the name alone; what it is and where it comes from are cells of their own.
    const api = screen.getByRole("rowheader", { name: "Order API" });
    expect(within(api.closest("tr")!).getByText("Takes channel orders.")).toBeInTheDocument();
    expect(within(api.closest("tr")!).getByText("SDD §8")).toBeInTheDocument();
  });
});

describe("an offering's record shows what its edits hold", () => {
  it("says why a customer buys it, the device it is built on, a part's and a role's description, and an order type's stage", () => {
    renderAt(`/architecture/offerings/${OFFERING.id}`, offerings);
    expect(screen.getByText("One bill for internet and security.")).toBeInTheDocument();
    expect(screen.getByText(/The device it is built on/)).toBeInTheDocument();
    expect(screen.getByText("The router every other part plugs into.").closest("th")).toBeNull();
    expect(screen.getAllByText("Provisions it.").length).toBeGreaterThan(0);
  });

  it("says each order type's stage", () => {
    renderAt(`/architecture/offerings/${OFFERING.id}?tab=orders`, offerings);
    expect(screen.getAllByText(/Joining/).length).toBeGreaterThan(0);
  });

  it("says what a plan is", () => {
    renderAt(`/architecture/offerings/${OFFERING.id}?tab=plans`, offerings);
    expect(screen.getByText("For small offices.")).toBeInTheDocument();
  });

  it("says the system an order falls out in", () => {
    renderAt(`/architecture/offerings/${OFFERING.id}?tab=service`, offerings);
    const fallout = screen.getByRole("rowheader", { name: "Coverage fails" }).closest("tr")!;
    expect(within(fallout).getByRole("link", { name: "CWOM" })).toBeInTheDocument();
  });
});

describe("the registers show what their edits hold", () => {
  it("says what a node or record covers, what replaces a retired node, and where each comes from", () => {
    renderAt("/architecture/offerings", offerings);
    expect(screen.getByText("Small and medium businesses.").closest("th")).toBeNull();
    expect(screen.getByText("Portfolio deck p.2")).toBeInTheDocument();
    // A node or record that states no source says so, rather than saying nothing.
    expect(screen.getAllByText("Not stated").length).toBeGreaterThan(0);
    expect(screen.getByText(/Retired, replaced by/)).toBeInTheDocument();
    expect(screen.getByText("The customer-facing internet service.")).toBeInTheDocument();
    expect(screen.getByText("SDD §5")).toBeInTheDocument();
  });
});
