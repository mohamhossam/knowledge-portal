import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { type Accepted, acceptances } from "./accepted";
import { AcceptedFrom } from "./AcceptedFrom";
import { catalogue } from "./catalogue";
import type { CatalogueContext } from "./useCatalogue";

const RELEASE = { ...EXPLORED, revision: 3, status: "draft", documents: [] } as unknown as Release;
const NAMES: Record<string, string> = { amina: "Amina Owner", ravi: "Ravi Curator" };

function shown(children: ReactNode) {
  const context: CatalogueContext = {
    book: catalogue(RELEASE),
    base: "/architecture",
    inService: false,
    actorName: (id) => (id ? NAMES[id] ?? id : "someone"),
  };
  return render(
    <MemoryRouter initialEntries={["/architecture"]}>
      <Routes>
        <Route path="architecture" element={<Outlet context={context} />}>
          <Route index element={<div data-testid="record">{children}</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const FIRST: Accepted = { candidate_id: "c1", model: "model-x", prompt_version: "prompt-7", decided_by: "amina", decided_at: "2026-10-20T09:00:00Z", citations: [] };
const SECOND: Accepted = { candidate_id: "c2", model: "model-y", prompt_version: "prompt-8", decided_by: "ravi", decided_at: "2026-10-21T09:00:00Z", citations: [] };

describe("AcceptedFrom (ADR-0120)", () => {
  it("shows nothing for a record written by hand", () => {
    shown(<AcceptedFrom accepted={[]} />);
    expect(screen.getByTestId("record")).toBeEmptyDOMElement();
  });

  it("says which model suggested it and who accepted it when", () => {
    shown(<AcceptedFrom accepted={[FIRST]} />);
    expect(screen.getByTestId("record")).toHaveTextContent(/^A suggestion from model-x \(prompt prompt-7\), accepted by Amina Owner on .*2026$/);
  });

  it("lists every acceptance, newest first", () => {
    shown(<AcceptedFrom accepted={[FIRST, SECOND]} />);
    const items = within(screen.getByRole("list", { name: "Accepted suggestions" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("model-y (prompt prompt-8), accepted by Ravi Curator"),
      expect.stringContaining("model-x (prompt prompt-7), accepted by Amina Owner"),
    ]);
  });

  it("reads a record from an API that predates acceptances as having none", () => {
    expect(acceptances({})).toEqual([]);
    expect(acceptances({ accepted: [FIRST] })).toEqual([FIRST]);
  });

  it("says where it was read, after its suggestion is gone (review recommendation 6)", () => {
    const read: Accepted = {
      ...FIRST,
      citations: [
        { document_version_id: "doc-1", document: "Integration design", location: "§4.1 › Table 2, row 3", quote: "CWOM tracks orders" },
        { location: "Catalogue › 3 activities", quote: "Order Handling" },
      ],
    };
    shown(<AcceptedFrom accepted={[read]} />);
    const cited = within(screen.getByRole("list", { name: "Where it was read" })).getAllByRole("listitem");
    expect(cited.map((item) => item.textContent)).toEqual([
      "Integration design, §4.1 › Table 2, row 3: “CWOM tracks orders”",
      // Read from the catalogue itself or a change request: no document to name.
      "Catalogue › 3 activities: “Order Handling”",
    ]);
  });

  it("names where the last one was read in the heading's one line", () => {
    const read: Accepted = { ...SECOND, citations: [{ document_version_id: "doc-1", document: "Integration design", location: "§4.1", quote: "CWOM tracks orders" }] };
    shown(<AcceptedFrom accepted={[FIRST, read]} summary />);
    expect(screen.getByTestId("record")).toHaveTextContent(/accepted by Ravi Curator on .*2026, read in Integration design, §4\.1$/);
  });

  it("sums them up in one line for a record's heading", () => {
    shown(<AcceptedFrom accepted={[FIRST, SECOND]} summary />);
    expect(screen.getByTestId("record")).toHaveTextContent(/^From 2 accepted suggestions; the last accepted by Ravi Curator on .*2026$/);
  });
});
