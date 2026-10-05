/**
 * Reading a draft's suggestions: which system each would change, what it says
 * in words, and whether it is ready, needs a person, or waits for another.
 * Pure functions over the suggestions payload and the draft.
 */
import type {
  ArchitectureJob, CatalogueSystem, ExtractionRun, RelationshipKind, Release, Suggestion, SuggestionKind,
} from "../api/client";

export type SuggestionState = "ready" | "decide" | "waits" | "present" | "accepted" | "rejected";

export const STATE_LABEL: Record<SuggestionState, string> = {
  ready: "Ready",
  decide: "Needs your decision",
  waits: "Waits for another",
  present: "Already in the draft",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** Rank by weight: a decision due is bold, a wait is set back, a decided row is past. */
export const STATE_RANK: Record<SuggestionState, "due" | "service" | "running" | "past"> = {
  decide: "due",
  ready: "service",
  waits: "running",
  present: "running",
  accepted: "past",
  rejected: "past",
};

/** The order accepting-all walks, and the order rows sit inside a system. */
export const KIND_ORDER: SuggestionKind[] = [
  "landscape_domain", "system", "placement", "component", "capability", "constraint", "relationship", "channel", "product", "journey",
];

/**
 * Whether a person must decide this one: the service's accept-all leaves it
 * alone, and the response does not say so.
 */
export function needsOneByOne(suggestion: Suggestion): boolean {
  const kind = suggestion.content.kind;
  return suggestion.basis === "inferred"
    || suggestion.possible_matches.length > 0
    || ((kind === "placement" || kind === "product" || kind === "journey") && suggestion.match === "updates_existing");
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
  const humane = (id: string) => id.split(/[-_]+/).filter(Boolean).map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(" ");
  return {
    system: (id) => systems.get(id) ?? humane(id),
    component: (systemId, componentId) => components.get(`${systemId}/${componentId}`) ?? humane(componentId),
    domain: (id) => domains.get(id) ?? humane(id),
    offering: (id) => offerings.get(id) ?? humane(id),
    // A channel the document named that no suggestion adds is kept as written.
    channel: (id) => channels.get(id) ?? id,
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
      return `Adds the capability ${content.name}${within}, matched by ${quoted(content.triggers)}`;
    }
    case "constraint":
      return `Adds the constraint “${content.text}”`;
    case "relationship":
      return `${VERB[content.relationship_kind ?? "unspecified"]} ${targetName(suggestion, words)}`;
    case "placement":
      return `Places it in ${words.domain(content.landscape_domain_id ?? "")}`;
    case "landscape_domain":
      return `Adds the landscape domain ${content.name}${content.parent_domain_id ? `, inside ${words.domain(content.parent_domain_id)}` : ""}`;
    case "product":
      return replaces ? `Replaces the offering ${content.name} with the document's` : `Adds the offering ${content.name}`;
    case "journey":
      return replaces
        ? `Replaces the journey ${content.journey?.name ?? content.name} with the document's`
        : `Adds the journey ${content.journey?.name ?? content.name}`;
    case "channel": {
      const entry = content.channel?.entry_system_id;
      const through = entry ? `, its orders entering through ${words.system(entry)}` : "";
      return replaces
        ? `Adds what the document says about the channel ${content.name}${through}`
        : `Adds the channel ${content.name}${through}`;
    }
  }
}

export function targetName(suggestion: Suggestion, words: Lexicon): string {
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
      return content.kind === "product" || content.kind === "journey"
        ? "Waits for the systems it names"
        : `Waits for the system ${words.system(missing)}`;
    }
    case "needs_component":
      return content.kind === "journey"
        ? "Waits for the offering's parts it names"
        : `Waits for the component ${words.component(content.system_id, content.component_id ?? "")}`;
    case "needs_domain":
      return `Waits for the landscape domain ${words.domain(content.landscape_domain_id ?? content.parent_domain_id ?? "")}`;
    case "needs_offering":
      return `Waits for the offering ${words.offering(content.journey?.product_id ?? "")}`;
    case "needs_channel": {
      const named = [...new Set(channelsNamed(suggestion).map(words.channel))];
      return `Waits for the ${named.length === 1 ? "channel" : "channels"} ${named.join(", ")}`;
    }
    default:
      return "";
  }
}

/** Why a person must decide, in words. */
export function decideWhy(suggestion: Suggestion): string {
  if (suggestion.possible_matches.length) {
    const names = suggestion.possible_matches.map((item) => item.written_as);
    return `“${[...new Set(names)].join("”, “")}” may be a system the draft already has`;
  }
  if (suggestion.basis === "inferred") return "Inferred, not stated in the document";
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

const SECTION = { domains: "Landscape domains", channels: "Channels", offerings: "Offerings", journeys: "Journeys" } as const;

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
    } else if (content.kind === "product") {
      key = "section:offerings";
      group = { key, isNew: false, label: SECTION.offerings };
    } else if (content.kind === "journey") {
      key = "section:journeys";
      group = { key, isNew: false, label: SECTION.journeys };
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
 * A suggestion waiting on something no suggestion adds stays out.
 */
export function bulkAcceptable(release: Release, suggestions: Suggestion[]): { ready: Suggestion[]; lifted: Suggestion[] } {
  const known = new Set<string>();
  for (const system of release.systems) {
    known.add(`system:${system.id}`);
    for (const component of system.components) known.add(`component:${system.id}/${component.id}`);
  }
  for (const domain of release.landscape_domains ?? []) known.add(`domain:${domain.id}`);
  for (const offering of release.products ?? []) known.add(`offering:${offering.id}`);
  for (const channel of release.channels ?? []) known.add(`channel:${channel.id}`);
  const open = suggestions.filter((item) => item.status === "proposed" && !needsOneByOne(item));
  const ready = open.filter((item) => !item.match.startsWith("needs_"));
  const provided = new Set(known);
  const add = (item: Suggestion) => provides(item).forEach((key) => provided.add(key));
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
      return [`offering:${content.system_id}`];
    case "channel":
      return [`channel:${content.system_id}`];
    default:
      return [];
  }
}

/** The channels an offering's order types or a journey's steps name. */
function channelsNamed(suggestion: Suggestion): string[] {
  const { content } = suggestion;
  if (content.kind === "product") return (content.product?.order_types ?? []).flatMap((type) => type.channels ?? []);
  if (content.kind === "journey") return (content.journey?.activities ?? []).flatMap((step) => step.channels ?? []);
  return [];
}

function requires(suggestion: Suggestion): string[] {
  const { content } = suggestion;
  const system = suggestion.system_name ? [] : [`system:${content.system_id}`];
  // An offering or a journey also waits for every channel it names, whatever it waits for first.
  const channels = channelsNamed(suggestion).map((id) => `channel:${id}`);
  switch (suggestion.match) {
    case "needs_channel":
      return channels;
    case "needs_component":
      return [...system, `component:${content.system_id}/${content.component_id ?? ""}`];
    case "needs_domain":
      // A domain waits for its parent; a placement for the domain it places the system in.
      return [`domain:${(content.kind === "landscape_domain" ? content.parent_domain_id : content.landscape_domain_id) ?? ""}`];
    case "needs_offering":
      return [`offering:${content.journey?.product_id ?? ""}`];
    case "needs_system":
      if (content.kind === "channel") return [`system:${content.channel?.entry_system_id ?? ""}`];
      if (content.kind === "product") {
        return [
          ...(content.product?.components ?? []).flatMap((part) => part.responsibilities.map((item) => `system:${item.system_id}`)),
          ...channels,
        ];
      }
      if (content.kind === "journey") {
        return [
          ...(content.journey?.activities ?? []).flatMap((step) =>
            [step.performing_system_id, ...step.supporting_system_ids].filter(Boolean).map((id) => `system:${id}`),
          ),
          ...channels,
        ];
      }
      return [...system, ...(content.target_system_id && !suggestion.target_system_name ? [`system:${content.target_system_id}`] : [])];
    default:
      return system;
  }
}

/** The service's reading warnings count with "(s)"; say them as English. */
export function warningInWords(text: string): string {
  return text
    .replace(/\b(\d+) ([^()]*?)\(s\)/g, (_, n: string, words: string) => `${n} ${n === "1" ? words : `${words}s`}`)
    .replace(/\b1 ([^.]*?)\bwere\b/g, "1 $1was");
}

export type Tally = Record<SuggestionState, number> & { waiting: number; all: number };

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
export type Reading = { label: string; failed: boolean; busy: boolean };

const JOB_ERROR: Record<string, string> = {
  attempts_exhausted: "it stopped after three attempts",
  provider_rate_limited: "the model was busy",
  catalogue_extraction_unsupported: "this kind of file cannot be read here",
  catalogue_extraction_failed: "the model's answer could not be used",
  architecture_knowledge_conflict: "the draft changed while it was read",
};

export function reading(job: ArchitectureJob | undefined): Reading {
  if (!job) return { label: "Not read yet", failed: false, busy: false };
  switch (job.status) {
    case "queued":
      return { label: "Waiting to be read", failed: false, busy: true };
    case "running":
      return { label: "Being read", failed: false, busy: true };
    case "succeeded":
      return { label: "Read", failed: false, busy: false };
    case "cancelled":
      return { label: "Reading cancelled", failed: false, busy: false };
    case "failed": {
      const why = job.error_category ? JOB_ERROR[job.error_category] ?? job.error_category.replace(/_/g, " ") : null;
      return { label: why ? `Reading failed: ${why}` : "Reading failed", failed: true, busy: false };
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
