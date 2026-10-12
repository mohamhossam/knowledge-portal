import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { api, type ImpactComparison, type Release } from "../../api/client";
import type { Step, StatusTone } from "../../design/components";
import { count } from "../../home/format";
import { buildState } from "../drafting";
import { type Reading, reading, tally } from "../suggestions";
import { useBuild } from "../useEditing";

/** The draft workflow's steps, in the order the work goes (redesign phase 3). */
export const DRAFT_STEPS = [
  { id: "sources", label: "Sources" },
  { id: "decide", label: "Decide" },
  { id: "changes", label: "Changes" },
  { id: "check", label: "Check" },
  { id: "publish", label: "Publish" },
] as const;

export type DraftStep = (typeof DRAFT_STEPS)[number]["id"];

/** The step a catalogue address opens, if it is one of a draft's steps. */
export function draftStepOf(pathname: string, base: string): DraftStep | null {
  if (!pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length + 1).replace(/\/$/, "");
  return DRAFT_STEPS.find((step) => step.id === rest)?.id ?? null;
}

/** Where a draft's work stands, from the answers its steps already share. */
export function useDraftProgress(release: Release) {
  const draft = release.status === "draft";
  const suggestions = useQuery({
    queryKey: ["architecture", "releases", release.id, "suggestions"],
    queryFn: () => api.suggestions(release.id),
    enabled: draft,
  });
  const extractions = useQuery({
    queryKey: ["architecture", "releases", release.id, "extractions"],
    queryFn: () => api.extractions(release.id),
    enabled: draft,
  });
  const changes = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision],
    queryFn: () => api.releaseChanges(release.id),
    enabled: draft,
  });
  const build = useBuild(release);
  const counts = tally(suggestions.data?.suggestions ?? []);
  const readings = (extractions.data ?? []).map((item) => reading(item.job, extractions.dataUpdatedAt));
  const busy = readings.filter((item) => item.busy);
  const requests = new Set((suggestions.data?.runs ?? []).flatMap((run) => (run.change_request_id ? [run.change_request_id] : []))).size;
  return {
    suggestions,
    changes,
    counts,
    sources: release.documents.length + requests,
    reading: busy.length,
    readingLabel: readingWords(busy),
    stalled: busy.filter((item) => item.stalled).length,
    failed: readings.filter((item) => item.failed).length,
    build: buildState(release, build.job.data),
  };
}

export type DraftProgress = ReturnType<typeof useDraftProgress>;

/**
 * The readings under way in a few words: the one being read in its own words
 * ("Reading part 3 of 12"), with how many wait behind it.
 */
function readingWords(busy: Reading[]): string | null {
  const started = busy.filter((item) => !item.waiting);
  const waiting = busy.length - started.length;
  const lead = started.length === 1 ? started[0]?.label : started.length ? `${started.length} being read` : null;
  if (!lead) return waiting ? `${waiting} waiting to be read` : null;
  return waiting ? `${lead}, ${waiting} waiting` : lead;
}

const status = (tone: StatusTone, text: string) => ({ tone, text });

/** Each step with where it stands, in words, for the stepper. */
export function draftSteps(base: string, current: DraftStep | null, progress: DraftProgress): Step[] {
  const { counts } = progress;
  const said: Record<DraftStep, Step["status"]> = {
    sources: progress.failed
      ? status("attention", `${progress.failed} not read`)
      : progress.stalled
        ? status("warning", `${progress.stalled} stopped responding`)
        : progress.reading
          ? status("working", progress.readingLabel ?? `${progress.reading} being read`)
          : status("neutral", progress.sources ? count(progress.sources, "source") : "No source yet"),
    decide: !progress.suggestions.data
      ? undefined
      : counts.waiting
        ? status("held", `${counts.waiting.toLocaleString("en")} waiting`)
        : counts.all
          ? status("done", "All decided")
          : status("neutral", "Nothing to decide"),
    changes: progress.changes.data
      ? status("neutral", progress.changes.data.changes.length ? count(progress.changes.data.changes.length, "change") : "No change yet")
      : undefined,
    check: {
      built: status("done", "Built"),
      building: status("working", "Being built"),
      failed: status("attention", "Build failed"),
      stale: status("held", "Edited since built"),
      never: status("neutral", "Not built yet"),
    }[progress.build],
    publish: undefined,
  };
  return DRAFT_STEPS.map((step) => ({ href: `${base}/${step.id}`, label: step.label, current: step.id === current, status: said[step.id] }));
}

export type SampleResult = { comparison?: ImpactComparison; error?: unknown };

/** Results by draft and revision; a new revision starts afresh, as the comparisons no longer hold. */
const sampleResults = new Map<string, Record<string, SampleResult>>();
const listeners = new Set<() => void>();
const NONE: Record<string, SampleResult> = {};

/**
 * The samples compared against this draft at its revision, kept for the
 * session so Publish can say what Check found. Never sent anywhere.
 */
export function useSampleResults(release: Release) {
  const key = `${release.id}@${release.revision}`;
  const results = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => sampleResults.get(key) ?? NONE,
  );
  const record = useCallback((sample: string, result: SampleResult) => {
    sampleResults.set(key, { ...(sampleResults.get(key) ?? NONE), [sample]: result });
    for (const listener of listeners) listener();
  }, [key]);
  return { results, record };
}
