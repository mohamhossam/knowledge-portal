import { Lines } from "../design/components";
import { formatDay } from "../home/format";
import type { Accepted } from "./accepted";
import { useCatalogueContext } from "./useCatalogue";

type Citation = Accepted["citations"][number];

function line(entry: Accepted, actorName: (id: string) => string): string {
  return `A suggestion from ${entry.model} (prompt ${entry.prompt_version}), accepted by ${actorName(entry.decided_by)} on ${formatDay(entry.decided_at)}`;
}

/** Where in its source a passage is: the document's title, when it came from one, then the place. */
function place(citation: Citation): string {
  return [citation.document, citation.location].filter(Boolean).join(", ");
}

/**
 * Where an accepted suggestion was read (review recommendation 6): kept with the fact, so it
 * still leads to its passage once a later reading has replaced the draft's suggestions.
 */
function Cited({ entry }: { entry: Accepted }) {
  const cited = entry.citations ?? [];
  if (!cited.length) return null;
  return (
    <Lines label="Where it was read">
      {cited.map((citation, index) => (
        <li key={index}>
          <bdi>{place(citation)}</bdi>: “<bdi>{citation.quote}</bdi>”
        </li>
      ))}
    </Lines>
  );
}

/**
 * ADR-0120: the accepted suggestions that produced a record, newest first, beside its
 * source, each with where it was read. `summary` gives one line for a record's meta;
 * nothing shows for a record written by hand.
 */
export function AcceptedFrom({ accepted, summary = false }: { accepted: readonly Accepted[]; summary?: boolean }) {
  const { actorName } = useCatalogueContext();
  const newest = [...accepted].reverse();
  const [last] = newest;
  if (!last) return null;
  if (summary) {
    const first = last.citations?.[0];
    const read = first ? `, read in ${place(first)}` : "";
    return (
      <span>
        {newest.length === 1
          ? `${line(last, actorName)}${read}`
          : `From ${newest.length} accepted suggestions; the last accepted by ${actorName(last.decided_by)} on ${formatDay(last.decided_at)}${read}`}
      </span>
    );
  }
  if (newest.length === 1) {
    return (
      <>
        <span>{line(last, actorName)}</span>
        <Cited entry={last} />
      </>
    );
  }
  return (
    <Lines label="Accepted suggestions">
      {newest.map((entry) => (
        <li key={entry.candidate_id}>
          {line(entry, actorName)}
          <Cited entry={entry} />
        </li>
      ))}
    </Lines>
  );
}
