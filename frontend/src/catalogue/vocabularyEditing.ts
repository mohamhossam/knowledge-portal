/**
 * The vocabulary as a curator edits it: its terms and the vocabularies a curator defines, the
 * service's rules for each said before saving, and where each term is used.
 */
import type { Release } from "../api/client";
import { savedSame } from "./editing";

export type Term = NonNullable<Release["vocabulary"]>[number];
export type Scheme = NonNullable<Release["schemes"]>[number];
export type VocabularyField = Scheme["fields"][number];

/** The built-in vocabularies, in the service's order, each with its name and the prefix its new terms' ids take. */
export const BUILT_IN: { id: string; name: string; prefix: string; about: string }[] = [
  { id: "etom_process", name: "eTOM process", prefix: "etom", about: "Where a journey step sits in eTOM." },
  { id: "channel_kind", name: "Channel kind", prefix: "channel", about: "What kind of channel an order comes through." },
  { id: "component_kind", name: "Component kind", prefix: "component", about: "What kind of part of an offering a component is." },
  { id: "responsibility_role", name: "Role", prefix: "role", about: "What a system does for a component or a step, strongest first." },
  { id: "open_api", name: "Open API", prefix: "api", about: "The TM Forum Open APIs a hand-over is equivalent to." },
  { id: "information_entity", name: "Information entity", prefix: "entity", about: "What systems master or read, and interfaces carry." },
  { id: "document_type", name: "Document type", prefix: "doctype", about: "What kind of document a library document is." },
];
export const ROLES = "responsibility_role";
const BUILT_IN_IDS = new Set(BUILT_IN.map((scheme) => scheme.id));
export const isBuiltIn = (scheme: string) => BUILT_IN_IDS.has(scheme);

/** Each field a vocabulary covers, in words; the first six have their built-in vocabulary. */
export const FIELD_WORDS: Record<VocabularyField, string> = {
  activity_etom: "a journey step's eTOM process",
  activity_role: "a journey step's role",
  channel_kind: "a channel's kind",
  component_kind: "an offering component's kind",
  responsibility_role: "a component responsibility's role",
  integration_open_api: "a hand-over's TM Forum equivalent",
  nfr_quality: "an offering's NFR quality",
  offering_family: "an offering's family",
  offering_lifecycle: "an offering's lifecycle stage",
  rule_kind: "a business rule's kind",
  activity_mode: "a journey step's mode",
  activity_phase: "a journey step's phase",
  portfolio_level: "a portfolio node's level",
  component_technology: "a system component's technology",
};
/** The fields bound to a built-in vocabulary. */
export const BUILT_IN_FIELDS: Partial<Record<VocabularyField, string>> = {
  activity_etom: "etom_process",
  activity_role: ROLES,
  channel_kind: "channel_kind",
  component_kind: "component_kind",
  responsibility_role: ROLES,
  integration_open_api: "open_api",
};
/** The fields a curator's vocabulary may cover. */
export const OPEN_FIELDS = (Object.keys(FIELD_WORDS) as VocabularyField[]).filter((field) => !(field in BUILT_IN_FIELDS));
/** The key a field's linked term is written under, where a curator's vocabulary covers it. */
const FIELD_KEY: Partial<Record<VocabularyField, string>> = {
  nfr_quality: "quality_id",
  offering_family: "family_id",
  offering_lifecycle: "lifecycle_id",
  rule_kind: "kind_id",
  activity_mode: "mode_id",
  activity_phase: "phase_id",
  portfolio_level: "level_id",
  component_technology: "technology_id",
};

/** How deep a vocabulary's terms nest (`MAX_TERM_DEPTH`). */
export const MAX_TERM_DEPTH = 3;

/** Every vocabulary of the version: the built-in ones in their order, then a curator's in theirs. */
export function schemesOf(release: Release): { id: string; name: string; about: string; builtIn: boolean; scheme?: Scheme }[] {
  return [
    ...BUILT_IN.map((scheme) => ({ id: scheme.id, name: scheme.name, about: scheme.about, builtIn: true })),
    ...(release.schemes ?? []).map((scheme) => ({ id: scheme.id, name: scheme.name, about: scheme.definition ?? "", builtIn: false, scheme })),
  ];
}

/** A vocabulary's name, for a sentence. */
export const schemeName = (release: Release, id: string): string => schemesOf(release).find((scheme) => scheme.id === id)?.name ?? id;

/** How two labels are compared, as the service does: their letters and digits alone, so "Wi-Fi" is "WiFi". */
export const labelKey = (label: string) => label.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
const words = (label: string) => label.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
const lines = (items: string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];

/** A new term's id from its vocabulary and its code or label, as the service makes one: `etom-order-handling`. */
export function termIdFor(scheme: string, label: string, taken: Set<string>): string {
  const prefix = BUILT_IN.find((item) => item.id === scheme)?.prefix ?? scheme.replaceAll("_", "-");
  const base = words(label).length ? `${prefix}-${words(label).join("-")}` : prefix;
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** A new vocabulary's id from its name: lower case letters, digits and underscores, never a built-in one's. */
export function schemeIdFor(name: string, taken: Set<string>): string {
  const base = words(name).join("_").replace(/^[^a-z]+/, "") || "vocabulary";
  let id = base;
  for (let n = 2; taken.has(id) || BUILT_IN_IDS.has(id); n += 1) id = `${base}_${n}`;
  return id;
}

export const blankTerm = (scheme: string): Term => ({ id: "", scheme, pref_label: "", alt_labels: [], close_match: [], deprecated: false, accepted: [] });
export const blankScheme = (): Scheme => ({ id: "", name: "", fields: [] });

/** What the service is sent for a term: an id when new, trimmed text, and nothing said where a field was left empty. */
export function finishedTerm(value: Term, release: Release): Term {
  const taken = new Set((release.vocabulary ?? []).map((item) => item.id));
  const notation = value.notation?.trim() || null;
  return {
    ...value,
    id: value.id || termIdFor(value.scheme, notation ?? value.pref_label, taken),
    pref_label: value.pref_label.trim(),
    alt_labels: lines(value.alt_labels),
    close_match: lines(value.close_match),
    notation,
    definition: value.definition?.trim() || null,
    exact_match: value.exact_match?.trim() || null,
    source: value.source?.trim() || null,
    broader_id: value.broader_id || null,
    replaced_by: value.deprecated ? value.replaced_by || null : null,
  };
}

/** The terms once this one is saved in its place, or added. */
export function termsWith(release: Release, term: Term): Term[] {
  const all = release.vocabulary ?? [];
  return all.some((item) => item.id === term.id) ? all.map((item) => (item.id === term.id ? term : item)) : [...all, term];
}

/** A term and every term under it, by id. */
export function termAndNarrower(terms: Term[], id: string): Set<string> {
  const found = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of terms) {
      if (item.broader_id && found.has(item.broader_id) && !found.has(item.id)) {
        found.add(item.id);
        grew = true;
      }
    }
  }
  return found;
}

/** Levels from the top down to a term; a loop stops counting past the limit. */
function levelOf(byId: Map<string, Term>, id: string): number {
  let levels = 1;
  for (let item = byId.get(id); item?.broader_id && levels <= MAX_TERM_DEPTH + 1; item = byId.get(item.broader_id)) levels += 1;
  return levels;
}

/** Whether a term may sit under another without any term going more than MAX_TERM_DEPTH levels down. */
export function termFitsUnder(release: Release, term: Term, broaderId: string): boolean {
  const id = term.id || "*new";
  const edited = termsWith(release, { ...term, id, broader_id: broaderId });
  const byId = new Map(edited.map((item) => [item.id, item]));
  return [...termAndNarrower(edited, id)].every((item) => levelOf(byId, item) <= MAX_TERM_DEPTH);
}

export type TermField = "pref_label" | "alt_labels" | "notation" | "broader_id" | "close_match" | "replaced_by";
export const TERM_FIELD: Record<TermField, string> = {
  pref_label: "the preferred label",
  alt_labels: "the other labels",
  notation: "the code",
  broader_id: "the broader term",
  close_match: "the near matches",
  replaced_by: "what replaces it",
};

/** Why a term cannot be saved yet, and the field it is at: the service's rules for terms. */
export function termIssue(value: Term, release: Release): { field: TermField; message: string } | null {
  const term = finishedTerm(value, release);
  const at = (field: TermField, message: string) => ({ field, message });
  if (!labelKey(term.pref_label)) return at("pref_label", "Give the term a preferred label, with a letter or digit.");
  if (term.alt_labels.some((label) => !labelKey(label))) return at("alt_labels", "Every other label needs a letter or digit.");
  if (term.notation && !labelKey(term.notation)) return at("notation", "A code needs a letter or digit.");
  // Each label or code names one term of its vocabulary, its own included.
  const own: [TermField, string][] = [
    ["pref_label", term.pref_label],
    ...term.alt_labels.map((label): [TermField, string] => ["alt_labels", label]),
    ...(term.notation ? [["notation", term.notation] as [TermField, string]] : []),
  ];
  const seen = new Set<string>();
  for (const [field, label] of own) {
    if (seen.has(labelKey(label))) return at(field, `“${label}” is written twice; each of its labels and its code differs from the rest.`);
    seen.add(labelKey(label));
  }
  const kin = (release.vocabulary ?? []).filter((item) => item.scheme === term.scheme && item.id !== term.id);
  for (const other of kin) {
    const theirs = new Set([other.pref_label, ...other.alt_labels, ...(other.notation ? [other.notation] : [])].map(labelKey));
    const clash = own.find(([, label]) => theirs.has(labelKey(label)));
    if (clash) return at(clash[0], `“${clash[1]}” already names ${other.pref_label}; each label and code names one term of the vocabulary.`);
  }
  const edited = termsWith(release, term);
  const byId = new Map(edited.map((item) => [item.id, item]));
  const named = (id: string) => byId.get(id)?.pref_label ?? id;
  if (term.broader_id) {
    if (termAndNarrower(edited, term.id).has(term.broader_id)) return at("broader_id", `${named(term.broader_id)} sits under this term, so it cannot be its broader one.`);
    if (!termFitsUnder(release, term, term.broader_id)) return at("broader_id", `Terms are at most ${MAX_TERM_DEPTH} levels deep; under ${named(term.broader_id)}, a term would be deeper.`);
  }
  if (term.exact_match && term.close_match.includes(term.exact_match)) return at("close_match", `${term.exact_match} is its outside match, so it is not also a near one.`);
  if (term.replaced_by) {
    const chain = new Set([term.id]);
    for (let item = byId.get(term.replaced_by); item?.replaced_by; item = byId.get(item.replaced_by)) {
      if (chain.has(item.replaced_by)) return at("replaced_by", `${named(term.replaced_by)} is replaced, in turn, by this term; choose another to replace it.`);
      chain.add(item.id);
    }
  }
  return null;
}

/** A term's parts as its form names them, each read the way it is saved. */
const TERM_PARTS: [string, (term: Term) => unknown][] = [
  ["its labels and code", (term) => [term.pref_label, term.alt_labels, term.notation ?? null]],
  ["what it means", (term) => term.definition ?? null],
  ["where it sits", (term) => term.broader_id ?? null],
  ["its outside matches", (term) => [term.exact_match ?? null, term.close_match]],
  ["its source", (term) => [term.confidence ?? null, term.source ?? null]],
  ["whether it is retired", (term) => [term.deprecated, term.replaced_by ?? null]],
];

/** Which parts of a term an edit has changed, by the form's names for them. */
export function termChanges(before: Term, after: Term, release: Release): string[] {
  const [was, is] = [finishedTerm(before, release), finishedTerm(after, release)];
  return TERM_PARTS.filter(([, read]) => !savedSame(read(was), read(is))).map(([name]) => name);
}

/** The keys a term is linked under, across the catalogue. */
const LINK_KEYS = new Set(["etom_id", "role_id", "mode_id", "phase_id", "kind_id", "quality_id", "family_id", "lifecycle_id", "level_id", "technology_id", "entity_id", "open_api_ids", "masters", "reads", "entity_ids"]);

/** Where each part of the version is read, and what one is called in a sentence. */
const OWNERS: Record<string, { noun: string; page: (item: Record<string, unknown>) => string }> = {
  systems: { noun: "the system", page: (item) => `systems/${encodeURIComponent(String(item.id))}` },
  interfaces: { noun: "the interface", page: (item) => `systems/${encodeURIComponent(String(item.system_id))}` },
  products: { noun: "the offering", page: (item) => `offerings/${encodeURIComponent(String(item.id))}` },
  journeys: { noun: "the journey", page: (item) => `journeys/${encodeURIComponent(String(item.id))}` },
  channels: { noun: "the channel", page: () => "channels" },
  portfolio: { noun: "the portfolio node", page: () => "offerings" },
  realisations: { noun: "the realisation record", page: () => "offerings" },
};

export type TermUse = { text: string; path: string; key: string };

/**
 * What names a term, each with the page it is on (under the catalogue's base): every place in
 * the version that links it, and the terms under it or replaced by it.
 */
export function termUsers(release: Release, id: string): TermUse[] {
  const found: TermUse[] = [];
  const seen = new Set<string>();
  for (const [collection, owner] of Object.entries(OWNERS)) {
    const items = (release as unknown as Record<string, unknown>)[collection];
    if (!Array.isArray(items)) continue;
    for (const item of items as Record<string, unknown>[]) {
      const keys = new Set<string>();
      const walk = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") {
          for (const [key, inner] of Object.entries(value)) {
            if (LINK_KEYS.has(key) && (inner === id || (Array.isArray(inner) && inner.includes(id)))) keys.add(key);
            else walk(inner);
          }
        }
      };
      walk(item);
      for (const key of keys) {
        const text = `${owner.noun} ${String(item.name ?? item.id)}`;
        if (seen.has(`${text}:${key}`)) continue;
        seen.add(`${text}:${key}`);
        found.push({ text, path: owner.page(item), key });
      }
    }
  }
  for (const term of release.vocabulary ?? []) {
    if (term.broader_id === id) found.push({ text: `the narrower term ${term.pref_label}`, path: `vocabulary/${encodeURIComponent(term.id)}`, key: "broader_id" });
    if (term.replaced_by === id) found.push({ text: `${term.pref_label}, which it replaces`, path: `vocabulary/${encodeURIComponent(term.id)}`, key: "replaced_by" });
  }
  return found;
}

/** Roles from strongest to weakest, as they are ranked; those without a rank after, by label. */
export function rolesInOrder(release: Release, legacy: readonly string[] = []): Term[] {
  const roles = (release.vocabulary ?? []).filter((term) => term.scheme === ROLES);
  const place = (term: Term) => {
    if (term.rank != null) return term.rank;
    const code = term.pref_label.trim().toLowerCase().replace(/[\s_]+/g, "-");
    const at = legacy.indexOf(code);
    return at < 0 ? Number.MAX_SAFE_INTEGER : 1000 + at;
  };
  return [...roles].sort((a, b) => place(a) - place(b) || a.pref_label.localeCompare(b.pref_label));
}

export type SchemeField = "name" | "fields";

/** Why a curator's vocabulary cannot be saved yet, and the field it is at: the service's rules, and links its fields still hold. */
export function schemeIssue(value: Scheme, release: Release, original?: Scheme): { field: SchemeField; message: string } | null {
  const at = (field: SchemeField, message: string) => ({ field, message });
  const name = value.name.trim();
  if (!labelKey(name)) return at("name", "Give the vocabulary a name, with a letter or digit.");
  const owner = [...BUILT_IN.map((item) => ({ id: item.id, name: item.name })), ...(release.schemes ?? [])].find(
    (other) => other.id !== value.id && labelKey(other.name) === labelKey(name),
  );
  if (owner) return at("name", `${owner.name} is the name of another vocabulary; each has its own.`);
  for (const field of value.fields) {
    const other = (release.schemes ?? []).find((item) => item.id !== value.id && item.fields.includes(field));
    if (other) return at("fields", `${other.name} covers ${FIELD_WORDS[field]} already; a field has one vocabulary.`);
  }
  // A field let go of must link none of its terms any more.
  for (const field of original?.fields.filter((item) => !value.fields.includes(item)) ?? []) {
    const key = FIELD_KEY[field];
    const linked = (release.vocabulary ?? [])
      .filter((term) => term.scheme === value.id)
      .flatMap((term) => termUsers(release, term.id).filter((use) => use.key === key));
    if (linked.length) return at("fields", `${linked.length === 1 ? "One place still links" : `${linked.length} places still link`} ${FIELD_WORDS[field]} to its terms; unlink ${linked.length === 1 ? "it" : "them"} first, or keep the field.`);
  }
  return null;
}

/** What the service is sent for a curator's vocabulary: an id when new, and trimmed text. */
export function finishedScheme(value: Scheme, release: Release): Scheme {
  const taken = new Set((release.schemes ?? []).map((item) => item.id));
  return { ...value, id: value.id || schemeIdFor(value.name, taken), name: value.name.trim(), definition: value.definition?.trim() || null };
}

/** Which parts of a curator's vocabulary an edit has changed. */
export function schemeChanges(before: Scheme, after: Scheme, release: Release): string[] {
  const [was, is] = [finishedScheme(before, release), finishedScheme(after, release)];
  return [
    ...(was.name !== is.name ? ["its name"] : []),
    ...((was.definition ?? null) !== (is.definition ?? null) ? ["what it is"] : []),
    ...(savedSame([...was.fields].sort(), [...is.fields].sort()) ? [] : ["the fields it covers"]),
  ];
}
