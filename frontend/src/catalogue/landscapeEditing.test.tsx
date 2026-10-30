import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { checkAxeAfterEach } from "../test/axe";
import { catalogue } from "./catalogue";
import { DomainsPage } from "./DomainsPage";
import { domainsChanges, domainsIssue, moveDomain, removeDomain } from "./editing";
import type { CatalogueContext } from "./useCatalogue";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

const domain = (id: string, name: string, parent_id: string | null = null) => ({ id, name, parent_id, accepted: [] });

/** A draft whose landscape names no place on the map and marks nothing cross-cutting: the map knows TAM's domains by id. */
const RELEASE = {
  id: "draft-1", name: "October", revision: 2, status: "draft", documents: [],
  landscape_domains: [
    domain("customer", "Customer"),
    domain("customer.order", "Order", "customer"),
    domain("service", "Service"),
    domain("integration", "Integration"),
    domain("enterprise", "Enterprise"),
  ],
  capability_domains: [domain("fulfilment", "Fulfilment")],
  systems: [{ id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [], constraints: [], landscape_domain_id: "service" }],
  relationships: [],
} as unknown as Release;

function open(label = "Edit where systems sit") {
  vi.spyOn(api, "changeRequests").mockResolvedValue([] as never);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({ outdated_requirements: 0 } as never);
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/architecture/domains"]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="domains" element={<DomainsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: label }));
  return screen.getByRole("form", { name: label });
}

/** A domain's row, closed to its name. */
const row = (form: HTMLElement, name: string) => within(form).getByRole("group", { name });
/** A domain's row, opened from its name. */
function opened(form: HTMLElement, name: string) {
  fireEvent.click(within(form).getByRole("button", { name }));
  return row(form, name);
}
/** The domains' names in the outline's order. */
const outline = (form: HTMLElement) => [...form.querySelectorAll(".cat-outline__title")].map((title) => title.textContent);

describe("where systems sit, edited as an outline with the map's layout", () => {
  it("starts from the map as it is drawn, each domain closed to a line of what it holds, and says how the map will read it", () => {
    const form = open();
    expect(within(row(form, "Customer")).getByText("the layer above the bus · 1 inside it")).toBeInTheDocument();
    expect(within(row(form, "Integration")).getByText("the bus · runs across the others")).toBeInTheDocument();
    expect(within(opened(form, "Service")).getByLabelText("Place on the map")).toHaveValue("");
    expect(within(opened(form, "Enterprise")).getByLabelText("Place on the map")).toHaveValue("side");
    expect(within(row(form, "Enterprise")).getByLabelText("Runs across the other domains")).toBeChecked();
    // A sub-domain has no place of its own.
    expect(within(opened(form, "Order")).queryByLabelText("Place on the map")).not.toBeInTheDocument();
    expect(within(form).getByText("Top to bottom: Customer, Integration as the bus and Service.")).toBeInTheDocument();
    expect(within(form).getByText("Side by side, last: Enterprise.")).toBeInTheDocument();
    expect(within(form).getByText("Running across the others: Integration and Enterprise.")).toBeInTheDocument();
    expect(within(form).getByText("Nothing changed yet.")).toBeInTheDocument();
  });

  it("saves each domain's place and whether it is cross-cutting outright, so changing one keeps the others", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    const form = open();
    fireEvent.change(within(opened(form, "Service")).getByLabelText("Place on the map"), { target: { value: "side" } });
    expect(within(form).getByText("Changed: Service.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the domains" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const sent = (save.mock.calls[0]![1] as { landscape_domains: { id: string; layout: string | null; cross_cutting: boolean }[] }).landscape_domains;
    expect(sent.map(({ id, layout, cross_cutting }) => [id, layout, cross_cutting])).toEqual([
      ["customer", "above_bus", false],
      ["customer.order", null, false],
      ["service", "side", false],
      ["integration", "bus", true],
      ["enterprise", "side", true],
    ]);
    expect(sent.some((item) => "key" in item)).toBe(false);
  });

  it("says a second bus in the preview, and under the field of the domain just placed once Save is tried", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    const form = open();
    const service = opened(form, "Service");
    const place = within(service).getByLabelText("Place on the map");
    fireEvent.change(place, { target: { value: "bus" } });
    expect(within(form).getByText("Service and Integration are each the bus; the map has one.")).toBeInTheDocument();
    expect(within(form).getByText("Correct the place of the domain Service first.")).toBeInTheDocument();
    expect(place).not.toHaveAttribute("aria-invalid");
    fireEvent.click(within(form).getByRole("button", { name: "Save the domains" }));
    expect(place).toHaveAttribute("aria-invalid", "true");
    expect(within(service).getByText("Integration is the bus already; the map has one.")).toBeInTheDocument();
    await waitFor(() => expect(place).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
  });

  it("moves a top domain past its neighbour with what is inside it, says where it is now, and keeps focus on the way left", async () => {
    const form = open();
    // An only child has nowhere to move.
    expect(within(row(form, "Order")).queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument();
    expect(within(row(form, "Customer")).queryByRole("button", { name: /^Move up/ })).not.toBeInTheDocument();
    fireEvent.click(within(row(form, "Service")).getByRole("button", { name: "Move up Service" }));
    expect(outline(form)).toEqual(["Service", "Customer", "Order", "Integration", "Enterprise"]);
    expect(within(form).getByText("Service moved up: now 1 of 4 at the top.")).toBeInTheDocument();
    await waitFor(() => expect(within(row(form, "Service")).getByRole("button", { name: "Move down Service" })).toHaveFocus());
    expect(within(form).getByText("Changed: the order.")).toBeInTheDocument();
    fireEvent.click(within(row(form, "Customer")).getByRole("button", { name: "Move down Customer" }));
    expect(outline(form)).toEqual(["Service", "Integration", "Customer", "Order", "Enterprise"]);
  });

  it("offers a domain a parent that is not itself or inside it, and a promoted one lands after its old parent", async () => {
    const form = open();
    const customer = opened(form, "Customer");
    const options = [...(within(customer).getByLabelText("Inside") as HTMLSelectElement).options].map((option) => option.text);
    expect(options).toEqual(["At the top", "Service", "Integration", "Enterprise"]);
    const order = opened(form, "Order");
    fireEvent.change(within(order).getByLabelText("Inside"), { target: { value: "" } });
    expect(outline(form)).toEqual(["Customer", "Order", "Service", "Integration", "Enterprise"]);
    expect(form.querySelector('[data-domain="customer.order"]')).toHaveAttribute("data-depth", "0");
    await waitFor(() => expect(within(row(form, "Order")).getByLabelText("Inside")).toHaveFocus());
    expect(within(row(form, "Order")).getByLabelText("Place on the map")).toBeInTheDocument();
  });

  it("removes a domain with its sub-domains moved up a level, and hands focus back to its button when closed", async () => {
    const form = open();
    fireEvent.click(within(row(form, "Customer")).getByRole("button", { name: "Remove Customer; what is inside it moves up a level" }));
    expect(within(form).getByText("Customer removed; what was inside it moved up a level.")).toBeInTheDocument();
    expect(within(form).queryByRole("group", { name: "Customer" })).not.toBeInTheDocument();
    expect(form.querySelector('[data-domain="customer.order"]')).toHaveAttribute("data-depth", "0");
    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(form).getByRole("button", { name: "Discard the changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit where systems sit" })).toHaveFocus());
  });

  it("keeps the business areas to their names, places and descriptions", () => {
    const form = open("Edit the business areas");
    opened(form, "Fulfilment");
    expect(within(form).queryByLabelText("Place on the map")).not.toBeInTheDocument();
    expect(within(form).queryByLabelText("Runs across the other domains")).not.toBeInTheDocument();
  });
});

describe("the domains' checks and changes, as the service reads them", () => {
  it("allows one layer above the bus, only with a bus, and a place only on a top domain", () => {
    expect(domainsIssue([{ id: "a", name: "A", layout: "above_bus" }])?.message).toBe("The layer above the bus needs a domain that is the bus.");
    expect(domainsIssue([{ id: "a", name: "A", parent_id: "b", layout: "side" }, { id: "b", name: "B" }])?.at).toBe("domains.0.layout");
    expect(domainsIssue([{ id: "a", name: "A", layout: "side" }, { id: "b", name: "B", layout: "side" }])).toBeNull();
    expect(domainsIssue([{ id: "a", name: " " }])?.field).toBe("the name of a new domain");
  });

  it("tells the domain placed last when neither of two claiming the bus was there before", () => {
    const items = [{ id: "a", key: "a", name: "A", layout: "bus" as const }, { id: "b", key: "b", name: "B", layout: "bus" as const }];
    expect(domainsIssue(items, [], "a")).toMatchObject({ at: "domains.0.layout", message: "B is the bus already; the map has one." });
    expect(domainsIssue(items, [], "b")).toMatchObject({ at: "domains.1.layout" });
  });

  it("checks the tree as the service does: no cycle, three levels at most, sibling names unique", () => {
    expect(domainsIssue([{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }])?.message).toBe("It would be inside itself; choose another parent.");
    const deep = [{ id: "a", name: "A" }, { id: "b", name: "B", parent_id: "a" }, { id: "c", name: "C", parent_id: "b" }, { id: "d", name: "D", parent_id: "c" }];
    expect(domainsIssue(deep)).toMatchObject({ at: "domains.3.parent" });
    expect(domainsIssue([{ id: "a", name: "A" }, { id: "b", name: " a " }])?.message).toBe("Another domain at the top is named a.");
    expect(domainsIssue([{ id: "a", name: "A", parent_id: "gone" }])?.at).toBe("domains.0.parent");
  });

  it("moves a domain with everything inside it, and a removed one hands what is inside it to its parent", () => {
    const items = [{ id: "a", name: "A" }, { id: "a1", name: "A1", parent_id: "a" }, { id: "b", name: "B" }];
    expect(moveDomain(items, 2, -1).map((item) => item.id)).toEqual(["b", "a", "a1"]);
    expect(moveDomain(items, 0, 1).map((item) => item.id)).toEqual(["b", "a", "a1"]);
    expect(removeDomain(items, 0)).toEqual([{ id: "a1", name: "A1", parent_id: null }, { id: "b", name: "B" }]);
  });

  it("names each domain changed, added or removed, and the order", () => {
    const before = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
    expect(domainsChanges(before, [{ id: "b", name: "B" }, { id: "a", name: "A", cross_cutting: true }, { id: "", name: "D" }])).toEqual([
      "A",
      "the new domain D",
      "the removed domain C",
      "the order",
    ]);
    // Moving a domain to another parent changes it, not the order.
    expect(domainsChanges(before, [{ id: "a", name: "A" }, { id: "b", name: "B", parent_id: "a" }, { id: "c", name: "C" }])).toEqual(["B"]);
  });
});
