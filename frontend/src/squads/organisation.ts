/**
 * Reading the squad catalogue through what the organisation sells: value
 * streams, their products, each product's systems and who runs each; then the
 * systems no product names. Pure functions over the organisation and the
 * architecture version in service.
 */
import type { Organisation, OrganisationAuditEvent, OrgProduct, Person, Release, Squad, ValueStream } from "../api/client";
import { domainPath } from "../catalogue/catalogue";

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

export type RunBy = { squad: Squad; contact: Person | null };

export type SystemRow = {
  systemId: string;
  name: string;
  /** Where it sits in the landscape, outermost first. */
  place: string[];
  /** A link to a system no longer in the version in service. */
  lapsed: boolean;
  runBy: RunBy[];
};

export type ProductSection = { product: OrgProduct; rows: SystemRow[] };
export type StreamSection = { stream: ValueStream; lead: Person | null; products: ProductSection[]; squads: Squad[] };

export function people(org: Organisation): Map<string, Person> {
  return new Map(org.people.map((person) => [person.id, person]));
}

/** The squads that run a system, each with its contact for it. */
export function runBy(org: Organisation, systemId: string): RunBy[] {
  const directory = people(org);
  return org.squads
    .filter((squad) => squad.systems.some((item) => item.system_id === systemId))
    .sort(byName)
    .map((squad) => {
      const contact = squad.systems.find((item) => item.system_id === systemId)?.person_id;
      return { squad, contact: contact ? directory.get(contact) ?? null : null };
    });
}

function row(org: Organisation, release: Release | null, systemId: string): SystemRow {
  const system = release?.systems.find((item) => item.id === systemId);
  const landscape = new Map((release?.landscape_domains ?? []).map((domain) => [domain.id, domain]));
  return {
    systemId,
    name: system?.name ?? systemId,
    place: system ? domainPath(landscape, system.landscape_domain_id) : [],
    lapsed: release !== null && !system,
    runBy: runBy(org, systemId),
  };
}

/** Value streams by name, each with its lead, its products (their systems and who runs each), and its squads. */
export function streamSections(org: Organisation, release: Release | null): StreamSection[] {
  const directory = people(org);
  return [...org.value_streams].sort(byName).map((stream) => ({
    stream,
    lead: stream.lead_person_id ? directory.get(stream.lead_person_id) ?? null : null,
    products: org.products
      .filter((product) => product.value_stream_id === stream.id)
      .sort(byName)
      .map((product) => ({ product, rows: product.system_ids.map((id) => row(org, release, id)) })),
    squads: org.squads.filter((squad) => squad.value_stream_id === stream.id).sort(byName),
  }));
}

/** Systems in service that no product names, grouped by where they sit; unplaced last. */
export function unnamedSystems(org: Organisation, release: Release | null): { place: string; rows: SystemRow[] }[] {
  if (!release) return [];
  const named = new Set(org.products.flatMap((product) => product.system_ids));
  const groups = new Map<string, SystemRow[]>();
  for (const system of [...release.systems].sort(byName)) {
    if (named.has(system.id)) continue;
    const item = row(org, release, system.id);
    const place = item.place.join(" › ") || "";
    groups.set(place, [...(groups.get(place) ?? []), item]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "en", { sensitivity: "base" })))
    .map(([place, rows]) => ({ place: place || "Not placed in the landscape", rows }));
}

export type Gaps = { inService: number; run: number; noSquad: number; lapsed: number };

/** How far ownership reaches across the version in service. */
export function gaps(org: Organisation, release: Release | null): Gaps {
  const owned = new Set(org.squads.flatMap((squad) => squad.systems.map((item) => item.system_id)));
  const inService = new Set((release?.systems ?? []).map((system) => system.id));
  const linked = new Set([...owned, ...org.products.flatMap((product) => product.system_ids)]);
  const run = [...inService].filter((id) => owned.has(id)).length;
  return {
    inService: inService.size,
    run,
    noSquad: inService.size - run,
    lapsed: release ? [...linked].filter((id) => !inService.has(id)).length : 0,
  };
}

export type Roles = { leads: ValueStream[]; scrumMaster: Squad[]; resource: { squad: Squad; systemId: string }[] };

/** What a person holds; a person holding anything cannot be made inactive. */
export function rolesOf(org: Organisation, personId: string): Roles {
  return {
    leads: org.value_streams.filter((stream) => stream.lead_person_id === personId),
    scrumMaster: org.squads.filter((squad) => squad.scrum_master_person_id === personId),
    resource: org.squads.flatMap((squad) =>
      squad.systems.filter((item) => item.person_id === personId).map((item) => ({ squad, systemId: item.system_id })),
    ),
  };
}

export const holdsRoles = (roles: Roles) => roles.leads.length + roles.scrumMaster.length + roles.resource.length > 0;

/** An id not yet taken: a slug of the name, then -2, -3. */
export function freeId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = name.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "item";
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

const ACTION: Record<string, [string, keyof Organisation | null]> = {
  save_person: ["Saved the person", "people"],
  save_value_stream: ["Saved the value stream", "value_streams"],
  save_product: ["Saved the product", "products"],
  save_squad: ["Saved the squad", "squads"],
  remove_value_stream: ["Removed the value stream", null],
  remove_product: ["Removed the product", null],
  remove_squad: ["Removed the squad", null],
};

/** One history line: what was done, to what, named when it still exists. */
export function historyLine(event: OrganisationAuditEvent, org: Organisation): string {
  const [verb, list] = ACTION[event.action] ?? [event.action.replace(/_/g, " "), null];
  const records = list ? (org[list] as { id: string; name: string }[]) : [];
  const name = records.find((item) => item.id === event.subject_id)?.name;
  return name ? `${verb} ${name}` : `${verb} ${event.subject_id.replace(/[-_]+/g, " ")}`;
}

/** Active people, by name: the only ones who can hold a role. */
export const activePeople = (org: Organisation) => org.people.filter((person) => person.active).sort(byName);
