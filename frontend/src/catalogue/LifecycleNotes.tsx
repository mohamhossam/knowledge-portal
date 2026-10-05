import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Offering } from "../api/client";
import { CONFIDENCE, concerns } from "./catalogue";

type Note = Offering["lifecycle_notes"][number];
type Block = Note["blocks"][number];

/** The explorer reads the notes of one order type, through one channel. */
export type LifecycleFocus = { orderCode: string; orderName: string; channelId: string | null };

function sourced(item: { confidence?: string | null; source?: string | null }): string | null {
  const confidence = item.confidence && item.confidence !== "confirmed" ? CONFIDENCE[item.confidence as keyof typeof CONFIDENCE] : null;
  return [confidence, item.source].filter(Boolean).join(" · ") || null;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a closed note holds, so it can be judged without opening it: "a table of 18 rows, a paragraph". */
function holds(note: Note): string {
  const parts = note.blocks.map((block) =>
    block.kind === "table"
      ? `a table of ${count(block.rows.length, "row")}`
      : block.kind === "list"
        ? `a list of ${count(block.items.length, "item")}`
        : "a paragraph",
  );
  return parts.length ? `Holds ${parts.join(", ")}.` : "";
}

/**
 * A source table, read as a table on a wide screen and, on a phone, each row
 * stacked under its row header with the column heads beside its values. The
 * roles are said outright so the stacked rows stay a table to a screen reader.
 */
function SourceTable({ block, name }: { block: Block; name: string }) {
  return (
    <table className="govtable lifecycle__table" role="table">
      <caption className="lifecycle__caption">
        <span className="visually-hidden">{name}</span>
        {block.caption && <span className="secondary" dir="auto">{block.caption}</span>}
      </caption>
      <thead role="rowgroup">
        <tr role="row">
          {block.columns.map((column, index) => (
            <th key={`${index}:${column}`} scope="col" role="columnheader" dir="auto">{column}</th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {block.rows.map((row, index) => (
          <tr key={index} className="row" role="row">
            {row.map((cell, position) =>
              position === 0 ? (
                <th key={position} scope="row" role="rowheader" dir="auto">{cell}</th>
              ) : (
                <td key={position} role="cell" data-head={block.columns[position] ?? ""} dir="auto">{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NoteBlock({ block, name }: { block: Block; name: string }) {
  const provenance = sourced(block);
  return (
    <div className="lifecycle__block">
      {block.title && <p className={block.to_verify ? "lifecycle__aside lifecycle__due" : "lifecycle__aside"} dir="auto">{block.title}</p>}
      {block.to_verify && (
        <p className={block.title ? "secondary lifecycle__provenance" : "lifecycle__provenance lifecycle__due"}>
          Carried over from another source: to re-verify before anyone relies on it.
        </p>
      )}
      {block.title && provenance && <p className="secondary lifecycle__provenance" dir="auto">{provenance}</p>}
      {block.kind === "text" && <p className="lifecycle__text" dir="auto">{block.text}</p>}
      {block.kind === "list" && (
        <ul className="sheet__list lifecycle__list">
          {block.items.map((item, index) => <li key={`${index}:${item}`} dir="auto">{item}</li>)}
        </ul>
      )}
      {block.kind === "table" && <SourceTable block={block} name={name} />}
      {!block.title && provenance && <p className="secondary lifecycle__provenance" dir="auto">{provenance}</p>}
    </div>
  );
}

/** "its table" when a note has one; "table 2 of 2" when it has more, so each can be told apart. */
function tableName(note: Note, block: Block): string {
  if (block.title) return block.title;
  const tables = note.blocks.filter((item) => item.kind === "table");
  return tables.length > 1 ? `table ${tables.indexOf(block) + 1} of ${tables.length}` : "its table";
}

/**
 * What happens to an offering over its life, as its sources tell it
 * (requirement-portal ADR-0101): each note a titled topic with the order types
 * and channels it concerns and its content as the source sets it out. Notes
 * open in place, so a long list reads as an index first. The explorer reads
 * the notes of its order type and channel; a sheet reads all.
 */
export function LifecycleSection({ offering, headingId, orderName, channelName, focus, action }: {
  offering: Offering;
  headingId: string;
  orderName: (code: string) => string;
  channelName: (channelId: string) => string;
  focus?: LifecycleFocus;
  /** An edit offered under the title, on a draft's sheet. */
  action?: ReactNode;
}) {
  const notes = offering.lifecycle_notes ?? [];
  const shown = focus ? notes.filter((note) => concerns(note, focus.orderCode, focus.channelId)) : notes;
  const others = notes.length - shown.length;
  const [open, setOpen] = useState<Set<string>>(() => new Set(shown.length === 1 ? [shown[0]!.id] : []));
  const allOpen = shown.length > 0 && shown.every((note) => open.has(note.id));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const othersLine =
    focus && others > 0 ? `${others === 1 ? "1 more note concerns" : `${others} more notes concern`} other order types or channels.` : null;

  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">
        {focus ? `Lifecycle notes for ${focus.orderName}` : "Lifecycle notes"}{" "}
        {shown.length > 0 && <span className="govsection__count">{shown.length}</span>}
      </h3>
      {action}
      {shown.length > 1 && (
        <p className="lifecycle__toolbar">
          <button type="button" className="text-button" onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((note) => note.id)))}>
            {allOpen ? "Close every note" : "Open every note"}
          </button>
        </p>
      )}
      {shown.length ? (
        shown.map((note) => {
          const isOpen = open.has(note.id);
          const bodyId = `${headingId}-${note.id}-body`;
          const scope = [
            note.kind,
            focus ? null : note.order_types.length ? `For ${note.order_types.map(orderName).join(", ")}` : "For every order type",
            note.channels.length ? `Only in ${note.channels.map(channelName).join(", ")}` : null,
            sourced(note),
          ].filter(Boolean);
          return (
            <article key={note.id} className="lifecycle__note" aria-labelledby={`${headingId}-${note.id}`}>
              <h4 id={`${headingId}-${note.id}`} className="govsection__part lifecycle__head">
                <button type="button" className="lifecycle__toggle" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(note.id)}>
                  {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                  <span dir="auto">{note.title}</span>
                </button>
              </h4>
              {scope.length > 0 && <p className="secondary lifecycle__meta" dir="auto">{scope.join(" · ")}</p>}
              {!isOpen && holds(note) && <p className="secondary lifecycle__meta">{holds(note)}</p>}
              {!isOpen && note.blocks.some((block) => block.to_verify) && (
                <p className="lifecycle__meta lifecycle__due">Carries over content to re-verify.</p>
              )}
              <div id={bodyId} hidden={!isOpen}>
                {note.summary && <p className="lifecycle__text" dir="auto">{note.summary}</p>}
                {note.blocks.map((block, index) => (
                  <NoteBlock key={index} block={block} name={tableName(note, block)} />
                ))}
              </div>
            </article>
          );
        })
      ) : (
        <p className="timetable__quiet">
          {notes.length ? `No lifecycle note concerns ${focus?.orderName ?? "this order"}.` : "No lifecycle note is recorded."}
        </p>
      )}
      {othersLine && <p className="secondary lifecycle__others">{othersLine}</p>}
    </section>
  );
}
