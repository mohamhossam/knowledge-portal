/**
 * What each table on the home says, derived from the API's answers alone.
 *
 * Pure functions, so the rules that decide what needs a curator are tested
 * without a browser: a document awaits review when its newest version has been
 * read and no publication was approved from it (a version's ingestion stage
 * stays "ready_for_review" after approval, so the stage alone cannot say); a catalogue draft needs someone while it
 * holds proposed suggestions; a system needs an owner when no squad holds it.
 */
import type {
  Actor,
  CatalogueSuggestions,
  LibraryDocument,
  Organisation,
  OrganisationAuditEvent,
  Release,
} from "../api/client";
import type { Rank } from "../timetable/TimetableTable";
import { count, formatDay } from "./format";

export type Line = {
  key: string;
  rank: Rank;
  cells: Record<string, string>;
  /** The item's name may be Arabic, English or both. */
  name: string;
  /** Where the item's own page is, when it has one. */
  to?: string;
  nameAr?: string | null;
  note?: string;
};

export type DerivedNote = { id: string; text: string };
export type Next = { to?: string; label: string };

export type Overview = {
  lines: Line[];
  /** Said after the rows when the table holds more than it shows. */
  more?: string;
  totals: { key: string; label: string; value: string }[];
  notes: DerivedNote[];
  edition: { text: string; note?: string };
  next: Next;
  /** How many entries the table holds, for the index's extent rule. */
  extent: { value: number; label: string };
};

const RANK_ORDER: Record<Rank, number> = { delayed: 0, due: 1, running: 2, service: 3, past: 4 };
const byRank = (a: Line, b: Line) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank];

/**
 * Notes numbered in the order their marks are read: the edition line's first,
 * then each row's, top to bottom, as a timetable numbers its footnotes.
 */
function inReadingOrder(notes: DerivedNote[], editionNote: string | undefined, lines: Line[]): DerivedNote[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const order = [editionNote, ...lines.map((line) => line.note)];
  return order.flatMap((id) => {
    const note = id ? byId.get(id) : undefined;
    if (note) byId.delete(note.id);
    return note ? [note] : [];
  });
}

export type NameOf = (actorId: string | null | undefined) => string;

/** Who did something, by name. The packaged initial catalogue has no person behind it. */
export function nameDirectory(actors: Actor[] | undefined): NameOf {
  const names = new Map((actors ?? []).map((actor) => [actor.id, actor.display_name]));
  names.set("packaged-seed", "the packaged initial catalogue");
  return (actorId) => (actorId ? names.get(actorId) ?? actorId : "someone");
}

// Table 1 ----------------------------------------------------------------------

const READING: Record<string, string> = { queued: "Queued", scanning: "Scanning", extracting: "Reading" };

export function libraryOverview(documents: LibraryDocument[]): Overview {
  const lines: Line[] = [];
  const notes: DerivedNote[] = [];
  let inService = 0;
  let withdrawn = 0;
  let yoursToReview = 0;
  let latest: { title: string; version: number | undefined; by: string; at: string } | null = null;
  let latestId: string | null = null;
  for (const document of documents) {
    const active = document.publications.find((item) => item.id === document.published_id);
    if (active && (!latest || active.approved_at > latest.at)) {
      latestId = active.id;
      latest = {
        title: document.title,
        version: document.versions.find((item) => item.id === active.version_id)?.number,
        by: active.approved_by.display_name,
        at: active.approved_at,
      };
    }
  }

  for (const document of documents) {
    const newest = [...document.versions].sort((a, b) => b.number - a.number)[0];
    const active = document.publications.find((item) => item.id === document.published_id);
    const activeVersion = active && document.versions.find((item) => item.id === active.version_id)?.number;
    if (active) {
      inService += 1;
    } else if (document.publications.some((item) => item.withdrawn_at)) {
      withdrawn += 1;
    }

    const line = (rank: Rank, status: string, since: string | null | undefined, note?: string): Line => ({
      key: document.id,
      rank,
      name: document.title,
      to: `/library/${encodeURIComponent(document.id)}`,
      cells: {
        status,
        version: newest ? `v${newest.number}` : "—",
        owner: document.can_edit ? `${document.owner.display_name} (you)` : document.owner.display_name,
        since: formatDay(since),
      },
      note,
    });
    const uploadNote = (id: string, detail: string) => {
      notes.push({
        id,
        text: `Version ${newest?.number ?? "?"} uploaded by ${newest?.uploaded_by.display_name ?? "its owner"} on ${formatDay(newest?.uploaded_at)}. ${detail}`,
      });
      return id;
    };
    const serviceNote = () => {
      if (!active) return undefined;
      const id = `pub-${document.id}`;
      notes.push({
        id,
        text: active.id === latestId
          ? `Version ${activeVersion ?? "?"}, the latest publication (note 1), stays in service until version ${newest?.number ?? "?"} is approved.`
          : `Version ${activeVersion ?? "?"} stays in service until version ${newest?.number ?? "?"} is approved. It was approved by ${active.approved_by.display_name} on ${formatDay(active.approved_at)}.`,
      });
      return id;
    };

    const stage = newest?.stage;
    const approved = newest !== undefined && document.publications.some((item) => item.version_id === newest.id);
    let entry: Line | null = null;
    if (stage === "ready_for_review" && !approved) {
      entry = line("due", document.can_edit ? "Awaiting your review" : "Awaiting review", newest?.uploaded_at, serviceNote());
      if (document.can_edit) yoursToReview += 1;
    } else if (stage === "failed") {
      entry = line("delayed", "Extraction failed", newest?.uploaded_at,
        uploadNote(`fail-${document.id}`, newest?.error ? `The file could not be read: ${newest.error}` : "The file could not be read."));
    } else if (stage === "quarantined") {
      entry = line("delayed", "Quarantined by the scanner", newest?.uploaded_at,
        uploadNote(`fail-${document.id}`, "The malware scanner held it back; it was never read."));
    } else if (stage && stage in READING) {
      entry = line("running", READING[stage] ?? "Reading", newest?.uploaded_at);
    } else if (active?.indexing_error) {
      entry = line("delayed", "Index build failed", active.built_at ?? active.approved_at,
        uploadNote(`fail-${document.id}`, `Its search index could not be built: ${active.indexing_error}`));
    }
    if (entry) lines.push(entry);
  }

  lines.sort(byRank);
  const due = lines.filter((item) => item.rank === "due").length;
  const delayed = lines.filter((item) => item.rank === "delayed").length;
  if (latest) {
    notes.push({
      id: "latest",
      text: `Latest publication: ‘${latest.title}’ version ${latest.version ?? "?"}, approved by ${latest.by} on ${formatDay(latest.at)}.`,
    });
  }

  return {
    lines,
    notes: inReadingOrder(notes, latest ? "latest" : undefined, lines),
    totals: [
      { key: "service", label: "In service", value: count(inService, "document") },
      { key: "withdrawn", label: "Withdrawn", value: count(withdrawn, "document") },
    ],
    edition: latest
      ? { text: `Edition of ${formatDay(latest.at)} · ${count(inService, "document")} in service`, note: "latest" }
      : { text: "Nothing published yet. Requirement work can cite only what is published here." },
    next: yoursToReview > 0
      ? { to: "/library", label: `${count(yoursToReview, "document")} ${yoursToReview === 1 ? "awaits" : "await"} your review` }
      : due > 0
        ? { to: "/library", label: `${count(due, "document")} ${due === 1 ? "awaits its owner's" : "await their owners'"} review` }
        : delayed > 0
          ? { to: "/library", label: `${count(delayed, "upload")} ${delayed === 1 ? "needs" : "need"} attention` }
          : { label: "Nothing in the library awaits a curator." },
    extent: { value: documents.length, label: count(documents.length, "document") },
  };
}

// Table 2 ----------------------------------------------------------------------

export function architectureOverview(
  releases: Release[],
  active: Release | null,
  suggestions: Map<string, CatalogueSuggestions>,
  nameOf: NameOf,
): Overview {
  const drafts = releases.filter((release) => release.status === "draft");
  const notes: DerivedNote[] = [];
  if (active) {
    notes.push({
      id: "edition",
      text: `Published by ${nameOf(active.published_by)} on ${formatDay(active.published_at)}, revision ${active.revision}. Requirement work maps new requirements against this edition.`,
    });
  }
  let pendingTotal = 0;
  const lines = drafts.map((draft): Line => {
    const reading = suggestions.get(draft.id);
    const pending = (reading?.suggestions ?? []).filter((item) => item.status === "proposed").length;
    pendingTotal += pending;
    const note = `draft-${draft.id}`;
    notes.push({
      id: note,
      text: `Prepared by ${nameOf(draft.created_by)}, now at revision ${draft.revision}. ${count(reading?.runs.length ?? 0, "catalogue reading")} proposed ${count(reading?.suggestions.length ?? 0, "suggestion")}; each waits for a curator's decision.`,
    });
    return {
      note,
      key: draft.id,
      rank: pending > 0 ? "due" : "service",
      name: draft.name ?? "Unnamed draft",
      cells: {
        status: pending > 0 ? `${count(pending, "suggestion")} to decide` : "Ready to review and publish",
        preparedBy: nameOf(draft.created_by),
        systems: String(draft.systems.length),
        revision: `r${draft.revision}`,
      },
    };
  }).sort(byRank);

  const pendingDrafts = lines.filter((line) => line.rank === "due");
  return {
    lines,
    notes: inReadingOrder(notes, active ? "edition" : undefined, lines),
    totals: active
      ? [
          { key: "systems", label: "Systems", value: String(active.systems.length) },
          { key: "relationships", label: "Relationships", value: String(active.relationships.length) },
          { key: "domains", label: "Capability domains", value: String(active.capability_domains?.length ?? 0) },
          { key: "journeys", label: "Journeys", value: String(active.journeys?.length ?? 0) },
        ]
      : [],
    edition: active
      ? { text: `Edition ‘${active.name ?? active.id}’ in force`, note: "edition" }
      : { text: "No edition is in force. Requirement work maps against nothing until a release is published." },
    next: pendingTotal > 0
      ? {
          to: pendingDrafts.length === 1 && pendingDrafts[0] ? draftSuggestions(pendingDrafts[0].key) : "/architecture/versions",
          label: pendingDrafts.length === 1
            ? `${count(pendingTotal, "suggestion")} to decide in ‘${pendingDrafts[0]?.name}’`
            : `${count(pendingTotal, "suggestion")} to decide across ${count(pendingDrafts.length, "draft")}`,
        }
      : drafts.length > 0
        ? {
            to: drafts.length === 1 && drafts[0] ? draftSuggestions(drafts[0].id) : "/architecture/versions",
            label: `${count(drafts.length, "draft release")} ${drafts.length === 1 ? "awaits" : "await"} publication`,
          }
        : { label: "Nothing in the architecture catalogue awaits a curator." },
    extent: { value: active?.systems.length ?? 0, label: count(active?.systems.length ?? 0, "system") },
  };
}

/** Where a draft is worked on: its sources, documents and suggestions. */
const draftSuggestions = (releaseId: string) => `/architecture/versions/${encodeURIComponent(releaseId)}/sources`;

// Table 3 ----------------------------------------------------------------------

const SHOWN_UNOWNED = 8;

export function squadOverview(
  organisation: Organisation,
  active: Release | null,
  audit: OrganisationAuditEvent[],
  nameOf: NameOf,
): Overview {
  const owner = new Map<string, string>();
  for (const squad of organisation.squads) {
    for (const held of squad.systems) owner.set(held.system_id, squad.name);
  }
  const systems = active?.systems ?? [];
  const lines: Line[] = [];
  const unowned = systems.filter((system) => !owner.has(system.id));
  for (const system of unowned.slice(0, SHOWN_UNOWNED)) {
    lines.push({
      key: system.id,
      rank: "due",
      name: system.name,
      nameAr: system.name_ar,
      cells: { id: system.id },
    });
  }

  const latest = [...audit].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const notes: DerivedNote[] = latest
    ? [{
        id: "audit",
        text: `Last change: ${latest.action.replace(/[._]/g, " ")} by ${nameOf(latest.actor_id)} on ${formatDay(latest.created_at)}.`,
      }]
    : [];
  const activePeople = organisation.people.filter((person) => person.active).length;
  const hidden = unowned.length - Math.min(unowned.length, SHOWN_UNOWNED);
  return {
    lines,
    more: hidden > 0 ? `and ${count(hidden, "more system")} with no owning squad` : undefined,
    notes,
    totals: [
      { key: "squads", label: "Squads", value: String(organisation.squads.length) },
      { key: "streams", label: "Value streams", value: String(organisation.value_streams.length) },
      { key: "products", label: "Products", value: String(organisation.products.length) },
      { key: "people", label: "People", value: String(activePeople) },
    ],
    edition: {
      text: `${count(organisation.squads.length, "squad")} owning ${count(owner.size, "system")}${active ? ` of the ${systems.length} in force (Table 2)` : ""}`,
      note: latest ? "audit" : undefined,
    },
    next: unowned.length > 0
      ? { to: "/squads", label: `${count(unowned.length, "system")} in force ${unowned.length === 1 ? "has" : "have"} no owning squad` }
      : { label: active ? "Every system in force has an owning squad." : "No edition is in force, so no system needs an owner yet." },
    extent: { value: organisation.squads.length, label: count(organisation.squads.length, "squad") },
  };
}
