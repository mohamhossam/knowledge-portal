/**
 * Reading a draft's suggestions: which system each would change, what it says
 * in words, and whether it is ready, needs a person, or waits for another.
 * Pure functions over the suggestions payload and the draft.
 */
import type {
  ArchitectureJob, CatalogueSystem, ExtractionRun, Offering, RelationshipKind, Release, Suggestion, SuggestionKind,
} from "../api/client";
import { formatClock, formatElapsed } from "../home/format";
import { COVERAGE, LAYERS } from "./catalogue";

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
const KIND_ORDER: SuggestionKind[] = [
  "landscape_domain", "system", "placement", "component", "capability", "constraint", "relationship", "channel", "product", "offering_rule", "question", "journey",
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

/** Names the documents gave things the draft does not have yet, so waits and errors can say them in words. */
export type Lexicon = {
  system: (id: string) => string;
  component: (systemId: string, componentId: string) => string;
  domain: (id: string) => string;
  offering: (id: string) => string;
  channel: (id: string) => string;
  /** An offering's order type by code, or as a change request named it ("New Activation"). */
  orderType: (offering: string, code: string) => string;
  /** Whether the draft has the offering, by id or name. */
  hasOffering: (reference: string) => boolean;
  /** Whether the draft already has a system or channel ("system:cwom", "channel:business-web"). */
  inDraft: (key: string) => boolean;
};

export function lexicon(release: Release, suggestions: Suggestion[]): Lexicon {
  const systems = new Map<string, string>();
  const components = new Map<string, string>();
  const domains = new Map<string, string>();
  const offerings = new Map<string, string>();
  const channels = new Map<string, string>();
  for (const channel of release.channels ?? []) channels.set(channel.id, channel.name);
  for (const system of release.systems) {
    systems.set(system.id, system.name);
    for (const component of system.components) components.set(`${system.id}/${component.id}`, component.name);
  }
  for (const domain of release.landscape_domains ?? []) domains.set(domain.id, domain.name);
  for (const offering of release.products ?? []) offerings.set(offering.id, offering.name);
  const set = (map: Map<string, string>, key: string, name: string) => {
    if (name && !map.has(key)) map.set(key, name);
  };
  for (const { content } of suggestions) {
    if (content.kind === "system") set(systems, content.system_id, content.name);
    if (content.kind === "component" && content.component_id) set(components, `${content.system_id}/${content.component_id}`, content.name);
    if (content.kind === "landscape_domain") set(domains, content.system_id, content.name);
    if (content.kind === "product") set(offerings, content.system_id, content.name);
    if (content.kind === "channel") set(channels, content.system_id, content.name);
  }
  // A name the document used for a system it may share with the draft keeps the document's spelling.
  for (const suggestion of suggestions) {
    for (const match of suggestion.possible_matches) {
      const id = match.role === "target" ? suggestion.content.target_system_id : suggestion.content.system_id;
      if (id) set(systems, id, match.written_as);
    }
  }
  const drafted = new Set([
    ...release.systems.map((system) => `system:${system.id}`),
    ...(release.channels ?? []).flatMap((channel) => channelKeys(channel.id, channel.name)),
  ]);
  // A name no suggestion spells out, from its id: a part with a digit, without a vowel or of two
  // letters reads as an acronym ("om-e2eso" is "OM E2ESO", "rtf" is "RTF"), a word is capitalised
  // ("business-pro-plus" is "Business Pro Plus").
  // A reference that is not an id ("Business Pro/ PRO+ with 5G Backup") is the document's own
  // spelling, and is shown as written.
  const humane = (id: string) =>
    !/^[a-z0-9_-]+$/.test(id) ? id : id.split(/[-_]+/).filter(Boolean)
      .map((word) => (/[0-9]/.test(word) || !/[aeiou]/.test(word) || word.length <= 2 ? word.toLocaleUpperCase() : word.charAt(0).toLocaleUpperCase() + word.slice(1)))
      .join(" ");
  const offeringBy = (reference: string) =>
    (release.products ?? []).find((item) => item.id === reference || item.name.toLocaleLowerCase() === reference.toLocaleLowerCase());
  return {
    orderType: (offering, code) => offeringBy(offering)?.order_types.find((item) => item.code === code)?.name ?? code,
    hasOffering: (reference) => offeringBy(reference) !== undefined,
    system: (id) => systems.get(id) ?? humane(id),
    component: (systemId, componentId) => components.get(`${systemId}/${componentId}`) ?? humane(componentId),
    domain: (id) => domains.get(id) ?? humane(id),
    offering: (id) => offerings.get(id) ?? humane(id),
    // A channel the document named that no suggestion adds is kept as written.
    channel: (id) => channels.get(id) ?? id,
    inDraft: (key) => drafted.has(key.startsWith("channel:") ? channelKeys(key.slice(8))[0]! : key),
  };
}

const VERB: Record<RelationshipKind, string> = {
  calls_api: "Calls the API of",
  publishes_events_to: "Sends events to",
  transfers_data_to: "Sends data to",
  orchestrates: "Orchestrates",
  unspecified: "Depends on",
};

const quoted = (items: string[]) => items.map((item) => `“${item}”`).join(", ");
const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] ?? "");
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const realisedParts = (product: Offering) => product.components.filter((part) => (part.realisation ?? []).length > 0).length;

/** What a suggested offering holds beyond its parts and order types (ADR-0101, step 4), so a reviewer sees it. */
function details(product: Offering | null | undefined): string[] {
  if (!product) return [];
  return [
    realisedParts(product) ? `realisation for ${count(realisedParts(product), "part")}` : "",
    product.nfrs?.length ? count(product.nfrs.length, "NFR") : "",
    product.tracking ? "order tracking" : "",
    product.lifecycle_notes?.length ? count(product.lifecycle_notes.length, "lifecycle note") : "",
    product.plans?.length ? count(product.plans.length, "plan") : "",
  ].filter(Boolean);
}

/** The change a suggestion would make, said as a sentence about its system. */
export function changeSentence(suggestion: Suggestion, words: Lexicon): string {
  const { content } = suggestion;
  const replaces = suggestion.match === "updates_existing";
  switch (content.kind) {
    case "system": {
      const others = content.aliases.length ? `, also called ${content.aliases.join(", ")}` : "";
      return replaces && suggestion.system_name
        ? `Adds what the document calls it: ${[content.name, ...content.aliases].join(", ")}`
        : `Adds the system ${content.name}${others}`;
    }
    case "component":
      return `Adds the component ${content.name}${content.technology ? `, built with ${content.technology}` : ""}`;
    case "capability": {
      const within = content.component_id ? `, in ${words.component(content.system_id, content.component_id)}` : "";
      const concept = content.concept_ids?.[0];
      const realises = concept ? `, realising the concept ${concept}` : "";
      return `Adds the capability ${content.name}${within}${realises}, matched by ${quoted(content.triggers)}`;
    }
    case "constraint":
      return `Adds the constraint “${content.text}”`;
    case "offering_rule":
      return `Adds the rule “${content.text}” to the offering ${words.offering(content.system_id)}`;
    case "relationship":
      return `${VERB[content.relationship_kind ?? "unspecified"]} ${targetName(suggestion, words)}`;
    case "placement":
      return `Places it in ${words.domain(content.landscape_domain_id ?? "")}`;
    case "landscape_domain":
      return `Adds the landscape domain ${content.name}${content.parent_domain_id ? `, inside ${words.domain(content.parent_domain_id)}` : ""}`;
    case "product": {
      const held = listed(details(content.product));
      if (replaces) return `Replaces the offering ${content.name} with the document's version${held ? `, which includes ${held}` : ""}`;
      return `Adds the offering ${content.name}${held ? `, with ${held}` : ""}`;
    }
    case "journey":
      return replaces
        ? `Replaces the journey ${content.journey?.name ?? content.name} with the document's`
        : `Adds the journey ${content.journey?.name ?? content.name}`;
    case "question": {
      const orders = (content.question?.order_types ?? []).map((code) => words.orderType(content.system_id, code));
      const of = `${words.offering(content.system_id)}${orders.length ? ` (${orders.join(", ")})` : ""}`;
      return replaces
        ? `Rewords the question it asks of ${of}: ${content.question?.text ?? ""}`
        : `Asks of ${of}: ${content.question?.text ?? ""}`;
    }
    case "channel": {
      const entry = content.channel?.entry_system_id;
      const through = entry ? `, its orders entering through ${words.system(entry)}` : "";
      return replaces
        ? `Adds what the document says about the channel ${content.name}${through}`
        : `Adds the channel ${content.name}${through}`;
    }
    case "concept": {
      const label = content.concept?.pref_label ?? content.system_id;
      const covered = content.capability_refs.length;
      const linking = covered ? `, linking ${covered === 1 ? "1 capability" : `${covered} capabilities`}` : "";
      return replaces ? `Adds to the capability concept ${label}${linking}` : `Adds the capability concept ${label}${linking}`;
    }
    case "component_link":
      return `Links ${words.offering(content.system_id)} › ${content.component_id ?? ""} to ${listed(content.concept_ids)}`;
    case "vocabulary_term": {
      const term = content.term;
      const scheme = term ? SCHEME[term.scheme] : "term";
      const label = term ? `${term.pref_label}${term.notation ? ` (${term.notation})` : ""}` : content.system_id;
      const covered = content.value_refs.length;
      const values = covered === 1 ? "1 value" : `${covered} values`;
      if (replaces) return `Links ${values} to the ${scheme} ${label}`;
      return `Adds the ${scheme} ${label}${covered ? `, linking ${values}` : ""}`;
    }
  }
}

/** What each controlled vocabulary is called in a sentence. */
const SCHEME: Record<NonNullable<Suggestion["content"]["term"]>["scheme"], string> = {
  etom_process: "eTOM process",
  channel_kind: "channel kind",
  component_kind: "component kind",
  responsibility_role: "role",
  open_api: "Open API",
  information_entity: "information entity",
};

/** Kinds whose sentence is said about a system ("Sends data to RTF"), which a list shows it under. */
const ABOUT_A_SYSTEM = new Set(["relationship", "capability", "component", "constraint", "placement"]);

/**
 * The change as a sentence that stands on its own, naming the system it is about: a
 * question asked one at a time has no system heading above it, so "Sends data to RTF"
 * alone did not say which of fourteen systems sends it.
 */
export function standaloneSentence(suggestion: Suggestion, words: Lexicon): string {
  const sentence = changeSentence(suggestion, words);
  const { content } = suggestion;
  if (!ABOUT_A_SYSTEM.has(content.kind)) return sentence;
  const subject = suggestion.system_name ?? words.system(content.system_id);
  return content.kind === "relationship"
    ? `${subject} ${sentence.charAt(0).toLocaleLowerCase()}${sentence.slice(1)}`
    : `${subject}: ${sentence}`;
}

function targetName(suggestion: Suggestion, words: Lexicon): string {
  return suggestion.target_system_name ?? words.system(suggestion.content.target_system_id ?? "");
}

/** What a waiting suggestion waits for, in words. */
export function waitsFor(suggestion: Suggestion, words: Lexicon): string {
  const { content } = suggestion;
  switch (suggestion.match) {
    case "needs_system": {
      if (content.kind === "channel") return `Waits for the system ${words.system(content.channel?.entry_system_id ?? "")}`;
      const missing = !suggestion.system_name && content.kind !== "product" && content.kind !== "journey"
        ? content.system_id
        : content.target_system_id ?? content.system_id;
      if (content.kind === "product" || content.kind === "journey") {
        const { systems, channels } = awaited(suggestion, words);
        const parts = [
          systems.length ? `the ${systems.length === 1 ? "system" : "systems"} ${few(systems)}` : "",
          channels.length ? `the ${channels.length === 1 ? "channel" : "channels"} ${few(channels)}` : "",
        ].filter(Boolean);
        return parts.length ? `Waits for ${parts.join(", and ")}` : "Waits for the systems it names";
      }
      return `Waits for the system ${words.system(missing)}`;
    }
    case "needs_component":
      return content.kind === "journey"
        ? "Waits for the offering's parts it names"
        : `Waits for the component ${words.component(content.system_id, content.component_id ?? "")}`;
    case "needs_domain":
      return `Waits for the landscape domain ${words.domain(content.landscape_domain_id ?? content.parent_domain_id ?? "")}`;
    case "needs_offering":
      if (content.kind === "offering_rule") return `Waits for the offering ${words.offering(content.system_id)}`;
      if (content.kind === "question") {
        const missing = (content.question?.order_types ?? []).filter((code) => words.orderType(content.system_id, code) === code);
        return words.hasOffering(content.system_id) && missing.length
          ? `Waits for ${words.offering(content.system_id)}’s order type ${missing.join(", ")}`
          : `Waits for the offering ${words.offering(content.system_id)}`;
      }
      return `Waits for the offering ${words.offering(content.journey?.product_id ?? "")}`;
    case "needs_channel": {
      const named = [...new Set(channelsNamed(suggestion).map(words.channel))];
      return `Waits for the ${named.length === 1 ? "channel" : "channels"} ${named.join(", ")}`;
    }
    default:
      return "";
  }
}

/**
 * What a suggested offering holds beyond its parts and order types, one line each, so a
 * reviewer can check it against the document without opening the editor.
 */
export function offeringHolds(product: Offering | null | undefined, words: Lexicon): { label: string; text: string; due?: boolean }[] {
  if (!product) return [];
  const order = (code: string) => product.order_types.find((item) => item.code === code)?.name ?? code;
  const lines: { label: string; text: string; due?: boolean }[] = [];
  const realised = product.components.filter((part) => (part.realisation ?? []).length > 0);
  if (realised.length) {
    const layers = (part: Offering["components"][number]) =>
      [...new Set((part.realisation ?? []).map((item) => LAYERS.find((layer) => layer.layer === item.layer)?.short ?? item.layer))].join(", ");
    lines.push({ label: "Realised as", text: realised.map((part) => `${part.name} (${layers(part)})`).join("; ") });
  }
  if (product.nfrs?.length) {
    lines.push({ label: "NFRs", text: product.nfrs.map((item) => `${item.quality} (${COVERAGE[item.coverage].toLocaleLowerCase()})`).join("; ") });
  }
  const tracking = product.tracking;
  if (tracking) {
    const scope = tracking.order_types.length ? ` for ${tracking.order_types.map(order).join(", ")}` : "";
    const parts = [
      tracking.channels.length ? `Channels ${tracking.channels.map((item) => words.channel(item.channel_id)).join(", ")}` : "",
      tracking.flows.length ? count(tracking.flows.length, "flow") : "",
      tracking.milestones.length ? count(tracking.milestones.length, "milestone") : "",
      tracking.statuses.length ? count(tracking.statuses.length, "internal status").replace(/statuss$/, "statuses") : "",
      tracking.fallout.length ? count(tracking.fallout.length, "fallout case") : "",
    ].filter(Boolean);
    lines.push({ label: `Order tracking${scope}`, text: parts.join("; ") || "Its scope only" });
  }
  if (product.plans?.length) {
    // A plan's stated facts beside its name: "PO1 (Offer Description Unlimited 100Mbps, IN Offer ID 860)".
    const plan = (item: Offering["plans"][number]) =>
      item.characteristics.length ? `${item.name} (${item.characteristics.map((fact) => `${fact.name} ${fact.value}`).join(", ")})` : item.name;
    lines.push({ label: "Plans", text: product.plans.map(plan).join("; ") });
  }
  if (product.lifecycle_notes?.length) {
    lines.push({ label: "Lifecycle notes", text: product.lifecycle_notes.map((note) => note.title).join("; ") });
    const carried = product.lifecycle_notes.filter((note) => note.blocks.some((block) => block.to_verify));
    if (carried.length) {
      lines.push({ label: "To re-verify", text: `${carried.map((note) => note.title).join("; ")} carries over content from another source`, due: true });
    }
  }
  return lines;
}

/** At most four names, then how many more: a waits line stays a line. */
const few = (names: string[]) => (names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));

/** The systems and channels an offering or journey names that the draft lacks, in the documents' names. */
function awaited(suggestion: Suggestion, words: Lexicon): { systems: string[]; channels: string[] } {
  const systems = [...new Set(systemsNamed(suggestion))].filter((id) => stillMissing(suggestion, id, words)).map(words.system);
  const channels = [...new Set(channelsNamed(suggestion))].filter((id) => !words.inDraft(`channel:${id}`)).map(words.channel);
  return { systems: [...new Set(systems)], channels: [...new Set(channels)] };
}

/** Whether a waiting suggestion waits for more than one thing, so its line says "those". */
export function waitsForMany(suggestion: Suggestion, words: Lexicon): boolean {
  const { content } = suggestion;
  if (suggestion.match === "needs_channel") return new Set(channelsNamed(suggestion)).size > 1;
  if (suggestion.match !== "needs_system" || (content.kind !== "product" && content.kind !== "journey")) return false;
  const { systems, channels } = awaited(suggestion, words);
  return systems.length + channels.length !== 1;
}

/**
 * An offering or journey a change request carries was drafted for a new offering (ontology
 * plan Phase 9): it comes from the decided product impact, not from one of its features.
 */
export function draftedForRequirement(suggestion: Suggestion): boolean {
  const { kind } = suggestion.content;
  return suggestion.change_request != null && (kind === "product" || kind === "journey");
}

/** Why a person must decide, in words. */
export function decideWhy(suggestion: Suggestion): string {
  if (suggestion.possible_matches.length) {
    const names = suggestion.possible_matches.map((item) => item.written_as);
    return `“${[...new Set(names)].join("”, “")}” may be a system the draft already has`;
  }
  if (suggestion.basis === "inferred") return "Inferred, not stated in the document";
  if (draftedForRequirement(suggestion) && suggestion.match !== "updates_existing") {
    return "Drafted for a new offering: review what it holds";
  }
  return "Would replace what the draft has";
}

export type SuggestionGroup = {
  key: string;
  /** A system the draft does not have yet, which these suggestions would add. */
  isNew: boolean;
  label: string;
  /** The draft system's id, when it has one, for a link to its sheet. */
  systemId?: string;
  suggestions: Suggestion[];
};

const SECTION = {
  domains: "Landscape domains",
  channels: "Channels",
  offerings: "Offerings",
  questions: "Questions for offerings",
  journeys: "Journeys",
  vocabulary: "Vocabulary terms",
} as const;

/** The galley's groups: new systems first, then the systems the draft has, then domains, offerings and journeys. */
export function suggestionGroups(release: Release, suggestions: Suggestion[], words: Lexicon): SuggestionGroup[] {
  const byName = new Map<string, CatalogueSystem>(release.systems.map((system) => [system.name, system]));
  const groups = new Map<string, SuggestionGroup>();
  for (const suggestion of suggestions) {
    const { content } = suggestion;
    let key: string;
    let group: Omit<SuggestionGroup, "suggestions">;
    if (content.kind === "landscape_domain") {
      key = "section:domains";
      group = { key, isNew: false, label: SECTION.domains };
    } else if (content.kind === "channel") {
      key = "section:channels";
      group = { key, isNew: false, label: SECTION.channels };
    } else if (content.kind === "product" || content.kind === "offering_rule") {
      key = "section:offerings";
      group = { key, isNew: false, label: SECTION.offerings };
    } else if (content.kind === "question") {
      key = "section:questions";
      group = { key, isNew: false, label: SECTION.questions };
    } else if (content.kind === "journey") {
      key = "section:journeys";
      group = { key, isNew: false, label: SECTION.journeys };
    } else if (content.kind === "vocabulary_term") {
      key = "section:vocabulary";
      group = { key, isNew: false, label: SECTION.vocabulary };
    } else {
      // Keyed by the system's name, so a new system keeps its group once accepted into the draft.
      const label = suggestion.system_name ?? words.system(content.system_id);
      key = `system:${label.toLocaleLowerCase()}`;
      group = { key, isNew: !suggestion.system_name, label, systemId: byName.get(label)?.id };
    }
    const existing = groups.get(key);
    if (existing) {
      existing.suggestions.push(suggestion);
      // A group is new while any of its suggestions names a system the draft does not have.
      if (!suggestion.system_name && !group.key.startsWith("section:")) existing.isNew = existing.isNew || group.isNew;
      if (group.systemId) existing.systemId = group.systemId;
    } else groups.set(key, { ...group, suggestions: [suggestion] });
  }
  for (const group of groups.values()) {
    if (group.systemId && group.suggestions.every((item) => item.system_name)) group.isNew = false;
  }
  const rank = (group: SuggestionGroup) =>
    group.key.startsWith("section:") ? 2 + Object.keys(SECTION).indexOf(group.key.slice(8)) : group.isNew ? 0 : 1;
  const sorted = [...groups.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
  );
  for (const group of sorted) group.suggestions.sort(bySuggestionOrder);
  return sorted;
}

function bySuggestionOrder(a: Suggestion, b: Suggestion): number {
  return KIND_ORDER.indexOf(a.content.kind) - KIND_ORDER.indexOf(b.content.kind)
    || (a.content.name || a.content.text).localeCompare(b.content.name || b.content.text, "en", { sensitivity: "base" })
    || a.id.localeCompare(b.id);
}

/**
 * What "accept everything that needs no decision" would accept: the ready ones,
 * then, again and again, the waiting ones whose wait one of those would lift.
 * A suggestion waiting on something no suggestion adds stays out. `given` are
 * suggestions about to be accepted by a person's answer: what they add lifts waits too.
 */
export function bulkAcceptable(release: Release, suggestions: Suggestion[], given: Suggestion[] = []): { ready: Suggestion[]; lifted: Suggestion[] } {
  const known = knownKeys(release);
  const open = suggestions.filter((item) => item.status === "proposed" && !needsOneByOne(item));
  const ready = open.filter((item) => !item.match.startsWith("needs_"));
  const provided = new Set(known);
  const add = (item: Suggestion) => provides(item).forEach((key) => provided.add(key));
  // Suggestions a person has said they accept (focus mode's answers) provide what they add, too.
  given.forEach(add);
  ready.forEach(add);
  const lifted: Suggestion[] = [];
  let waiting = open.filter((item) => item.match.startsWith("needs_"));
  for (let changed = true; changed; ) {
    changed = false;
    const still: Suggestion[] = [];
    for (const item of waiting) {
      if (requires(item).every((key) => provided.has(key))) {
        lifted.push(item);
        add(item);
        changed = true;
      } else still.push(item);
    }
    waiting = still;
  }
  return { ready, lifted };
}

/** What the draft already has, as the keys suggestions provide and require. */
function knownKeys(release: Release): Set<string> {
  const known = new Set<string>();
  for (const system of release.systems) {
    known.add(`system:${system.id}`);
    for (const component of system.components) known.add(`component:${system.id}/${component.id}`);
  }
  for (const domain of release.landscape_domains ?? []) known.add(`domain:${domain.id}`);
  for (const offering of release.products ?? []) [offering.id, offering.code ?? "", offering.name].forEach((reference) => reference && known.add(offeringKey(reference)));
  for (const channel of release.channels ?? []) channelKeys(channel.id, channel.name).forEach((key) => known.add(key));
  return known;
}

/** An offering's key: by id, code or name alike, without case, spaces or punctuation, as the service finds it. */
const offeringKey = (reference: string) => `offering:${reference.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}`;

/** Something waiting suggestions need that neither the draft nor any open suggestion adds. */
export type Blocker = {
  key: string;
  /** What is missing: a system or an offering can be settled on the spot; the rest is edited or rejected. */
  kind: "system" | "offering" | "other";
  /** How the suggestions name it, for the service. */
  reference: string;
  /** Its name in the documents' words. */
  name: string;
  /** What it is, in a sentence: "the system Business Pro Plus". */
  label: string;
  waiting: Suggestion[];
};

/**
 * The dead ends: waiting suggestions whose wait no decision on this page lifts, by what they
 * wait for, the most waited-for first. A suggestion a person must decide anyway is left out.
 */
export function blockers(release: Release, suggestions: Suggestion[], words: Lexicon): Blocker[] {
  const known = knownKeys(release);
  const open = suggestions.filter((item) => item.status === "proposed");
  const provided = new Set(open.flatMap(provides));
  const found = new Map<string, Blocker>();
  for (const item of open) {
    if (!item.match.startsWith("needs_") || needsOneByOne(item)) continue;
    for (const key of new Set(requires(item))) {
      if (known.has(key) || provided.has(key)) continue;
      const blocker = found.get(key) ?? describeNeed(key, item, words);
      blocker.waiting.push(item);
      found.set(key, blocker);
    }
  }
  return [...found.values()].sort((a, b) => b.waiting.length - a.waiting.length || a.name.localeCompare(b.name, "en"));
}

function describeNeed(key: string, item: Suggestion, words: Lexicon): Blocker {
  const [prefix, ...rest] = key.split(":");
  const reference = rest.join(":");
  const { content } = item;
  if (prefix === "system") {
    const name = words.system(reference);
    return { key, kind: "system", reference, name, label: `the system ${name}`, waiting: [] };
  }
  if (prefix === "offering") {
    // Keys drop punctuation; the suggestion still says how it names the offering.
    const named = content.kind === "journey" ? content.journey?.product_id ?? reference : content.system_id;
    const name = words.offering(named);
    return { key, kind: "offering", reference: named, name, label: `the offering ${name}`, waiting: [] };
  }
  const [systemId = "", componentId = ""] = reference.split("/");
  const name = prefix === "component" ? words.component(systemId, componentId)
    : prefix === "domain" ? words.domain(reference)
      : prefix === "channel" ? words.channel(reference)
        : reference;
  const what = prefix === "domain" ? "landscape domain" : prefix;
  return { key, kind: "other", reference, name, label: `the ${what} ${name}`, waiting: [] };
}

/**
 * Which suggestion waits on which: an edge from each open suggestion to every
 * open one that needs what it adds (the draft decision tree, UX rebuild phase 2).
 */
export function dependencyEdges(suggestions: Suggestion[]): { from: string; to: string }[] {
  const open = suggestions.filter((item) => item.status === "proposed");
  const providers = new Map<string, string[]>();
  for (const item of open) for (const key of provides(item)) providers.set(key, [...(providers.get(key) ?? []), item.id]);
  const edges: { from: string; to: string }[] = [];
  for (const item of open) {
    if (!item.match.startsWith("needs_")) continue;
    for (const key of new Set(requires(item))) {
      for (const from of providers.get(key) ?? []) if (from !== item.id) edges.push({ from, to: item.id });
    }
  }
  return edges;
}

/**
 * The missing systems accepting a suggestion needs first: the open system suggestions that
 * add them, and by id those nothing suggests. The service refuses a link to a system the
 * draft lacks, so an answer accepting it adds these first.
 */
export function systemsFirst(suggestion: Suggestion, suggestions: Suggestion[]): { suggested: Suggestion[]; unsuggested: string[] } {
  const systems = suggestions.filter((item) => item.status === "proposed" && item.id !== suggestion.id && item.content.kind === "system");
  const suggested: Suggestion[] = [];
  const unsuggested: string[] = [];
  for (const key of new Set(requires(suggestion))) {
    if (!key.startsWith("system:")) continue;
    const found = systems.find((item) => provides(item).includes(key));
    if (!found) unsuggested.push(key.slice("system:".length));
    else if (!suggested.includes(found)) suggested.push(found);
  }
  return { suggested, unsuggested };
}

/** Suggestions in the order accepting them works: domains, then systems, then what hangs on them. */
export function inDependencyOrder(suggestions: Suggestion[]): Suggestion[] {
  return [...suggestions].sort((a, b) => KIND_ORDER.indexOf(a.content.kind) - KIND_ORDER.indexOf(b.content.kind));
}

function provides(suggestion: Suggestion): string[] {
  const { content } = suggestion;
  switch (content.kind) {
    case "system":
      return [`system:${content.system_id}`];
    case "component":
      return [`component:${content.system_id}/${content.component_id ?? ""}`];
    case "landscape_domain":
      return [`domain:${content.system_id}`];
    case "product":
      return [offeringKey(content.system_id), ...(content.product ? [offeringKey(content.product.name)] : [])];
    case "channel":
      return channelKeys(content.system_id, content.channel?.name ?? content.name);
    default:
      return [];
  }
}

/** The systems an offering's parts and order tracking, or a journey's steps, name. */
function systemsNamed(suggestion: Suggestion): string[] {
  const { content } = suggestion;
  if (content.kind === "product") {
    const tracking = content.product?.tracking;
    return [
      ...(content.product?.components ?? []).flatMap((part) => part.responsibilities.map((item) => item.system_id)),
      ...(tracking?.flows ?? []).flatMap((flow) => [flow.from_system_id, flow.to_system_id]),
      ...(tracking?.channels ?? []).flatMap((item) => [item.ui_system_id ?? "", item.read_system_id ?? ""]),
      ...(tracking?.milestones ?? []).map((item) => item.system_id ?? ""),
    ].filter(Boolean);
  }
  if (content.kind === "journey") {
    return (content.journey?.activities ?? []).flatMap((step) => [step.performing_system_id ?? "", ...step.supporting_system_ids]).filter(Boolean);
  }
  return [];
}

/**
 * A channel's keys: its id and its name, without case. A document names a channel as
 * it writes it ("Business Web"), and the service finds it by id or name alike.
 */
function channelKeys(...references: string[]): string[] {
  return references.filter(Boolean).map((reference) => `channel:${reference.trim().toLowerCase()}`);
}

/** The channels an offering's order types, order tracking and lifecycle notes, or a journey's steps, name. */
function channelsNamed(suggestion: Suggestion): string[] {
  const { content } = suggestion;
  if (content.kind === "product") {
    const product = content.product;
    return [
      ...(product?.order_types ?? []).flatMap((type) => type.channels ?? []),
      ...(product?.tracking?.channels ?? []).map((item) => item.channel_id),
      ...(product?.lifecycle_notes ?? []).flatMap((note) => note.channels ?? []),
    ];
  }
  if (content.kind === "journey") return (content.journey?.activities ?? []).flatMap((step) => step.channels ?? []);
  return [];
}

/**
 * Whether a system a suggestion names is still missing. The service says so by id, name,
 * alias or the words of a name (`missing_systems`); a draft answering to the name some
 * other way than by id is never waited for. Without that list, the id alone decides.
 */
function stillMissing(suggestion: Suggestion, reference: string, words?: Lexicon): boolean {
  const missing = suggestion.missing_systems as string[] | undefined;
  if (missing) return missing.includes(reference);
  return words ? !words.inDraft(`system:${reference}`) : true;
}

function requires(suggestion: Suggestion): string[] {
  return requiredKeys(suggestion).filter((key) => !key.startsWith("system:") || stillMissing(suggestion, key.slice("system:".length)));
}

function requiredKeys(suggestion: Suggestion): string[] {
  const { content } = suggestion;
  const system = suggestion.system_name ? [] : [`system:${content.system_id}`];
  // An offering or a journey also waits for every channel it names, whatever it waits for first.
  const channels = channelsNamed(suggestion).flatMap((reference) => channelKeys(reference));
  switch (suggestion.match) {
    case "needs_channel":
      return channels;
    case "needs_component":
      return [...system, `component:${content.system_id}/${content.component_id ?? ""}`];
    case "needs_domain":
      // A domain waits for its parent; a placement for the domain it places the system in.
      return [`domain:${(content.kind === "landscape_domain" ? content.parent_domain_id : content.landscape_domain_id) ?? ""}`];
    case "needs_offering":
      return [offeringKey(content.kind === "question" || content.kind === "offering_rule" ? content.system_id : content.journey?.product_id ?? "")];
    case "needs_system":
      if (content.kind === "channel") return [`system:${content.channel?.entry_system_id ?? ""}`];
      if (content.kind === "product" || content.kind === "journey") {
        return [...systemsNamed(suggestion).map((id) => `system:${id}`), ...channels];
      }
      return [...system, ...(content.target_system_id && !suggestion.target_system_name ? [`system:${content.target_system_id}`] : [])];
    default:
      return system;
  }
}

/** The service's reading warnings count with "(s)"; say them as English. */
/**
 * What each change request's last reading said of one feature, keyed "<change request>/<feature>":
 * a warning naming a feature opens with its id ("FT-2: …").
 */
export function featureWarnings(runs: ExtractionRun[]): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  for (const run of runs) {
    if (!run.change_request_id) continue;
    for (const warning of run.warnings) {
      const named = /^([^\s:]+): (.+)$/.exec(warning);
      if (!named) continue;
      const key = `${run.change_request_id}/${named[1]}`;
      const said = warningInWords(named[2]!);
      notes.set(key, [...(notes.get(key) ?? []), said.charAt(0).toUpperCase() + said.slice(1)]);
    }
  }
  return notes;
}

export function warningInWords(text: string): string {
  return text
    .replace(/\b(\d+) ([^()]*?)\(s\)/g, (_, n: string, words: string) => `${n} ${n === "1" ? words : `${words}s`}`)
    .replace(/\b1 ([^.]*?)\bwere\b/g, "1 $1was");
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

export type Filter = "waiting" | "decide" | "waits" | "decided" | "all";

export function shown(suggestion: Suggestion, filter: Filter): boolean {
  const state = suggestionState(suggestion);
  if (filter === "all") return true;
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

/** A dependency error quotes raw ids; say them as the names the documents gave. */
export function inWords(message: string, words: Lexicon): string {
  return message
    .replace(/system '([^']+)'/g, (_, id: string) => `the system ${words.system(id)}`)
    .replace(/landscape domain '([^']+)'/g, (_, id: string) => `the landscape domain ${words.domain(id)}`)
    .replace(/component '([^']+)'/g, (_, id: string) => `the component ${id.replace(/[-_]+/g, " ")}`)
    .replace(/product offering '([^']+)'/g, (_, id: string) => `the offering ${words.offering(id)}`)
    .replace(/channel '([^']+)'/g, (_, id: string) => `the channel ${words.channel(id)}`);
}

/** How the reading of one document stands. */
export type Reading = {
  label: string;
  failed: boolean;
  busy: boolean;
  /** Queued: no reader has started on it yet. */
  waiting: boolean;
  /** The reader has stopped reporting: the attempt died, and is picked up again or fails. */
  stalled: boolean;
  /** Parts done of those expected, while the model reads the document part by part. */
  part: { done: number; total: number } | null;
  /** Further lines in words: when it started, how long it has taken, what comes next. */
  details: string[];
};

const JOB_ERROR: Record<string, string> = {
  attempts_exhausted: "it stopped after three attempts",
  provider_rate_limited: "the model was busy",
  catalogue_extraction_unsupported: "this kind of file cannot be read here",
  catalogue_extraction_failed: "the model's answer could not be used",
  architecture_knowledge_conflict: "the draft changed while it was read",
};

/** Why a catalogue job failed, in a curator's words. */
export function jobReason(category: string | null | undefined): string {
  return category ? JOB_ERROR[category] ?? category.replace(/_/g, " ") : "the reason was not recorded";
}

/** The service's attempts per job, and how long a lease outlives the reader's last word. */
const ATTEMPTS = 3;
const LEASE_MS = 5 * 60_000;

const STAGE: Record<string, string> = {
  opening: "Opening the file",
  reading: "Reading",
  matching: "Matching names to the catalogue",
  saving: "Saving its suggestions",
};

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Number.NaN);

/** "about 12 min left", from the time the parts done took; nothing before a part is done. */
function remaining(started: number, done: number, total: number, now: number): string | null {
  if (!(done > 0) || total <= done || Number.isNaN(started)) return null;
  const minutes = Math.round(((now - started) / done) * (total - done) / 60_000);
  return minutes <= 1 ? "about a minute left" : `about ${minutes} min left`;
}

/**
 * How a document's reading stands, in words: the stage it is at, the part it is
 * on, when it started, and whether the reader has gone quiet. `now` is epoch ms.
 */
export function reading(job: ArchitectureJob | undefined, now: number = Date.now()): Reading {
  const base: Reading = { label: "", failed: false, busy: false, waiting: false, stalled: false, part: null, details: [] };
  if (!job) return { ...base, label: "Not read yet" };
  switch (job.status) {
    case "queued": {
      const queued = time(job.queued_at);
      return {
        ...base,
        label: "Waiting to be read",
        busy: true,
        waiting: true,
        details: [
          Number.isNaN(queued) ? "Waiting for the reader." : `Waiting since ${formatClock(new Date(queued))} (${formatElapsed(queued, now)}).`,
          "Documents are read one at a time; it starts when the reader is free.",
        ],
      };
    }
    case "running": {
      const started = time(job.started_at);
      const lease = time(job.lease_until);
      const attempt = job.attempts ?? 1;
      if (!Number.isNaN(lease) && lease < now) {
        const heard = new Date(lease - LEASE_MS);
        return {
          ...base,
          label: "Stopped responding",
          busy: true,
          stalled: true,
          details: [
            `No word from the reader since ${formatClock(heard)} (${formatElapsed(heard.getTime(), now)} ago).`,
            attempt < ATTEMPTS
              ? `The reading service starts it again by itself, as attempt ${attempt + 1} of ${ATTEMPTS}. If nothing changes, the service may be stopped.`
              : `This was the last of ${ATTEMPTS} attempts: the reading service marks it failed, and you can then read it again.`,
          ],
        };
      }
      const done = job.progress_done ?? null;
      const total = job.progress_total ?? null;
      const part = job.stage === "reading" && done !== null && total ? { done, total } : null;
      const label = part
        ? `Reading part ${Math.min(part.done + 1, part.total)} of ${part.total}`
        : (job.stage && STAGE[job.stage]) || "Being read";
      const timing = Number.isNaN(started) ? null : `Started ${formatClock(new Date(started))}, ${formatElapsed(started, now)} so far`;
      const left = part ? remaining(started, part.done, part.total, now) : null;
      return {
        ...base,
        label,
        busy: true,
        part,
        details: [
          ...(timing ? [left ? `${timing}; ${left}.` : `${timing}.`] : []),
          ...(attempt > 1 ? [`Attempt ${attempt} of ${ATTEMPTS}: the last one stopped before it finished.`] : []),
        ],
      };
    }
    case "succeeded":
      return { ...base, label: "Read" };
    case "cancelled":
      return { ...base, label: "Reading cancelled" };
    case "failed": {
      const why = job.error_category ? JOB_ERROR[job.error_category] ?? job.error_category.replace(/_/g, " ") : null;
      return { ...base, label: why ? `Reading failed: ${why}` : "Reading failed", failed: true };
    }
  }
}

/** Each document's reading warnings, said once each, from every run of it. */
export function documentWarnings(runs: ExtractionRun[], versionId: string): string[] {
  return [...new Set(runs.filter((run) => run.document_version_id === versionId).flatMap((run) => run.warnings))];
}

/** The extension a file must carry for the service to read it. */
export const ACCEPTED_FILES = ".pdf,.docx,.txt,.md,.markdown,.xlsx,.csv,.tsv,.png,.jpg,.jpeg";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Browsers type some files loosely; the service wants the type its extension implies. */
export function typedFile(file: File): File {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = MIME[extension];
  return type && file.type !== type ? new File([file], file.name, { type }) : file;
}
