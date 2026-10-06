/**
 * What each table on the home says, derived from the API's answers alone.
 *
 * Pure functions, so the rules that decide what needs a curator are tested
 * without a browser: a document awaits review when its newest version has been
 * read and no publication was approved from it (a version's ingestion stage
 * stays "ready_for_review" after approval, so the stage alone cannot say); a catalogue draft needs someone while it
 * holds proposed suggestions, and is disrupted when its build or a reading failed; a system needs an owner when no
 * squad holds it; and requirement work's corpus needs someone when indexing stopped or a finding has stood a month.
 */
import type {
  Actor,
  ArchitectureJob,
  CatalogueSuggestions,
  DocumentExtraction,
  LibraryDocument,
  Organisation,
  OrganisationAuditEvent,
  Release,
  RequirementCorpus,
} from "../api/client";
import { jobReason, reading } from "../catalogue/suggestions";
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
  /** A secondary fact kept under the status (the Kept Column Rule). */
  statusDetail?: string;
};

export type DerivedNote = { id: string; text: string };
export type Next = { to?: string; href?: string; leaves?: string; label: string };

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
  /** The table's most pressing state, said in the index of tables; none when quiet. */
  alert?: { rank: Rank; text: string };
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

/** The newest of some ISO moments, or null when none is known. */
function latestOf(moments: (string | null | undefined)[]): string | null {
  return moments.reduce<string | null>((latest, at) => (at && (!latest || at > latest) ? at : latest), null);
}

/** Freshness: when a table's body last changed, said once on its edition line. */
function lastChange(at: string | null, what?: string): string {
  return at ? ` · last change ${formatDay(at)}${what ? `, ${what}` : ""}` : "";
}

/** The index's clause for a table: its disruptions first, else what is due. */
function alertOf(delayed: string | null, due: string | null): Overview["alert"] {
  return delayed ? { rank: "delayed", text: delayed } : due ? { rank: "due", text: due } : undefined;
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
  const changed = latestOf(documents.flatMap((document) => [
    ...document.versions.map((version) => version.uploaded_at),
    ...document.publications.flatMap((item) => [item.approved_at, item.activated_at, item.built_at, item.withdrawn_at]),
  ]));
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
      { key: "service", label: "In service", value: String(inService) },
      { key: "withdrawn", label: "Withdrawn", value: String(withdrawn) },
    ],
    edition: latest
      ? { text: `Edition of ${formatDay(latest.at)} · ${count(inService, "document")} in service${lastChange(changed)}`, note: "latest" }
      : { text: `Nothing published yet. Requirement work can cite only what is published here.${changed ? ` Last change ${formatDay(changed)}.` : ""}` },
    next: yoursToReview > 0
      ? { to: "/library", label: `${count(yoursToReview, "document")} ${yoursToReview === 1 ? "awaits" : "await"} your review` }
      : due > 0
        ? { to: "/library", label: `${count(due, "document")} ${due === 1 ? "awaits its owner's" : "await their owners'"} review` }
        : delayed > 0
          ? { to: "/library", label: `${count(delayed, "upload")} ${delayed === 1 ? "needs" : "need"} attention` }
          : { label: "Nothing in the library awaits a curator." },
    extent: { value: documents.length, label: count(documents.length, "document") },
    alert: alertOf(
      delayed > 0 ? `${delayed} ${delayed === 1 ? "needs" : "need"} attention` : null,
      due > 0 ? `${due} to review` : null,
    ),
  };
}

// Table 2 ----------------------------------------------------------------------

/** A draft's latest index build and its documents' latest readings. */
export type DraftJobs = { build: ArchitectureJob | null; extractions: DocumentExtraction[] };

type DraftFailure = { status: string; detail: string; failedReadings: number; build: boolean };

/** What failed on a draft, in a status cell's words and its note's; null when nothing did. */
function draftFailure(draft: Release, jobs: DraftJobs | undefined): DraftFailure | null {
  if (!jobs) return null;
  const build = jobs.build?.status === "failed";
  const readings = jobs.extractions.filter((item) => item.job.status === "failed");
  if (!build && readings.length === 0) return null;
  const documentName = (versionId: string) => {
    const document = draft.documents?.find((item) => item.id === versionId);
    return document ? `‘${document.title || document.filename}’` : "A document";
  };
  const why = [
    ...readings.map((item) =>
      `${documentName(item.document_version_id)} could not be read: ${reading(item.job).label.replace(/^Reading failed: /, "")}.`),
    ...(build ? [`Its evidence index could not be built: ${jobReason(jobs.build?.error_category)}.`] : []),
  ];
  const status = build && readings.length > 0
    ? `Build and ${count(readings.length, "reading")} failed`
    : build
      ? "Index build failed"
      : `${count(readings.length, "reading")} failed`;
  return { status, detail: why.join(" "), failedReadings: readings.length, build };
}

export function architectureOverview(
  releases: Release[],
  active: Release | null,
  suggestions: Map<string, CatalogueSuggestions>,
  nameOf: NameOf,
  /** Each draft's builds and readings, when the reader may see them; failures are then disruptions. */
  jobs: Map<string, DraftJobs> | null = null,
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
  const failures = new Map(drafts.map((draft) => [draft.id, draftFailure(draft, jobs?.get(draft.id))]));
  const lines = drafts.map((draft): Line => {
    const read = suggestions.get(draft.id);
    const pending = (read?.suggestions ?? []).filter((item) => item.status === "proposed").length;
    pendingTotal += pending;
    const failure = failures.get(draft.id) ?? null;
    const note = `draft-${draft.id}`;
    notes.push({
      id: note,
      text: `Prepared by ${nameOf(draft.created_by)}, now at revision ${draft.revision}. ${count(read?.runs.length ?? 0, "catalogue reading")} proposed ${count(read?.suggestions.length ?? 0, "suggestion")}; each waits for a curator's decision.${failure ? ` ${failure.detail}` : ""}`,
    });
    const toDecide = pending > 0 ? `${count(pending, "suggestion")} to decide` : null;
    return {
      note,
      key: draft.id,
      rank: failure ? "delayed" : pending > 0 ? "due" : "service",
      name: draft.name ?? "Unnamed draft",
      // A failure takes the status; what it would have said stays under it.
      statusDetail: failure && toDecide ? toDecide : undefined,
      cells: {
        // Without its builds and readings in view, a settled draft is not called ready.
        status: failure ? failure.status : toDecide ?? (jobs ? "Ready to review and publish" : "No suggestions to decide"),
        preparedBy: nameOf(draft.created_by),
        systems: String(draft.systems.length),
        revision: `r${draft.revision}`,
      },
    };
  }).sort(byRank);

  const pendingDrafts = lines.filter((line) => line.rank === "due");
  const failedDrafts = lines.filter((line) => line.rank === "delayed");
  const firstFailed = failedDrafts[0];
  const firstFailure = firstFailed ? failures.get(firstFailed.key) ?? null : null;

  // The newest change anywhere in the catalogue: a publication, or a reading in a draft.
  const published = latestOf(releases.map((release) => release.published_at));
  let readAt: string | null = null;
  let readIn: string | null = null;
  for (const draft of drafts) {
    const at = latestOf(suggestions.get(draft.id)?.runs.map((run) => run.created_at) ?? []);
    if (at && (!readAt || at > readAt)) [readAt, readIn] = [at, draft.name ?? "an unnamed draft"];
  }
  const changed = readAt && (!published || readAt > published)
    ? { at: readAt, what: `a reading in ‘${readIn}’` }
    : published ? { at: published, what: "a publication" } : null;

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
      ? { text: `Edition ‘${active.name ?? active.id}’ in force${lastChange(changed?.at ?? null, changed?.what)}`, note: "edition" }
      : {
          text: `No edition is in force. Requirement work maps against nothing until a release is published.${
            changed ? ` Last change ${formatDay(changed.at)}, ${changed.what}.` : ""}`,
        },
    next: firstFailed && firstFailure
      ? failedDrafts.length > 1
        ? { to: "/architecture/versions", label: `Mend the failed work in ${count(failedDrafts.length, "draft")}` }
        : firstFailure.failedReadings > 0
          ? {
              // Readings are redone on Sources, where their documents are; a build waits for them.
              to: draftSuggestions(firstFailed.key),
              label: `Read ${count(firstFailure.failedReadings, "document")} again in ‘${firstFailed.name}’${firstFailure.build ? ", then rebuild" : ""}`,
            }
          : { to: draftCheck(firstFailed.key), label: `Rebuild the evidence index of ‘${firstFailed.name}’` }
      : pendingTotal > 0
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
    alert: alertOf(
      failedDrafts.length > 0 ? `${count(failedDrafts.length, "draft")} failed` : null,
      pendingTotal > 0 ? `${pendingTotal} to decide` : null,
    ),
  };
}

/** Where a draft is worked on: its sources, documents and suggestions. */
const draftSuggestions = (releaseId: string) => `/architecture/versions/${encodeURIComponent(releaseId)}/sources`;
/** Where a draft's evidence index is built and checked. */
const draftCheck = (releaseId: string) => `/architecture/versions/${encodeURIComponent(releaseId)}/check`;

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
        text: `The last change: ${latest.action.replace(/[._]/g, " ")}, by ${nameOf(latest.actor_id)}.`,
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
      text: `${count(organisation.squads.length, "squad")} owning ${count(owner.size, "system")}${active ? ` of the ${systems.length} in force (Table 2)` : ""}${lastChange(latest?.created_at ?? null)}`,
      note: latest ? "audit" : undefined,
    },
    next: unowned.length > 0
      ? { to: "/squads", label: `${count(unowned.length, "system")} in force ${unowned.length === 1 ? "has" : "have"} no owning squad` }
      : { label: active ? "Every system in force has an owning squad." : "No edition is in force, so no system needs an owner yet." },
    extent: { value: organisation.squads.length, label: count(organisation.squads.length, "squad") },
    alert: alertOf(null, unowned.length > 0 ? `${unowned.length} with no squad` : null),
  };
}

// Table 4 ----------------------------------------------------------------------

/** Requirement work, where its owners act on what Table 4 reports. */
export const REQUIREMENT_WORK_LEAVES = "opens requirement work";

/**
 * Requirement work's corpus, in counts (requirement-portal ADR-0099, Amendment 1). Its teams
 * decide findings and retry indexing there, so the table's next decision leads there.
 */
export function requirementOverview(corpus: RequirementCorpus, requirementWork: string): Overview {
  const ages = corpus.open_findings;
  const open = ages.under_7_days + ages.from_7_to_30_days + ages.over_30_days;
  const notes: DerivedNote[] = [{
    id: "source",
    text: "Requirement work keeps the requirements and their findings, and answers in counts, never naming a requirement. The figures are as of the time in the masthead.",
  }];
  const lines: Line[] = [];
  const row = (key: string, rank: Rank, name: string, status: string, value: number, note?: string) =>
    lines.push({ key, rank, name, cells: { status, count: String(value) }, note });

  if (corpus.rebuild_required) {
    notes.push({
      id: "rebuild",
      text: "The embedding model changed. Until the index is rebuilt in requirement work, no requirement is screened against the others.",
    });
    lines.push({ key: "rebuild", rank: "delayed", name: "Requirement index", cells: { status: "Rebuild required", count: "—" }, note: "rebuild" });
  }
  if (corpus.failed > 0) {
    notes.push({
      id: "failed",
      text: "Indexing stops after three failed attempts on the same change. The requirement's team retries it from the requirement, or a later change starts it afresh.",
    });
    row("failed", "delayed", "Requirements that stopped indexing", "Indexing failed", corpus.failed, "failed");
  }
  if (ages.over_30_days > 0) {
    notes.push({
      id: "findings",
      text: "A possible duplicate or contradiction stays open until the requirements' owners decide it on the Knowledge step. One left over a month is overdue.",
    });
    row("over30", "delayed", "Findings open over 30 days", "Overdue", ages.over_30_days, "findings");
  }
  if (ages.from_7_to_30_days > 0) row("over7", "due", "Findings open 7 to 30 days", "Awaiting owners", ages.from_7_to_30_days);
  // A finding this week is screening at its normal pace: in progress, not yet anyone's concern.
  if (ages.under_7_days > 0) row("recent", "running", "Findings open under 7 days", "With their owners", ages.under_7_days);
  if (corpus.waiting > 0) row("waiting", "running", "Requirements waiting to be indexed", "Indexing", corpus.waiting);

  const present = (items: (string | null)[]) => items.filter((item): item is string => item !== null);
  const troubles = present([
    corpus.failed > 0 ? `the ${count(corpus.failed, "requirement")} that stopped indexing` : null,
    ages.over_30_days > 0 ? `the ${count(ages.over_30_days, "overdue finding")}` : null,
  ]);
  // The index's clause: the same troubles, as short as a timetable's margin note.
  const brief = present([
    corpus.failed > 0 ? `${corpus.failed} stopped indexing` : null,
    ages.over_30_days > 0 ? `${ages.over_30_days} overdue` : null,
  ]);
  const leave = (label: string): Next => ({ href: requirementWork, leaves: REQUIREMENT_WORK_LEAVES, label });

  return {
    lines,
    notes: inReadingOrder(notes, "source", lines),
    totals: [
      { key: "requirements", label: "Requirements", value: String(corpus.requirements) },
      { key: "current", label: "Indexed and current", value: String(corpus.current) },
      { key: "duplicates", label: "Of them closed as duplicates", value: String(corpus.duplicates) },
      { key: "open", label: "Open findings", value: String(open) },
    ],
    edition: {
      text: corpus.rebuild_required
        ? `${count(corpus.requirements, "requirement")} · the index must be rebuilt`
        : `${count(corpus.requirements, "requirement")}, ${corpus.current} indexed and current`,
      note: "source",
    },
    next: corpus.rebuild_required
      ? leave("Rebuild the requirement index in requirement work")
      : troubles.length > 0
        ? leave(`See to ${troubles.join(" and ")} in requirement work`)
        : ages.from_7_to_30_days > 0
          ? leave(`${count(ages.from_7_to_30_days, "finding")} ${ages.from_7_to_30_days === 1 ? "awaits its" : "await their"} owners in requirement work`)
          : { label: "Nothing in requirement knowledge awaits anyone." },
    extent: { value: corpus.requirements, label: count(corpus.requirements, "requirement") },
    alert: alertOf(
      corpus.rebuild_required ? "rebuild required" : brief.length > 0 ? brief.join(", ") : null,
      ages.from_7_to_30_days > 0 ? `${count(ages.from_7_to_30_days, "finding")} awaiting owners` : null,
    ),
  };
}
