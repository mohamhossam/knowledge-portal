/**
 * The catalogue's controlled vocabulary, as the lab reads it: what a step's role and a
 * channel's kind are called, and how roles rank. A role is a code ("ORCHESTRATE", or
 * "orchestrate" once read); a term answers to the codes its labels read as ("Customer data"
 * is "customer-data").
 */
import type { Release } from "../../api/client";
import { LEGACY_ROLE_RANK } from "./conventions";

const ROLE_SCHEME = "responsibility_role";

/** A role code as the model keeps it: lower case, words joined by "-" ("CUSTOMER_DATA" is "customer-data"). */
export function roleCode(value: string | null | undefined): string | undefined {
  const code = value?.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return code || undefined;
}

type Term = NonNullable<Release["vocabulary"]>[number];

/** The codes a term answers to: each of its labels as a code ("Customer data" is "customer-data"). */
function codesOf(term: Term): string[] {
  return [term.pref_label, ...term.alt_labels].flatMap((label) => roleCode(label) ?? []);
}

/** A vocabulary's terms by code, each with its preferred label: the first term to claim a code keeps it. */
function termsByCode(release: Pick<Release, "vocabulary">, scheme: string): Record<string, string> {
  const terms: Record<string, string> = {};
  for (const term of release.vocabulary ?? []) {
    if (term.scheme !== scheme) continue;
    for (const code of codesOf(term)) terms[code] ??= term.pref_label;
  }
  return terms;
}

/** Each role the vocabulary names, by code, with its preferred label. */
export function roleTerms(release: Pick<Release, "vocabulary">): Record<string, string> {
  return termsByCode(release, ROLE_SCHEME);
}

/**
 * A step's role, read against the vocabulary: its code as the source wrote it, or, without
 * one, the code of the role term it names (review recommendation 10: by the term's label,
 * not by a naming convention for its id).
 */
export function stepRoleIn(release: Pick<Release, "vocabulary">): (role: string | null | undefined, roleId: string | null | undefined) => string | undefined {
  const byId = new Map((release.vocabulary ?? []).map((term) => [term.id, term]));
  return (role, roleId) => roleCode(role) ?? roleCode(roleId ? byId.get(roleId)?.pref_label : undefined);
}

/**
 * Roles from strongest to weakest, as the vocabulary ranks them (review recommendation 10);
 * a version saved before roles carried a rank falls back to the order the lab kept.
 */
export function roleRank(release: Pick<Release, "vocabulary">): string[] {
  const ranked = (release.vocabulary ?? [])
    .filter((term) => term.scheme === ROLE_SCHEME && term.rank != null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .flatMap((term) => roleCode(term.pref_label) ?? []);
  return ranked.length ? ranked : [...LEGACY_ROLE_RANK];
}

/** Each channel kind the vocabulary names, by code ("Self-service" is "self-service"), with its preferred label. */
export function channelKindTerms(release: Pick<Release, "vocabulary">): Record<string, string> {
  return termsByCode(release, "channel_kind");
}
