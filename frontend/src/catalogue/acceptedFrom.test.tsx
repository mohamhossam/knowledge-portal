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
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

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

  it("says who accepted it when and which reader suggested it, the model and prompt one step away", () => {
    shown(<AcceptedFrom accepted={[FIRST]} />);
    expect(screen.getByTestId("record")).toHaveTextContent(/^Accepted by Amina Owner on .*2026, from a suggestion by the catalogue reader/);
    const detail = screen.getByText("Model and prompt").closest("details")!;
    expect(detail).not.toHaveAttribute("open");
    expect(detail).toHaveTextContent("model-x · prompt prompt-7");
  });

  it("names the table reader in words, and gives the record's meta one line", () => {
    shown(<AcceptedFrom accepted={[{ ...FIRST, model: "catalogue-table-reader" }, SECOND]} summary />);
    expect(screen.getByTestId("record")).toHaveTextContent(/^From 2 accepted suggestions; the last accepted by Ravi Curator on /);
    expect(screen.getByText("Model and prompt").closest("details")).toHaveTextContent("model-y · prompt prompt-8; catalogue-table-reader · prompt prompt-7");
  });

  it("lists every acceptance, newest first", () => {
    shown(<AcceptedFrom accepted={[FIRST, SECOND]} />);
    const items = within(screen.getByRole("list", { name: "Accepted suggestions" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Accepted by Ravi Curator .*model-y · prompt prompt-8/),
      expect.stringMatching(/^Accepted by Amina Owner .*model-x · prompt prompt-7/),
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
    expect(cited[0]).toHaveTextContent(/^Integration design, §4.1 › Table 2, row 3: “CWOM tracks orders”/);
    // A passage read from a document opens in place (catalogue merge, step 6).
    expect(within(cited[0]!).getByRole("button", { name: "Show the passage in Integration design, §4.1 › Table 2, row 3" })).toHaveAttribute("aria-expanded", "false");
    // Read from the catalogue itself or a change request: no document to name, nothing to open.
    expect(cited[1]).toHaveTextContent("Catalogue › 3 activities: “Order Handling”");
    expect(within(cited[1]!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("names where the last one was read in the heading's one line", () => {
    const read: Accepted = { ...SECOND, citations: [{ document_version_id: "doc-1", document: "Integration design", location: "§4.1", quote: "CWOM tracks orders" }] };
    shown(<AcceptedFrom accepted={[FIRST, read]} summary />);
    expect(screen.getByTestId("record")).toHaveTextContent(/accepted by Ravi Curator on .*2026, read in Integration design, §4\.1Model and prompt/);
  });

  it("sums them up in one line for a record's heading", () => {
    shown(<AcceptedFrom accepted={[FIRST, SECOND]} summary />);
    expect(screen.getByTestId("record")).toHaveTextContent(/^From 2 accepted suggestions; the last accepted by Ravi Curator on .*2026Model and prompt/);
  });
});
