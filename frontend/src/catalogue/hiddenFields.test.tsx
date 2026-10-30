import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { checkAxeAfterEach } from "../test/axe";
import { catalogue } from "./catalogue";
import { interfacesChanges, interfacesOfSystem } from "./editing";
import { JourneysPage } from "./JourneysPage";
import release from "./model/fixtures/smb-release.json";
import { asRelease } from "./model/sample";
import { OfferingsPage } from "./OfferingsPage";
import { SystemsPage } from "./SystemsPage";
import type { CatalogueContext } from "./useCatalogue";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

// The committed SMB catalogue, as a draft that can be edited.
const RELEASE = { ...asRelease(release), status: "draft" } as Release;

function open(path: string, book: Release = RELEASE) {
  vi.spyOn(api, "organisation").mockResolvedValue({ people: [], squads: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "changeRequests").mockResolvedValue([] as never);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({ outdated_requirements: 0 } as never);
  const context: CatalogueContext = { book: catalogue(book), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="systems/:systemId" element={<SystemsPage />} />
            <Route path="offerings/:offeringId" element={<OfferingsPage />} />
            <Route path="journeys/:journeyId" element={<JourneysPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const saved = (save: ReturnType<typeof vi.spyOn>) => save.mock.calls[0]![1] as Release;

describe("facts a draft kept that no screen showed", () => {
  it("says what an interface passes on and the Open APIs it matches", () => {
    open("/architecture/systems/tibco");
    const row = screen.getByRole("row", { name: /NC CRM party APIs/ });
    expect(row).toHaveTextContent(/Passes on TMF party APIs \(.+\)/);
    expect(row).toHaveTextContent("Matches Open API Party Management, Customer Management");
  });

  it("offers what an interface passes on and the Open APIs it matches, where it is edited", () => {
    open("/architecture/systems/tibco");
    fireEvent.click(screen.getByRole("button", { name: "Edit the interfaces" }));
    const group = within(screen.getByRole("form", { name: "Edit the interfaces of TIBCO" })).getByRole("group", { name: /Interface NC CRM party APIs/ });
    expect(within(group).getByText("Passes on")).toBeInTheDocument();
    expect(within(group).getByText("Matches Open API")).toBeInTheDocument();
  });

  it("counts a change to what an interface passes on or the Open APIs it matches", () => {
    const { exposed, used } = interfacesOfSystem(RELEASE, "tibco");
    expect(interfacesChanges(RELEASE, "tibco", exposed, used)).toEqual([]);
    const fewer = exposed.map((item, at) => (at === 0 ? { ...item, open_api_ids: item.open_api_ids.slice(1) } : item));
    expect(interfacesChanges(RELEASE, "tibco", fewer, used)).toEqual(["what it exposes"]);
    const none = exposed.map((item, at) => (at === 0 ? { ...item, relays: [] } : item));
    expect(interfacesChanges(RELEASE, "tibco", none, used)).toEqual(["what it exposes"]);
  });

  it("uses what an interface passes on, says why, and lets go of it with the relay", () => {
    open("/architecture/systems/tibco");
    fireEvent.click(screen.getByRole("button", { name: "Edit the interfaces" }));
    const panel = within(screen.getByRole("form", { name: "Edit the interfaces of TIBCO" }));
    const notify = within(panel.getByRole("group", { name: /Interface NotifyOrderCreationRequest/ }));
    fireEvent.change(notify.getByLabelText("Passes on"), { target: { value: "if-cbcm-retrieve-account" } });
    fireEvent.click(notify.getByRole("button", { name: "Add to passes on" }));
    const calls = () => panel.getByRole("list", { name: "Interfaces of other systems it calls: chosen" });
    expect(calls()).toHaveTextContent("retrieveAccount (CBCM)");
    expect(panel.getByText(/Added because an interface it exposes passes it on/)).toHaveTextContent("retrieveAccount (CBCM)");
    fireEvent.click(notify.getByRole("button", { name: "Remove retrieveAccount (CBCM) from passes on" }));
    expect(calls()).not.toHaveTextContent("retrieveAccount (CBCM)");
    expect(panel.queryByText(/Added because/)).not.toBeInTheDocument();
  });

  it("says the drop an order type is delivered in, and where each order type and part comes from", () => {
    open("/architecture/offerings/business-pro-plus?tab=orders");
    const order = screen.getByRole("row", { name: /New activation/ });
    expect(order).toHaveTextContent("Delivery drop P1");
    expect(order).toHaveTextContent(/SDD v2\.3/);
  });

  it("edits the drop an order type is delivered in, with its source kept", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open("/architecture/offerings/business-pro-plus?tab=orders");
    fireEvent.click(screen.getByRole("button", { name: "Edit the order types" }));
    const first = within(screen.getByRole("form", { name: /Edit the order types/ })).getByRole("group", { name: /order type New activation/i });
    fireEvent.change(within(first).getByLabelText(/^Delivery drop/), { target: { value: "P2" } });
    expect(within(first).getByLabelText("How sure its source is")).toHaveValue("confirmed");
    fireEvent.click(screen.getByRole("button", { name: "Save the order types" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved(save).products![0]!.order_types[0]).toMatchObject({ code: "NEW", delivery_drop: "P2", confidence: "confirmed" });
  });

  it("says what the system does in a step, under who performs it", async () => {
    const journeys = RELEASE.journeys!.map((journey) =>
      journey.id === "bpp-new-activation"
        ? { ...journey, activities: journey.activities.map((step) => (step.number === "20" ? { ...step, system_function: "Maps the offer to PSM package codes." } : step)) }
        : journey,
    );
    open("/architecture/journeys/bpp-new-activation", { ...RELEASE, journeys } as Release);
    // The journey's views load apart; its steps' table follows them.
    await waitFor(() => expect(document.querySelector('tr[data-row-id="20"]')).toHaveTextContent("Maps the offer to PSM package codes."), { timeout: 3000 });
  });
});
