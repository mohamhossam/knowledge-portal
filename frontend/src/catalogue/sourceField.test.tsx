import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { KnowledgeSource, SourceReference } from "../api/client";
import { checkAxeAfterEach } from "../test/axe";
import { type SourceRegister, SourcesContext, sourceRegister } from "./governance";
import { SourceField } from "./SourceField";

checkAxeAfterEach();

const SOURCES = [
  { id: "SDD", title: "Business Pro Plus Solution Design", level: "L2", short: "SDD v2.3", supplied: true },
  { id: "CANON", title: "SMB Value Stream", level: "L1", short: "SMB Ref", supplied: true },
] as unknown as KnowledgeSource[];
/** The lines the service has read, as a version carries them. */
const READ = [
  { text: "SDD v2.3 · §4.1", source_id: "SDD", cited: "SDD v2.3", rest: "· §4.1", where: "§4.1" },
  { text: "Vendor deck p.3", where: "Vendor deck p.3" },
] as unknown as SourceReference[];

/** A source field holding a line, saying the line it now holds. */
function Holding({ start, register = sourceRegister({ sources: SOURCES, source_references: READ }) }: { start: string | null; register?: SourceRegister }) {
  const [line, setLine] = useState<string | null>(start);
  return (
    <MemoryRouter>
      <SourcesContext.Provider value={register}>
        <form aria-label="A fact">
          <SourceField value={line} onChange={setLine} />
        </form>
        <p data-testid="line">{JSON.stringify(line)}</p>
      </SourcesContext.Provider>
    </MemoryRouter>
  );
}

describe("a fact's source, chosen from the register", () => {
  it("opens a line on the source the service read it as, with where in it beside", () => {
    render(<Holding start="SDD v2.3 · §4.1" />);
    expect(screen.getByLabelText("Source")).toHaveValue("SDD");
    expect(screen.getByLabelText(/^Where in it/)).toHaveValue("§4.1");
  });

  it("lists the register by level, canonical first, writes the line the service reads back, and says it", () => {
    render(<Holding start={null} />);
    const select = screen.getByLabelText("Source") as HTMLSelectElement;
    expect([...select.querySelectorAll("optgroup")].map((group) => group.label)).toEqual(["Canonical (L1)", "Primary (L2)"]);
    expect([...select.options].map((option) => option.text)).toEqual([
      "Not stated",
      "SMB Ref: SMB Value Stream",
      "SDD v2.3: Business Pro Plus Solution Design",
      "A document not in the register",
    ]);
    fireEvent.change(select, { target: { value: "SDD" } });
    expect(screen.getByTestId("line")).toHaveTextContent('"SDD v2.3"');
    fireEvent.change(screen.getByLabelText(/^Where in it/), { target: { value: " §11 · the order step " } });
    expect(screen.getByTestId("line")).toHaveTextContent('"SDD v2.3 · §11 · the order step"');
    expect(screen.getByText("Saves as “SDD v2.3 · §11 · the order step”.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "" } });
    expect(screen.getByTestId("line")).toHaveTextContent("null");
  });

  it("keeps a citation of a document the register lacks as written, marked, with the way to register it", () => {
    render(<Holding start="Vendor deck p.3" />);
    expect(screen.getByLabelText("Source")).toHaveValue("*elsewhere");
    expect(screen.getByLabelText("The document, as cited")).toHaveValue("Vendor deck p.3");
    // The hint is the field's own, so it is read with it.
    expect(screen.getByLabelText("The document, as cited")).toHaveAccessibleDescription("Not in the register, so it can't be traced to its document.");
    fireEvent.change(screen.getByLabelText("The document, as cited"), { target: { value: "Vendor deck p.4" } });
    expect(screen.getByTestId("line")).toHaveTextContent('"Vendor deck p.4"');
    fireEvent.change(screen.getByLabelText("The document, as cited"), { target: { value: " " } });
    expect(screen.getByText("Nothing is recorded until the document is named.")).toBeInTheDocument();
  });

  it("keeps where in it when a registered source gives way to one not in the register", () => {
    render(<Holding start="SDD v2.3 · §4.1" />);
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "*elsewhere" } });
    expect(screen.getByLabelText("The document, as cited")).toHaveValue("SDD v2.3 · §4.1");
    expect(screen.getByTestId("line")).toHaveTextContent('"SDD v2.3 · §4.1"');
  });

  it("says when the draft registers no source, and still takes one as written", () => {
    render(<Holding start={null} register={sourceRegister({})} />);
    expect(screen.getByText("This draft registers no source yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "*elsewhere" } });
    fireEvent.change(screen.getByLabelText("The document, as cited"), { target: { value: "SDD v2.3 · §4.1" } });
    expect(screen.getByTestId("line")).toHaveTextContent('"SDD v2.3 · §4.1"');
  });
});
