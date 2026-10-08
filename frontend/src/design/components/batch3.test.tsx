import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./actions";
import { BulkActionBar, type Column, DataTable, DecisionButtons, DiffView, FilterStrip, type Sort } from "./data";
import { ConsequencePanel, EvidenceQuote, ImpactPanel, ProvenanceTrail } from "./evidence";
import { checkAxeAfterEach } from "../../test/axe";

// Every test's rendered state is also checked by axe (Phase 7).
checkAxeAfterEach();

type Doc = { id: string; title: string; count: number };
const DOCS: Doc[] = [
  { id: "a", title: "XGPON coverage rules", count: 12 },
  { id: "b", title: "سياسة التحقق من العنوان", count: 3 },
  { id: "c", title: "Fault escalation matrix", count: 404 },
];
const COLUMNS: Column<Doc>[] = [
  { id: "title", header: "Document", cell: (d) => d.title, rowHeader: true, sortable: true, bidi: true },
  { id: "count", header: "Passages", cell: (d) => d.count, numeric: true, sortable: true },
];

function Grid({ onActivate = vi.fn(), onRowKey }: { onActivate?: (d: Doc) => void; onRowKey?: (d: Doc, key: string) => boolean }) {
  const [current, setCurrent] = useState<string>();
  const [selected, setSelected] = useState(new Set<string>());
  const [sort, setSort] = useState<Sort>({ id: "title", direction: "ascending" });
  return (
    <DataTable caption="Documents" columns={COLUMNS} rows={DOCS} rowId={(d) => d.id} rowLabel={(d) => d.title}
      sort={sort} onSort={setSort} selected={selected} onSelectedChange={setSelected}
      currentId={current} onCurrentChange={setCurrent} onActivate={onActivate} onRowKey={onRowKey} />
  );
}

describe("DataTable", () => {
  it("is a captioned table with sortable headers that say their order", async () => {
    render(<Grid />);
    const table = screen.getByRole("grid", { name: "Documents" });
    const header = within(table).getByRole("columnheader", { name: /Document/ });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getByRole("columnheader", { name: /Passages/ })).toHaveAttribute("aria-sort", "none");
  });

  it("is one tab stop; arrows and j/k move; Enter opens; Space selects; Shift extends", async () => {
    const onActivate = vi.fn();
    render(<Grid onActivate={onActivate} />);
    const cells = screen.getAllByRole("rowheader");
    expect(cells.filter((c) => c.getAttribute("tabindex") === "0")).toHaveLength(1);
    cells[0]!.focus();
    await userEvent.keyboard("j");
    expect(screen.getAllByRole("rowheader")[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("rowheader")[2]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getAllByRole("rowheader")[0]).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledWith(DOCS[0]);
    await userEvent.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "Select XGPON coverage rules" })).toBeChecked();
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(screen.getByRole("checkbox", { name: "Select سياسة التحقق من العنوان" })).toBeChecked();
  });

  it("passes the widget's own letter keys to the current row, never with modifiers", async () => {
    const onRowKey = vi.fn((_: Doc, key: string) => key === "x");
    render(<Grid onRowKey={onRowKey} />);
    screen.getAllByRole("rowheader")[0]!.focus();
    await userEvent.keyboard("j");
    await userEvent.keyboard("x");
    expect(onRowKey).toHaveBeenLastCalledWith(DOCS[1], "x");
    await userEvent.keyboard("{Control>}x{/Control}");
    expect(onRowKey).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("q");
    expect(onRowKey).toHaveBeenLastCalledWith(DOCS[1], "q");
  });

  it("gives bidi cells their own direction and numbers their own column style", () => {
    render(<Grid />);
    expect(screen.getByRole("rowheader", { name: "سياسة التحقق من العنوان" })).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("gridcell", { name: "404" })).toHaveClass("ds-table__num");
  });

  it("makes a frame narrower than its table a labelled region that the keyboard can scroll (WCAG 2.1.1)", () => {
    // jsdom lays nothing out: report a frame narrower than its table, and observe at once.
    vi.stubGlobal("ResizeObserver", class { constructor(private callback: () => void) {} observe() { this.callback(); } disconnect() {} unobserve() {} });
    const widths = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
    const frame = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    render(<DataTable caption="Squads" columns={COLUMNS} rows={DOCS} rowId={(d) => d.id} />);
    const region = screen.getByRole("region", { name: "Squads (scrolls sideways)" });
    expect(region).toHaveAttribute("tabindex", "0");
    widths.mockRestore();
    frame.mockRestore();
    vi.unstubAllGlobals();
  });

  it("is a plain table when nothing activates rows, and says when it is empty", () => {
    render(<DataTable caption="Squads" columns={COLUMNS} rows={[]} rowId={(d) => d.id} emptyText="No squads yet." />);
    expect(screen.getByRole("table", { name: "Squads" })).toBeInTheDocument();
    expect(screen.getByText("No squads yet.")).toBeInTheDocument();
  });
});

describe("filters, decisions and bulk", () => {
  it("presses one filter at a time and offers clear", async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<FilterStrip label="Show passages" filters={[{ id: "all", label: "All", count: 404 }, { id: "flagged", label: "Flagged", count: 3 }]} active="all" onChange={onChange} onClear={onClear} />);
    expect(screen.getByRole("button", { name: "All 404" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Flagged 3" }));
    expect(onChange).toHaveBeenCalledWith("flagged");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("names decision buttons for their row and declares their keys", async () => {
    const onDecide = vi.fn();
    render(<DecisionButtons kind="suggestion" subject="Adds the system Dynamics CRM" onDecide={onDecide} />);
    const group = screen.getByRole("group", { name: "Decide Adds the system Dynamics CRM" });
    expect(within(group).getByRole("button", { name: "Reject" })).toHaveAttribute("aria-keyshortcuts", "r");
    await userEvent.click(within(group).getByRole("button", { name: "Accept" }));
    expect(onDecide).toHaveBeenCalledWith("accept");
  });

  it("shows the decided state instead of buttons", () => {
    render(<DecisionButtons kind="passage" subject="Passage 14" state="Excluded: internal floor price" onDecide={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Excluded: internal floor price")).toBeInTheDocument();
  });

  it("appears only with a selection, says how many, and clears", async () => {
    const onClear = vi.fn();
    const { rerender } = render(<BulkActionBar count={0} noun={["passage", "passages"]} onClear={onClear}><Button>Exclude…</Button></BulkActionBar>);
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument();
    rerender(<BulkActionBar count={12} noun={["passage", "passages"]} onClear={onClear}><Button>Exclude 12…</Button></BulkActionBar>);
    expect(screen.getByRole("status")).toHaveTextContent("12 passages selected");
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe("compare and evidence", () => {
  it("says each change's kind in words, with from → to and origin", () => {
    render(
      <DiffView
        fromLabel="Initial catalogue"
        toLabel="October integration update"
        changes={[
          { key: "order-hub", kind: "added", item: "System", label: "Order Hub", origin: "Suggestion, accepted by Amina Owner" },
          { key: "cwom", kind: "changed", item: "System", label: "CWOM", fields: [{ name: "Owner", from: "Fulfilment", to: "Care" }] },
          { key: "bcrm", kind: "removed", item: "System", label: "BCRM" },
        ]}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 added · 1 changed · 1 removed");
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Added");
    expect(items[0]).toHaveTextContent("Suggestion, accepted by Amina Owner");
    expect(items[1]).toHaveTextContent("Fulfilment → changed to Care");
    expect(items[2]).toHaveTextContent("Removed");
  });

  it("puts consequence first, needs a reason, and closes on Escape (§5)", async () => {
    const onConfirm = vi.fn();
    const onKeep = vi.fn();
    render(
      <ConsequencePanel
        tone="danger"
        title="Withdraw 'XGPON coverage rules'"
        happens="Requirement work can no longer cite this document."
        affects="7 requirements cite it now (only requirements you can see)."
        reversibility="You can return it to service later."
        reason={{ label: "Why are you withdrawing it?", hint: "The requirement owners see this." }}
        confirmLabel="Withdraw 'XGPON coverage rules'"
        keepLabel="Keep it in service"
        onConfirm={onConfirm}
        onKeep={onKeep}
      />,
    );
    const reason = screen.getByRole("textbox", { name: "Why are you withdrawing it?" });
    expect(reason).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Withdraw 'XGPON coverage rules'" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(reason).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(reason, "Superseded by the 2026 rules");
    await userEvent.click(screen.getByRole("button", { name: "Withdraw 'XGPON coverage rules'" }));
    expect(onConfirm).toHaveBeenCalledWith("Superseded by the 2026 rules");
    reason.focus();
    await userEvent.keyboard("{Escape}");
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it("says an unknown impact is unknown, not zero", () => {
    render(<ImpactPanel title="Cited by" state={{ kind: "unknown", why: "Couldn't ask Requirement AI." }} />);
    expect(screen.getByText(/unknown, not zero/)).toBeInTheDocument();
  });

  it("marks a stale check and offers to check again", async () => {
    const onCheck = vi.fn();
    render(<ImpactPanel title="Mapping impact" state={{ kind: "stale", at: "14:02" }} counts={[{ label: "Requirements that would map differently", value: 3 }]} onCheck={onCheck} />);
    expect(screen.getByText(/Out of date/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheck).toHaveBeenCalledOnce();
    // The button goes away while the check runs, so focus stays on the panel's title.
    expect(screen.getByRole("heading", { name: "Mapping impact" })).toHaveFocus();
  });

  it("lays the provenance trail out as an ordered, labelled list of hops", () => {
    render(<ProvenanceTrail hops={[{ label: "Evidence", value: "lines 1–12", href: "#e" }, { label: "Document", value: "Integration design, version 2" }, { label: "Decided by", value: "Amina Owner, 8 Oct" }]} />);
    const trail = screen.getByRole("navigation", { name: "Where this comes from" });
    expect(within(trail).getAllByRole("listitem")).toHaveLength(3);
  });

  it("highlights only the quoted line, in the passage's own direction", () => {
    render(<EvidenceQuote text={"System: Order Hub\nCaptures business orders."} quote="System: Order Hub" source="Integration design · lines 1–12" />);
    expect(screen.getByText("System: Order Hub").tagName).toBe("MARK");
    expect(document.querySelector("blockquote")).toHaveAttribute("dir", "auto");
  });
});
