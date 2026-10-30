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

const record = (id: string, name: string, layer: string, extra: object = {}) => ({
  id, name, layer, aliases: [], system_ids: [], realised_by: [], rules: [], accepted: [], ...extra,
});

/** The explorer's offering, sitting in a portfolio node, with a part realised as a linked record. */
const RELEASE = (() => {
  const offering = EXPLORED.products![0]!;
  return {
    ...EXPLORED,
    revision: 3,
    status: "draft",
    documents: [],
    portfolio: [
      { id: "bu-smb", name: "SMB", level: "business unit", deprecated: false, accepted: [] },
      { id: "fam-internet", name: "Internet", level: "family", parent_id: "bu-smb", deprecated: false, accepted: [] },
    ],
    realisations: [
      record("cfs-gpon-internet", "GPON internet CFS", "cfs", { realised_by: ["resource-gpon-line"], rules: ["One line per site."] }),
      record("resource-gpon-line", "GPON line", "resource"),
    ],
    products: [
      {
        ...offering,
        portfolio_node_id: "fam-internet",
        components: offering.components.map((part) =>
          part.id === "bb" ? { ...part, realisation: [{ layer: "cfs", name: "GPON internet CFS", record_id: "cfs-gpon-internet" }] } : part,
        ),
      },
    ],
  } as unknown as Release;
})();

function open() {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/architecture/offerings"]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings" element={<OfferingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the portfolio", () => {
  it("is read beside the offerings and edited whole, a new node placed by its path", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open();
    expect(screen.getByRole("rowheader", { name: "SMB › Internet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit the portfolio" }));
    const panel = screen.getByRole("form", { name: "Edit the portfolio" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add another portfolio node" }));
    const added = within(panel).getByRole("group", { name: "Node 3" });
    fireEvent.change(within(added).getByLabelText(/^Name/), { target: { value: "Security" } });
    fireEvent.change(within(added).getByLabelText(/^Level/), { target: { value: "family" } });
    fireEvent.change(within(added).getByLabelText("Inside"), { target: { value: "bu-smb" } });
    expect(within(panel).getByText("Changed: the portfolio.")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Save the portfolio" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect((save.mock.calls[0]![1] as { portfolio: unknown[] }).portfolio.at(-1)).toMatchObject({ id: "security", name: "Security", level: "family", parent_id: "bu-smb" });
  });

  it("will not remove a node an offering or another node sits in, and says why", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit the portfolio" }));
    const panel = screen.getByRole("form", { name: "Edit the portfolio" });
    const internet = within(panel).getByRole("button", { name: "Remove node Internet" });
    expect(internet).toHaveAttribute("aria-disabled", "true");
    expect(internet).toHaveAccessibleDescription("Business Pro Plus sits in it; retire it instead.");
    fireEvent.click(internet);
    expect(within(panel).getByRole("group", { name: "Node Internet" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Remove node SMB" })).toHaveAccessibleDescription("Internet sits inside it; move that first.");
  });
});

describe("the realisation records", () => {
  it("adds a record realised by one of a layer below it", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open();
    expect(screen.getByRole("rowheader", { name: "GPON internet CFS" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit the realisation records" }));
    const panel = screen.getByRole("form", { name: "Edit the realisation records" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add another realisation record" }));
    const added = within(panel).getByRole("group", { name: "CFSS 3" });
    fireEvent.change(within(added).getByLabelText("Layer"), { target: { value: "rfs" } });
    fireEvent.change(within(added).getByLabelText(/^Name/), { target: { value: "GPON access RFS" } });
    const below = within(added).getByLabelText("Realised by");
    // Only the layers below it: a resource, never the CFS.
    expect(within(below).queryByRole("option", { name: "GPON internet CFS" })).not.toBeInTheDocument();
    fireEvent.change(below, { target: { value: "resource-gpon-line" } });
    fireEvent.click(within(added).getByRole("button", { name: "Add to realised by" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Save the realisation records" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect((save.mock.calls[0]![1] as { realisations: unknown[] }).realisations.at(-1)).toMatchObject({
      id: "rfs-gpon-access-rfs", layer: "rfs", name: "GPON access RFS", realised_by: ["resource-gpon-line"],
    });
  });

  it("keeps a record a part still links, in its layer", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit the realisation records" }));
    const panel = screen.getByRole("form", { name: "Edit the realisation records" });
    const cfs = within(panel).getByRole("group", { name: "CFSS GPON internet CFS" });
    expect(within(cfs).getByRole("button", { name: "Remove CFSS GPON internet CFS" })).toHaveAccessibleDescription(
      "The part Broadband of Business Pro Plus is realised as it; change that first.",
    );
    expect(within(panel).getByRole("button", { name: "Remove Resource GPON line" })).toHaveAccessibleDescription(
      "GPON internet CFS is realised by it; take it off there first.",
    );
    fireEvent.change(within(cfs).getByLabelText("Layer"), { target: { value: "rfs" } });
    const save = within(panel).getByRole("button", { name: "Save the realisation records" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(save);
    const layer = within(panel).getAllByLabelText("Layer")[0]!;
    expect(layer).toHaveAttribute("aria-invalid", "true");
    expect(layer).toHaveAccessibleDescription(/The part Broadband of Business Pro Plus is realised as it, as a CFSS; keep its layer, or change the part first\./);
  });
});
