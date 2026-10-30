import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { catalogue } from "./catalogue";
import { OfferingsPage } from "./OfferingsPage";
import type { CatalogueContext } from "./useCatalogue";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const concept = (id: string, pref_label: string, extra: object = {}) => ({
  id, pref_label, alt_labels: [], close_match: [], deprecated: false, accepted: [], ...extra,
});

/** The explorer's offering, with what it can link to: concepts, a portfolio and realisation records. */
const RELEASE = {
  ...EXPLORED,
  revision: 3,
  status: "draft",
  documents: [],
  capability_domains: [{ id: "connectivity", name: "Connectivity", accepted: [] }],
  business_capabilities: [concept("cap-internet", "Internet access", { domain_id: "connectivity" }), concept("cap-security", "Network security", { domain_id: "connectivity" })],
  portfolio: [
    { id: "bu-smb", name: "SMB", level: "business unit", deprecated: false, accepted: [] },
    { id: "fam-internet", name: "Internet", level: "family", parent_id: "bu-smb", deprecated: false, accepted: [] },
  ],
  realisations: [
    { id: "cfs-gpon-internet", name: "GPON internet CFS", layer: "cfs", aliases: [], system_ids: [], realised_by: [], rules: [], accepted: [] },
    { id: "resource-gpon-line", name: "GPON line", layer: "resource", aliases: [], system_ids: [], realised_by: [], rules: [], accepted: [] },
  ],
} as unknown as Release;
const OFFERING = RELEASE.products![0]!;

function open(path: string) {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings" element={<OfferingsPage />} />
            <Route path="offerings/:offeringId" element={<OfferingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const savedOffering = (save: ReturnType<typeof vi.spyOn>) =>
  (save.mock.calls[0]![1] as { products: typeof RELEASE.products }).products!.find((item) => item.id === OFFERING.id)!;

describe("an offering's parts and what they link to", () => {
  it("links a part to concepts, says why none fits another, and links what a part is realised as to its record", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open(`/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the parts" }));
    const panel = screen.getByRole("form", { name: "Edit the parts of Business Pro Plus" });
    const broadband = within(panel).getByRole("group", { name: "Part Broadband" });
    fireEvent.change(within(broadband).getByLabelText("Concepts it means"), { target: { value: "cap-internet" } });
    fireEvent.click(within(broadband).getByRole("button", { name: "Add to concepts it means" }));
    const cfs = within(broadband).getByRole("group", { name: "CFSS GPON internet CFS" });
    fireEvent.change(within(cfs).getByLabelText("The record it means"), { target: { value: "cfs-gpon-internet" } });
    // A record is of one layer: its options are that layer's, and another layer lets go of it.
    expect(within(within(cfs).getByLabelText("The record it means")).queryByRole("option", { name: "GPON line" })).not.toBeInTheDocument();
    const firewall = within(panel).getByRole("group", { name: "Part Firewall" });
    fireEvent.click(within(firewall).getByLabelText("No concept fits it"));
    expect(within(panel).getByRole("button", { name: "Save the parts" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(firewall).getByLabelText(/Why no concept fits/), { target: { value: " Sold as an add-on only. " } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save the parts" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [bb, fw] = savedOffering(save).components;
    expect(bb).toMatchObject({ capability_ids: ["cap-internet"], unlinked_reason: null });
    expect(bb!.realisation).toContainEqual(expect.objectContaining({ layer: "cfs", record_id: "cfs-gpon-internet" }));
    expect(fw).toMatchObject({ capability_ids: [], unlinked_reason: "Sold as an add-on only." });
  });

  it("keeps a record through a layer change, says it is of another layer, and will not save it so", () => {
    open(`/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the parts" }));
    const panel = screen.getByRole("form", { name: "Edit the parts of Business Pro Plus" });
    const broadband = within(panel).getByRole("group", { name: "Part Broadband" });
    const cfs = within(broadband).getByRole("group", { name: "CFSS GPON internet CFS" });
    fireEvent.change(within(cfs).getByLabelText("The record it means"), { target: { value: "cfs-gpon-internet" } });
    fireEvent.change(within(cfs).getByLabelText("Layer"), { target: { value: "resource" } });
    const record = within(broadband).getAllByLabelText("The record it means")[1]!;
    expect(record).toHaveValue("cfs-gpon-internet");
    expect(record).toHaveAttribute("aria-invalid", "true");
    expect(within(panel).getByRole("button", { name: "Save the parts" })).toHaveAttribute("aria-disabled", "true");
    // Back to its own layer, it is as it was.
    fireEvent.change(within(broadband).getAllByLabelText("Layer")[1]!, { target: { value: "cfs" } });
    expect(within(broadband).getAllByLabelText("The record it means")[1]!).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a part's concepts while \"no concept fits\" is tried, and says saving would let them go", () => {
    open(`/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the parts" }));
    const broadband = within(screen.getByRole("form", { name: "Edit the parts of Business Pro Plus" })).getByRole("group", { name: "Part Broadband" });
    fireEvent.change(within(broadband).getByLabelText("Concepts it means"), { target: { value: "cap-internet" } });
    fireEvent.click(within(broadband).getByRole("button", { name: "Add to concepts it means" }));
    fireEvent.click(within(broadband).getByLabelText("No concept fits it"));
    expect(within(broadband).getByText(/Saving lets go of the concept it means/)).toBeInTheDocument();
    fireEvent.click(within(broadband).getByLabelText("No concept fits it"));
    expect(within(broadband).getByRole("list", { name: "Concepts it means: chosen" })).toHaveTextContent("Internet access");
  });

  it("asks before Cancel throws a changed section away", () => {
    open(`/architecture/offerings/${OFFERING.id}?tab=plans`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the plans" }));
    const panel = screen.getByRole("form", { name: "Edit the plans of Business Pro Plus" });
    expect(within(panel).getByText("Nothing changed yet.")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Add a plan" }));
    fireEvent.change(within(panel).getByLabelText(/^Plan/), { target: { value: "Business Pro Plus 500" } });
    expect(within(panel).getByText("Changed: the plans.")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    expect(within(panel).getByText("Discard your changes to the plans?")).toBeInTheDocument();
  });
});

describe("an offering's plans and business rules", () => {
  it("adds a plan with the characteristics that set it apart", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open(`/architecture/offerings/${OFFERING.id}?tab=plans`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the plans" }));
    const panel = screen.getByRole("form", { name: "Edit the plans of Business Pro Plus" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add a plan" }));
    fireEvent.change(within(panel).getByLabelText(/^Plan/), { target: { value: "Business Pro Plus 500" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add a characteristic" }));
    const first = within(panel).getByRole("group", { name: "characteristic 1" });
    fireEvent.change(within(first).getByLabelText(/^Characteristic/), { target: { value: "Download" } });
    fireEvent.change(within(first).getByLabelText(/^Value/), { target: { value: "500 Mbps" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add another characteristic" }));
    const second = within(panel).getByRole("group", { name: "characteristic 2" });
    fireEvent.change(within(second).getByLabelText(/^Characteristic/), { target: { value: "download" } });
    fireEvent.change(within(second).getByLabelText(/^Value/), { target: { value: "1 Gbps" } });
    const button = within(panel).getByRole("button", { name: "Save the plans" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(within(panel).getByText("Business Pro Plus 500: each characteristic is stated once.")).toBeInTheDocument();
    fireEvent.change(within(second).getByLabelText(/^Characteristic/), { target: { value: "Upload" } });
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(savedOffering(save).plans).toEqual([
      expect.objectContaining({ name: "Business Pro Plus 500", characteristics: [{ name: "Download", value: "500 Mbps" }, { name: "Upload", value: "1 Gbps" }] }),
    ]);
  });

  it("adds a business rule, numbering it when no id is given", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open(`/architecture/offerings/${OFFERING.id}?tab=rules`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the business rules" }));
    const panel = screen.getByRole("form", { name: "Edit the business rules of Business Pro Plus" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add a business rule" }));
    expect(within(panel).getByRole("button", { name: "Save the business rules" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(panel).getByLabelText("What it governs"), { target: { value: "composition" } });
    fireEvent.change(within(panel).getByLabelText(/What it says/), { target: { value: "The router is always included." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save the business rules" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(savedOffering(save).business_rules).toEqual([
      expect.objectContaining({ id: "BR-01", kind: "composition", statement: "The router is always included." }),
    ]);
  });
});

describe("where an offering sits in the portfolio", () => {
  it("places it on a portfolio node, named by its path", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open(`/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Edit what it is" }));
    const portfolio = screen.getByLabelText("Portfolio");
    expect(within(portfolio).getByRole("option", { name: "SMB › Internet" })).toBeInTheDocument();
    fireEvent.change(portfolio, { target: { value: "fam-internet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save what it is" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(savedOffering(save).portfolio_node_id).toBe("fam-internet");
  });
});
