/**
 * The one priority function behind "Your work" and the rail's count
 * (interaction model §15, IA §3): both read these entries, so they can't
 * disagree. Order: Needs attention → Decisions → Re-confirmations → Gaps.
 *
 * It reads the same queries as the pages it points at (same keys), so the
 * cache is shared and nothing is fetched twice.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api, type LibraryDocument, type Organisation, type Release, type Reminders, type Suggestion } from "../api/client";
import { suggestionState } from "../catalogue/suggestions";
import { formatDay } from "../home/format";
import { docState } from "../library/docState";
import { newestVersion, standing } from "../library/model";
import { REMINDERS_KEY } from "../reviews/review";
import { gaps } from "../squads/gaps";

/**
 * Where each kind of entry is decided. The areas that move these pages
 * (3 catalogue curation, 6 re-confirmations, 7 ownership) update this map.
 */
export const WORK_ROUTES = {
  document: (id: string) => `/library/${id}`,
  decide: (releaseId: string) => `/architecture/versions/${releaseId}/sources`,
  reConfirmations: "/reminders",
  gaps: "/squads",
};

/** What a document row can say about its newest version (all from the list read). */
export type VersionFacts = {
  number: number;
  /** A version of it is already in service: this one would replace it. */
  replaces: number | null;
  fileType: string;
  passages: number;
  flagged: number;
  blocking: number;
};

export type Entry =
  | { kind: "unreadable"; id: string; mine: boolean; subject: string; cause: string | null; held: boolean; sinceAt: string; fileType: string; to: string }
  | { kind: "unsearchable"; id: string; mine: boolean; subject: string; sinceAt: string; to: string }
  | { kind: "review"; id: string; mine: boolean; subject: string; owner: string; since: string; sinceAt: string; facts: VersionFacts; to: string }
  | { kind: "suggestions"; id: string; mine: boolean; subject: string; count: number; to: string }
  | { kind: "due"; id: string; mine: boolean; subject: string; what: "document" | "system"; overdue: boolean; when: string; to: string }
  /** A standing backlog: listed, but not counted in the rail's "need you" (it rarely empties). */
  | { kind: "gaps"; id: string; mine: boolean; subject: string; count: number; to: string };

export type SectionKey = "attention" | "decisions" | "due" | "gaps";
export type Sections = Record<SectionKey, Entry[]>;

export type QueueInput = {
  documents: LibraryDocument[];
  releases: Release[];
  active: Release | null;
  suggestions: Suggestion[];
  organisation: Organisation | undefined;
  reminders: Reminders | undefined;
};

const FILE_TYPES: [RegExp, string][] = [
  [/pdf/, "PDF"],
  [/wordprocessingml|msword/, "Word"],
  [/spreadsheetml|ms-excel/, "Excel"],
  [/presentationml|powerpoint/, "PowerPoint"],
  [/csv/, "CSV"],
  [/markdown/, "Markdown"],
  [/^text\//, "Text"],
];

export function fileType(mime: string | null | undefined): string {
  return FILE_TYPES.find(([pattern]) => pattern.test(mime ?? ""))?.[1] ?? "File";
}

function facts(doc: LibraryDocument): VersionFacts {
  const version = newestVersion(doc);
  const current = standing(doc);
  return {
    number: version?.number ?? 1,
    replaces: current.kind === "service" && current.versionNumber !== version?.number ? current.versionNumber ?? null : null,
    fileType: fileType(version?.mime_type),
    passages: version?.blocks?.length ?? 0,
    flagged: version?.warnings?.length ?? 0,
    blocking: version?.blocking_warnings?.length ?? 0,
  };
}

/** Pure: the ranked sections from what the queries returned. */
export function workQueue(input: QueueInput): Sections {
  const attention: Entry[] = input.documents
    .filter((doc) => docState(doc) === "attention" || docState(doc) === "held")
    .map((doc): Entry => {
      const base = { id: `doc-${doc.id}`, mine: doc.is_owner, subject: doc.title, sinceAt: newestVersion(doc)?.uploaded_at ?? "", to: WORK_ROUTES.document(doc.id) };
      // Approved, but indexing stopped after three tries: not citable until it is made searchable.
      if (standing(doc).kind === "indexing") return { kind: "unsearchable", ...base };
      // The service's reading errors are written to be read (unsupported file, timeout, a bad delimiter).
      const cause = newestVersion(doc)?.error?.trim() || null;
      return { kind: "unreadable", ...base, cause, held: docState(doc) === "held", fileType: fileType(newestVersion(doc)?.mime_type) };
    });

  const draft = input.releases.find((release) => release.status === "draft");
  const toDecide = input.suggestions.filter((item) => item.status === "proposed" && suggestionState(item) === "decide").length;
  const decisions: Entry[] = [
    // Most urgent first: what blocks approval, then what is flagged, then the longest wait.
    ...input.documents
      .filter((doc) => docState(doc) === "review")
      .map((doc): Entry => {
        const sinceAt = newestVersion(doc)?.uploaded_at ?? "";
        return { kind: "review", id: `rev-${doc.id}`, mine: doc.is_owner, subject: doc.title, owner: doc.owner.display_name, since: formatDay(sinceAt), sinceAt, facts: facts(doc), to: WORK_ROUTES.document(doc.id) };
      })
      .sort((a, b) => {
        if (a.kind !== "review" || b.kind !== "review") return 0;
        return Number(b.facts.blocking > 0) - Number(a.facts.blocking > 0)
          || Number(b.facts.flagged > 0) - Number(a.facts.flagged > 0)
          || a.sinceAt.localeCompare(b.sinceAt);
      }),
    ...(draft && toDecide > 0
      ? [{ kind: "suggestions", id: `draft-${draft.id}`, mine: true, subject: draft.name ?? "the draft", count: toDecide, to: WORK_ROUTES.decide(draft.id) } satisfies Entry]
      : []),
  ];

  // The reminders read lists what the signed-in person answers for: all of it is theirs.
  // Overdue first, then by due date.
  const due: Entry[] = [...(input.reminders?.items ?? [])]
    .filter((item) => item.standing.state !== "current")
    .sort((a, b) => Number(b.standing.state === "overdue") - Number(a.standing.state === "overdue") || a.standing.due_at.localeCompare(b.standing.due_at))
    .map((item) => ({
      kind: "due",
      id: `due-${item.kind}-${item.id}`,
      mine: true,
      subject: item.title,
      what: item.kind,
      overdue: item.standing.state === "overdue",
      when: formatDay(item.standing.due_at),
      to: WORK_ROUTES.reConfirmations,
    }));

  const gapList = gaps(input.active, input.organisation);
  const gapEntries: Entry[] = gapList.length
    ? [{ kind: "gaps", id: "gaps", mine: true, subject: gapList[0]!.system.name, count: gapList.length, to: WORK_ROUTES.gaps }]
    : [];

  return { attention, decisions, due, gaps: gapEntries };
}

function nextDue(reminders: Reminders | undefined): string | null {
  const ahead = (reminders?.items ?? []).filter((item) => item.standing.state === "current").map((item) => item.standing.due_at).sort();
  return ahead[0] ? formatDay(ahead[0]) : null;
}

/**
 * The rail's "need you" count: the signed-in person's entries, without the
 * standing gaps backlog, so the count can reach zero on a good day.
 */
export function mineCount(sections: Sections): number {
  return [...sections.attention, ...sections.decisions, ...sections.due].filter((entry) => entry.mine).length;
}

/** The queries behind the queue, keyed as the pages that own them key them. */
export function useWorkQueue() {
  const documents = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments });
  const releases = useQuery({ queryKey: ["architecture", "releases"], queryFn: api.releases });
  const active = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease });
  const organisation = useQuery({ queryKey: ["organisation"], queryFn: api.organisation });
  const reminders = useQuery({ queryKey: REMINDERS_KEY, queryFn: api.reminders, refetchInterval: 5 * 60_000 });
  const draft = releases.data?.find((release) => release.status === "draft");
  const suggestions = useQuery({
    queryKey: ["architecture", "releases", draft?.id ?? "", "suggestions"],
    queryFn: () => api.suggestions(draft!.id),
    enabled: Boolean(draft),
  });

  // Rebuilt only when a read's data changes (TanStack keeps unchanged data referentially stable).
  const sections = useMemo(
    () => workQueue({
      documents: documents.data ?? [],
      releases: releases.data ?? [],
      active: active.data ?? null,
      suggestions: suggestions.data?.suggestions ?? [],
      organisation: organisation.data,
      reminders: reminders.data,
    }),
    [documents.data, releases.data, active.data, suggestions.data, organisation.data, reminders.data],
  );
  const reads = [documents, releases, active, organisation, reminders, suggestions];
  return {
    sections,
    mine: mineCount(sections),
    loading: documents.isPending || releases.isPending || organisation.isPending,
    retrying: reads.some((read) => read.isError && read.isFetching),
    /** Sections whose reads are still in flight: they show a skeleton, never "nothing". */
    pending: {
      attention: documents.isPending,
      decisions: documents.isPending || releases.isPending || (Boolean(draft) && suggestions.isPending),
      due: reminders.isPending,
      gaps: active.isPending || organisation.isPending,
    } satisfies Record<SectionKey, boolean>,
    /** Which sections' reads failed, so a section can say so instead of showing "nothing". */
    failed: {
      attention: documents.isError,
      decisions: documents.isError || releases.isError || suggestions.isError,
      due: reminders.isError,
      gaps: active.isError || organisation.isError,
    } satisfies Record<SectionKey, boolean>,
    retry: () => reads.forEach((read) => {
      if (read.isError) void read.refetch();
    }),
    summary: {
      // Each is null while its read is pending or failed: unknown, never 0.
      // In service by standing: a document with a newer version under review is still in service.
      inService: documents.data ? documents.data.filter((doc) => standing(doc).kind === "service").length : null,
      /** The version in service: its name, "none" when there is none yet, null while unknown. */
      active: active.isSuccess ? (active.data ? (active.data.name ?? "—") : "none") : null,
      hasDraft: Boolean(draft),
      squads: organisation.data ? organisation.data.squads.length : null,
      /** The earliest re-confirmation still ahead, for "Nothing needs you. Next re-confirmation: …". */
      nextDue: nextDue(reminders.data),
    },
  };
}
