import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, type LibraryDocument } from "../api/client";
import type { Job } from "../design/components";
import { type JobAction, useJobActions } from "../library/actions";
import { newestState, settling } from "../library/model";
import { ATTEMPT_LIMIT } from "../library/publications";

function elapsed(from: number, to: number): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ${seconds % 60} s` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const clock = (at: number) => new Date(at).toTimeString().slice(0, 5);

/** A job as the shell lists it: the design system's job, and the library action behind its buttons. */
export type ShellJob = Omit<Job, "fix" | "onRetry" | "onCancel"> & {
  fixLabel?: string;
  /** What "Try again" does, when the signed-in person may do it. */
  retry?: JobAction;
  /** Whether "Stop" is offered (reading can be stopped; indexing can't). */
  stop?: boolean;
  document?: LibraryDocument;
};

/** Whether the list should keep asking: the library's own rule, for any of its documents. */
function anySettling(documents: LibraryDocument[] | undefined): boolean {
  return (documents ?? []).some(settling);
}

const DONE_FOR = 30 * 60_000;

/**
 * The Jobs panel's jobs (§6). The service has no list of jobs (BG1), so they
 * are derived from the documents: reading (with its attempts, Stop and Try
 * again), indexing for search, and what finished while this tab was open
 * (kept for 30 minutes). Each failure says its cause and offers the fix.
 */
export function useJobs() {
  // While something runs, the list is polled so a job settles (or fails) in view;
  // otherwise it is read as the library page reads it.
  const documents = useQuery({
    queryKey: ["library", "documents"],
    queryFn: api.libraryDocuments,
    refetchInterval: (query) => (anySettling(query.state.data) ? 3000 : false),
  });
  const actions = useJobActions();
  const active = anySettling(documents.data);
  // Elapsed times read a clock (a render must stay pure) that ticks only while something runs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, [active]);

  const jobs = (documents.data ?? []).flatMap((doc): ShellJob[] => {
    const version = newestState(doc);
    const jobs: ShellJob[] = [];
    if (!version) return jobs;
    const started = Date.parse(version.uploaded_at);
    const attempt = "attempt" in version && version.attempt > 1 ? `Attempt ${version.attempt} of ${ATTEMPT_LIMIT} · ` : "";
    const base = { id: `read-${doc.id}`, kind: "Reading", subject: doc.title, subjectHref: `/library/${doc.id}`, document: doc };
    if (version.stage === "failed") {
      jobs.push({
        ...base,
        state: "attention",
        timing: attempt ? attempt.replace(/ · $/, "") : undefined,
        cause: version.error ?? "The file couldn't be read.",
        retry: doc.can_edit ? "retry" : undefined,
        fixLabel: doc.is_owner ? "Upload a new version" : undefined,
      });
    } else if (version.stage === "quarantined") {
      jobs.push({ ...base, state: "held", cause: "The malware scan flagged it. It won't be read.", fixLabel: doc.is_owner ? "Upload a clean copy" : undefined });
    } else if (version.stage === "cancelled") {
      jobs.push({ ...base, state: "stopped", cause: "Reading was stopped before it finished.", retry: doc.can_edit ? "retry" : undefined });
    } else if (version.stage === "queued") {
      jobs.push({ ...base, state: "waiting", timing: `${attempt}Waiting to be read`, stop: doc.can_edit });
    } else if (version.stage === "scanning" || version.stage === "extracting") {
      const so = elapsed(started, now);
      jobs.push({
        ...base,
        state: "working",
        timing: `${attempt}${now - started > 60_000 ? `Still reading (${so}). You can leave this page; it carries on.` : `Reading… ${so}`}`,
        stop: doc.can_edit,
      });
    }
    // Indexing, from the publications themselves: a new version published over one in service
    // indexes while the old one stays in service, so the document's standing doesn't show it.
    for (const publication of doc.publications) {
      if (publication.withdrawn_at || publication.activated_at || (publication.requires_activation && publication.built_at)) continue;
      const tries = publication.indexing_attempts;
      const tables = publication.requires_activation;
      const indexing = { id: `index-${publication.id}`, kind: tables ? "Building the search index for tables" : "Indexing for search", subject: doc.title, subjectHref: `/library/${doc.id}${tables ? "/versions" : ""}`, document: doc };
      jobs.push(tries >= ATTEMPT_LIMIT
        ? tables
          ? { ...indexing, state: "attention", timing: `Attempt ${tries} of ${ATTEMPT_LIMIT}`, cause: publication.indexing_error ?? "Building stopped after three attempts.", fixLabel: doc.is_owner ? "Discard it and build again" : undefined }
          : { ...indexing, state: "attention", timing: `Attempt ${tries} of ${ATTEMPT_LIMIT}`, cause: publication.indexing_error ?? "Indexing stopped after three attempts. Requirement work can't cite it yet.", retry: doc.is_owner ? "retry-indexing" : undefined }
        : { ...indexing, state: "working", timing: tries > 0 ? `Attempt ${tries + 1} of ${ATTEMPT_LIMIT}` : tables ? "Building…" : "Indexing…" });
    }
    return jobs;
  });

  // What finished while this tab watched it: a job that was running and is no longer listed.
  // Each ending, and each failure, is also said once, politely (§6 Notifications).
  const running = useRef(new Map<string, ShellJob>());
  const [finished, setFinished] = useState<(ShellJob & { at: number })[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const runningIds = jobs.filter((job) => job.state === "working" || job.state === "waiting").map((job) => job.id).join(" ");
  const listedIds = jobs.map((job) => job.id).join(" ");
  useEffect(() => {
    const listed = new Set(listedIds.split(" "));
    const ended = [...running.current.values()].filter((job) => !listed.has(job.id));
    const failed = jobs.filter((job) => job.state === "attention" && running.current.has(job.id));
    const said = [
      ...ended.map((job) => `${job.kind} finished: '${job.subject}'.`),
      ...failed.map((job) => `${job.kind} needs attention: '${job.subject}'. See Jobs.`),
    ];
    if (said.length) setAnnouncement(said.join(" "));
    const stillRunning = new Map(jobs.filter((job) => job.state === "working" || job.state === "waiting").map((job) => [job.id, job]));
    running.current = stillRunning;
    if (ended.length) {
      const at = Date.now();
      setFinished((all) => [...all.filter((job) => !ended.some((item) => item.id === job.id)), ...ended.map((job) => ({ ...job, at }))]);
    }
    // Only when what runs, or what is listed, changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningIds, listedIds]);
  const done: ShellJob[] = finished
    .filter((job) => now - job.at < DONE_FOR && !jobs.some((item) => item.id === job.id))
    .map((job) => ({ id: `done-${job.id}`, kind: job.kind, subject: job.subject, subjectHref: job.subjectHref, state: "done", timing: `Done at ${clock(job.at)}` }));

  return {
    jobs: [...jobs, ...done],
    state: (documents.isPending ? "loading" : documents.isError && !documents.data ? "failed" : "ready") as "loading" | "failed" | "ready",
    retry: () => void documents.refetch(),
    act: actions.act,
    /** One polite line for the shell's live region: what just finished or failed. */
    announcement,
    busy: actions.busy,
    said: actions.said,
  };
}

/** Running or needing someone (§6): what the Jobs button counts. Waiting, stopped and done aren't counted. */
export function activeJobs(jobs: ShellJob[]): number {
  return jobs.filter((job) => job.state === "working" || job.state === "attention" || job.state === "held").length;
}
