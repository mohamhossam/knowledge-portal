import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { catalogue } from "./catalogue";
import { finishedOffering, journeyOrderProblem, offeringProblem } from "./editing";
import { OfferingPage, OfferingsPage } from "./OfferingsPage";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const RELEASE = { ...EXPLORED, revision: 3, status: "draft", documents: [] } as unknown as Release;
const OFFERING = RELEASE.products![0]!;
const EDITS = [
  "Edit what it is",
  "Edit the order types",
  "Edit the parts",
  "Edit the non-functional requirements",
  "Edit the order tracking",
  "Edit the lifecycle notes",
  "Edit the rules",
];

function open(editable: boolean, path = `/architecture/offerings/${OFFERING.id}`) {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: !editable, editable, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings" element={<OfferingsPage />} />
            <Route path="offerings/:offeringId" element={<OfferingPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("an offering edited one section at a time", () => {
  it("offers each section its own edit on a draft, and none on a version in service", () => {
    open(true);
    expect(EDITS.map((name) => screen.getByRole("button", { name }))).toHaveLength(EDITS.length);
    expect(screen.queryByRole("button", { name: "Edit this offering" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove this offering" })).toBeInTheDocument();
  });

  it("shows no edit on a version in service", () => {
    open(false);
    for (const name of [...EDITS, "Remove this offering"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it("opens one section in place, keeps the rest readable, and gives focus back on cancel", () => {
    open(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit the order types" }));

    const panel = screen.getByRole("form", { name: "Edit the order types of Business Pro Plus" });
    expect(within(panel).getByRole("heading", { name: "Edit the order types of Business Pro Plus" })).toHaveFocus();
    expect(within(panel).queryByLabelText("Quality")).not.toBeInTheDocument();
    // The other sections still read as they are, with no second edit open.
    expect(screen.getByRole("heading", { name: "Parts, and who is responsible" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Order tracking/ })).toBeInTheDocument();
    for (const name of EDITS) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit the order types" })).toHaveFocus();
  });

  it("saves one section and sends the rest of the offering unchanged", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit the rules" }));
    const panel = screen.getByRole("form", { name: "Edit the rules of Business Pro Plus" });
    fireEvent.change(within(panel).getByLabelText(/^Rules/), { target: { value: "One line per site\n  \nNo resale" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save the rules" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const sent = save.mock.calls[0]![1].products![0]!;
    expect(sent.rules).toEqual(["One line per site", "No resale"]);
    // Everything else is the offering as it was, only tidied as every save tidies it.
    expect({ ...sent, rules: [] }).toEqual({ ...finishedOffering(OFFERING), rules: [] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit the rules" })).toHaveFocus());
  });

  it("will not drop an order type its parts, tracking, notes or journeys still name", () => {
    open(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit the order types" }));
    const panel = screen.getByRole("form", { name: "Edit the order types of Business Pro Plus" });
    fireEvent.click(within(panel).getByRole("button", { name: /Remove order type Cease/ }));

    expect(within(panel).getByText(/Broadband’s responsibility FULFILMENT still names the order type ‘CEASE’/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Save the order types" })).toBeDisabled();
  });

  it("adds an offering with what it is, leaving the rest to its sheet", () => {
    open(true, "/architecture/offerings");
    fireEvent.click(screen.getByRole("button", { name: "Add an offering" }));
    const panel = screen.getByRole("form", { name: "Add an offering" });
    expect(within(panel).getByRole("heading", { name: "Add an offering" })).toHaveFocus();
    expect(within(panel).getByLabelText(/^Name/)).toBeInTheDocument();
    expect(within(panel).queryByRole("group", { name: "Order types" })).not.toBeInTheDocument();

    fireEvent.keyDown(within(panel).getByLabelText(/^Name/), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Add an offering" })).toHaveFocus();
  });

  it("asks before removing, from the panel it opens, and gives focus back when kept", () => {
    open(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove this offering" }));
    const panel = screen.getByRole("form", { name: "Remove Business Pro Plus" });
    expect(within(panel).getByRole("heading", { name: "Remove Business Pro Plus" })).toHaveFocus();

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove this offering" })).toHaveFocus();
  });
});

describe("order types named elsewhere", () => {
  it("names the journey that is for an order type the offering no longer has", () => {
    const without = { ...OFFERING, order_types: OFFERING.order_types.filter((type) => type.code !== "NEW") };
    expect(journeyOrderProblem(without, RELEASE.journeys ?? [])).toBe(
      "The journey Business Pro Plus new activation is for the order type ‘NEW’; edit that journey first.",
    );
    expect(journeyOrderProblem(OFFERING, RELEASE.journeys ?? [])).toBeNull();
  });

  it("refuses two order types with one code, and tracking or notes naming a code it lacks", () => {
    const twice = { ...OFFERING, order_types: [...OFFERING.order_types, { code: "new", name: "Again", enabled: true, channels: [] }] };
    expect(offeringProblem(twice)).toBe("Each order type needs its own code.");
    const loose = { ...OFFERING, components: [], lifecycle_notes: [], tracking: { ...OFFERING.tracking!, order_types: ["MOVE"] } };
    expect(offeringProblem(loose)).toBe("Order tracking still names the order type ‘MOVE’, which the offering no longer has; change it there first.");
  });
});
