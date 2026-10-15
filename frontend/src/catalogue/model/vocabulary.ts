/**
 * The catalogue's controlled vocabulary, as the lab reads it: what a step's role and a
 * channel's kind are called. A role is a code ("ORCHESTRATE", or "orchestrate" once read); its term is
 * the one the activity names (`role_id`), or else `role-<code>` by the vocabulary's own
 * naming ("role-orchestrate", "role-customer-data").
 */
import type { Release } from "../../api/client";

const ROLE_SCHEME = "responsibility_role";

/** A role code as the model keeps it: lower case, words joined by "-" ("CUSTOMER_DATA" is "customer-data"). */
export function roleCode(value: string | null | undefined): string | undefined {
  const code = value?.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return code || undefined;
}

/** The code a role term stands for: "role-customer-data" is "customer-data". */
function codeOfTerm(termId: string): string {
  return termId.startsWith("role-") ? termId.slice("role-".length) : termId;
}

/** Each role the vocabulary names, by code, with its preferred label. */
export function roleTerms(release: Release): Record<string, string> {
  const terms: Record<string, string> = {};
  for (const term of release.vocabulary ?? []) {
    if (term.scheme === ROLE_SCHEME) terms[codeOfTerm(term.id)] = term.pref_label;
  }
  return terms;
}

/** A step's role: its code as the source wrote it, or, without one, the code of the term it names. */
export function stepRole(role: string | null | undefined, roleId: string | null | undefined): string | undefined {
  return roleCode(role) ?? (roleId ? codeOfTerm(roleId) : undefined);
}

/** Each channel kind the vocabulary names ("channel-system" is "system"), with its preferred label. */
export function channelKindTerms(release: Release): Record<string, string> {
  const terms: Record<string, string> = {};
  for (const term of release.vocabulary ?? []) {
    if (term.scheme === "channel_kind") terms[term.id.startsWith("channel-") ? term.id.slice("channel-".length) : term.id] = term.pref_label;
  }
  return terms;
}
