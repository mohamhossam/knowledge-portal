import { Link } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { NoteMark, TimetableTable } from "../timetable/TimetableTable";
import type { TableSpec } from "./tables";
import type { Line } from "./derive";
import type { TableState } from "./useOverview";

function nameCell(line: Line) {
  return (
    <>
      {line.to ? <Link to={line.to} dir="auto">{line.name}</Link> : <span dir="auto">{line.name}</span>}
      {line.nameAr && (
        <span className="secondary name-ar" lang="ar" dir="rtl">{line.nameAr}</span>
      )}
    </>
  );
}

/** One table of the overview, in whatever state its answers are in. */
export function OverviewTable({ spec, state, headingLevel }: {
  spec: TableSpec;
  state: TableState;
  headingLevel?: "h1" | "h2";
}) {
  if (state.status !== "ready") {
    return (
      <TimetableTable
        number={spec.number}
        title={spec.title}
        to={headingLevel === "h1" ? undefined : spec.to}
        headingLevel={headingLevel}
        edition={state.status === "loading" ? `Reading ${spec.noun}…` : "This table could not be read."}
        columns={spec.columns}
        rows={[]}
        notes={[]}
        quiet={state.status === "loading" ? "Reading…" : `${spec.answerer} did not answer: ${errorMessage(state.error)}`}
        next={{ label: "" }}
        failure={state.status === "error" ? state.retry : undefined}
      />
    );
  }
  const { overview } = state;
  return (
    <TimetableTable
      number={spec.number}
      title={spec.title}
      to={headingLevel === "h1" ? undefined : spec.to}
      headingLevel={headingLevel}
      edition={<>{overview.edition.text}{overview.edition.note && <NoteMark note={overview.edition.note} />}</>}
      columns={spec.columns}
      rows={overview.lines.map((line) => ({
        key: line.key,
        rank: line.rank,
        note: line.note,
        cells: {
          ...line.cells,
          name: nameCell(line),
          ...(line.cells.status ? { status: <span className="status">{line.cells.status}</span> } : {}),
        },
      }))}
      more={overview.more}
      totals={overview.totals}
      totalsLabel={spec.totalsLabel}
      notes={overview.notes}
      quiet={spec.quiet}
      next={overview.next}
    />
  );
}
