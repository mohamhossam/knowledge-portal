import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { catalogue } from "./catalogue";
import { JourneysPage } from "./JourneysPage";
import { OfferingsPage } from "./OfferingsPage";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const DRAFT = { ...EXPLORED, revision: 3, status: "draft", documents: [] } as unknown as Release;
const OFFERING = DRAFT.products![0]!;
const JOURNEY = DRAFT.journeys![0]!;
/** The draft after its offering was renamed from "old-offering" and its journey from "old-journey". */
const RENAMED = {
  ...DRAFT,
  products: [{ ...OFFERING, former_ids: ["old-offering"] }, ...DRAFT.products!.slice(1)],
  journeys: [{ ...JOURNEY, former_ids: ["old-journey"] }, ...DRAFT.journeys!.slice(1)],
} as Release;

function open(release: Release, path: string) {
  cleanup();
  const context: CatalogueContext = { book: catalogue(release), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings/:offeringId" element={<OfferingsPage />} />
            <Route path="journeys/:journeyId" element={<JourneysPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("an address that names a former id", () => {
  it("opens the offering under its id now, and says what it was", async () => {
    open(RENAMED, "/architecture/offerings/old-offering?tab=orders");
    expect(await screen.findByRole("heading", { level: 2, name: OFFERING.name })).toBeInTheDocument();
    expect(screen.getByText("old-offering")).toBeInTheDocument();
    expect(screen.queryByText(/has no offering/)).not.toBeInTheDocument();
  });

  it("opens the journey under its id now", async () => {
    open(RENAMED, "/architecture/journeys/old-journey");
    expect(await screen.findByRole("heading", { level: 2, name: JOURNEY.name })).toBeInTheDocument();
    expect(screen.getByText("old-journey")).toBeInTheDocument();
  });

  it("still says so when no offering ever had the id", () => {
    open(RENAMED, "/architecture/offerings/nowhere");
    expect(screen.getByText(/has no offering “nowhere”/)).toBeInTheDocument();
  });
});

describe("changing an offering's id", () => {
  it("refuses an id another offering has, or had, beside the field", () => {
    const other = { ...OFFERING, id: "other", name: "Other", former_ids: ["taken"] };
    open({ ...RENAMED, products: [...RENAMED.products!, other] } as Release, `/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Change the id…" }));
    const field = screen.getByLabelText(/New id/);
    for (const [typed, said] of [["other", "already the id"], ["taken", "already the id"], ["has space", "no spaces"], ["", "Give it an id"]] as const) {
      fireEvent.change(field, { target: { value: typed } });
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(expect.stringContaining(said));
    }
  });

  it("sends the new id with the draft's revision and opens the offering under it", async () => {
    const renamed = { ...DRAFT, revision: 4, products: [{ ...OFFERING, id: "business-pro-plus", former_ids: [OFFERING.id] }] } as Release;
    const rename = vi.spyOn(api, "renameEntity").mockResolvedValue(renamed);
    open(DRAFT, `/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Change the id…" }));
    fireEvent.change(screen.getByLabelText(/New id/), { target: { value: "business-pro-plus" } });
    fireEvent.click(screen.getByRole("button", { name: "Change the id" }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(DRAFT.id, "offerings", OFFERING.id, { expected_revision: 3, new_id: "business-pro-plus" }));
  });

  it("gives focus back to its button when cancelled", async () => {
    open(DRAFT, `/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Change the id…" }));
    fireEvent.keyDown(screen.getByLabelText(/New id/), { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Change the id…" })).toHaveFocus());
  });
});
