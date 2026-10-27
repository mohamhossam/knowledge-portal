import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Offering, Release } from "../../api/client";
import { checkAxeAfterEach } from "../../test/axe";
import { catalogue } from "../catalogue";
import release from "../model/fixtures/smb-release.json";
import { asRelease } from "../model/sample";
import { OfferingsPage } from "../OfferingsPage";
import type { CatalogueContext } from "../useCatalogue";
import { familyGroups } from "./familyGroups";

checkAxeAfterEach();

const SMB = asRelease(release);
const BPP = (SMB.products ?? []).find((offering) => offering.id === "business-pro-plus")!;

// Business Pro Plus as it is, and four empty offerings beside it: a family of two, two families of one, and one with no family.
const offering = (id: string, name: string, family: string | null, extra: Partial<Offering> = {}): Offering =>
  ({ ...BPP, id, name, family, code: null, components: [], order_types: [], plans: [], confidence: "inferred", source: null, accepted: [], ...extra }) as Offering;
const PRODUCTS: Offering[] = [
  offering("roam-weekly", "Roam Weekly", "Roam Like Home"),
  offering("visitor", "Visitor Line", "Mobile Plans - Prepaid Visitor Line"),
  { ...BPP, family: "Business Pro" },
  offering("roam-daily", "Roam Daily", "Roam Like Home"),
  offering("devices", "Devices & Accessories", null, { confidence: null }),
];
const RELEASE = { ...SMB, status: "published", products: PRODUCTS } as Release;

function open(search = "") {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: true, editable: false, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/architecture/offerings${search}`]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings" element={<OfferingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tableNames = () => within(screen.getByRole("table", { name: /side by side, by family/ })).getAllByRole("rowheader").map((cell) => cell.querySelector("a")?.textContent);

describe("every offering, listed and side by side", () => {
  it("groups a family of two under its name, the families of one together, then those with none", () => {
    expect(familyGroups(PRODUCTS).map((group) => [group.label, group.offerings.map((item) => item.name)])).toEqual([
      ["Roam Like Home", ["Roam Daily", "Roam Weekly"]],
      ["Other families", ["Business Pro Plus", "Visitor Line"]],
      [null, ["Devices & Accessories"]],
    ]);
    // A lone family of one keeps its own name.
    expect(familyGroups([PRODUCTS[1]!]).map((group) => group.label)).toEqual(["Mobile Plans - Prepaid Visitor Line"]);
  });

  it("lists them in that order, a row under Other families naming its own family", () => {
    open();
    // Each group is a list named by its label and count.
    const groups = screen.getAllByRole("list").filter((list) => list.closest(".ds-records"));
    expect(groups).toHaveLength(3);
    expect(document.querySelector(".ds-records")).toHaveTextContent(/^Roam Like Home 2Roam Daily.*Roam Weekly.*Other families 2Business Pro Plus.*Visitor Line.*No family stated 1Devices & Accessories/);
    const other = screen.getByRole("list", { name: "Other families 2" });
    expect(within(other).getByRole("link", { name: /Visitor Line/ })).toHaveTextContent("Mobile Plans - Prepaid Visitor Line");
  });

  it("lays them side by side in the list's order, says once how many there are, and marks inferred as suggested", () => {
    open();
    expect(screen.getByText("5 offerings. Choose one to read what it is made of and who delivers it.")).toBeInTheDocument();
    expect(screen.queryByText(/What is sold, what it is made of/)).not.toBeInTheDocument();
    expect(tableNames()).toEqual(["Roam Daily", "Roam Weekly", "Business Pro Plus", "Visitor Line", "Devices & Accessories"]);
    const row = screen.getByRole("rowheader", { name: /^Roam Daily/ }).closest("tr")!;
    expect(row).toHaveTextContent("Roam Like Home");
    expect(row).toHaveTextContent("Suggested · inferred, not stated in the source");
    expect(screen.getByRole("rowheader", { name: /^Devices & Accessories/ }).closest("tr")).toHaveTextContent("Not stated");
  });

  it("keeps to the offerings with components, or without, in the address", () => {
    open();
    const holds = screen.getByRole("group", { name: "What it holds" });
    fireEvent.click(within(holds).getByRole("button", { name: /^With components/ }));
    expect(tableNames()).toEqual(["Business Pro Plus"]);
    fireEvent.click(within(holds).getByRole("button", { name: /^No components yet/ }));
    expect(tableNames()).toEqual(["Roam Daily", "Roam Weekly", "Visitor Line", "Devices & Accessories"]);
  });
});
