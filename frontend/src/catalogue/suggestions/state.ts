/**
 * Where a suggestion stands: ready, needs a person, waits for another or decided;
 * where it came from; and which ones a filter or a find shows.
 */
import type { CatalogueReading, Suggestion, SuggestionKind } from "../../api/client";

type SuggestionState = "ready" | "decide" | "waits" | "present" | "accepted" | "rejected";

export const STATE_LABEL: Record<SuggestionState, string> = {
  ready: "Ready",
  decide: "Needs your decision",
  waits: "Waits for another",
  present: "Already in the draft",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** The order accepting-all walks, and the order rows sit inside a system. */
export const KIND_ORDER: SuggestionKind[] = [
  "source", "capability_domain", "portfolio_node", "landscape_domain", "system", "placement", "component", "capability", "constraint", "relationship", "interface", "realisation_record", "channel", "product", "offering_rule", "question", "journey", "conflict",
];

/**
 * Whether a person must decide this one: the service's accept-all leaves it
 * alone, and the response does not say so.
 */
export function needsOneByOne(suggestion: Suggestion): boolean {
  const kind = suggestion.content.kind;
  return suggestion.basis === "inferred"
    || suggestion.possible_matches.length > 0
    || ((kind === "placement" || kind === "product" || kind === "journey") && suggestion.match === "updates_existing")
    // A value no term names is flagged as a new term, decided alone.
    || (kind === "vocabulary_term" && suggestion.match === "new")
    // Two sources contradicting each other are never reconciled in bulk.
    || kind === "conflict"
    // An offering or journey drafted for a new offering is reviewed alone once it can be.
    || (draftedForRequirement(suggestion) && !suggestion.match.startsWith("needs_"));
}

export function suggestionState(suggestion: Suggestion): SuggestionState {
  if (suggestion.status === "accepted") return "accepted";
  if (suggestion.status === "rejected") return "rejected";
  if (needsOneByOne(suggestion)) return "decide";
  if (suggestion.match === "already_present") return "present";
  if (suggestion.match.startsWith("needs_")) return "waits";
  return "ready";
}

/**
 * An offering or journey a change request carries was drafted for a new offering (ontology
 * plan Phase 9): it comes from the decided product impact, not from one of its features.
 */
export function draftedForRequirement(suggestion: Suggestion): boolean {
  const { kind } = suggestion.content;
  return suggestion.change_request != null && (kind === "product" || kind === "journey");
}

/** The readings of a draft's own catalogue (ADR-0114, ADR-0119): each stands where a document's id would. */
const CATALOGUE_READINGS: ReadonlySet<string> = new Set<CatalogueReading>([
  "concept_backfill",
  "component_links",
  "vocabulary_cleanup",
  "derived_dependencies",
]);

/** Whether a suggestion comes from reading the draft's own catalogue rather than a document. */
export function fromCatalogue(suggestion: Pick<Suggestion, "document_version_id" | "change_request">): boolean {
  return !suggestion.change_request && CATALOGUE_READINGS.has(suggestion.document_version_id);
}

type Tally = Record<SuggestionState, number> & { waiting: number; all: number };

export function tally(suggestions: Suggestion[]): Tally {
  const counts: Tally = { ready: 0, decide: 0, waits: 0, present: 0, accepted: 0, rejected: 0, waiting: 0, all: suggestions.length };
  for (const suggestion of suggestions) {
    const state = suggestionState(suggestion);
    counts[state] += 1;
    if (suggestion.status === "proposed") counts.waiting += 1;
  }
  return counts;
}

export type Filter = "waiting" | "ready" | "decide" | "waits" | "decided" | "all";

/**
 * Whether a suggestion is listed under a filter. "Ready" is what accepting the ready
 * ones would take: given that set (`bulkAcceptable`), exactly it, waits it lifts
 * included; without it, the suggestions ready on their own.
 */
export function shown(suggestion: Suggestion, filter: Filter, ready?: ReadonlySet<string>): boolean {
  const state = suggestionState(suggestion);
  if (filter === "all") return true;
  if (filter === "ready") return ready ? ready.has(suggestion.id) : state === "ready";
  if (filter === "decided") return state === "accepted" || state === "rejected";
  if (filter === "waiting") return suggestion.status === "proposed";
  return state === filter;
}

/** A suggestion found by any word it says, its system, or the document it came from. */
export function matchesFind(suggestion: Suggestion, sentence: string, groupLabel: string, query: string): boolean {
  const wanted = query.trim().toLocaleLowerCase();
  if (!wanted) return true;
  return [sentence, groupLabel, suggestion.content.text, ...suggestion.citations.map((item) => item.quote)]
    .some((text) => text?.toLocaleLowerCase().includes(wanted));
}
