/**
 * What the vocabulary clean-up proposes for a draft, read for the Vocabulary tab: each proposed
 * term, whether it is in the draft already (the proposal only links values to it) or new, and the
 * places it would be linked to, in words. The clean-up decides what a written value means; the
 * tab only says what it proposed and where, and Decide is where it is accepted.
 */
import type { Release, Suggestion } from "../api/client";
import { FIELD_WORDS, type Term, type VocabularyField } from "./vocabularyEditing";

/** One place a value is written, and the value as it was read there (VocabularyRef). */
export type ValueRef = { field: VocabularyField; owner_id: string; value: string; item?: string | null; part?: string | null };

/** A term the clean-up proposes: the suggestion, the term, and the places it would link. */
export type TermProposal = { suggestion: Suggestion; term: Term; refs: ValueRef[]; existing: boolean };

/** The clean-up's proposals still waiting on Decide, each with its term. */
export function termProposals(suggestions: Suggestion[], release: Release): TermProposal[] {
  const ids = new Set((release.vocabulary ?? []).map((term) => term.id));
  return suggestions.flatMap((suggestion) => {
    const content = suggestion.content as unknown as { kind: string; term?: Term | null; value_refs?: ValueRef[] };
    if (suggestion.status !== "proposed" || content.kind !== "vocabulary_term" || !content.term) return [];
    return [{ suggestion, term: content.term, refs: content.value_refs ?? [], existing: ids.has(content.term.id) }];
  });
}

/** How the waiting proposals stand: values to link to terms already here, and new terms with the values they would take. */
export type Waiting = { linked: number; existing: number; added: number; withNew: number };

/** How the waiting proposals stand for the vocabularies given (every one when none is). */
export function waitingIn(proposals: TermProposal[], schemes?: string[]): Waiting {
  const own = proposals.filter((proposal) => !schemes || schemes.includes(proposal.term.scheme));
  const values = (items: TermProposal[]) => items.reduce((sum, proposal) => sum + proposal.refs.length, 0);
  const existing = own.filter((proposal) => proposal.existing);
  const added = own.filter((proposal) => !proposal.existing);
  return { linked: values(existing), existing: existing.length, added: added.length, withNew: values(added) };
}

/** Every written value the waiting proposals would link, to a term here or a new one. */
export const waitingValues = (waiting: Waiting): number => waiting.linked + waiting.withNew;

/** What waits, in one sentence and one unit, written values: "2 written values wait to be linked to 1 term; 1 new term is proposed for 1 more." */
export function waitingSentence(waiting: Waiting): string | null {
  const values = (n: number) => (n === 1 ? "1 written value" : `${n} written values`);
  const terms = (n: number) => (n === 1 ? "1 term" : `${n} terms`);
  const linked = waiting.linked ? `${values(waiting.linked)} ${waiting.linked === 1 ? "waits" : "wait"} to be linked to ${terms(waiting.existing)}` : null;
  const added = waiting.added
    ? `${waiting.added === 1 ? "1 new term is" : `${waiting.added} new terms are`} proposed${waiting.withNew ? ` for ${linked ? `${waiting.withNew} more` : values(waiting.withNew)}` : ""}`
    : null;
  const said = [linked, added].filter(Boolean).join("; ");
  return said ? `${said.charAt(0).toLocaleUpperCase()}${said.slice(1)}.` : null;
}

/** The place a value is written, in words, with the page it is read on (under the catalogue's base). */
export function placeOf(ref: ValueRef, release: Release): { text: string; path: string } {
  // A place the version no longer has keeps the words it was written in, never a bare id alone.
  const named = <T extends { id: string; name?: string | null }>(items: T[] | null | undefined) => items?.find((item) => item.id === ref.owner_id)?.name ?? `“${ref.owner_id}”`;
  const offering = () => `the offering ${named(release.products)}`;
  const at = (kind: string) => `${kind}/${encodeURIComponent(ref.owner_id)}`;
  switch (ref.field) {
    case "activity_etom":
    case "activity_role":
    case "activity_mode":
    case "activity_phase":
      return { text: `step ${ref.item} of the journey ${named(release.journeys)}`, path: at("journeys") };
    case "integration_open_api":
      return { text: `hand-over ${Number(ref.item) + 1} of the journey ${named(release.journeys)}`, path: at("journeys") };
    case "channel_kind":
      return { text: `the channel ${named(release.channels)}`, path: "channels" };
    case "component_kind":
      return { text: `the part ${ref.item} of ${offering()}`, path: at("offerings") };
    case "responsibility_role": {
      const system = release.systems.find((item) => item.id === ref.part)?.name ?? ref.part;
      return { text: `${system} in the part ${ref.item} of ${offering()}`, path: at("offerings") };
    }
    case "nfr_quality":
    case "rule_kind":
      return { text: `${ref.item} in ${offering()}`, path: at("offerings") };
    case "offering_family":
    case "offering_lifecycle":
      return { text: offering(), path: at("offerings") };
    case "portfolio_level":
      return { text: `the portfolio node ${named(release.portfolio)}`, path: "offerings" };
    case "component_technology":
      return { text: `the component ${ref.item} of the system ${named(release.systems)}`, path: at("systems") };
    default:
      return { text: ref.owner_id, path: "" };
  }
}

/** What a field is, in words, for a place it is written: "a journey step's role". */
export const fieldWords = (field: VocabularyField): string => FIELD_WORDS[field] ?? field;
