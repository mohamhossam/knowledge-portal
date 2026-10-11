import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
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

function renderAt(path: string, page: ReactNode, child: string) {
  vi.spyOn(api, "organisation").mockResolvedValue(org);
  vi.spyOn(api, "activeRelease").mockResolvedValue(release);
  vi.spyOn(api, "organisationAudit").mockResolvedValue([]);
  vi.spyOn(api, "organisationReferences").mockResolvedValue([
    {
      subject: "product", subject_id: "p", retired_system_ids: [], retired_offering_ids: [], retired_portfolio_node_id: null,
      retired_capabilities: [], systems_missing: [], systems_unexplained: [], unlinked: true,
    },
    {
      subject: "squad", subject_id: "sales", retired_system_ids: [], retired_offering_ids: [], retired_portfolio_node_id: null,
      retired_capabilities: [{ system_id: "bcrm", capability_id: "cap-old" }], systems_missing: [], systems_unexplained: [], unlinked: false,
    },
  ]);
  vi.spyOn(api, "knownActors").mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="squads" element={<SquadsPage />}>
            {child === "index" ? <Route index element={page} /> : <Route path={child} element={page} />}
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const counts = () => screen.findByRole("group", { name: "Who runs the systems in service" }, { timeout: 5000 });

describe("OwnershipGrid", () => {
  it("counts the gap as a way into the grid, and filters to the systems with no squad", async () => {
    renderAt("/squads", <OwnershipGrid />, "index");
    expect(await counts()).toHaveTextContent("No squad1 system");
    expect(screen.getByRole("heading", { level: 1, name: "Ownership" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Systems" })).toHaveAttribute("aria-current", "page");
    const table = screen.getByRole("table", { name: "Systems · 2" });
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["BCRM", "DCRM"]);
    fireEvent.click(screen.getByRole("button", { name: /^No squad/ }));
    const filtered = screen.getByRole("table", { name: "Systems · 1 of 2 shown" });
    expect(within(filtered).getByRole("rowheader")).toHaveTextContent("DCRM");
    expect(within(filtered).getByText("No squad")).toBeInTheDocument();
  });

  it("gives the selected systems to the suggested squad in one save, keeping its revision", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads?show=none", <OwnershipGrid />, "index");
    await counts();
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select the 1 system shown" }));
    const bar = screen.getByRole("region", { name: "Selection" });
    expect(bar).toHaveTextContent("1 system selected");
    fireEvent.click(within(bar).getByRole("button", { name: "Give to a squad…" }));
    const panel = screen.getByRole("form", { name: "Give 1 system to a squad" });
    // Sales runs BCRM, the other system in Partner channel: it is offered first.
    const squad = within(panel).getByRole("combobox", { name: "Squad" });
    expect(squad).toHaveValue("sales");
    expect(squad).toHaveAccessibleDescription("Suggested: Sales, because it runs 1 other system in Partner channel.");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Role on each" }), { target: { value: "developer" } });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Person" }), { target: { value: "omar" } });
    expect(panel).toHaveTextContent("Sales will run DCRM, with a developer seat on each held by Omar.");
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
    const said = await screen.findByText("Gave 1 system to Sales.");
    expect(said).toHaveAttribute("role", "status");
    // The bar that opened it is hidden now: focus lands on the outcome instead.
    await waitFor(() => expect(said).toHaveFocus());
  });

  it("says why it can't give systems to a squad that already runs them all", async () => {
    vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads?squad=sales", <OwnershipGrid />, "index");
    await counts();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select BCRM" }));
    fireEvent.click(screen.getByRole("button", { name: "Give to a squad…" }));
    const panel = screen.getByRole("form", { name: "Give 1 system to a squad" });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Squad" }), { target: { value: "sales" } });
    expect(within(panel).getByRole("button", { name: "Give them to the squad" })).toHaveAccessibleDescription("It already runs every system chosen.");
    fireEvent.keyDown(within(panel).getByRole("combobox", { name: "Squad" }), { key: "Escape" });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});

describe("ProductsPage", () => {
  it("shows each product's systems with no give link per row, and one way into the grid for its gaps", async () => {
    renderAt("/squads/products", <ProductsPage />, "products");
    const product = await screen.findByRole("article", { name: "Partner channel" }, { timeout: 5000 });
    expect(within(product).getByRole("table")).toHaveTextContent("No squad");
    expect(within(product).queryByRole("button", { name: /Give it to a squad/ })).not.toBeInTheDocument();
    expect(within(product).getByRole("link", { name: "Give the system with no squad to a squad, in Partner channel" })).toHaveAttribute(
      "href",
      "/squads?show=none&product=p",
    );
  });

  it("flags a product linked to no offering or portfolio node, and counts it", async () => {
    renderAt("/squads/products", <ProductsPage />, "products");
    const checks = await screen.findByRole("list", { name: "To check in Partner channel" }, { timeout: 5000 });
    expect(checks).toHaveTextContent("Not linked to an offering or a portfolio node.");
    expect(await counts()).toHaveTextContent("Products to check1");
  });

  it("won't remove a value stream that still holds products or squads, and says why", async () => {
    renderAt("/squads/products", <ProductsPage />, "products");
    const remove = await screen.findByRole("button", { name: "Remove the value stream Retail" }, { timeout: 5000 });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAccessibleDescription("Move or remove its products and squads first.");
    fireEvent.click(remove);
    expect(screen.queryByRole("region", { name: /Remove Retail/ })).not.toBeInTheDocument();
  });
});

describe("SquadListPage", () => {
  it("flags a seat on a capability the system no longer links to, and counts the squad", async () => {
    renderAt("/squads/squads", <SquadListPage />, "squads");
    const checks = await screen.findByRole("list", { name: "To check in Sales" }, { timeout: 5000 });
    expect(checks).toHaveTextContent("BCRM › Retired selling: no capability of the system links to it any more.");
    expect(await counts()).toHaveTextContent("Squads to check1");
  });

  it("names the systems a removed squad leaves without one", async () => {
    renderAt("/squads/squads", <SquadListPage />, "squads");
    fireEvent.click(await screen.findByRole("button", { name: "Remove Sales" }, { timeout: 5000 }));
    const panel = screen.getByRole("region", { name: "Remove Sales?" });
    expect(panel).toHaveTextContent("This system will have no squad: BCRM.");
  });

  it("scopes a seat to a capability the system links to, and clears it when the system changes", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads/squads", <SquadListPage />, "squads");
    fireEvent.click(await screen.findByRole("button", { name: "Edit Sales" }, { timeout: 5000 }));
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

describe("PeoplePage", () => {
  it("adds a person with a free id and nulls for what is left blank", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads/people", <PeoplePage />, "people");
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

  it("won't make inactive someone who still holds a role", async () => {
    renderAt("/squads/people", <PeoplePage />, "people");
    fireEvent.click(await screen.findByRole("button", { name: "Edit Layla" }, { timeout: 5000 }));
    const active = screen.getByRole("checkbox", { name: /Active/ });
    expect(active).toBeDisabled();
    expect(active).toHaveAccessibleDescription(/still holds a role/);
  });
});

describe("HistoryPage", () => {
  it("says when nothing has changed yet", async () => {
    renderAt("/squads/history", <HistoryPage />, "history");
    expect(await screen.findByText("Nothing has changed yet.", undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});
