import "./data.css";

import { ArrowDown, ArrowUp, ArrowUpDown, Minus, Plus, RefreshCw } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

import { useFocusAfterRender, useStickySize } from "../hooks";

export type Filter = { id: string; label: string; count?: number };

/**
 * Filters as pressed buttons with their counts; state belongs in the URL (the
 * caller's job). "Clear filters" appears only when a filter is on.
 */
export function FilterStrip({
  label,
  filters,
  active,
  onChange,
  find,
  onClear,
}: {
  label: string;
  filters: Filter[];
  active: string;
  onChange: (id: string) => void;
  /** An optional find field: `data-find` lets the "/" shortcut focus it. */
  find?: { label: string; value: string; onChange: (value: string) => void; placeholder?: string };
  onClear?: () => void;
}) {
  return (
    <div className="ds-filters" role="group" aria-label={label}>
      {filters.map((filter) => (
        <button key={filter.id} type="button" className="ds-filters__button" aria-pressed={active === filter.id} onClick={() => onChange(filter.id)}>
          {filter.label}
          {filter.count !== undefined && <>{" "}<span className="ds-filters__count">{filter.count.toLocaleString("en")}</span></>}
        </button>
      ))}
      {find && (
        <label className="ds-filters__find">
          <span className="ds-visually-hidden">{find.label}</span>
          <input className="ds-input" data-find dir="auto" value={find.value} placeholder={find.placeholder ?? "Find"} onChange={(event) => find.onChange(event.target.value)} />
        </label>
      )}
      {onClear && <button type="button" className="ds-button ds-button--link" onClick={onClear}>Clear filters</button>}
    </div>
  );
}

export type Column<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** A row header column (the row's name). One per table. */
  rowHeader?: boolean;
  sortable?: boolean;
  /** Tabular, condensed numerals, aligned to the end. */
  numeric?: boolean;
  /** Content of either language: each cell takes its own direction (§13). */
  bidi?: boolean;
  width?: string;
};

export type Sort = { id: string; direction: "ascending" | "descending" };

/**
 * The ledger table. Dense, sticky head under the heavy rule, sortable columns
 * (aria-sort), optional selection (24 px checkboxes), and, when `onActivate`
 * is given, a keyboard grid: ↑ ↓ (or j k) move, Home/End jump, Enter opens,
 * Space selects, Shift+↑/↓ extends. One tab stop for the whole grid.
 */
export function DataTable<T>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowId,
  sort,
  onSort,
  selected,
  onSelectedChange,
  onActivate,
  currentId,
  onCurrentChange,
  rowLabel,
  emptyText = "Nothing to show.",
}: {
  caption: string;
  captionHidden?: boolean;
  columns: Column<T>[];
  rows: T[];
  rowId: (row: T) => string;
  sort?: Sort;
  onSort?: (sort: Sort) => void;
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  onActivate?: (row: T) => void;
  currentId?: string;
  onCurrentChange?: (id: string) => void;
  /** Names a row for its checkbox and for announcements ("passage 14"). */
  rowLabel?: (row: T) => string;
  emptyText?: string;
}) {
  const grid = Boolean(onActivate);
  const body = useRef<HTMLTableSectionElement>(null);
  const focusLater = useFocusAfterRender();
  const ids = rows.map(rowId);
  const current = currentId && ids.includes(currentId) ? currentId : ids[0];

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    onCurrentChange?.(id);
    focusLater(() => body.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] [data-cell-focus]`));
  };
  const toggle = (id: string, on?: boolean) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (on ?? !next.has(id)) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  };

  const keyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (!grid || (event.target as HTMLElement).closest("input,textarea,select,button,a")) return;
    const index = Math.max(0, ids.indexOf(current ?? ""));
    const step = (by: number) => ids[Math.max(0, Math.min(index + by, ids.length - 1))];
    const key = event.key;
    if (event.shiftKey && (key === "ArrowDown" || key === "ArrowUp")) {
      const target = step(key === "ArrowDown" ? 1 : -1);
      if (current) toggle(current, true);
      if (target) toggle(target, true);
      focusRow(target);
    } else if (key === "ArrowDown" || key === "j") focusRow(step(1));
    else if (key === "ArrowUp" || key === "k") focusRow(step(-1));
    else if (key === "Home") focusRow(ids[0]);
    else if (key === "End") focusRow(ids.at(-1));
    else if (key === "Enter") {
      const row = rows[index];
      if (row) onActivate?.(row);
    } else if (key === " " && current) toggle(current);
    else return;
    event.preventDefault();
  };

  const header = (column: Column<T>) => {
    const sorted = sort?.id === column.id ? sort.direction : undefined;
    return (
      <th key={column.id} scope="col" aria-sort={column.sortable ? sorted ?? "none" : undefined} style={column.width ? { inlineSize: column.width } : undefined} className={column.numeric ? "ds-table__num" : undefined}>
        {column.sortable && onSort ? (
          <button type="button" className="ds-table__sort" onClick={() => onSort({ id: column.id, direction: sorted === "ascending" ? "descending" : "ascending" })}>
            {column.header}
            {sorted === "ascending" ? <ArrowUp size={12} aria-hidden="true" /> : sorted === "descending" ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUpDown size={12} aria-hidden="true" className="ds-table__sort-idle" />}
          </button>
        ) : (
          column.header
        )}
      </th>
    );
  };

  return (
    <div className="ds-table-wrap">
      <table className="ds-table" role={grid ? "grid" : undefined} aria-rowcount={grid ? rows.length + 1 : undefined}>
        <caption className={captionHidden ? "ds-visually-hidden" : "ds-table__caption"}>{caption}</caption>
        <thead>
          <tr>
            {selected && <th scope="col" className="ds-table__select"><span className="ds-visually-hidden">Select</span></th>}
            {columns.map(header)}
          </tr>
        </thead>
        <tbody ref={body} onKeyDown={keyDown}>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + (selected ? 1 : 0)} className="ds-table__empty">{emptyText}</td></tr>
          ) : (
            rows.map((row, rowIndex) => {
              const id = rowId(row);
              const isCurrent = grid && id === current;
              return (
                <tr key={id} data-row-id={id} aria-selected={selected ? selected.has(id) : undefined} aria-rowindex={grid ? rowIndex + 2 : undefined} className={isCurrent ? "is-current" : undefined}>
                  {selected && (
                    <td className="ds-table__select">
                      <input type="checkbox" className="ds-check__box" tabIndex={grid ? -1 : 0} aria-label={`Select ${rowLabel?.(row) ?? `row ${rowIndex + 1}`}`} checked={selected.has(id)} onChange={() => toggle(id)} />
                    </td>
                  )}
                  {columns.map((column, columnIndex) => {
                    const Cell = column.rowHeader ? "th" : "td";
                    const focusable = grid && columnIndex === 0;
                    return (
                      <Cell
                        key={column.id}
                        scope={column.rowHeader ? "row" : undefined}
                        dir={column.bidi ? "auto" : undefined}
                        className={column.numeric ? "ds-table__num" : undefined}
                        role={grid ? (column.rowHeader ? "rowheader" : "gridcell") : undefined}
                        data-cell-focus={focusable || undefined}
                        tabIndex={focusable ? (isCurrent ? 0 : -1) : undefined}
                        onFocus={focusable ? () => onCurrentChange?.(id) : undefined}
                        onClick={grid ? () => onCurrentChange?.(id) : undefined}
                      >
                        {column.cell(row)}
                      </Cell>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The row's decision, in words with its key: a passage (include, exclude,
 * edit) or a suggestion (accept, reject, accept with edits). Shows the decided
 * state instead of buttons once decided.
 */
export function DecisionButtons({
  kind,
  subject,
  state,
  onDecide,
}: {
  kind: "passage" | "suggestion";
  subject: string;
  state?: string;
  onDecide: (decision: "include" | "exclude" | "edit" | "accept" | "reject" | "accept-edits") => void;
}) {
  const options = kind === "passage"
    ? ([["include", "Include", "i"], ["exclude", "Exclude", "x"], ["edit", "Edit", "e"]] as const)
    : ([["accept", "Accept", "a"], ["reject", "Reject", "r"], ["accept-edits", "Accept with edits", "e"]] as const);
  if (state) return <span className="ds-decision__state">{state}</span>;
  return (
    <span className="ds-decision" role="group" aria-label={`Decide ${subject}`}>
      {options.map(([id, label, key]) => (
        <button key={id} type="button" className="ds-button ds-button--secondary" tabIndex={-1} aria-keyshortcuts={key} onClick={() => onDecide(id)}>
          {label}
        </button>
      ))}
    </span>
  );
}

/**
 * §3: appears in place when rows are selected, sticky at the bottom of the
 * region and measured, so it never hides the focused row.
 */
export function BulkActionBar({ count, noun, children, onClear }: { count: number; noun: [string, string]; children: ReactNode; onClear: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  useStickySize(bar, "--sticky-bottom");
  if (count === 0) return null;
  return (
    <div ref={bar} className="ds-bulkbar" role="region" aria-label="Selection">
      <p className="ds-bulkbar__count" role="status">{count.toLocaleString("en")} {count === 1 ? noun[0] : noun[1]} selected</p>
      <div className="ds-actions">{children}</div>
      <button type="button" className="ds-button ds-button--link" onClick={onClear}>Clear selection</button>
    </div>
  );
}

export type Change = {
  key: string;
  kind: "added" | "changed" | "removed";
  item: string;
  label: string;
  fields?: { name: string; from: ReactNode; to: ReactNode }[];
  /** Suggestion by …, hand edit, catalogue file (§9). */
  origin?: ReactNode;
};

const CHANGE: Record<Change["kind"], { word: string; icon: typeof Plus }> = {
  added: { word: "Added", icon: Plus },
  changed: { word: "Changed", icon: RefreshCw },
  removed: { word: "Removed", icon: Minus },
};

/**
 * Compare archetype body: counts first, then each change with its kind in an
 * icon and a word (never colour alone, never brand red), from → to values, and
 * origin. Removed items keep full weight.
 */
export function DiffView({ changes, fromLabel, toLabel, empty = "No differences." }: { changes: Change[]; fromLabel: string; toLabel: string; empty?: string }) {
  const id = useId();
  if (changes.length === 0) return <p className="ds-diff__empty">{empty}</p>;
  const counts = (["added", "changed", "removed"] as const).map((kind) => `${changes.filter((c) => c.kind === kind).length} ${kind}`);
  return (
    <div className="ds-diff">
      <p id={`${id}-sum`} className="ds-diff__summary" role="status">
        From <bdi>{fromLabel}</bdi> to <bdi>{toLabel}</bdi>: {counts.join(" · ")}
      </p>
      <ul className="ds-diff__list" aria-describedby={`${id}-sum`}>
        {changes.map((change) => {
          const { word, icon: Icon } = CHANGE[change.kind];
          return (
            <li key={`${change.kind}-${change.key}`} className={`ds-diff__item ds-diff__item--${change.kind}`}>
              <span className="ds-diff__kind"><Icon size={14} aria-hidden="true" /> {word}</span>
              <span className="ds-diff__what">{change.item}: <bdi>{change.label}</bdi></span>
              {change.fields && change.fields.length > 0 && (
                <dl className="ds-diff__fields">
                  {change.fields.map((field) => (
                    <div key={field.name}>
                      <dt>{field.name}</dt>
                      <dd><bdi>{field.from}</bdi>{" "}<span aria-hidden="true">→</span>{" "}<span className="ds-visually-hidden">changed to</span>{" "}<bdi>{field.to}</bdi></dd>
                    </div>
                  ))}
                </dl>
              )}
              {change.origin && <span className="ds-diff__origin">{change.origin}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
