import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../../api/client";
import { checkAxeAfterEach } from "../../test/axe";
import { catalogue } from "../catalogue";
import release from "../model/fixtures/smb-release.json";
import { asRelease } from "../model/sample";
import { SystemsPage } from "../SystemsPage";
import type { CatalogueContext } from "../useCatalogue";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

// The committed SMB catalogue: its journeys' calls and Business Pro Plus's components.
const RELEASE = { ...asRelease(release), status: "published" } as Release;

function Address() {
  const { pathname, search } = useLocation();
  return <output aria-label="Address">{pathname}{search}</output>;
}

function open(path: string) {
  cleanup();
  vi.spyOn(api, "organisation").mockResolvedValue({ people: [], squads: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "changeRequests").mockResolvedValue([] as never);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({ outdated_requirements: 0 } as never);
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: true, actorName: () => "Amina Owner" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route index element={<SystemsPage />} />
            <Route path="systems/:systemId" element={<SystemsPage />} />
          </Route>
        </Routes>
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the systems read across (catalogue merge, step 5)", () => {
  it("crosses who calls whom, picks a system for its summary, and keeps the recorded connections under it", () => {
    open("/architecture?view=interfaces");
    expect(screen.getByRole("tab", { name: "Who calls whom" })).toHaveAttribute("aria-selected", "true");
    const matrix = screen.getByRole("region", { name: "Interface matrix (scrolls when narrow)" });
    // Each system's row opens with its button; a layer's own row only names the layer.
    const rows = [...matrix.querySelectorAll<HTMLButtonElement>("tbody th[scope=row] button")];
    expect(rows.length).toBeGreaterThan(5);
    const first = rows[0]!;
    fireEvent.click(first);
    const name = first.querySelector("span")!.textContent!;
    expect(screen.getByRole("complementary", { name })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent(/[?&]system=/);
    expect(screen.getByRole("heading", { name: /^Connections recorded between systems/ })).toBeInTheDocument();
  });

  it("marks which systems deliver which kind of bundle part", () => {
    open("/architecture?view=delivery");
    const matrix = screen.getByRole("region", { name: "Systems by what they deliver (scrolls when narrow)" });
    expect(within(matrix).getByRole("columnheader", { name: "Connectivity" })).toBeInTheDocument();
    expect(within(matrix).getAllByRole("img", { name: /: \d+ components?: / }).length).toBeGreaterThan(0);
  });

  it("goes back to the records, and leaves a record for a matrix in the address", () => {
    open("/architecture?view=interfaces");
    fireEvent.click(screen.getByRole("tab", { name: "Records" }));
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent(/^\/architecture$/);
    open("/architecture/systems/cwom");
    fireEvent.click(screen.getByRole("tab", { name: "What they deliver" }));
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent("/architecture?view=delivery");
  });
});
