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

function NoteBlock({ block, label }: { block: Block; label: string }) {
  const provenance = sourced(block);
  return (
    <div className="lifecycle__block">
      {block.title && <p className="lifecycle__aside" dir="auto">{block.title}</p>}
      {block.title && provenance && <p className="secondary lifecycle__provenance" dir="auto">{provenance}</p>}
      {block.kind === "text" && <p className="lifecycle__text" dir="auto">{block.text}</p>}
      {block.kind === "list" && (
        <ul className="sheet__list lifecycle__list">
          {block.items.map((item, index) => <li key={`${index}:${item}`} dir="auto">{item}</li>)}
        </ul>
      )}
      {block.kind === "table" && (
        <>
          {/* A wide source table scrolls in its own frame on narrow screens, words kept whole. */}
          <div className="lifecycle__scroll" role="region" tabIndex={0} aria-label={`${block.title ?? label}, scrolls sideways`}>
          <table className="govtable lifecycle__table">
            <caption className="visually-hidden">{block.title ? `${label}: ${block.title}` : label}</caption>
            <thead>
              <tr>
                {block.columns.map((column, index) => <th key={`${index}:${column}`} scope="col" dir="auto">{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index} className="row">
                  {row.map((cell, position) =>
                    position === 0 ? (
                      <th key={position} scope="row" dir="auto">{cell}</th>
                    ) : (
                      <td key={position} dir="auto">{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {block.caption && <p className="secondary lifecycle__caption" dir="auto">{block.caption}</p>}
        </>
      )}
      {!block.title && provenance && <p className="secondary lifecycle__provenance" dir="auto">{provenance}</p>}
    </div>
  );
}

/**
 * What happens to an offering over its life, as its sources tell it
 * (requirement-portal ADR-0101): each note a titled topic with the order types
 * and channels it concerns and its content as the source sets it out. The
 * explorer reads the notes of its order type and channel; a sheet reads all.
 */
export function LifecycleSection({ offering, headingId, orderName, channelName, focus }: {
  offering: Offering;
  headingId: string;
  orderName: (code: string) => string;
  channelName: (channelId: string) => string;
  focus?: LifecycleFocus;
}) {
  const notes = offering.lifecycle_notes ?? [];
  const shown = focus ? notes.filter((note) => concerns(note, focus.orderCode, focus.channelId)) : notes;
  const others = notes.length - shown.length;
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">
        {focus ? `Lifecycle notes for ${focus.orderName}` : "Lifecycle notes"}{" "}
        {shown.length > 0 && <span className="govsection__count">{shown.length}</span>}
      </h3>
      {shown.length ? (
        shown.map((note) => {
          const scope = [
            note.kind,
            focus ? null : note.order_types.length ? `For ${note.order_types.map(orderName).join(", ")}` : "For every order type",
            note.channels.length ? `Only in ${note.channels.map(channelName).join(", ")}` : null,
            sourced(note),
          ].filter(Boolean);
          return (
            <article key={note.id} className="lifecycle__note" aria-labelledby={`${headingId}-${note.id}`}>
              <h4 id={`${headingId}-${note.id}`} className="govsection__part" dir="auto">{note.title}</h4>
              {scope.length > 0 && <p className="secondary lifecycle__meta" dir="auto">{scope.join(" · ")}</p>}
              {note.summary && <p className="lifecycle__text" dir="auto">{note.summary}</p>}
              {note.blocks.map((block, index) => <NoteBlock key={index} block={block} label={note.title} />)}
            </article>
          );
        })
      ) : (
        <p className="timetable__quiet">
          {notes.length ? `No lifecycle note concerns ${focus?.orderName ?? "this order"}.` : "No lifecycle note is recorded."}
        </p>
      )}
      {focus && others > 0 && shown.length > 0 && (
        <p className="secondary lifecycle__others">
          {others === 1 ? "1 more note concerns" : `${others} more notes concern`} other order types or channels.
        </p>
      )}
    </section>
  );
}
