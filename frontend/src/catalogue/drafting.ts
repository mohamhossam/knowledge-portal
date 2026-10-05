/**
 * Changing a draft by hand and getting it ready to publish: what the service is
 * sent, what a removal would break, how far the build has got, and how a
 * comparison and a diff are said in words. Pure functions.
 */
import type {
  ArchitectureJob, CatalogueDiff, CatalogueSystem, DraftUpdate, ImpactComparison, Release,
} from "../api/client";

/** The whole draft, as the service takes it, with a part replaced. */
export function draftBody(release: Release, patch: Partial<Omit<DraftUpdate, "expected_revision">> = {}): DraftUpdate {
  return {
    expected_revision: release.revision,
    systems: release.systems,
    relationships: release.relationships,
    capability_domains: release.capability_domains ?? [],
    landscape_domains: release.landscape_domains ?? [],
    products: release.products ?? [],
    journeys: release.journeys ?? [],
    channels: release.channels ?? [],
    ...patch,
  };
}

/** Where else a system is named: offerings, journeys and channels must let go of it before it can go. */
export function systemUses(release: Release, systemId: string): string[] {
  const offerings = (release.products ?? [])
    .filter((offering) => offering.components.some((part) => part.responsibilities.some((item) => item.system_id === systemId)))
    .map((offering) => `the offering ${offering.name}`);
  const journeys = (release.journeys ?? [])
    .filter((journey) =>
      journey.activities.some((step) => step.performing_system_id === systemId || step.supporting_system_ids.includes(systemId)),
    )
    .map((journey) => `the journey ${journey.name}`);
  const channels = (release.channels ?? [])
    .filter((channel) => channel.entry_system_id === systemId)
    .map((channel) => `the channel ${channel.name}`);
  return [...offerings, ...journeys, ...channels];
}

/** Where a channel is named: order types and journey steps must let go of it before it can go. */
export function channelUses(release: Release, channelId: string): string[] {
  const orders = (release.products ?? []).flatMap((offering) =>
    offering.order_types
      .filter((type) => (type.channels ?? []).includes(channelId))
      .map((type) => `${offering.name}: ${type.name}`),
  );
  const journeys = (release.journeys ?? [])
    .filter((journey) => journey.activities.some((step) => (step.channels ?? []).includes(channelId)))
    .map((journey) => `the journey ${journey.name}`);
  return [...orders, ...journeys];
}

/** The draft without a system, and without every connection to or from it. */
export function withoutSystem(release: Release, systemId: string): DraftUpdate {
  return draftBody(release, {
    systems: release.systems.filter((system) => system.id !== systemId),
    relationships: release.relationships.filter(
      (item) => item.source_system_id !== systemId && item.target_system_id !== systemId,
    ),
  });
}

/** A new system's starting shape. */
export const blankSystem = (): CatalogueSystem => ({ id: "", name: "", aliases: [], capabilities: [], components: [], constraints: [] });

export type BuildState = "built" | "building" | "failed" | "stale" | "never";

/** How far the draft's build for matching has got, at its current revision. */
export function buildState(release: Release, job: ArchitectureJob | null | undefined): BuildState {
  if (release.built_revision === release.revision) return "built";
  const forThisRevision = job?.fingerprint.split("|")[0] === String(release.revision);
  if (job && forThisRevision && (job.status === "queued" || job.status === "running")) return "building";
  if (job && forThisRevision && job.status === "failed") return "failed";
  return release.built_revision == null ? "never" : "stale";
}

export const BUILD_STATE: Record<BuildState, string> = {
  built: "Built for matching",
  building: "Being built",
  failed: "The build failed",
  stale: "Edited since it was built",
  never: "Not built yet",
};

/** What changes for one requirement between the version in service and this draft, in words. */
export function impactVerdict(comparison: ImpactComparison): { label: string; moved: boolean } {
  const before = new Map(comparison.in_use.systems.map((system) => [system.id, system.name]));
  const after = new Map(comparison.this_version.systems.map((system) => [system.id, system.name]));
  const gained = [...after].filter(([id]) => !before.has(id)).map(([, name]) => name);
  const lost = [...before].filter(([id]) => !after.has(id)).map(([, name]) => name);
  if (!gained.length && !lost.length) {
    return { label: after.size ? "Same systems" : "Finds no system, as before", moved: false };
  }
  if (!after.size) return { label: "Finds no system now", moved: true };
  const parts = [
    gained.length ? `Now also finds ${list(gained)}` : null,
    lost.length ? `No longer finds ${list(lost)}` : null,
  ].filter(Boolean);
  return { label: parts.join("; "), moved: true };
}

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "");

type Item = CatalogueDiff["changes"][number]["item"];

/** The kinds of change in the order a timetable lists its alterations. */
export const DIFF_ORDER: { item: Item; one: string; many: string }[] = [
  { item: "system", one: "System", many: "Systems" },
  { item: "capability", one: "Capability", many: "Capabilities" },
  { item: "component", one: "Component", many: "Components" },
  { item: "relationship", one: "Connection", many: "Connections" },
  { item: "landscape_domain", one: "Landscape domain", many: "Landscape domains" },
  { item: "domain", one: "Business area", many: "Business areas" },
  { item: "channel", one: "Channel", many: "Channels" },
  { item: "product", one: "Offering", many: "Offerings" },
  { item: "journey", one: "Journey", many: "Journeys" },
  { item: "document", one: "Document", many: "Documents" },
];

const FIELD: Record<string, string> = {
  name: "name",
  name_ar: "Arabic name",
  aliases: "other names",
  description: "description",
  capabilities: "capabilities",
  components: "components",
  constraints: "constraints",
  landscape_domain: "where it sits",
  landscape_domain_id: "where it sits",
  triggers: "matching phrases",
  kind: "how it depends",
  domain_id: "business area",
  component_id: "component",
  technology: "technology",
  parent_id: "parent domain",
  activities: "steps",
  flow_rules: "branches",
  integrations: "hand-overs",
  order_types: "order types",
  rules: "rules",
  channel_kind: "kind of channel",
  entry_system_id: "entry system",
  realisation: "how its parts are realised",
  nfrs: "non-functional requirements",
};

/** A changed item's fields, said as words: "Arabic name and where it sits". */
export function fieldsInWords(fields: string[]): string {
  return list([...new Set(fields.map((field) => FIELD[field] ?? field.replace(/_/g, " ")))]);
}

export const CHANGE_WORD = { added: "Added", changed: "Changed", removed: "Removed" } as const;

const VERB = {
  calls_api: "calls the API of",
  publishes_events_to: "sends events to",
  transfers_data_to: "sends data to",
  orchestrates: "orchestrates",
  unspecified: "depends on",
} as const;

/**
 * A connection's change as a sentence about its two systems ("Order Hub calls
 * the API of CWOM"), and what it is for, kept apart because a description is
 * often a clause of its own. The service keys a connection "source->target:for
 * what" and labels it with an arrow; the arrow never reaches the screen.
 */
export function connectionSentence(change: CatalogueDiff["changes"][number], release: Release): { sentence: string; forWhat: string } {
  const match = /^(.+?)->(.+?):(.*)$/.exec(change.key);
  const [labelSource = "", rest = ""] = change.label.split(" → ");
  const labelTarget = rest.split(": ")[0] ?? "";
  if (!match) return { sentence: change.label.replace(" → ", " depends on "), forWhat: "" };
  const [, source = "", target = "", purpose = ""] = match;
  const name = (id: string, fallback: string) => release.systems.find((system) => system.id === id)?.name ?? (fallback || id);
  const said = release.relationships.find(
    (item) => item.source_system_id === source && item.target_system_id === target && item.description.toLocaleLowerCase() === purpose,
  );
  const forWhat = change.label.includes(": ") ? change.label.slice(change.label.indexOf(": ") + 2) : purpose;
  const verb = change.change === "removed" || !said ? "depends on" : VERB[said.kind];
  const lead = change.change === "removed" ? "no longer depends on" : change.change === "changed" ? `now ${verb}` : verb;
  return { sentence: `${name(source, labelSource)} ${lead} ${name(target, labelTarget)}`, forWhat };
}

export type DiffSection = { item: Item; label: string; changes: CatalogueDiff["changes"] };

/** The diff's changes by kind, in the timetable's order, each kind's changes added, then changed, then removed. */
export function diffSections(diff: CatalogueDiff): DiffSection[] {
  const rank = { added: 0, changed: 1, removed: 2 } as const;
  return DIFF_ORDER.map(({ item, many }) => ({
    item,
    label: many,
    changes: diff.changes
      .filter((change) => change.item === item)
      .sort((a, b) => rank[a.change] - rank[b.change] || a.label.localeCompare(b.label, "en", { sensitivity: "base" })),
  })).filter((section) => section.changes.length > 0);
}
