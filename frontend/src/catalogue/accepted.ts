import type { components } from "../api/schema";

export type Accepted = components["schemas"]["AcceptedFromSchema"];

/** A record's accepted suggestions (ADR-0120): none from an API that predates them. */
export function acceptances(record: { accepted?: readonly Accepted[] }): readonly Accepted[] {
  return record.accepted ?? [];
}
