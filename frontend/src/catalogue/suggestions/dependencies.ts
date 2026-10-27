/**
 * What each suggestion adds and needs, and so which wait on which: what accepting the
 * ready ones lifts, the dead ends nothing lifts, and the order accepting them works.
 */
import type { Release, Suggestion } from "../../api/client";
import { BELOW_WORDS, channelKeys, interfaceKeys, nodeKeys, offeringKey, orderTypeKey, realisationKeys, realisedByKey, specificationKeys } from "./keys";
import type { Lexicon } from "./lexicon";
import { KIND_ORDER, needsOneByOne } from "./state";

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

/** Every order type of an offering under every name of both. */
function orderTypeKeys(offering: string[], orderTypes: { code: string; name: string }[]): string[] {
  return offering.flatMap((name) => orderTypes.flatMap((item) => [item.code, item.name].filter(Boolean).map((type) => orderTypeKey(name, type))));
}

/** What the draft already has, as the keys suggestions provide and require. */
function knownKeys(release: Release): Set<string> {
  const known = new Set<string>();
  for (const system of release.systems) {
    known.add(`system:${system.id}`);
    for (const component of system.components) known.add(`component:${system.id}/${component.id}`);
  }
  for (const domain of release.landscape_domains ?? []) known.add(`domain:${domain.id}`);
  for (const offering of release.products ?? []) {
    const names = [offering.id, offering.code ?? "", offering.name].filter(Boolean);
    names.forEach((reference) => known.add(offeringKey(reference)));
    orderTypeKeys(names, offering.order_types).forEach((key) => known.add(key));
  }
  for (const channel of release.channels ?? []) channelKeys(channel.id, channel.name).forEach((key) => known.add(key));
  for (const item of release.interfaces ?? []) interfaceKeys(item.id, item.name).forEach((key) => known.add(key));
  for (const item of release.capability_domains ?? []) nodeKeys("area", item.id, item.name).forEach((key) => known.add(key));
  for (const item of release.portfolio ?? []) nodeKeys("portfolio", item.id, item.name).forEach((key) => known.add(key));
  for (const item of release.sources ?? []) nodeKeys("source", item.id, item.title, item.short ?? "").forEach((key) => known.add(key));
  for (const item of release.realisations ?? []) {
    realisationKeys(item.layer, item.id, item.name, ...(item.aliases ?? [])).forEach((key) => known.add(key));
    if (item.layer !== "resource") specificationKeys(item.id, item.name, ...(item.aliases ?? [])).forEach((key) => known.add(key));
  }
  return known;
}

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
  if (prefix === "ordertype" && content.journey?.product_id) {
    const offering = words.offering(content.journey.product_id);
    const order = content.journey.order_type_code ?? reference;
    return { key, kind: "other", reference: content.journey.product_id, name: `${offering} › ${order}`, label: `the order type ${order} of ${offering}`, waiting: [] };
  }
  if (prefix === "specification") {
    const name = words.realisation(content.system_id);
    return { key, kind: "other", reference: content.system_id, name, label: `the CFSS or RFSS ${name}`, waiting: [] };
  }
  if (prefix === "realisation" && content.realisation) {
    // What realises a record must sit in a layer below it: a CFS of that name does not realise an RFS.
    const { layer, realised_by } = content.realisation;
    const named = realised_by.find((item) => realisedByKey(layer, item).includes(key)) ?? reference;
    const name = words.realisation(named);
    return { key, kind: "other", reference: named, name, label: `${name} as ${BELOW_WORDS[layer]}`, waiting: [] };
  }
  const [systemId = "", componentId = ""] = reference.split("/");
  const name = prefix === "component" ? words.component(systemId, componentId)
    : prefix === "domain" ? words.domain(reference)
      : prefix === "channel" ? words.channel(reference)
        : reference;
  // A component is one system's: the same name in two systems is two things missing.
  if (prefix === "component") {
    return { key, kind: "other", reference, name, label: `the component ${name} of ${item.system_name ?? words.system(systemId)}`, waiting: [] };
  }
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
    // A capability is filed under its business area only once the area is accepted
    // (ADR-0128): drawn as waiting on it, though it never blocks accepting.
    const area = item.content.kind === "capability" && item.content.capability_domain_id ? nodeKeys("area", item.content.capability_domain_id) : [];
    const keys = new Set([...(item.match.startsWith("needs_") ? requires(item) : []), ...area]);
    // One edge per provider: an area's id and name can give the same key.
    const froms = new Set([...keys].flatMap((key) => providers.get(key) ?? []));
    for (const from of froms) if (from !== item.id) edges.push({ from, to: item.id });
  }
  return edges;
}

/**
 * The missing systems accepting a suggestion needs first: the open system suggestions that
 * add them, and by id those nothing suggests. The service refuses a link to a system the
 * draft lacks, so an answer accepting it adds these first. `others` are what it requires
 * besides systems (a channel, an offering, a domain…): with any, adding systems isn't enough.
 */
export function systemsFirst(suggestion: Suggestion, suggestions: Suggestion[]): { suggested: Suggestion[]; unsuggested: string[]; others: string[] } {
  const systems = suggestions.filter((item) => item.status === "proposed" && item.id !== suggestion.id && item.content.kind === "system");
  const suggested: Suggestion[] = [];
  const unsuggested: string[] = [];
  const others: string[] = [];
  for (const key of new Set(requires(suggestion))) {
    if (!key.startsWith("system:")) {
      others.push(key);
      continue;
    }
    const found = systems.find((item) => provides(item).includes(key));
    if (!found) unsuggested.push(key.slice("system:".length));
    else if (!suggested.includes(found)) suggested.push(found);
  }
  return { suggested, unsuggested, others };
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
    case "product": {
      const names = [content.system_id, ...(content.product ? [content.product.id, content.product.name, content.product.code ?? ""] : [])].filter(Boolean);
      return [...names.map(offeringKey), ...orderTypeKeys(names, content.product?.order_types ?? [])];
    }
    case "channel":
      return channelKeys(content.system_id, content.channel?.name ?? content.name);
    case "interface":
      return interfaceKeys(content.system_id, content.interface?.name ?? content.name);
    case "capability_domain":
      return nodeKeys("area", content.system_id, content.capability_domain?.name ?? content.name);
    case "portfolio_node":
      return nodeKeys("portfolio", content.system_id, content.portfolio_node?.name ?? content.name);
    case "source":
      return nodeKeys("source", content.system_id, content.knowledge_source?.title ?? content.name, content.knowledge_source?.short ?? "");
    case "realisation_record":
      if (!content.realisation) return [];
      return [
        ...realisationKeys(content.realisation.layer, content.system_id, content.realisation.name || content.name, ...(content.realisation.aliases ?? [])),
        ...(content.realisation.layer === "resource"
          ? []
          : specificationKeys(content.system_id, content.realisation.name || content.name, ...(content.realisation.aliases ?? []))),
      ];
    default:
      return [];
  }
}

/** The systems an offering's parts and order tracking, or a journey's steps, name. */
export function systemsNamed(suggestion: Suggestion): string[] {
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

/** The channels an offering's order types, order tracking and lifecycle notes, or a journey's steps, name. */
export function channelsNamed(suggestion: Suggestion): string[] {
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
export function stillMissing(suggestion: Suggestion, reference: string, words?: Lexicon): boolean {
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
      if (content.kind === "capability_domain") return nodeKeys("area", content.capability_domain?.parent_id ?? "");
      // A domain waits for its parent; a placement for the domain it places the system in.
      return [`domain:${(content.kind === "landscape_domain" ? content.parent_domain_id : content.landscape_domain_id) ?? ""}`];
    case "needs_offering":
      if (content.kind === "conflict") return (content.conflict?.scope ?? []).map((item) => offeringKey(item.product_id));
      if (content.kind === "journey" && content.journey?.product_id && content.journey.order_type_code) {
        // The service waits for the offering, and for the order type it is a journey of.
        return [offeringKey(content.journey.product_id), orderTypeKey(content.journey.product_id, content.journey.order_type_code)];
      }
      return [offeringKey(content.kind === "question" || content.kind === "offering_rule" ? content.system_id : content.journey?.product_id ?? "")];
    case "needs_source":
      return content.conflict ? [content.conflict.a.source_id, content.conflict.b.source_id].flatMap((reference) => nodeKeys("source", reference)) : [];
    case "needs_interface":
      return (content.interface?.relays ?? []).flatMap((reference) => interfaceKeys(reference));
    case "needs_portfolio_node":
      return nodeKeys("portfolio", content.portfolio_node?.parent_id ?? "");
    case "needs_realisation":
      if (content.kind === "specification_rule") return specificationKeys(content.system_id);
      return content.realisation ? content.realisation.realised_by.flatMap((reference) => realisedByKey(content.realisation!.layer, reference)) : [];
    case "needs_system":
      if (content.kind === "channel") return [`system:${content.channel?.entry_system_id ?? ""}`];
      if (content.kind === "interface") {
        return [content.interface?.system_id ?? "", ...(content.interface?.consumer_ids ?? [])].filter(Boolean).map((id) => `system:${id}`);
      }
      if (content.kind === "realisation_record") return (content.realisation?.system_ids ?? []).map((id) => `system:${id}`);
      if (content.kind === "product" || content.kind === "journey") {
        return [...systemsNamed(suggestion).map((id) => `system:${id}`), ...channels];
      }
      return [...system, ...(content.target_system_id && !suggestion.target_system_name ? [`system:${content.target_system_id}`] : [])];
    default:
      return system;
  }
}
