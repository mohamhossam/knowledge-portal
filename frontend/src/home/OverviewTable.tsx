import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { NoteMark, TimetableTable, type NextDecision } from "../timetable/TimetableTable";
import type { TableSpec } from "./tables";
import type { Line, Next } from "./derive";
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

function decision(next: Next): NextDecision {
  if (next.to) return { to: next.to, label: next.label };
  if (next.href) return { href: next.href, leaves: next.leaves ?? "opens another application", label: next.label };
  return { label: next.label };
}

/** Why a table could not be read, naming who did not answer unless the reason already does. */
function failureLine(answerer: string, error: unknown): string {
  const reason = errorMessage(error);
  if (!reason) return `${answerer} did not answer.`;
  return reason.toLowerCase().includes(answerer.toLowerCase()) ? reason : `${answerer} did not answer: ${reason}`;
}

/** One table of the overview, in whatever state its answers are in. */
export function OverviewTable({ spec, state, headingLevel, toolbar }: {
  spec: TableSpec;
  state: TableState;
  headingLevel?: "h1" | "h2";
  /** Set between the head and the grid, such as a table page's sub-index. */
  toolbar?: ReactNode;
}) {
  if (state.status !== "ready") {
    return (
      <TimetableTable
        number={spec.number}
        title={spec.title}
        to={headingLevel === "h1" ? undefined : spec.to}
        headingLevel={headingLevel}
      toolbar={toolbar}
        edition={state.status === "loading" ? `Reading ${spec.noun}…` : "This table could not be read."}
        columns={spec.columns}
        rows={[]}
        notes={[]}
        quiet={state.status === "loading" ? "Reading…" : failureLine(spec.answerer, state.error)}
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
      toolbar={toolbar}
      edition={<>{overview.edition.text}{overview.edition.note && <NoteMark note={overview.edition.note} />}</>}
      columns={spec.columns}
      rows={overview.lines.map((line) => ({
        key: line.key,
        rank: line.rank,
        note: line.note,
        cells: {
          ...line.cells,
          name: nameCell(line),
          ...(line.cells.status
            ? {
                status: (
                  <>
                    <span className="status">{line.cells.status}</span>
                    {line.statusDetail && <span className="secondary status-detail">{line.statusDetail}</span>}
                  </>
                ),
              }
            : {}),
        },
      }))}
      more={overview.more}
      totals={overview.totals}
      totalsLabel={spec.totalsLabel}
      notes={overview.notes}
      quiet={spec.quiet}
      next={decision(overview.next)}
      caption={spec.caption}
      narrow={spec.narrow}
    />
  );
}
