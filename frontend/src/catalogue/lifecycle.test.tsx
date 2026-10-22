import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Offering } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { concerns } from "./catalogue";
import { fieldsInWords } from "./drafting";
import { finishedOffering, offeringProblem } from "./editing";
import { sourceRegister, SourcesContext } from "./governance";
import { LifecycleSection } from "./LifecycleNotes";
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
    expect(within(group).getByText("Note Cessation")).toHaveClass("cat-form__row-title");
  });

  it("say why one cannot be sent yet", () => {
    const with_ = (note: Partial<typeof MATRIX>) => offeringProblem({ ...OFFERING, lifecycle_notes: [{ ...MATRIX!, ...note }] });
    expect(with_({ title: " " })).toBe("Every lifecycle note needs a title.");
    expect(with_({ blocks: [], summary: null })).toBe("Up / Downgrade matrix: a note needs a summary or what it says.");
    expect(with_({ blocks: [{ kind: "list", items: [" "], columns: [], rows: [], to_verify: false }] })).toBe("Up / Downgrade matrix: a list needs at least one item.");
    expect(with_({ blocks: [{ kind: "table", items: [], columns: ["A"], rows: [["1", "2"]], to_verify: false }] })).toBe(
      "Up / Downgrade matrix: a table row has more cells than the table has columns.",
    );
  });

  it("are said in words when they change", () => {
    expect(fieldsInWords(["lifecycle_notes"])).toBe("lifecycle notes");
  });
});

describe("lifecycle notes read in the explorer", () => {
  const name = (id: string) => ({ shop: "Shop", online: "Online", NEW: "New Activation" })[id] ?? id;
  const read = (channelId: string) =>
    render(
      <SourcesContext.Provider value={sourceRegister(EXPLORED)}>
        <LifecycleSection
          offering={OFFERING}
          headingId="lc"
          orderName={name}
          channelName={name}
          focus={{ orderCode: "NEW", orderName: "New Activation", channelId }}
        />
      </SourcesContext.Provider>,
    );
  const section = () => within(screen.getByRole("heading", { name: /^Lifecycle notes for New Activation/ }).closest("section")!);

  it("reads the notes of the order type and channel, and counts the others", () => {
    read("online");
    expect(section().getAllByRole("article")).toHaveLength(1);
    // A lone note opens by itself.
    const matrix = within(section().getByRole("article", { name: "Up / Downgrade matrix" }));
    expect(matrix.getByRole("button", { name: "Up / Downgrade matrix" })).toHaveAttribute("aria-expanded", "true");
    // The note's source names a registered source, so it says its level.
    expect(matrix.getByText("Change · SDD (L2) §10")).toBeInTheDocument();
    const table = matrix.getByRole("table", { name: "Workflows are in the annexure." });
    expect(within(table).getByRole("rowheader")).toHaveTextContent("200Mbps");
    expect(within(table).getByRole("cell")).toHaveTextContent("300Mbps");
    expect(within(table).getAllByRole("columnheader").map((head) => head.textContent)).toEqual(["From", "To"]);
    expect(section().getByText("2 more notes concern other order types or channels.")).toBeInTheDocument();
  });

  it("closes notes to an index when there are several, each saying what it holds", () => {
    read("shop");
    const toggle = section().getByRole("button", { name: "Renewal" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const renewal = within(section().getByRole("article", { name: "Renewal" }));
    expect(renewal.getByText("Commercial · Only in Shop")).toBeInTheDocument();
    expect(renewal.getByText("Holds a list of 1 item.")).toBeInTheDocument();
    expect(renewal.getByText("Carries over content to re-verify.").closest(".ds-status--attention")).not.toBeNull();
    expect(renewal.queryByRole("listitem")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(renewal.getByText("v8.2 carry-over (re-verify)")).toBeInTheDocument();
    expect(renewal.getByText("Carried over from another source: to re-verify before anyone relies on it.").closest(".ds-status--attention")).not.toBeNull();
    expect(renewal.getByText("Suggested · inferred, not stated in the source")).toBeInTheDocument();
    expect(renewal.getByRole("listitem")).toHaveTextContent("Inherit tenure");

    fireEvent.click(section().getByRole("button", { name: "Open every note" }));
    expect(section().getByRole("button", { name: "Up / Downgrade matrix" })).toHaveAttribute("aria-expanded", "true");
    expect(section().getByRole("button", { name: "Close every note" })).toBeInTheDocument();
  });
});
