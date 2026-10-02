import { ArrowRight, CornerLeftUp, RotateCw } from "lucide-react";
import { type ReactNode, createContext, useContext, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";

/**
 * A numbered timetable table: the knowledge portal's one container.
 *
 * Its number sits monumental in the margin column, and every fact that has a
 * source carries a reference mark leading to a note at the table's foot.
 * Rank is weight: a row that needs someone is bold, a row in service is
 * regular, a row in the past is grey. Red is only for a disruption.
 */

export type Rank = "due" | "delayed" | "running" | "service" | "past";

export type Column = {
  key: string;
  label: string;
  /** Numbers and dates align right, as in any timetable. */
  align?: "start" | "end";
  /** 1 always shows; 2 hides on phones; 3 hides below desktop width. */
  priority?: 1 | 2 | 3;
};

export type Row = {
  key: string;
  rank: Rank;
  cells: Record<string, ReactNode>;
  /** The note this row's facts come from, by note id. */
  note?: string;
};

export type Note = { id: string; text: ReactNode };

export type NextDecision = { to: string; label: string } | { to?: undefined; label: string };

type Props = {
  number: number;
  title: string;
  /** Where the full table lives; the title links there. */
  to?: string;
  /** The published state the table runs from, one line under the title. */
  edition: ReactNode;
  columns: Column[];
  rows: Row[];
  /** Rows the table holds beyond those shown, said as one closing line. */
  more?: string;
  /** Totals for what is in force, set after the rows that need someone. */
  totals?: { key: string; label: ReactNode; value: ReactNode }[];
  /** What the totals count, e.g. "In the edition in force". */
  totalsLabel?: string;
  notes: Note[];
  next: NextDecision;
  /** Said when no row needs anyone. */
  quiet: string;
  headingLevel?: "h1" | "h2";
  /** The table could not be read; offered as a retry beside the message. */
  failure?: () => void;
};

type NoteContext = {
  number: number;
  order: Map<string, number>;
  lit: string | null;
  light: (id: string | null) => void;
  prefix: string;
};

const Notes = createContext<NoteContext | null>(null);

/** A reference mark: the number of the note a fact comes from. */
export function NoteMark({ note }: { note: string }) {
  const context = useContext(Notes);
  if (!context) throw new Error("NoteMark must sit inside a TimetableTable.");
  const position = context.order.get(note);
  if (position === undefined) return null;
  const lit = context.lit === note;
  return (
    <sup className="mark-wrap">
      <a
        id={`${context.prefix}-ref-${note}`}
        href={`#${context.prefix}-note-${note}`}
        className={lit ? "mark is-lit" : "mark"}
        aria-label={`Note ${context.number}.${position}`}
        onMouseEnter={() => context.light(note)}
        onMouseLeave={() => context.light(null)}
        onFocus={() => context.light(note)}
        onBlur={() => context.light(null)}
      >
        {position}
      </a>
    </sup>
  );
}

export function TimetableTable({
  number, title, to, edition, columns, rows, more, totals = [], totalsLabel, notes, next, quiet,
  headingLevel = "h2", failure,
}: Props) {
  const prefix = `t${number}${useId().replace(/:/g, "")}`;
  const [lit, light] = useState<string | null>(null);
  const order = useMemo(() => new Map(notes.map((note, index) => [note.id, index + 1])), [notes]);
  const context = useMemo<NoteContext>(() => ({ number, order, lit, light, prefix }), [number, order, lit, prefix]);
  const Heading = headingLevel;
  const headingId = `${prefix}-title`;

  return (
    <Notes.Provider value={context}>
      <section className="timetable" aria-labelledby={headingId}>
        <p className="timetable__number" aria-hidden="true">{number}</p>
        <header className="timetable__head">
          <Heading id={headingId} className="timetable__title">
            <span className="visually-hidden">Table {number}:</span>{" "}
            {to ? <Link to={to}>{title}</Link> : title}
          </Heading>
          <p className="timetable__edition">{edition}</p>
        </header>

        <div className="timetable__body">
          {rows.length > 0 ? (
            <table className="timetable__grid">
              <caption className="visually-hidden">{title}: what needs a curator</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className={cellClass(column)}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={`row row--${row.rank}${row.note && lit === row.note ? " is-lit" : ""}`}>
                    {columns.map((column, index) => {
                      const Cell = index === 0 ? "th" : "td";
                      return (
                        <Cell key={column.key} scope={index === 0 ? "row" : undefined} className={cellClass(column)}>
                          {row.cells[column.key]}
                          {index === 0 && row.note && <NoteMark note={row.note} />}
                        </Cell>
                      );
                    })}
                  </tr>
                ))}
                {more && (
                  <tr className="row row--more">
                    <td colSpan={columns.length}>{more}</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : failure ? (
            <p className="timetable__quiet timetable__quiet--failed" role="alert">
              <span className="status">{quiet}</span>
              <button type="button" className="text-button" onClick={failure}>
                <RotateCw size={14} aria-hidden="true" />
                Try again
              </button>
            </p>
          ) : (
            <p className="timetable__quiet">{quiet}</p>
          )}

          {totals.length > 0 && totalsLabel && (
            <p className="timetable__totals-label" id={`${prefix}-totals`}>{totalsLabel}</p>
          )}
          {totals.length > 0 && (
            <dl className="timetable__totals" aria-labelledby={totalsLabel ? `${prefix}-totals` : undefined}>
              {totals.map((total) => (
                <div key={total.key} className="total">
                  <dt>{total.label}</dt>
                  <dd>{total.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {notes.length > 0 && (
            <ol className="timetable__notes" aria-label={`Notes to table ${number}`}>
              {notes.map((note, index) => (
                <li
                  key={note.id}
                  id={`${prefix}-note-${note.id}`}
                  className={lit === note.id ? "note is-lit" : "note"}
                  onMouseEnter={() => light(note.id)}
                  onMouseLeave={() => light(null)}
                >
                  <span className="note__number">{index + 1}</span>
                  <span className="note__text">
                    {note.text}
                    <a
                    className="note__back"
                    href={`#${prefix}-ref-${note.id}`}
                    aria-label={`Back to the mark for note ${number}.${index + 1}`}
                    onFocus={() => light(note.id)}
                    onBlur={() => light(null)}
                  >
                      <CornerLeftUp size={14} aria-hidden="true" />
                    </a>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {next.label && <p className={next.to ? "timetable__next" : "timetable__next timetable__next--quiet"}>
            {next.to ? (
              <Link to={next.to}>
                {next.label}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : next.label}
          </p>}
        </div>
      </section>
    </Notes.Provider>
  );
}

function cellClass(column: Column) {
  return [
    "cell",
    column.align === "end" ? "cell--end" : "",
    column.priority === 2 ? "cell--p2" : "",
    column.priority === 3 ? "cell--p3" : "",
  ].filter(Boolean).join(" ");
}
