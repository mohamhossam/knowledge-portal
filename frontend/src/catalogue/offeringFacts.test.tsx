import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { catalogue, portfolioPath } from "./catalogue";
import { OfferingsPage } from "./OfferingsPage";
import type { CatalogueContext } from "./useCatalogue";

const BASE = { ...EXPLORED, revision: 3, status: "published", documents: [] } as unknown as Release;
const OFFERING = {
  ...BASE.products![0]!,
  portfolio_node_id: "smb",
  business_rules: [
    { id: "R1", statement: "Firewall is mandatory and locked.", kind: "composition", confidence: "confirmed", source: "SDD" },
    { id: "R2", statement: "One bundle per account.", kind: null },
  ],
  plans: [
    { name: "200 Mbps", characteristics: [{ name: "Download", value: "200 Mbps" }, { name: "CPE", value: "Fortinet 90G" }] },
    { name: "500 Mbps", characteristics: [{ name: "Download", value: "500 Mbps" }] },
  ],
};
const RELEASE = {
  ...BASE,
  products: [OFFERING],
  portfolio: [
    { id: "fixed", name: "Fixed", level: "Line of business" },
    { id: "smb", name: "SMB", level: "Segment", parent_id: "fixed" },
  ],
} as unknown as Release;

function open(tab = "") {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: true, editable: false, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/architecture/offerings/${OFFERING.id}${tab}`]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings/:offeringId" element={<OfferingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("what an offering's record holds beyond its parts", () => {
  it("says where the offering sits in the portfolio", () => {
    open();
    expect(screen.getByText("Fixed › SMB")).toBeInTheDocument();
    expect(portfolioPath(RELEASE, "missing")).toEqual(["missing"]);
    expect(portfolioPath(RELEASE, null)).toEqual([]);
  });

  it("lists its plans side by side, a column for each characteristic any plan has", () => {
    open("?tab=plans");
    const table = within(screen.getByRole("table", { name: /Plans of/ }));
    expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Plan", "Download", "CPE"]);
    expect(table.getByRole("row", { name: /500 Mbps/ })).toHaveTextContent("500 Mbps500 Mbps—");
  });

  it("lists its business rules with their kind, beside the rules written by hand", () => {
    open("?tab=governance");
    const table = within(screen.getByRole("table", { name: /Business rules of/ }));
    expect(table.getByRole("row", { name: /R1/ })).toHaveTextContent("Composition");
    expect(table.getByRole("row", { name: /R2/ })).toHaveTextContent("Not said");
    expect(screen.getByRole("heading", { name: /^Other rules/ })).toBeInTheDocument();
  });
});
