import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Release } from "../../api/client";
import { checkAxeAfterEach } from "../../test/axe";
import { catalogue } from "../catalogue";
import release from "../model/fixtures/smb-release.json";
import { asRelease } from "../model/sample";
import { OfferingsPage } from "../OfferingsPage";
import type { CatalogueContext } from "../useCatalogue";

checkAxeAfterEach();

// The committed SMB catalogue: Business Pro Plus, with its plans, business rules and journeys.
const RELEASE = { ...asRelease(release), status: "published" } as Release;

function open(tab = "") {
  cleanup();
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: true, editable: false, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/architecture/offerings/business-pro-plus${tab}`]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings/:offeringId" element={<OfferingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the lab's product pages in the offering record (catalogue merge, step 3)", () => {
  it("says where the offering sits in the portfolio", () => {
    open();
    const portfolio = screen.getByText("Portfolio").closest("div")!;
    expect(portfolio).toHaveTextContent(/›/);
  });

  it("compares the plans by what differs, and lists what they share apart", () => {
    open("?tab=plans");
    const table = screen.getByRole("table", { name: "How the plans of Business Pro Plus differ" });
    // Each plan by what sets it apart from the offering's name.
    expect(within(table).getByRole("columnheader", { name: "200 Mbps" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByText("No plan states a price: the price is a gap in its sources.")).toBeInTheDocument();
  });

  it("lists the business rules by what they govern, and filters them", () => {
    open("?tab=rules");
    const rules = screen.getByRole("list", { name: "Business rules of Business Pro Plus" });
    const all = within(rules).getAllByRole("listitem").length;
    expect(all).toBe(20);
    fireEvent.click(within(screen.getByRole("group", { name: "What the rule governs" })).getByRole("button", { name: /^Composition/ }));
    const composition = within(screen.getByRole("list", { name: "Business rules of Business Pro Plus" })).getAllByRole("listitem");
    expect(composition.length).toBeLessThan(all);
    for (const rule of composition) expect(rule).toHaveTextContent("Composition");
    expect(screen.getByRole("heading", { name: /^Other rules/ })).toBeInTheDocument();
  });

  it("draws the offering's footprint, and lights one journey on its own", () => {
    open("?tab=footprint");
    const map = screen.getByRole("group", { name: /Business Pro Plus's footprint/ });
    expect(map.querySelectorAll(".am-card.is-core").length).toBeGreaterThan(0);
    const reached = map.querySelectorAll(".am-card.is-core, .am-card.is-used, .am-card.is-carries").length;
    const journeys = screen.getByRole("combobox", { name: "Journeys" }) as HTMLSelectElement;
    fireEvent.change(journeys, { target: { value: journeys.options[1]!.value } });
    const one = screen.getByRole("group", { name: /Business Pro Plus's footprint/ });
    // One journey reaches fewer systems, and none of them is "core" to a single journey.
    expect(one.querySelectorAll(".am-card.is-core")).toHaveLength(0);
    expect(one.querySelectorAll(".am-card.is-used, .am-card.is-carries").length).toBeLessThanOrEqual(reached);
  });

  it("filters the components by the system that delivers them", () => {
    open();
    const table = screen.getByRole("table", { name: "Components of Business Pro Plus" });
    const every = within(table).getAllByRole("row").length;
    const filter = screen.getByRole("group", { name: "Delivered by" });
    const select = within(filter).queryByRole("combobox");
    // Many systems fold the chips into one select on a narrow main area; jsdom shows both.
    if (select) fireEvent.change(select, { target: { value: (select as HTMLSelectElement).options[1]!.value } });
    else fireEvent.click(within(filter).getAllByRole("button")[1]!);
    expect(within(screen.getByRole("table", { name: "Components of Business Pro Plus" })).getAllByRole("row").length).toBeLessThan(every);
  });
});
