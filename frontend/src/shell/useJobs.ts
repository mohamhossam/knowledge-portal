import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, type LibraryDocument } from "../api/client";
import type { Job } from "../design/components";
import { newestVersion } from "../library/model";

function elapsed(from: number, to: number): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ${seconds % 60} s` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export type ShellJob = Omit<Job, "fix"> & { fixLabel?: string };

/**
 * The Jobs panel's jobs (§6). The service has no list of jobs (BG1), so they
 * are derived from the documents being read or that failed: reading is the
 * background work a curator starts and waits for. Each failure says its cause
 * and leads to the fix on the document.
 */
const READING = ["queued", "scanning", "extracting"];

function reading(documents: LibraryDocument[] | undefined): boolean {
  return (documents ?? []).some((doc) => READING.includes(newestVersion(doc)?.stage ?? ""));
}

export function useJobs(): { jobs: ShellJob[]; state: "loading" | "failed" | "ready"; retry: () => void } {
  // While something is being read, the list is polled so a job settles (or fails) in view;
  // otherwise it is read as the library page reads it.
  const documents = useQuery({
    queryKey: ["library", "documents"],
    queryFn: api.libraryDocuments,
    refetchInterval: (query) => (reading(query.state.data) ? 3000 : false),
  });
  const active = reading(documents.data);
  // Elapsed times read a clock (a render must stay pure) that ticks only while reading runs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, [active]);
  const jobs = (documents.data ?? []).flatMap((doc): ShellJob[] => {
    const version = newestVersion(doc);
    if (!version) return [];
    const started = Date.parse(version.uploaded_at);
    const base = { id: `read-${doc.id}`, kind: "Reading", subject: doc.title, subjectHref: `/library/${doc.id}` };
    if (version.stage === "failed") {
      return [{ ...base, state: "attention", cause: version.error ?? "The file couldn't be read.", fixLabel: "Upload a new version" }];
    }
    if (version.stage === "quarantined") {
      return [{ ...base, state: "held", cause: "The malware scan flagged it. It won't be read.", fixLabel: "Upload a clean copy" }];
    }
    if (version.stage === "queued") return [{ ...base, state: "waiting", timing: "Waiting to be read" }];
    if (version.stage === "scanning" || version.stage === "extracting") {
      const so = elapsed(started, now);
      return [{ ...base, state: "working", timing: now - started > 60_000 ? `Still reading (${so}). You can leave this page; it continues.` : `Reading… ${so}` }];
    }
    return [];
  });
  return {
    jobs,
    state: documents.isPending ? "loading" : documents.isError && !documents.data ? "failed" : "ready",
    retry: () => void documents.refetch(),
  };
}

/** Running or needing someone (§6): what the Jobs button counts. Waiting isn't counted. */
export function activeJobs(jobs: ShellJob[]): number {
  return jobs.filter((job) => job.state === "working" || job.state === "attention" || job.state === "held").length;
}
