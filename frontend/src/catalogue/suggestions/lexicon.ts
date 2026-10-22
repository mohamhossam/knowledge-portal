/** The names things go by in the draft and its documents, so a sentence can say them. */
import type { Release, Suggestion } from "../../api/client";
import { channelKeys } from "./keys";

/** Names the documents gave things the draft does not have yet, so waits and errors can say them in words. */
export type Lexicon = {
  system: (id: string) => string;
  component: (systemId: string, componentId: string) => string;
  domain: (id: string) => string;
  /** A business area (capability domain) by id, or as a document named it. */
  area: (reference: string) => string;
  /** A portfolio node by id, or as a document named it. */
  portfolio: (reference: string) => string;
  /** A realisation record (CFS, RFS or resource) by id, or as a document named it. */
  realisation: (reference: string) => string;
  /** A registered source by id, by the name it is cited by, or as a document named it. */
  source: (reference: string) => string;
  offering: (id: string) => string;
  channel: (id: string) => string;
  /** An offering's order type by code, or as a change request named it ("New Activation"). */
  orderType: (offering: string, code: string) => string;
  /** Whether the draft has the offering, by id or name. */
  hasOffering: (reference: string) => boolean;
  /** Whether the draft already has a system or channel ("system:cwom", "channel:business-web"). */
  inDraft: (key: string) => boolean;
  /** A vocabulary by id: a built-in one, or one a curator defined ("NFR quality"). */
  vocabulary: (scheme: string) => string;
};

/** What each built-in vocabulary is called in a sentence; a curated one goes by its name. */
const SCHEME: Record<string, string> = {
  etom_process: "eTOM process",
  channel_kind: "channel kind",
  component_kind: "component kind",
  responsibility_role: "role",
  open_api: "Open API",
  information_entity: "information entity",
  document_type: "document type",
};

export function lexicon(release: Release, suggestions: Suggestion[]): Lexicon {
  const systems = new Map<string, string>();
  const components = new Map<string, string>();
  const domains = new Map<string, string>();
  const offerings = new Map<string, string>();
  const channels = new Map<string, string>();
  const areas = new Map<string, string>();
  const nodes = new Map<string, string>();
  for (const item of release.capability_domains ?? []) areas.set(item.id, item.name);
  for (const item of release.portfolio ?? []) nodes.set(item.id, item.name);
  const records = new Map<string, string>();
  for (const item of release.realisations ?? []) records.set(item.id, item.name);
  const sources = new Map<string, string>();
  for (const item of release.sources ?? []) sources.set(item.id, item.short ?? item.title);
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
    if (content.kind === "capability_domain") set(areas, content.system_id, content.name);
    if (content.kind === "portfolio_node") set(nodes, content.system_id, content.name);
    if (content.kind === "realisation_record") set(records, content.system_id, content.name);
    if (content.kind === "source") set(sources, content.system_id, content.knowledge_source?.short ?? content.name);
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
  const curated = new Map((release.schemes ?? []).map((item) => [item.id, item.name] as const));
  const offeringBy = (reference: string) =>
    (release.products ?? []).find((item) => item.id === reference || item.name.toLocaleLowerCase() === reference.toLocaleLowerCase());
  return {
    vocabulary: (scheme) => SCHEME[scheme] ?? curated.get(scheme) ?? humane(scheme),
    orderType: (offering, code) => offeringBy(offering)?.order_types.find((item) => item.code === code)?.name ?? code,
    hasOffering: (reference) => offeringBy(reference) !== undefined,
    system: (id) => systems.get(id) ?? humane(id),
    component: (systemId, componentId) => components.get(`${systemId}/${componentId}`) ?? humane(componentId),
    domain: (id) => domains.get(id) ?? humane(id),
    // A parent is named as the document wrote it until the draft resolves it, so it is kept.
    area: (reference) => areas.get(reference) ?? reference,
    portfolio: (reference) => nodes.get(reference) ?? reference,
    realisation: (reference) => records.get(reference) ?? reference,
    source: (reference) => sources.get(reference) ?? reference,
    offering: (id) => offerings.get(id) ?? humane(id),
    // A channel the document named that no suggestion adds is kept as written.
    channel: (id) => channels.get(id) ?? id,
    inDraft: (key) => drafted.has(key.startsWith("channel:") ? channelKeys(key.slice(8))[0]! : key),
  };
}
