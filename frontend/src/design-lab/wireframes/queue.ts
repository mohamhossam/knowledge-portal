/**
 * The one priority function behind "Your work" and the rail's count
 * (interaction model §15, IA §3): both read these entries, so they can't
 * disagree. Order: Needs attention → Decisions → Re-confirmations → Gaps.
 */
import { suggestionState } from "../../catalogue/suggestions";
import { docState, gaps, useActiveRelease, useDocuments, useOrganisation, useReleases, useReminders, useSuggestions } from "./data";
import { useLab, wf } from "./lab-context";

export type Entry =
  | { kind: "unreadable"; id: string; mine: boolean; subject: string; to: string }
  | { kind: "job-failed"; id: string; mine: boolean; subject: string; job: string; cause?: string; to: string }
  | { kind: "review"; id: string; mine: boolean; subject: string; to: string }
  | { kind: "suggestions"; id: string; mine: boolean; subject: string; count: number; to: string }
  | { kind: "due"; id: string; mine: boolean; subject: string; what: string; when: string; simulated: boolean; to: string }
  | { kind: "gaps"; id: string; mine: boolean; subject: string; count: number; to: string };

export type SectionKey = "attention" | "decisions" | "due" | "gaps";

/** Simulated due items, only under the "due-items" scenario (the seed has none). */
export const SIMULATED_DUE = [
  { id: "sim-1", title: "XGPON coverage rules (sample)", kind: "document", when: "Overdue since 30 Sep" },
  { id: "sim-2", title: "CWOM", kind: "system", when: "Due 14 Oct" },
];

export function useWorkQueue() {
  const lab = useLab();
  const documents = useDocuments();
  const releases = useReleases();
  const active = useActiveRelease();
  const organisation = useOrganisation();
  const reminders = useReminders();
  const draft = releases.data?.find((release) => release.status === "draft");
  const suggestions = useSuggestions(draft?.id);
  const docs = documents.data ?? [];

  const attention: Entry[] = [
    ...docs
      .filter((doc) => ["attention", "held"].includes(docState(doc)))
      .map((doc): Entry => ({ kind: "unreadable", id: `doc-${doc.id}`, mine: doc.is_owner, subject: doc.title, to: wf(`/library/${doc.id}`) })),
    ...lab.jobs
      .filter((job) => job.state === "attention")
      .map((job): Entry => ({ kind: "job-failed", id: job.id, mine: true, subject: job.subject, job: job.kind, cause: job.cause, to: job.to ?? wf() })),
  ];

  const toDecide = (suggestions.data?.suggestions ?? []).filter((item) => suggestionState(item) === "decide").length;
  const decisions: Entry[] = [
    ...docs
      .filter((doc) => docState(doc) === "review")
      .map((doc): Entry => ({ kind: "review", id: `rev-${doc.id}`, mine: doc.is_owner, subject: doc.title, to: wf(`/library/${doc.id}`) })),
    ...(draft && toDecide > 0
      ? [{ kind: "suggestions", id: `draft-${draft.id}`, mine: true, subject: draft.name ?? "the draft", count: toDecide, to: wf(`/architecture/versions/${draft.id}/decide`) } satisfies Entry]
      : []),
  ];

  const due: Entry[] = [
    ...(reminders.data?.items ?? []).map((item) => ({ id: item.id, title: item.title, kind: item.kind, when: `Due ${item.standing.due_at.slice(0, 10)}`, simulated: false })),
    ...(lab.scenario === "due-items" ? SIMULATED_DUE.map((item) => ({ ...item, simulated: true })) : []),
  ].map((item): Entry => ({ kind: "due", id: `due-${item.id}`, mine: true, subject: item.title, what: item.kind, when: item.when, simulated: item.simulated, to: wf("/re-confirmations") }));

  const gapList = gaps(active.data, organisation.data);
  const gapEntries: Entry[] = gapList.length
    ? [{ kind: "gaps", id: "gaps", mine: true, subject: gapList[0]!.system.name, count: gapList.length, to: wf("/ownership") }]
    : [];

  const sections: Record<SectionKey, Entry[]> = { attention, decisions, due, gaps: gapEntries };
  const mine = Object.values(sections).flat().filter((entry) => entry.mine).length;
  return {
    sections,
    mine,
    loading: documents.isPending || releases.isPending || organisation.isPending,
    summary: {
      inService: docs.filter((doc) => docState(doc) === "service").length,
      activeName: active.data?.name ?? "—",
      hasDraft: Boolean(draft),
      squads: organisation.data?.squads.length ?? 0,
    },
  };
}
