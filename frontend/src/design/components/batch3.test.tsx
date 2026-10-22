import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./actions";
import { BulkActionBar, type Column, DataTable, FilterStrip, type Sort } from "./data";
import { ConsequencePanel, EvidenceQuote } from "./evidence";
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
  it("opens a row's named link with a press anywhere on the row, but not on the row's own controls", async () => {
    const opened = vi.fn((event: Event) => event.preventDefault());
    const pressed = vi.fn();
    const columns: Column<Doc>[] = [
      { id: "title", header: "Document", rowHeader: true, cell: (d) => <a href={`/library/${d.id}`} onClick={(event) => opened(event.nativeEvent)}>{d.title}</a> },
      { id: "count", header: "Passages", numeric: true, cell: (d) => d.count },
      { id: "act", header: "Act", cell: (d) => <Button onClick={pressed}>Retry {d.title}</Button> },
    ];
    render(<DataTable caption="Documents" columns={columns} rows={DOCS} rowId={(d) => d.id} />);
    await userEvent.click(screen.getByRole("cell", { name: "404" }));
    expect(opened).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Retry XGPON coverage rules" }));
    expect(pressed).toHaveBeenCalledOnce();
    expect(opened).toHaveBeenCalledOnce();
  });

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
    // The filter that is on shows a check as well as its tint: state never by colour alone.
    expect(screen.getByRole("button", { name: "All 404" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Flagged 3" }).querySelector("svg")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Flagged 3" }));
    expect(onChange).toHaveBeenCalledWith("flagged");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("folds many filters into a labelled select as well (shown instead of the chips when narrow)", async () => {
    const onChange = vi.fn();
    const many = ["All", "Billing", "CRM", "Fulfilment", "Network"].map((name) => ({ id: name.toLowerCase(), label: name, count: 2 }));
    const { rerender } = render(<FilterStrip label="Capability domain" filters={many} active="all" onChange={onChange} />);
    // Hidden by a container query until the main area is narrow, so found by its label.
    const select = screen.getByLabelText("Capability domain", { selector: "select" });
    expect(select).toHaveValue("all");
    expect(screen.getByRole("option", { name: "CRM (2)", hidden: true })).toBeInTheDocument();
    await userEvent.selectOptions(select, "crm");
    expect(onChange).toHaveBeenCalledWith("crm");
    // A short strip stays chips at any width.
    rerender(<FilterStrip label="Capability domain" filters={many.slice(0, 4)} active="all" onChange={onChange} />);
    expect(document.querySelector("select")).toBeNull();
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

  it("highlights only the quoted line, in the passage's own direction", () => {
    render(<EvidenceQuote text={"System: Order Hub\nCaptures business orders."} quote="System: Order Hub" source="Integration design · lines 1–12" />);
    expect(screen.getByText("System: Order Hub").tagName).toBe("MARK");
    expect(document.querySelector("blockquote")).toHaveAttribute("dir", "auto");
  });

  it("marks the passage's language on the quote alone, not its source line", () => {
    render(<EvidenceQuote text="نظام الطلبات" source="Integration design · lines 1–12" lang="ar" />);
    expect(document.querySelector("blockquote")).toHaveAttribute("lang", "ar");
    expect(document.querySelector("figcaption")).not.toHaveAttribute("lang");
  });
});
