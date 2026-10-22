import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type Organisation, type Release } from "../api/client";
import { checkAxeAfterEach } from "../test/axe";
import { HistoryPage } from "./HistoryPage";
import { OwnershipGrid } from "./OwnershipGrid";
import { PeoplePage } from "./PeoplePage";
import { ProductsPage } from "./ProductsPage";
import { SquadListPage } from "./SquadListPage";
import { SquadsPage } from "./SquadsPage";
import { SystemsBench } from "./SystemsBench";

// jsdom has no layout observer; the sticky measuring hook only needs the interface.
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }));
checkAxeAfterEach();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const release = {
  id: "live", revision: 1, status: "published", documents: [], relationships: [], landscape_domains: [],
  systems: [
    {
      id: "bcrm", name: "BCRM", aliases: [], components: [], constraints: [],
      capabilities: [{ id: "leads", name: "Leads", triggers: [], concept_id: "cap-sales" }],
    },
    { id: "dcrm", name: "DCRM", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
  business_capabilities: [
    { id: "cap-sales", pref_label: "Sales management", alt_labels: [] },
    { id: "cap-old", pref_label: "Retired selling", alt_labels: [] },
  ],
} as unknown as Release;

const org = {
  people: [
    { id: "layla", name: "Layla", active: true, revision: 1 },
    { id: "omar", name: "Omar", active: true, revision: 1 },
  ],
  value_streams: [{ id: "retail", name: "Retail", lead_person_id: "layla", revision: 1 }],
  products: [
    {
      id: "p", name: "Partner channel", description: "", value_stream_id: "retail", system_ids: ["bcrm", "dcrm"],
      offering_ids: [], portfolio_node_id: null, revision: 1,
    },
  ],
  squads: [
    {
      id: "sales", name: "Sales", value_stream_id: "retail", scrum_master_person_id: "layla",
      resources: [{ system_id: "bcrm", role: "system_contact", person_id: "layla" }], revision: 4,
    },
  ],
} as unknown as Organisation;

/** The Ownership area at an address, with every page under it as the app routes them. */
function renderAt(path: string) {
  vi.spyOn(api, "organisation").mockResolvedValue(org);
  vi.spyOn(api, "activeRelease").mockResolvedValue(release);
  vi.spyOn(api, "organisationAudit").mockResolvedValue([]);
  vi.spyOn(api, "organisationReferences").mockResolvedValue([
    {
      subject: "product", subject_id: "p", retired_system_ids: [], retired_offering_ids: [], retired_portfolio_node_id: null,
      retired_capabilities: [], replaced_systems: [], systems_missing: [], systems_unexplained: [], unlinked: true, forwarded: [],
    },
    {
      subject: "squad", subject_id: "sales", retired_system_ids: [], retired_offering_ids: [], retired_portfolio_node_id: null,
      retired_capabilities: [{ system_id: "bcrm", capability_id: "cap-old" }], replaced_systems: [], systems_missing: [], systems_unexplained: [], unlinked: false, forwarded: [],
    },
  ]);
  vi.spyOn(api, "knownActors").mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="squads" element={<SquadsPage />}>
            <Route index element={<SystemsBench />} />
            <Route path="systems/:systemId" element={<SystemsBench />} />
            <Route path="assign" element={<OwnershipGrid />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/:productId" element={<ProductsPage />} />
            <Route path="squads" element={<SquadListPage />} />
            <Route path="squads/:squadId" element={<SquadListPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/:personId" element={<PeoplePage />} />
            <Route path="history" element={<HistoryPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ready = () => screen.findByRole("navigation", { name: "Ownership" }, { timeout: 5000 });

describe("Systems", () => {
  it("counts the gap on the head's one line, and lists systems with one quiet tag for those with no squad", async () => {
    renderAt("/squads");
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Ownership" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Systems" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "1 with no squad" })).toHaveAttribute("href", "/squads?show=none");
    const list = screen.getByRole("region", { name: "Systems" });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.querySelector(".ds-records__name")?.textContent)).toEqual(["BCRM", "DCRM"]);
    expect(rows[0]).toHaveTextContent("Sales");
    expect(rows[1]).toHaveTextContent("No squad");
    // The record side, with nothing chosen, names the gaps by product.
    expect(screen.getByRole("link", { name: "Give it to a squad: Partner channel" })).toHaveAttribute("href", "/squads/assign?show=none&product=p");
  });

  it("filters to the systems with no squad, from the address the grid used", async () => {
    renderAt("/squads?show=none");
    await ready();
    const list = screen.getByRole("region", { name: "Systems" });
    expect(within(list).getByRole("combobox", { name: "Run by" })).toHaveValue("show:none");
    expect(within(list).getAllByRole("link").map((row) => row.querySelector(".ds-records__name")?.textContent)).toEqual(["DCRM"]);
    expect(within(list).getByRole("status")).toHaveTextContent("1 system of 2");
    fireEvent.change(within(list).getByRole("combobox", { name: "Run by" }), { target: { value: "squad:sales" } });
    expect(within(list).getAllByRole("link").map((row) => row.querySelector(".ds-records__name")?.textContent)).toEqual(["BCRM"]);
  });

  it("shows who runs a system, its contact and seats, and its products, each a link across", async () => {
    renderAt("/squads/systems/bcrm");
    const record = await screen.findByRole("article", { name: "BCRM" }, { timeout: 5000 });
    const table = within(record).getByRole("table", { name: "Squads that run BCRM" });
    expect(within(table).getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/squads/squads/sales");
    expect(within(table).getByRole("link", { name: "Layla" })).toHaveAttribute("href", "/squads/people/layla");
    expect(within(record).getByRole("link", { name: "Partner channel" })).toHaveAttribute("href", "/squads/products/p");
    expect(within(screen.getByRole("region", { name: "Systems" })).getByRole("link", { current: "page" })).toHaveTextContent("BCRM");
  });

  it("gives the system to the suggested squad from its record, in place, keeping the squad's revision", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads/systems/dcrm");
    const record = await screen.findByRole("article", { name: "DCRM" }, { timeout: 5000 });
    expect(record).toHaveTextContent("No squad runs it yet.");
    fireEvent.click(within(record).getByRole("button", { name: "Give it to a squad" }));
    const panel = screen.getByRole("form", { name: "Give 1 system to a squad" });
    // Sales runs BCRM, the other system in Partner channel: it is offered first.
    const squad = within(panel).getByRole("combobox", { name: "Squad" });
    expect(squad).toHaveValue("sales");
    expect(squad).toHaveAccessibleDescription("Suggested: Sales, because it runs 1 other system in Partner channel.");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Role" }), { target: { value: "developer" } });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Person" }), { target: { value: "omar" } });
    expect(panel).toHaveTextContent("Sales will run DCRM, with a developer seat on it held by Omar.");
    fireEvent.click(within(panel).getByRole("button", { name: "Give 1 system to Sales" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]).toEqual([
      "squads",
      "sales",
      {
        expected_revision: 4,
        squad: expect.objectContaining({
          resources: [
            { system_id: "bcrm", role: "system_contact", person_id: "layla" },
            { system_id: "dcrm", role: "developer", person_id: "omar", capability_id: null },
          ],
        }),
      },
      false,
    ]);
    expect(await screen.findByText("Gave 1 system to Sales.")).toHaveAttribute("role", "status");
  });
});

describe("Assign several", () => {
  it("gives the selected systems to the suggested squad in one save", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads/assign?show=none");
    await ready();
    expect(screen.getByRole("heading", { level: 2, name: "Assign several systems" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the systems list" })).toHaveAttribute("href", "/squads?show=none");
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select the 1 system shown" }));
    const bar = screen.getByRole("region", { name: "Selection" });
    expect(bar).toHaveTextContent("1 system selected");
    fireEvent.click(within(bar).getByRole("button", { name: "Give to a squad…" }));
    const panel = screen.getByRole("form", { name: "Give 1 system to a squad" });
    expect(within(panel).getByRole("combobox", { name: "Squad" })).toHaveValue("sales");
    fireEvent.click(within(panel).getByRole("button", { name: "Give 1 system to Sales" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const said = await screen.findByText("Gave 1 system to Sales.");
    // The bar that opened it is hidden now: focus lands on the outcome instead.
    await waitFor(() => expect(said).toHaveFocus());
  });

  it("says why it can't give systems to a squad that already runs them all", async () => {
    vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads/assign?squad=sales");
    await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select BCRM" }));
    fireEvent.click(screen.getByRole("button", { name: "Give to a squad…" }));
    const panel = screen.getByRole("form", { name: "Give 1 system to a squad" });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Squad" }), { target: { value: "sales" } });
    expect(within(panel).getByRole("button", { name: "Give them to the squad" })).toHaveAccessibleDescription("It already runs every system chosen.");
    fireEvent.keyDown(within(panel).getByRole("combobox", { name: "Squad" }), { key: "Escape" });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});

describe("Products", () => {
  it("shows a product's systems with who runs each, and one way into Assign several for its gaps", async () => {
    renderAt("/squads/products/p");
    const record = await screen.findByRole("article", { name: "Partner channel" }, { timeout: 5000 });
    expect(within(record).getByRole("table")).toHaveTextContent("No squad");
    expect(within(record).getByRole("link", { name: "BCRM" })).toHaveAttribute("href", "/squads/systems/bcrm");
    expect(within(record).getByRole("link", { name: "Give the system with no squad to a squad, in Partner channel" })).toHaveAttribute(
      "href",
      "/squads/assign?show=none&product=p",
    );
  });

  it("flags a product linked to no offering or portfolio node, in its row and its record, and counts it", async () => {
    renderAt("/squads/products/p");
    const checks = await screen.findByRole("list", { name: "To check in Partner channel" }, { timeout: 5000 });
    expect(checks).toHaveTextContent("Not linked to an offering or a portfolio node.");
    expect(within(screen.getByRole("region", { name: "Products" })).getByRole("link", { current: "page" })).toHaveTextContent("To check");
    expect(screen.getByRole("link", { name: "1 product to check" })).toBeInTheDocument();
  });

  it("won't remove a value stream that still holds products or squads, and says why", async () => {
    renderAt("/squads/products");
    const remove = await screen.findByRole("button", { name: "Remove the value stream Retail" }, { timeout: 5000 });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAccessibleDescription("Move or remove its products and squads first.");
    fireEvent.click(remove);
    expect(screen.queryByRole("region", { name: /Remove Retail/ })).not.toBeInTheDocument();
  });
});

describe("Squads", () => {
  it("flags a seat on a capability the system no longer links to, and counts the squad", async () => {
    renderAt("/squads/squads/sales");
    const checks = await screen.findByRole("list", { name: "To check in Sales" }, { timeout: 5000 });
    expect(checks).toHaveTextContent("BCRM › Retired selling: no capability of the system links to it any more.");
    expect(screen.getByRole("link", { name: "1 squad to check" })).toBeInTheDocument();
  });

  it("lists the squad's systems and people, each a link to its record", async () => {
    renderAt("/squads/squads/sales");
    const record = await screen.findByRole("article", { name: "Sales" }, { timeout: 5000 });
    expect(within(record).getByRole("link", { name: "BCRM" })).toHaveAttribute("href", "/squads/systems/bcrm");
    const people = within(record).getByRole("region", { name: /People/ });
    expect(people).toHaveTextContent("Layla · Scrum master; Contact on BCRM");
  });

  it("names the systems a removed squad leaves without one", async () => {
    renderAt("/squads/squads/sales");
    const record = await screen.findByRole("article", { name: "Sales" }, { timeout: 5000 });
    fireEvent.click(within(record).getByRole("button", { name: "Remove…" }));
    const panel = screen.getByRole("region", { name: "Remove Sales?" });
    expect(panel).toHaveTextContent("This system will have no squad: BCRM.");
  });

  it("scopes a seat to a capability the system links to, and clears it when the system changes", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads/squads/sales");
    const record = await screen.findByRole("article", { name: "Sales" }, { timeout: 5000 });
    fireEvent.click(within(record).getByRole("button", { name: "Edit" }));
    const panel = screen.getByRole("form", { name: "Edit Sales" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add another seat" }));
    const seat = within(panel).getAllByRole("group").at(-1)!;
    const system = within(seat).getByRole("combobox", { name: "System" });
    const capability = within(seat).getByRole("combobox", { name: "Capability" });
    fireEvent.change(system, { target: { value: "bcrm" } });
    expect([...(capability as HTMLSelectElement).options].map((option) => option.text)).toEqual(["Whole system", "Sales management"]);
    fireEvent.change(capability, { target: { value: "cap-sales" } });
    fireEvent.change(system, { target: { value: "dcrm" } });
    expect(capability).toHaveValue("");
    fireEvent.change(system, { target: { value: "bcrm" } });
    fireEvent.change(capability, { target: { value: "cap-sales" } });
    fireEvent.change(within(seat).getByRole("combobox", { name: "Role" }), { target: { value: "tester" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save the squad" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![2]).toEqual({
      expected_revision: 4,
      squad: expect.objectContaining({
        resources: [
          { system_id: "bcrm", role: "system_contact", person_id: "layla", capability_id: null },
          { system_id: "bcrm", role: "tester", person_id: null, capability_id: "cap-sales" },
        ],
      }),
    });
  });
});

describe("People", () => {
  it("adds a person with a free id and nulls for what is left blank", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads/people");
    fireEvent.click(await screen.findByRole("button", { name: "Add a person" }, { timeout: 5000 }));
    const panel = screen.getByRole("form", { name: "Add a person" });
    fireEvent.change(within(panel).getByRole("textbox", { name: /Name/ }), { target: { value: "Layla" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add the person" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]).toEqual([
      "people",
      "layla-2",
      { expected_revision: null, person: expect.objectContaining({ id: "layla-2", name: "Layla", email: null, team: null }) },
      true,
    ]);
  });

  it("shows the seats a person holds, and won't make inactive someone who still holds a role", async () => {
    renderAt("/squads/people/layla");
    const record = await screen.findByRole("article", { name: "Layla" }, { timeout: 5000 });
    const seats = within(record).getByRole("table", { name: "Seats Layla holds" });
    expect(within(seats).getByRole("link", { name: "BCRM" })).toHaveAttribute("href", "/squads/systems/bcrm");
    expect(within(seats).getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/squads/squads/sales");
    fireEvent.click(within(record).getByRole("button", { name: "Edit" }));
    const active = screen.getByRole("checkbox", { name: /Active/ });
    expect(active).toBeDisabled();
    expect(active).toHaveAccessibleDescription(/still holds a role/);
  });
});

describe("History", () => {
  it("says when nothing has changed yet", async () => {
    renderAt("/squads/history");
    expect(await screen.findByText("Nothing has changed yet.", undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});
