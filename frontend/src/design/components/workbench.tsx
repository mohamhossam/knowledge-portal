import "./workbench.css";

import { Search } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";

import { rovingKeyDown, useFillHeight } from "../hooks";
import type { LinkLike } from "./layout";

const Anchor: LinkLike = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;

/**
 * A look-up area's workbench (UX rebuild, phase 3): the area's list, narrow
 * and full-height, on the left; the chosen record, wide, on the right. Each
 * scrolls on its own and the address names the record, so a row is a link.
 * Narrower than 60rem they stack, and with a record chosen the list keeps to
 * a short scrolling box so the record follows close under it; a `RecordView`
 * then scrolls itself into view, so a shared link opens on the record.
 */
export function Workbench({ list, listLabel, record, chosen }: {
  /** A `ListTools` head, then a `RecordList`. */
  list: ReactNode;
  /** Names the list's region ("Systems"). */
  listLabel: string;
  /** The chosen record (a `RecordView`), or what the area says when none is chosen. */
  record: ReactNode;
  /** Whether a record is chosen. */
  chosen: boolean;
}) {
  const bench = useRef<HTMLDivElement>(null);
  useFillHeight(bench);
  return (
    <div ref={bench} className="ds-bench" data-chosen={chosen || undefined}>
      <section className="ds-bench__list" aria-label={listLabel}>{list}</section>
      <div className="ds-bench__record">{record}</div>
    </div>
  );
}

/** The list's head: its find field and filters, and the count, kept at the top of the list as it scrolls. */
export function ListTools({ children, count, note }: {
  children?: ReactNode;
  count?: ReactNode;
  /** One quiet line under the count: what holds for most of the list, said once instead of on every row. */
  note?: ReactNode;
}) {
  const tools = useRef<HTMLDivElement>(null);
  // Group labels stick under the head, and a focused row scrolls clear of it: the list learns its height.
  useEffect(() => {
    const element = tools.current;
    const list = element?.closest<HTMLElement>(".ds-bench__list");
    if (!element || !list || typeof ResizeObserver === "undefined") return;
    const measure = () => list.style.setProperty("--bench-tools-height", `${element.offsetHeight}px`);
    // Measured now too: the list scrolls its current row into view before the observer first reports.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={tools} className="ds-listtools">
      {children && <div className="ds-listtools__controls">{children}</div>}
      {count !== undefined && <p className="ds-listtools__count" role="status">{count}</p>}
      {note && <p className="ds-listtools__count">{note}</p>}
    </div>
  );
}

/**
 * The list's find field: a search box named for what it finds. `data-find`
 * lets the "/" shortcut reach it.
 */
export function ListFind({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="ds-listfind">
      <span className="ds-visually-hidden">{label}</span>
      <Search size={16} aria-hidden="true" className="ds-listfind__icon" />
      <input className="ds-input" data-find type="search" dir="auto" autoComplete="off" spellCheck={false} value={value} placeholder={placeholder ?? label} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/** A filter for the list, as one compact choice (a long row of chips doesn't fit a narrow list). */
export function ListFilter({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { id: string; label: string; count?: number }[];
  onChange: (id: string) => void;
}) {
  const id = useId();
  return (
    <div className="ds-listfilter">
      <label htmlFor={id} className="ds-listfilter__label">{label}</label>
      <select id={id} className="ds-input ds-input--select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.count === undefined ? option.label : `${option.label} (${option.count.toLocaleString("en")})`}</option>
        ))}
      </select>
    </div>
  );
}

export type RecordItem = {
  id: string;
  href: string;
  /** The record's name: the row's one strong line. */
  name: ReactNode;
  /** A quieter second line: where it sits, its kind, its owner. */
  detail?: ReactNode;
  /** At the row's end: a status or a gap badge, one at most. */
  meta?: ReactNode;
  /** Set on a name: it takes its own direction (§13). */
  bidi?: boolean;
};

export type RecordGroup = { id: string; label: ReactNode; items: RecordItem[]; /** Said after the label; the group's rows when left out. */ count?: number };

/**
 * The rows of a workbench list: each a link to its record, with the record
 * shown marked as the current page. One tab stop for the list; ↑ ↓ move
 * between rows, Home and End jump, Enter opens. Rows may come in labelled
 * groups (systems by where they sit); a group's label sticks while its rows
 * scroll under it.
 */
export function RecordList({ label, items, groups, currentId, empty = "Nothing matches.", link: Link = Anchor }: {
  label: string;
  items?: RecordItem[];
  groups?: RecordGroup[];
  currentId?: string;
  empty?: ReactNode;
  link?: LinkLike;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const all = groups ? groups.flatMap((group) => group.items) : (items ?? []);
  const stop = all.some((item) => item.id === currentId) ? currentId : all[0]?.id;

  // The current row stays in view inside the list, however it was chosen. Only the list scrolls,
  // never the window: the row is brought clear of the sticky head and its group's label.
  useEffect(() => {
    // After layout: the workbench sizes itself (and the list learns its head's height) in effects of its own.
    const frame = requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>("[aria-current]");
      // The rows scroll in the list beside the record, or in their own short box when stacked.
      const box = root.current;
      const list = box && box.scrollHeight > box.clientHeight + 1 ? box : row?.closest<HTMLElement>(".ds-bench__list");
      if (!row || !list || list.scrollHeight <= list.clientHeight + 1) return;
      const head = list === box ? 0 : parseFloat(getComputedStyle(list).getPropertyValue("--bench-tools-height")) || 0;
      const label = row.closest(".ds-records__group")?.querySelector<HTMLElement>(".ds-records__label")?.offsetHeight ?? 0;
      const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
      const bottom = top + row.offsetHeight;
      // Out of view: bring it a third of the way down, so it stays in view if the page above it grows.
      if (top < head + label || bottom > list.clientHeight) list.scrollTop += top - head - label - (list.clientHeight - head - label) / 3;
    });
    return () => cancelAnimationFrame(frame);
  }, [currentId]);

  const keyDown = (event: KeyboardEvent<HTMLElement>) => rovingKeyDown(event, ".ds-records__link", "vertical");

  const row = (item: RecordItem) => (
    <li key={item.id} data-tab-stop={item.id === stop || undefined}>
      <Link href={item.href} className="ds-records__link" aria-current={item.id === currentId ? "page" : undefined}>
        <span className="ds-records__name" dir={item.bidi ? "auto" : undefined}>{item.name}</span>
        {item.meta && <span className="ds-records__meta">{item.meta}</span>}
        {item.detail && <span className="ds-records__detail" dir={item.bidi ? "auto" : undefined}>{item.detail}</span>}
      </Link>
    </li>
  );

  // Links take their tab stop from the row they sit in: only the current row's link is in the tab order.
  useEffect(() => {
    root.current?.querySelectorAll<HTMLElement>(".ds-records__link").forEach((link) => {
      link.setAttribute("tabindex", link.closest("[data-tab-stop]") ? "0" : "-1");
    });
  });

  if (all.length === 0) return <p className="ds-records__empty">{empty}</p>;
  return (
    <div ref={root} className="ds-records" onKeyDown={keyDown}>
      {groups ? (
        groups.filter((group) => group.items.length).map((group) => (
          <div key={group.id} className="ds-records__group">
            <p className="ds-records__label" id={`${id}-${group.id}`}>
              {group.label} <span className="ds-records__count">{(group.count ?? group.items.length).toLocaleString("en")}</span>
            </p>
            <ul aria-labelledby={`${id}-${group.id}`}>{group.items.map(row)}</ul>
          </div>
        ))
      ) : (
        <ul aria-label={label}>{all.map(row)}</ul>
      )}
    </div>
  );
}

/**
 * A record on the workbench: its name as the heading (h2, under the area's
 * h1), status and facts beside it, actions at the end, then its sections.
 * Choosing it from the list moves focus to its name (`takeFocus`); a fresh
 * page load leaves focus where the shell puts it.
 */
export function RecordView({ title, meta, actions, lead, takeFocus, children }: {
  title: ReactNode;
  /** Status and short facts on the title's line. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** What the record is, in a sentence. */
  lead?: ReactNode;
  takeFocus?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A newly chosen record opens at its top, not where the last one was scrolled to.
    const side = heading.current?.closest<HTMLElement>(".ds-bench__record");
    if (side) side.scrollTop = 0;
    if (takeFocus) heading.current?.focus({ preventScroll: true });
    // Stacked (a narrow screen), the record sits under the list: bring it into view, whether it was
    // chosen from the list or opened from a shared link. A fresh load scrolls but leaves focus be.
    if (side && heading.current && stacked(side)) heading.current.scrollIntoView({ block: "start" });
  }, [takeFocus]);
  return (
    <article className="ds-record" data-takes-focus aria-labelledby={`${id}-title`}>
      <header className="ds-record__head">
        <div className="ds-record__titles">
          <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="ds-record__title" dir="auto">{title}</h2>
          {meta && <div className="ds-record__meta">{meta}</div>}
        </div>
        {actions && <div className="ds-record__actions">{actions}</div>}
        {lead && <p className="ds-record__lead" dir="auto">{lead}</p>}
      </header>
      {children}
    </article>
  );
}

/** Whether the workbench stacks the record under its list (below 60rem) rather than beside it. */
function stacked(side: HTMLElement): boolean {
  const list = side.parentElement?.querySelector<HTMLElement>(".ds-bench__list")?.getBoundingClientRect();
  // Not laid out (no height yet, or a test's DOM): nothing to scroll to.
  return Boolean(list && list.height > 0) && side.getBoundingClientRect().top >= list!.bottom - 1;
}

/** The record side with nothing chosen: what the list holds, and how to open one. */
export function RecordPlaceholder({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="ds-record ds-record--none">
      <p className="ds-record__none-title">{title}</p>
      {children}
    </div>
  );
}
