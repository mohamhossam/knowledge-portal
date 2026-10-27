import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../../api/client";
import { EXPLORED } from "../../explorer/fixtures";
import { checkAxeAfterEach } from "../../test/axe";
import { catalogue } from "../catalogue";
import { GovernancePage } from "../GovernancePage";
import { SourcesContext, sourceRegister } from "../governance";
import type { CatalogueContext } from "../useCatalogue";
import { CitedPassage, OpenDocument, SourceById, SourceName } from "./Provenance";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

const DOCUMENT = { id: "doc-1", title: "Integration design", filename: "design.txt", mime_type: "text/plain" };
// The Business Pro Plus design names its file, which this version holds.
const RELEASE = {
  ...EXPLORED,
  documents: [DOCUMENT],
  sources: (EXPLORED.sources ?? []).map((source) => (source.id === "SDD" ? { ...source, file: "design.txt" } : source)),
} as unknown as Release;

/** On a catalogue page: the version's context and its source register. */
function onCataloguePage(children: ReactNode, path = "/architecture") {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: true, actorName: () => "Amina" };
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SourcesContext.Provider value={sourceRegister(RELEASE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="architecture" element={<Outlet context={context} />}>
              <Route index element={<div>{children}</div>} />
              <Route path="governance/:register/:itemId" element={children} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SourcesContext.Provider>
    </QueryClientProvider>,
  );
}

describe("provenance one step away (catalogue merge, step 6)", () => {
  it("opens the registered source a fact's source line names, on Governance", () => {
    onCataloguePage(<p><SourceName text="SDD §11" /> · <SourceName text="A note typed by hand" /> · <SourceById id="SDD" /></p>);
    expect(screen.getByRole("link", { name: "SDD (L2) §11" })).toHaveAttribute("href", "/architecture/governance/sources/SDD");
    expect(screen.getByRole("link", { name: "BPP SDD" })).toHaveAttribute("href", "/architecture/governance/sources/SDD");
    // A line that names no registered source reads as written.
    expect(screen.getByText("A note typed by hand").closest("a")).toBeNull();
  });

  it("keeps a source a name where a reader can't open Governance (the Explorer)", () => {
    render(
      <SourcesContext.Provider value={sourceRegister(RELEASE)}>
        <MemoryRouter><p><SourceName text="SDD §11" /></p></MemoryRouter>
      </SourcesContext.Provider>,
    );
    expect(screen.getByText("SDD (L2) §11").closest("a")).toBeNull();
  });

  it("opens a quote's passage in place, its neighbours either side and the quoted words marked", async () => {
    const passage = vi.spyOn(api, "citedPassage").mockResolvedValue({
      mime_type: "text/plain",
      before: [{ location: "§4.0", text: "Orders arrive from the portal." }],
      passage: { location: "§4.1", text: "CWOM tracks orders until they are fulfilled." },
      after: [{ location: "§4.2", text: "Billing starts on activation." }],
    } as never);
    onCataloguePage(<CitedPassage versionId="doc-1" location="§4.1" quote="CWOM tracks orders" title="Integration design" />);
    fireEvent.click(screen.getByRole("button", { name: "Show the passage in Integration design, §4.1" }));
    expect(await screen.findByText("CWOM tracks orders", { selector: "mark" })).toBeInTheDocument();
    expect(passage).toHaveBeenCalledWith(EXPLORED.id, "doc-1", "§4.1");
    expect(screen.getByText("Orders arrive from the portal.")).toBeInTheDocument();
    expect(screen.getByText("Billing starts on activation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the document Integration design" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide the passage in Integration design, §4.1" }));
    expect(screen.queryByText("Billing starts on activation.")).not.toBeInTheDocument();
  });

  it("says why a passage can't be opened", async () => {
    const { ApiError } = await import("../../api/errors");
    vi.spyOn(api, "citedPassage").mockRejectedValue(new ApiError(404, "This document is not part of the version.", "knowledge_not_found"));
    onCataloguePage(<CitedPassage versionId="doc-1" location="§4.1" title="Integration design" />);
    fireEvent.click(screen.getByRole("button", { name: /^Show the passage/ }));
    expect(await screen.findByText("This document is not part of the version.")).toBeInTheDocument();
  });

  it("opens a registered source's document from its Governance record, when the version holds its file", () => {
    onCataloguePage(<GovernancePage />, "/architecture/governance/sources/SDD");
    const record = within(screen.getByRole("article"));
    expect(record.getByText("design.txt")).toBeInTheDocument();
    expect(record.getByRole("button", { name: "Open the document Integration design" })).toBeInTheDocument();
  });

  it("opens the stored document in a new tab", async () => {
    vi.spyOn(api, "catalogueDocumentContent").mockResolvedValue(new Blob(["text"], { type: "text/plain" }));
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:design"), revokeObjectURL: vi.fn() });
    onCataloguePage(<OpenDocument versionId="doc-1" title="Integration design" />);
    fireEvent.click(screen.getByRole("button", { name: "Open the document Integration design" }));
    await waitFor(() => expect(tab.location.href).toBe("blob:design"));
    expect(within(document.body).queryByRole("status")).toBeNull();
  });

  it("downloads the document under its own name where a new tab is blocked, never leaving the record", async () => {
    vi.spyOn(api, "catalogueDocumentContent").mockResolvedValue(new Blob(["text"], { type: "text/plain" }));
    vi.spyOn(window, "open").mockReturnValue(null);
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:design"), revokeObjectURL: vi.fn() });
    const saved = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect([this.download, this.href]).toEqual(["design.txt", "blob:design"]);
    });
    onCataloguePage(<OpenDocument versionId="doc-1" title="Integration design" />);
    fireEvent.click(screen.getByRole("button", { name: "Open the document Integration design" }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  });
});
