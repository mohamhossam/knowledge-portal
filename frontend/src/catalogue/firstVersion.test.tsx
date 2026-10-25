import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { checkAxeAfterEach } from "../test/axe";
import { CataloguePage } from "./CataloguePage";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const DRAFT = { id: "draft-1", name: "First catalogue", status: "draft", revision: 1, systems: [], relationships: [] } as unknown as Release;

function open(releases: Release[]) {
  vi.spyOn(api, "activeRelease").mockResolvedValue(null);
  vi.spyOn(api, "releases").mockResolvedValue(releases);
  vi.spyOn(api, "knownActors").mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/architecture"]}>
        <Routes>
          <Route path="architecture" element={<CataloguePage />} />
          <Route path="architecture/versions/:releaseId/sources" element={<p>Sources step</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the catalogue with no version in service (ADR-0126)", () => {
  it("starts the first version, empty, and opens its first step", async () => {
    open([]);
    const create = vi.spyOn(api, "createDraft").mockResolvedValue(DRAFT);
    expect(await screen.findByRole("heading", { level: 1, name: "No catalogue version is in service yet" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Start the first version" }));
    expect(screen.getByText(/The first version starts empty/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "First catalogue" } });
    fireEvent.click(screen.getByRole("button", { name: "Start it" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith("First catalogue"));
    expect(await screen.findByText("Sources step")).toBeInTheDocument();
  });

  it("carries on with the first version once it is in preparation", async () => {
    open([DRAFT]);
    expect(await screen.findByRole("link", { name: "Carry on with ‘First catalogue’" })).toHaveAttribute(
      "href",
      "/architecture/versions/draft-1/sources",
    );
    expect(screen.queryByRole("button", { name: "Start the first version" })).not.toBeInTheDocument();
  });
});
