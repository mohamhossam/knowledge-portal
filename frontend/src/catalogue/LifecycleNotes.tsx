import "./offering/offering.css";

import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Offering } from "../api/client";
import { Button, type Column, DataTable, Lines, Section, Status } from "../design/components";
import { concerns } from "./catalogue";
import { ConfidenceMark, Provenance } from "./GovernanceSections";
import { useSourceText } from "./governance";

type Note = Offering["lifecycle_notes"][number];
type Block = Note["blocks"][number];

/** The explorer reads the notes of one order type, through one channel. */
type LifecycleFocus = { orderCode: string; orderName: string; channelId: string | null };

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

type SourceRow = { key: string; cells: string[] };

/**
 * A source table as a ledger table: its first column names each row, every cell
 * takes its own direction, and a wide one scrolls sideways in its own frame. Its
 * caption, when the source gives one, is shown; otherwise the table is named for
 * its note, so two tables in one note can be told apart.
 */
function SourceTable({ block, name }: { block: Block; name: string }) {
  const width = Math.max(block.columns.length, ...block.rows.map((row) => row.length));
  const columns: Column<SourceRow>[] = Array.from({ length: width }, (_, position) => ({
    id: String(position),
    header: block.columns[position] ?? "",
    rowHeader: position === 0,
    bidi: true,
    cell: (row) => row.cells[position] ?? "",
  }));
  return (
    <DataTable
      caption={block.caption ?? name}
      captionHidden={!block.caption}
      columns={columns}
      rows={block.rows.map((cells, index) => ({ key: String(index), cells }))}
      rowId={(row) => row.key}
    />
  );
}

const TO_VERIFY = "Carried over from another source: to re-verify before anyone relies on it.";

function NoteBlock({ block, name }: { block: Block; name: string }) {
  return (
    <div className="offering-block">
      {block.title && <p className="offering-block__title" dir="auto">{block.title}</p>}
      {block.to_verify && <p><Status tone="attention">{TO_VERIFY}</Status></p>}
      {block.kind === "text" && <p className="offering-text" dir="auto">{block.text}</p>}
      {block.kind === "list" && (
        <Lines>
          {block.items.map((item, index) => <li key={`${index}:${item}`} dir="auto">{item}</li>)}
        </Lines>
      )}
      {block.kind === "table" && <SourceTable block={block} name={name} />}
      <Provenance item={block} />
    </div>
  );
}

/** A note's table named for its note: "Up / Downgrade matrix, its table"; "…, table 2 of 2" when it has more. */
function tableName(note: Note, block: Block): string {
  if (block.title) return block.title;
  const tables = note.blocks.filter((item) => item.kind === "table");
  return tables.length > 1 ? `${note.title}, table ${tables.indexOf(block) + 1} of ${tables.length}` : `${note.title}, its table`;
}

/**
 * What happens to an offering over its life, as its sources tell it
 * (requirement-portal ADR-0101): each note a titled topic with the order types
 * and channels it concerns and its content as the source sets it out. Notes
 * open in place, so a long list reads as an index first. The explorer reads
 * the notes of its order type and channel; a sheet reads all.
 */
export function LifecycleSection({ offering, headingId, orderName, channelName, focus, action, level = 3 }: {
  offering: Offering;
  /** Seeds the ids of the notes' headings and bodies; the section names its own heading. */
  headingId: string;
  orderName: (code: string) => string;
  channelName: (channelId: string) => string;
  focus?: LifecycleFocus;
  /** An edit offered beside the title, on a draft's sheet. */
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const sourceText = useSourceText();
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
  const NoteHeading = level === 2 ? "h3" : "h4";

  // One row: the edit first, then the reading toggle.
  const actions = (action || shown.length > 1) && (
    <div className="offering-actions">
      {action}
      {shown.length > 1 && (
        <Button variant="quiet" onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((note) => note.id)))}>
          {allOpen ? "Close every note" : "Open every note"}
        </Button>
      )}
    </div>
  );

  return (
    <Section
      title={focus ? `Lifecycle notes for ${focus.orderName}` : "Lifecycle notes"}
      count={shown.length > 0 ? shown.length : undefined}
      actions={actions || undefined}
      headingLevel={level}
    >
      {shown.length ? (
        <div className="offering-notes">
          {shown.map((note) => {
            const isOpen = open.has(note.id);
            const headId = `${headingId}-${note.id}`;
            const bodyId = `${headId}-body`;
            const scope = [
              note.kind,
              focus ? null : note.order_types.length ? `For ${note.order_types.map(orderName).join(", ")}` : "For every order type",
              note.channels.length ? `Only in ${note.channels.map(channelName).join(", ")}` : null,
              sourceText(note.source),
            ].filter(Boolean);
            const held = holds(note);
            const marked = note.confidence === "inferred" || note.confidence === "gap";
            return (
              <article key={note.id} className="offering-note" aria-labelledby={headId}>
                <NoteHeading id={headId} className="offering-note__head">
                  <button type="button" className="offering-toggle" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(note.id)}>
                    {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    <span dir="auto">{note.title}</span>
                  </button>
                </NoteHeading>
                {scope.length > 0 && <p className="offering-quiet" dir="auto">{scope.join(" · ")}</p>}
                {marked && <span className="offering-by"><ConfidenceMark confidence={note.confidence} /></span>}
                {!isOpen && held && <p className="offering-quiet">{held}</p>}
                {!isOpen && note.blocks.some((block) => block.to_verify) && (
                  <p className="offering-quiet"><Status tone="attention">Carries over content to re-verify.</Status></p>
                )}
                <div id={bodyId} className="offering-note__body" hidden={!isOpen}>
                  {note.summary && <p className="offering-text" dir="auto">{note.summary}</p>}
                  {note.blocks.map((block, index) => (
                    <NoteBlock key={index} block={block} name={tableName(note, block)} />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="offering-quiet">
          {notes.length ? `No lifecycle note concerns ${focus?.orderName ?? "this order"}.` : "No lifecycle note is recorded."}
        </p>
      )}
      {othersLine && <p className="offering-quiet">{othersLine}</p>}
    </Section>
  );
}
