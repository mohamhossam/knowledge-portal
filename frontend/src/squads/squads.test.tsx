import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Organisation, type Release } from "../api/client";
import { PeoplePage } from "./PeoplePage";
import { ProductsPage } from "./ProductsPage";
import { SquadsPage } from "./SquadsPage";

afterEach(() => vi.restoreAllMocks());

const release = {
  id: "live", revision: 1, status: "published", documents: [], relationships: [], landscape_domains: [],
  systems: [
    { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [] },
    { id: "dcrm", name: "DCRM", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
} as unknown as Release;

const org = {
  people: [
    { id: "layla", name: "Layla", active: true, revision: 1 },
    { id: "omar", name: "Omar", active: true, revision: 1 },
  ],
  value_streams: [{ id: "retail", name: "Retail", lead_person_id: "layla", revision: 1 }],
  products: [{ id: "p", name: "Partner channel", description: "", value_stream_id: "retail", system_ids: ["bcrm", "dcrm"], revision: 1 }],
  squads: [{ id: "sales", name: "Sales", value_stream_id: "retail", scrum_master_person_id: "layla", systems: [{ system_id: "bcrm", person_id: "layla" }], revision: 4 }],
} as unknown as Organisation;

function renderAt(path: string, page: ReactNode, child: string) {
  vi.spyOn(api, "organisation").mockResolvedValue(org);
  vi.spyOn(api, "activeRelease").mockResolvedValue(release);
  vi.spyOn(api, "organisationAudit").mockResolvedValue([]);
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

describe("ProductsPage", () => {
  it("counts the gap and gives a system to a squad in place, keeping the squad's revision", async () => {
    const save = vi.spyOn(api, "saveOrganisation").mockResolvedValue(org);
    renderAt("/squads", <ProductsPage />, "index");
    const notice = await screen.findByLabelText("Ownership of the systems in service", undefined, { timeout: 5000 });
    expect(notice).toHaveTextContent("No squad1");
    const row = screen.getByRole("link", { name: "DCRM" }).closest("tr")!;
    expect(within(row).getByText("No squad")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /Give it to a squad/ }));
    const panel = screen.getByRole("form", { name: "Give DCRM to a squad" });
    const give = within(panel).getByRole("button", { name: "Give it to the squad" });
    expect(give).toBeDisabled();
    const [squad, contact] = within(panel).getAllByRole("combobox");
    fireEvent.change(squad!, { target: { value: "sales" } });
    fireEvent.change(contact!, { target: { value: "omar" } });
    fireEvent.click(give);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]).toEqual([
      "squads",
      "sales",
      {
        expected_revision: 4,
        squad: expect.objectContaining({ systems: [{ system_id: "bcrm", person_id: "layla" }, { system_id: "dcrm", person_id: "omar" }] }),
      },
      false,
    ]);
  });

  it("refuses to remove a value stream that still holds products or squads", async () => {
    renderAt("/squads", <ProductsPage />, "index");
    const stream = (await screen.findByText("Retail", { selector: "h2" })).closest("section")!;
    fireEvent.click(within(stream).getAllByRole("button", { name: /^Remove it ?\(Retail\)/ })[0]!);
    const panel = screen.getByRole("form", { name: "Remove Retail" });
    expect(within(panel).getByText("Move or remove this value stream's products and squads first.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Remove it" })).toBeDisabled();
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

  it("will not make inactive someone who still holds a role", async () => {
    renderAt("/squads/people", <PeoplePage />, "people");
    const row = (await screen.findByText("Layla", { selector: "th > span" })).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /^Edit ?Layla/ }));
    expect(screen.getByRole("checkbox", { name: /Active/ })).toBeDisabled();
    expect(screen.getByText(/still holds a role/)).toBeInTheDocument();
  });
});
