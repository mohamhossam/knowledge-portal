import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Offering } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { concerns } from "./catalogue";
import { fieldsInWords } from "./drafting";
import { finishedOffering, offeringProblem } from "./editing";
import { OfferingEditor } from "./OfferingEditor";

const OFFERING = EXPLORED.products![0]!;
const [MATRIX, RENEWAL] = OFFERING.lifecycle_notes;

function Editing({ start, seen }: { start: Offering; seen: (value: Offering) => void }) {
  const [value, setValue] = useState<Offering>(start);
  return (
    <OfferingEditor
      value={value}
      onChange={(next) => { setValue(next); seen(next); }}
      systems={EXPLORED.systems}
      channels={EXPLORED.channels ?? []}
    />
  );
}

describe("lifecycle notes", () => {
  it("concern their order types and channels, or every one", () => {
    expect(concerns(MATRIX!, "new", "online")).toBe(true);
    expect(concerns(MATRIX!, "CEASE", null)).toBe(false);
    expect(concerns(RENEWAL!, "CEASE", "shop")).toBe(true);
    expect(concerns(RENEWAL!, "NEW", "online")).toBe(false);
    expect(concerns(RENEWAL!, "NEW", null)).toBe(true);
  });

  it("are written in the offering editor, a table typed one row per line", () => {
    let last: Offering = { ...OFFERING, lifecycle_notes: [] };
    render(<Editing start={last} seen={(value) => (last = value)} />);

    const group = screen.getByRole("group", { name: "Lifecycle notes" });
    fireEvent.click(within(group).getByRole("button", { name: "Add a lifecycle note" }));
    fireEvent.change(within(group).getByLabelText(/^Title/), { target: { value: "Cessation" } });
    const parts = within(group).getByRole("group", { name: "What it says" });
    fireEvent.click(within(parts).getByRole("button", { name: "Add a part of Cessation" }));
    fireEvent.change(within(parts).getByLabelText("Kind of part"), { target: { value: "table" } });
    fireEvent.change(within(parts).getByLabelText(/^Column heads/), { target: { value: "When | Then" } });
    // Spaces survive typing: what was typed reads back exactly.
    expect(within(parts).getByLabelText(/^Column heads/)).toHaveValue("When | Then");
    fireEvent.change(within(parts).getByLabelText(/^Rows/), { target: { value: "Activating | Blocked\n\nActive | Allowed" } });

    const sent = finishedOffering(last).lifecycle_notes[0]!;
    expect(sent.id).toBe("cessation");
    expect(sent.blocks[0]).toMatchObject({ kind: "table", columns: ["When", "Then"], rows: [["Activating", "Blocked"], ["Active", "Allowed"]] });
    expect(offeringProblem(last)).toBeNull();
    expect(within(group).getByText("Note Cessation")).toHaveClass("form__row-title");
  });

  it("say why one cannot be sent yet", () => {
    const with_ = (note: Partial<typeof MATRIX>) => offeringProblem({ ...OFFERING, lifecycle_notes: [{ ...MATRIX!, ...note }] });
    expect(with_({ title: " " })).toBe("Every lifecycle note needs a title.");
    expect(with_({ blocks: [], summary: null })).toBe("Up / Downgrade matrix: a note needs a summary or what it says.");
    expect(with_({ blocks: [{ kind: "list", items: [" "], columns: [], rows: [] }] })).toBe("Up / Downgrade matrix: a list needs at least one item.");
    expect(with_({ blocks: [{ kind: "table", items: [], columns: ["A"], rows: [["1", "2"]] }] })).toBe(
      "Up / Downgrade matrix: a table row has more cells than the table has columns.",
    );
  });

  it("are said in words when they change", () => {
    expect(fieldsInWords(["lifecycle_notes"])).toBe("lifecycle notes");
  });
});
