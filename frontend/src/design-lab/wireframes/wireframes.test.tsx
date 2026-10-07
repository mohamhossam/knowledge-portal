import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../../api/client";
import { EXPLORED } from "../../explorer/fixtures";
import WireframesApp from "./WireframesApp";

// jsdom has no layout observer; the sticky measuring hook only needs the interface.
class NoResize {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const READS: Partial<Record<keyof typeof api, () => Promise<unknown>>> = {
  libraryDocuments: async () => [],
  releases: async () => [],
  activeRelease: async () => EXPLORED as unknown as Release,
  organisation: async () => ({ people: [], value_streams: [], products: [], squads: [] }),
  reminders: async () => ({ overdue: 0, due_soon: 0, items: [] }),
  explorerRelease: async () => EXPLORED,
  knownActors: async () => [],
  search: async () => [],
  releaseChanges: async () => ({ base_release_id: "a", draft_release_id: "b", changes: [] }),
};

let writes: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  writes = [];
  const methods = api as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const key of Object.keys(methods)) {
    if (typeof methods[key] !== "function") continue;
    const read = READS[key as keyof typeof api];
    const spy = vi.spyOn(methods, key).mockImplementation(read ?? (async () => { throw new Error(`unexpected call: ${key}`); }));
    // Anything that is not a known read counts as a write and must never be called.
    if (!read) writes.push(spy);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/design-lab/wireframes${path}`]}>
        <Routes>
          <Route path="design-lab/wireframes/*" element={<WireframesApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ROUTES: [string, string][] = [
  ["", "Your work"],
  ["/lab", "Wireframe lab"],
  ["/re-confirmations", "Re-confirmations"],
  ["/library", "Library"],
  ["/library/search?q=coverage", "Search passages"],
  ["/architecture", "Catalogue"],
  ["/architecture/versions", "Catalogue versions"],
  ["/ownership", "Ownership"],
  ["/ownership/people", "People"],
  ["/requirement-knowledge", "Requirements"],
  ["/requirement-knowledge/historic", "Historic requirements"],
  ["/explorer", "Product architecture explorer"],
  ["/states/no-access", "This portal is for knowledge admins"],
  ["/no-such-page", "We couldn't find that page"],
];

describe("wireframe lab", () => {
  it.each(ROUTES)("renders %s with its h1 and calls no write", async (path, title) => {
    open(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
  });

  it("offers skip links and every utility on every page", async () => {
    open("/library");
    await screen.findByRole("heading", { level: 1, name: "Library" });
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
    for (const name of ["Jobs", "Help"]) expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Areas" })).toBeInTheDocument();
  });

  it("says plainly when nothing is due", async () => {
    open("/re-confirmations");
    expect(await screen.findByText("Nothing is due.")).toBeInTheDocument();
  });
});
