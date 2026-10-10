/**
 * Reading the squad catalogue through what the organisation sells: value
 * streams, their products, each product's systems and who runs each; then the
 * systems no product names. Pure functions over the organisation and the
 * architecture version in service.
 */
import type {
  Organisation,
  OrganisationAuditEvent,
  OrgProduct,
  Person,
  ReferenceFlag,
  Release,
  Squad,
  SquadResource,
  SquadRole,
  ValueStream,
} from "../api/client";
import { domainPath } from "../catalogue/catalogue";

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** The roles a squad resource can hold, in the order a squad lists them. */
export const ROLES: { value: SquadRole; label: string }[] = [
  { value: "system_contact", label: "Contact" },
  { value: "solution_architect", label: "Solution architect" },
  { value: "business_analyst", label: "Business analyst" },
  { value: "developer", label: "Developer" },
  { value: "tester", label: "Tester" },
];

export const roleLabel = (role: SquadRole) => ROLES.find((item) => item.value === role)?.label ?? role;

/**
 * A seat in a squad on a system: its role, who holds it (or nobody yet), and the
 * capability concept it is scoped to, named, or null on the whole system. `lapsed`
 * marks a scope the system's capabilities no longer link to in the version in service.
 */
export type Seat = { role: SquadRole; person: Person | null; capability: string | null; lapsed: boolean };

export type RunBy = { squad: Squad; seats: Seat[] };

/** The systems a squad staffs, each once, in the order first named. */
export const systemIdsOf = (squad: Squad) => [...new Set(squad.resources.map((item) => item.system_id))];

/** A capability concept's preferred label in the version in service, or its id. */
export const conceptName = (release: Release | null, conceptId: string) =>
  release?.business_capabilities?.find((item) => item.id === conceptId)?.pref_label ?? conceptId;

/** The capability concepts a system's capabilities link to, by name: the scopes a seat on it can take. */
export function conceptsOf(release: Release | null, systemId: string): { id: string; name: string }[] {
  const system = release?.systems.find((item) => item.id === systemId);
  const ids = new Set((system?.capabilities ?? []).flatMap((item) => (item.concept_id ? [item.concept_id] : [])));
  return [...ids].map((id) => ({ id, name: conceptName(release, id) })).sort(byName);
}

function seat(resource: SquadResource, release: Release | null, directory: Map<string, Person>): Seat {
  const scope = resource.capability_id ?? null;
  return {
    role: resource.role,
    person: resource.person_id ? directory.get(resource.person_id) ?? null : null,
    capability: scope ? conceptName(release, scope) : null,
    lapsed: Boolean(scope && release?.systems.some((item) => item.id === resource.system_id)
      && !conceptsOf(release, resource.system_id).some((item) => item.id === scope)),
  };
}

/** A squad's seats on one system, by role, whole-system seats before scoped ones, then name. */
export function seatsOn(org: Organisation, squad: Squad, systemId: string, release: Release | null = null): Seat[] {
  const directory = people(org);
  const order = (role: SquadRole) => ROLES.findIndex((item) => item.value === role);
  return squad.resources
    .filter((item) => item.system_id === systemId)
    .map((item) => seat(item, release, directory))
    .sort(
      (a, b) =>
        order(a.role) - order(b.role)
        || (a.capability ?? "").localeCompare(b.capability ?? "")
        || (a.person?.name ?? "\uffff").localeCompare(b.person?.name ?? "\uffff"),
    );
}

/** One seat in words: "Developer for Billing: Bea", or "Contact: open seat". */
export const seatText = (seat: Seat) => {
  const scope = seat.capability ? ` for ${seat.capability}${seat.lapsed ? " (no longer linked)" : ""}` : "";
  return `${roleLabel(seat.role)}${scope}: ${seat.person?.name ?? "open seat"}`;
};

/** Seats in words: "Contact: Layla · Developer for Billing: open seat". */
export const seatsLine = (seats: Seat[]) => seats.map(seatText).join(" · ");

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

/** The squads that run a system, each with its seats on it. */
export function runBy(org: Organisation, systemId: string, release: Release | null = null): RunBy[] {
  return org.squads
    .filter((squad) => squad.resources.some((item) => item.system_id === systemId))
    .sort(byName)
    .map((squad) => ({ squad, seats: seatsOn(org, squad, systemId, release) }));
}

function row(org: Organisation, release: Release | null, systemId: string): SystemRow {
  const system = release?.systems.find((item) => item.id === systemId);
  const landscape = new Map((release?.landscape_domains ?? []).map((domain) => [domain.id, domain]));
  return {
    systemId,
    name: system?.name ?? systemId,
    place: system ? domainPath(landscape, system.landscape_domain_id) : [],
    lapsed: release !== null && !system,
    runBy: runBy(org, systemId, release),
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
  const owned = new Set(org.squads.flatMap(systemIdsOf));
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

export type Roles = { leads: ValueStream[]; scrumMaster: Squad[]; resource: { squad: Squad; systemId: string; role: SquadRole }[] };

/** What a person holds; a person holding anything cannot be made inactive. */
export function rolesOf(org: Organisation, personId: string): Roles {
  return {
    leads: org.value_streams.filter((stream) => stream.lead_person_id === personId),
    scrumMaster: org.squads.filter((squad) => squad.scrum_master_person_id === personId),
    resource: org.squads.flatMap((squad) =>
      squad.resources
        .filter((item) => item.person_id === personId)
        .map((item) => ({ squad, systemId: item.system_id, role: item.role })),
    ),
  };
}

export const holdsRoles = (roles: Roles) => roles.leads.length + roles.scrumMaster.length + roles.resource.length > 0;

/**
 * What a product's links say against the version in service, in words: what it sells
 * and where it sits, then each thing to check. Names come from the version in service,
 * ids where it no longer has them.
 */
export function productLinks(product: OrgProduct, release: Release | null, flag: ReferenceFlag | undefined) {
  const offeringName = (id: string) => release?.products?.find((item) => item.id === id)?.name ?? id;
  const systemName = (id: string) => release?.systems.find((item) => item.id === id)?.name ?? id;
  const node = product.portfolio_node_id ? release?.portfolio?.find((item) => item.id === product.portfolio_node_id) : undefined;
  const list = (ids: string[], name: (id: string) => string) => ids.map(name).join(", ");
  const checks: string[] = [];
  if (flag?.unlinked) checks.push("Not linked to an offering or a portfolio node.");
  if (flag?.retired_offering_ids.length) {
    checks.push(`${list(flag.retired_offering_ids, offeringName)}: no longer an offering in service.`);
  }
  if (flag?.retired_portfolio_node_id) checks.push(`${flag.retired_portfolio_node_id}: no longer a portfolio node in service.`);
  if (flag?.systems_missing.length) {
    checks.push(`Its offerings also name ${list(flag.systems_missing, systemName)}, which it does not list.`);
  }
  if (flag?.systems_unexplained.length) {
    checks.push(`It lists ${list(flag.systems_unexplained, systemName)}, which none of its offerings name.`);
  }
  return {
    sells: product.offering_ids.map(offeringName),
    portfolio: node ? `${node.name} (${node.level})` : product.portfolio_node_id,
    checks,
  };
}

/** What a squad's seats name that the version in service no longer has, in words. */
export function squadChecks(flag: ReferenceFlag | undefined, release: Release | null): string[] {
  const systemName = (id: string) => release?.systems.find((item) => item.id === id)?.name ?? id;
  return [
    ...(flag?.retired_system_ids ?? []).map((id) => `${id}: no longer a system in service.`),
    ...(flag?.retired_capabilities ?? []).map(
      (scope) => `${systemName(scope.system_id)} › ${conceptName(release, scope.capability_id)}: no capability of the system links to it any more.`,
    ),
  ];
}

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
