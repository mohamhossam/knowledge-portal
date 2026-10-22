import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type CatalogueDiff, type Release } from "../api/client";
import { ComparePage } from "./ComparePage";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const release = (id: string, extra: Partial<Release> = {}): Release => ({
  id, name: id, revision: 1, status: "published", published_at: "2026-09-01T00:00:00Z",
  systems: [], relationships: [], documents: [], ...extra,
}) as unknown as Release;

function Where() {
  const location = useLocation();
  return <p data-testid="address">{location.search}</p>;
}

describe("comparing two catalogue versions", () => {
  it("compares the two named in the address, and swaps them", async () => {
    vi.spyOn(api, "releases").mockResolvedValue([
      release("spring", { published_at: "2026-04-01T00:00:00Z" }),
      release("summer", { published_at: "2026-07-01T00:00:00Z" }),
      release("next", { status: "draft", published_at: null }),
    ]);
    const changes = vi.spyOn(api, "releaseChanges").mockResolvedValue({
      base_release_id: "spring", draft_release_id: "summer", changes: [],
    } as CatalogueDiff);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/architecture/compare?from=spring&to=summer"]}>
          <Routes>
            <Route element={<Outlet context={{ book: { release: { id: "summer" } } }} />}>
              <Route path="/architecture/compare" element={<><ComparePage /><Where /></>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(changes).toHaveBeenCalledWith("summer", "spring"));
    expect(await screen.findByText("Nothing differs.")).toBeInTheDocument();
    const from = screen.getByRole("combobox", { name: "From" });
    expect(from).toHaveValue("spring");
    // The draft first, then by when each was published; the one in service says so.
    expect([...screen.getByRole("combobox", { name: "To" }).querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "next (in preparation)",
      "summer (in service, 1 Jul 2026)",
      "spring (replaced, 1 Apr 2026)",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent("?from=summer&to=spring"));
    await waitFor(() => expect(changes).toHaveBeenCalledWith("spring", "summer"));
    fireEvent.change(screen.getByRole("combobox", { name: "To" }), { target: { value: "summer" } });
    expect(await screen.findByText("Choose two different versions.")).toBeInTheDocument();
  });
});
