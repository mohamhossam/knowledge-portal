import type { components } from "../api/schema";

export type Accepted = components["schemas"]["AcceptedFromSchema"];

/** The reader that reads a document's tables, apart from its prose. */
export const TABLE_READER = "catalogue-table-reader";

/** Which reader suggested it, in a curator's words; the model's own name stays for the audit. */
export function readerName(model: string): string {
  return model === TABLE_READER ? "the catalogue's table reader" : "the catalogue reader";
}

/** A record's accepted suggestions (ADR-0120): none from an API that predates them. */
export function acceptances(record: { accepted?: readonly Accepted[] }): readonly Accepted[] {
  return record.accepted ?? [];
}
