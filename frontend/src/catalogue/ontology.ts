/**
 * Reading a version's ontology (redesign phase 5): capability concepts, the
 * systems and offering components that realise them, interfaces and the
 * information entities they carry. Pure functions over the release payload.
 */
import type { CatalogueSystem, Offering, Release, SourceConfidence } from "../api/client";
import type { StatusTone } from "../design/components";

type Concept = NonNullable<Release["business_capabilities"]>[number];
type CapabilityDomain = NonNullable<Release["capability_domains"]>[number];
type Interface = NonNullable<Release["interfaces"]>[number];
type OfferingComponent = Offering["components"][number];
export type { Concept, Interface };

/** How sure a source is, in a word and a tone; "Not stated" when the source says nothing. */
export const SOURCE_WORD: Record<SourceConfidence, string> = {
  confirmed: "Confirmed",
  inferred: "Inferred",
  gap: "Has gaps",
};
export const SOURCE_TONE: Record<SourceConfidence, StatusTone> = {
  confirmed: "done",
  inferred: "neutral",
  gap: "attention",
};

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase().trim();
const byLabel = (a: Concept, b: Concept) => a.pref_label.localeCompare(b.pref_label, "en", { sensitivity: "base" });

/** A component of an offering, named with the offering it belongs to. */
export type ComponentUse = { offering: Offering; component: OfferingComponent };
/** A system's capability that names a concept. */
export type SystemUse = { system: CatalogueSystem; capability: string };

export type ConceptIndex = {
  concepts: Concept[];
  byId: Map<string, Concept>;
  domains: Map<string, CapabilityDomain>;
  systems: Map<string, SystemUse[]>;
  components: Map<string, ComponentUse[]>;
  narrower: Map<string, Concept[]>;
};

/** Every concept, with what realises it: systems' capabilities and offerings' components. */
export function conceptIndex(release: Release): ConceptIndex {
  const concepts = [...(release.business_capabilities ?? [])].sort(byLabel);
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const systems = new Map<string, SystemUse[]>();
  for (const system of release.systems) {
    for (const capability of system.capabilities) {
      if (!capability.concept_id) continue;
      const list = systems.get(capability.concept_id) ?? [];
      // A system that names a concept twice is listed once, with its first capability.
      if (!list.some((use) => use.system.id === system.id)) list.push({ system, capability: capability.name });
      systems.set(capability.concept_id, list);
    }
  }
  const components = new Map<string, ComponentUse[]>();
  for (const offering of release.products ?? []) {
    for (const component of offering.components) {
      for (const conceptId of component.capability_ids ?? []) {
        components.set(conceptId, [...(components.get(conceptId) ?? []), { offering, component }]);
      }
    }
  }
  const narrower = new Map<string, Concept[]>();
  for (const concept of concepts) {
    if (concept.broader_id) narrower.set(concept.broader_id, [...(narrower.get(concept.broader_id) ?? []), concept]);
  }
  return {
    concepts,
    byId,
    domains: new Map((release.capability_domains ?? []).map((domain) => [domain.id, domain])),
    systems,
    components,
    narrower,
  };
}

/**
 * The capability domain a concept sits in: its own as a top concept, else its top concept's,
 * which every concept under it inherits (concepts.concept_domain). `from` is that top concept
 * when the domain is inherited.
 */
export function domainOf(index: ConceptIndex, concept: Concept): { id: string | null; from?: Concept } {
  const seen = new Set<string>();
  let current: Concept | undefined = concept;
  while (current?.broader_id && !seen.has(current.id)) {
    seen.add(current.id);
    const broader = index.byId.get(current.broader_id);
    if (!broader) break;
    current = broader;
  }
  const id = current?.domain_id && index.domains.has(current.domain_id) ? current.domain_id : null;
  return current && current.id !== concept.id ? { id, from: current } : { id };
}

/** A concept's place: its capability domain (its top concept's, for one under another), then its broader concepts, outermost first. */
export function conceptPath(index: ConceptIndex, concept: Concept): string[] {
  const path: string[] = [];
  const seen = new Set<string>([concept.id]);
  for (let id = concept.broader_id; id && !seen.has(id); id = index.byId.get(id)?.broader_id) {
    seen.add(id);
    const broader = index.byId.get(id);
    if (!broader) break;
    path.unshift(broader.pref_label);
  }
  const domainId = domainOf(index, concept).id;
  const domain = domainId ? index.domains.get(domainId)?.name : undefined;
  return domain ? [domain, ...path] : path;
}

/**
 * Which concepts a label finds: the preferred label or any other. Each hit
 * says the other label that matched, or null for the preferred one.
 * "Wi-Fi" and "WiFi" read as the same label.
 */
export function findConcepts(concepts: Concept[], query: string): Map<string, string | null> {
  const squash = (text: string) => fold(text).replace(/[\s\-_.]+/g, "");
  const wanted = squash(query);
  const found = new Map<string, string | null>();
  if (!wanted) return found;
  for (const concept of concepts) {
    if (squash(concept.pref_label).includes(wanted)) found.set(concept.id, null);
    else {
      const other = concept.alt_labels.find((label) => squash(label).includes(wanted));
      if (other !== undefined) found.set(concept.id, other);
    }
  }
  return found;
}

export type Coverage = {
  capabilities: number;
  linkedCapabilities: number;
  noneFits: number;
  components: number;
  linkedComponents: number;
  withoutSystem: number;
};

/** How much of the catalogue is mapped to concepts. */
export function coverage(release: Release, index: ConceptIndex): Coverage {
  const capabilities = release.systems.flatMap((system) => system.capabilities);
  const components = (release.products ?? []).flatMap((offering) => offering.components);
  return {
    capabilities: capabilities.length,
    linkedCapabilities: capabilities.filter((item) => item.concept_id).length,
    noneFits: capabilities.filter((item) => !item.concept_id && item.unlinked_reason).length,
    components: components.length,
    linkedComponents: components.filter((item) => (item.capability_ids ?? []).length > 0).length,
    withoutSystem: index.concepts.filter((concept) => !index.systems.get(concept.id)?.length).length,
  };
}

/** The concepts a system's capabilities name, once each, in its own order. */
export function systemConcepts(system: CatalogueSystem, index: ConceptIndex): Concept[] {
  const seen = new Set<string>();
  const found: Concept[] = [];
  for (const capability of system.capabilities) {
    const concept = capability.concept_id ? index.byId.get(capability.concept_id) : undefined;
    if (concept && !seen.has(concept.id)) {
      seen.add(concept.id);
      found.push(concept);
    }
  }
  return found;
}

/** The capability domains a system works in, by its capabilities. */
export function systemDomains(system: CatalogueSystem): string[] {
  return [...new Set(system.capabilities.map((item) => item.domain_id).filter((id): id is string => Boolean(id)))];
}

/** Interfaces a system exposes, and those it consumes. */
export function interfacesOf(release: Release, systemId: string): { exposes: Interface[]; uses: Interface[] } {
  const all = release.interfaces ?? [];
  return {
    exposes: all.filter((item) => item.system_id === systemId),
    uses: all.filter((item) => item.consumer_ids.includes(systemId)),
  };
}

/** The TM Forum Open APIs (a vocabulary scheme) an interface does the same job as, by id. */
export function openApiNames(release: Release): Map<string, string> {
  return new Map((release.vocabulary ?? []).filter((term) => term.scheme === "open_api").map((term) => [term.id, term.pref_label]));
}

/** The names of information entities (a vocabulary scheme), by id. */
export function entityNames(release: Release): Map<string, string> {
  return new Map(
    (release.vocabulary ?? []).filter((term) => term.scheme === "information_entity").map((term) => [term.id, term.pref_label]),
  );
}

/** Named service and resource records (the realisation layers), by id. */
export function realisationRecords(release: Release): Map<string, NonNullable<Release["realisations"]>[number]> {
  return new Map((release.realisations ?? []).map((record) => [record.id, record]));
}

export const INTERFACE_STYLE: Record<Interface["style"], string> = {
  api: "API",
  event: "Event",
  file: "File",
  unspecified: "Not stated",
};
