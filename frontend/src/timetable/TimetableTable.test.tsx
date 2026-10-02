import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { NoteMark, TimetableTable } from "./TimetableTable";

function table(extra: Partial<Parameters<typeof TimetableTable>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TimetableTable
        number={1}
        title="Library"
        to="/library"
        edition={<>Edition of 2 Oct 2026<NoteMark note="latest" /></>}
        columns={[{ key: "name", label: "Document" }, { key: "status", label: "Status" }]}
        rows={[
          { key: "a", rank: "due", cells: { name: "Coverage", status: "Awaiting review" }, note: "pub-a" },
          { key: "b", rank: "delayed", cells: { name: "Broken", status: "Extraction failed" } },
        ]}
        notes={[{ id: "latest", text: "Latest publication." }, { id: "pub-a", text: "Version 1 stays in service." }]}
        next={{ to: "/library", label: "1 document awaits your review" }}
        quiet="Nothing waits."
        {...extra}
      />
    </MemoryRouter>,
  );
}

describe("TimetableTable", () => {
  it("is a numbered, labelled section with a row header per item", () => {
    table();
    const section = screen.getByRole("region", { name: "Table 1: Library" });
    expect(section).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Coverage/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1 document awaits your review" })).toHaveAttribute("href", "/library");
  });

  it("links each reference mark to its note and back, and lights both together", () => {
    table();
    const mark = screen.getByRole("link", { name: "Note 1.2" });
    expect(mark).toHaveAttribute("href", expect.stringMatching(/-note-pub-a$/));
    const back = screen.getByRole("link", { name: "Back to the mark for note 1.2" });
    expect(back).toHaveAttribute("href", expect.stringMatching(/-ref-pub-a$/));

    fireEvent.focus(mark);
    expect(screen.getByText("Version 1 stays in service.").closest("li")).toHaveClass("is-lit");
    expect(screen.getByRole("rowheader", { name: /Coverage/ }).closest("tr")).toHaveClass("is-lit");
    fireEvent.blur(mark);
    expect(screen.getByText("Version 1 stays in service.").closest("li")).not.toHaveClass("is-lit");
  });

  it("numbers notes in order, starting with the edition's", () => {
    table();
    expect(screen.getByRole("link", { name: "Note 1.1" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Notes to table 1" }).children).toHaveLength(2);
  });

  it("says when nothing waits, and offers a retry when the table could not be read", () => {
    let retried = 0;
    table({ rows: [], notes: [], quiet: "The knowledge service did not answer.", failure: () => { retried += 1; } });
    expect(screen.getByRole("alert")).toHaveTextContent("The knowledge service did not answer.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retried).toBe(1);
  });
});
