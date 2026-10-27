import { Lines } from "../design/components";
import { formatDay } from "../home/format";
import { type Accepted, readerName } from "./accepted";
import { CitedPassage } from "./provenance/Provenance";
import { useCatalogueContext } from "./useCatalogue";

type Citation = Accepted["citations"][number];

// Who decided it first (PRODUCT.md: nothing is published unreviewed), then which reader suggested it.
// Not the Suggested mark: that marks what nobody has decided yet, and this was accepted.
function line(entry: Accepted, actorName: (id: string) => string): string {
  return `Accepted by ${actorName(entry.decided_by)} on ${formatDay(entry.decided_at)}, from a suggestion by ${readerName(entry.model)}`;
}

/** Which model and prompt read it, each once: kept for the audit, one step away from the line a curator reads. */
function ModelDetail({ entries }: { entries: readonly Accepted[] }) {
  const read = [...new Set(entries.map((entry) => `${entry.model} · prompt ${entry.prompt_version}`))];
  return (
    <details className="accepted-model">
      <summary className="accepted-model__summary">Model and prompt</summary>
      <span translate="no">{read.join("; ")}</span>
    </details>
  );
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
          {citation.document_version_id && (
            <CitedPassage versionId={citation.document_version_id} location={citation.location} quote={citation.quote} title={citation.document ?? "The document"} />
          )}
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
        <ModelDetail entries={newest} />
      </span>
    );
  }
  if (newest.length === 1) {
    return (
      <>
        <span>{line(last, actorName)}</span>
        <ModelDetail entries={[last]} />
        <Cited entry={last} />
      </>
    );
  }
  return (
    <Lines label="Accepted suggestions">
      {newest.map((entry) => (
        <li key={entry.candidate_id}>
          {line(entry, actorName)}
          <ModelDetail entries={[entry]} />
          <Cited entry={entry} />
        </li>
      ))}
    </Lines>
  );
}
