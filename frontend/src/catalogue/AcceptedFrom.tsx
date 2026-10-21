import { Lines } from "../design/components";
import { formatDay } from "../home/format";
import type { Accepted } from "./accepted";
import { useCatalogueContext } from "./useCatalogue";

function line(entry: Accepted, actorName: (id: string) => string): string {
  return `A suggestion from ${entry.model} (prompt ${entry.prompt_version}), accepted by ${actorName(entry.decided_by)} on ${formatDay(entry.decided_at)}`;
}

/**
 * ADR-0120: the accepted suggestions that produced a record, newest first, beside its
 * source. `summary` gives one line for a record's meta; nothing shows for a record
 * written by hand.
 */
export function AcceptedFrom({ accepted, summary = false }: { accepted: readonly Accepted[]; summary?: boolean }) {
  const { actorName } = useCatalogueContext();
  const newest = [...accepted].reverse();
  const [last] = newest;
  if (!last) return null;
  if (summary) {
    return (
      <span>
        {newest.length === 1 ? line(last, actorName) : `From ${newest.length} accepted suggestions; the last accepted by ${actorName(last.decided_by)} on ${formatDay(last.decided_at)}`}
      </span>
    );
  }
  if (newest.length === 1) return <span>{line(last, actorName)}</span>;
  return (
    <Lines label="Accepted suggestions">
      {newest.map((entry) => <li key={entry.candidate_id}>{line(entry, actorName)}</li>)}
    </Lines>
  );
}
