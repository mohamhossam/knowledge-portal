/** How the reading of each document stands, and what its readings warned of, in words. */
import type { ArchitectureJob, ExtractionRun } from "../../api/client";
import { formatClock, formatElapsed } from "../../home/format";

/**
 * What each change request's last reading said of one feature, keyed "<change request>/<feature>":
 * a warning naming a feature opens with its id ("FT-2: …").
 */
export function featureWarnings(runs: ExtractionRun[]): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  for (const run of runs) {
    if (!run.change_request_id) continue;
    for (const warning of run.warnings) {
      const named = /^([^\s:]+): (.+)$/.exec(warning);
      if (!named) continue;
      const key = `${run.change_request_id}/${named[1]}`;
      const said = warningInWords(named[2]!);
      notes.set(key, [...(notes.get(key) ?? []), said.charAt(0).toUpperCase() + said.slice(1)]);
    }
  }
  return notes;
}

/** The service's reading warnings count with "(s)"; say them as English. */
export function warningInWords(text: string): string {
  return text
    .replace(/\b(\d+) ([^()]*?)\(s\)/g, (_, n: string, words: string) => `${n} ${n === "1" ? words : `${words}s`}`)
    .replace(/\b1 ([^.]*?)\bwere\b/g, "1 $1was");
}

/** How the reading of one document stands. */
export type Reading = {
  label: string;
  failed: boolean;
  busy: boolean;
  /** Queued: no reader has started on it yet. */
  waiting: boolean;
  /** The reader has stopped reporting: the attempt died, and is picked up again or fails. */
  stalled: boolean;
  /** Parts done of those expected, while the model reads the document part by part. */
  part: { done: number; total: number } | null;
  /** Further lines in words: when it started, how long it has taken, what comes next. */
  details: string[];
};

const JOB_ERROR: Record<string, string> = {
  attempts_exhausted: "it stopped after three attempts",
  provider_rate_limited: "the model was busy",
  catalogue_extraction_unsupported: "this kind of file cannot be read here",
  catalogue_extraction_failed: "the model's answer could not be used",
  architecture_knowledge_conflict: "the draft changed while it was read",
};

/** Why a catalogue job failed, in a curator's words. */
export function jobReason(category: string | null | undefined): string {
  return category ? JOB_ERROR[category] ?? category.replace(/_/g, " ") : "the reason was not recorded";
}

/** The service's attempts per job, and how long a lease outlives the reader's last word. */
const ATTEMPTS = 3;
const LEASE_MS = 5 * 60_000;

const STAGE: Record<string, string> = {
  opening: "Opening the file",
  reading: "Reading",
  matching: "Matching names to the catalogue",
  saving: "Saving its suggestions",
};

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Number.NaN);

/** "about 12 min left", from the time the parts done took; nothing before a part is done. */
function remaining(started: number, done: number, total: number, now: number): string | null {
  if (!(done > 0) || total <= done || Number.isNaN(started)) return null;
  const minutes = Math.round(((now - started) / done) * (total - done) / 60_000);
  return minutes <= 1 ? "about a minute left" : `about ${minutes} min left`;
}

/**
 * How a document's reading stands, in words: the stage it is at, the part it is
 * on, when it started, and whether the reader has gone quiet. `now` is epoch ms.
 */
export function reading(job: ArchitectureJob | undefined, now: number = Date.now()): Reading {
  const base: Reading = { label: "", failed: false, busy: false, waiting: false, stalled: false, part: null, details: [] };
  if (!job) return { ...base, label: "Not read yet" };
  switch (job.status) {
    case "queued": {
      const queued = time(job.queued_at);
      return {
        ...base,
        label: "Waiting to be read",
        busy: true,
        waiting: true,
        details: [
          Number.isNaN(queued) ? "Waiting for the reader." : `Waiting since ${formatClock(new Date(queued))} (${formatElapsed(queued, now)}).`,
          "Documents are read one at a time; it starts when the reader is free.",
        ],
      };
    }
    case "running": {
      const started = time(job.started_at);
      const lease = time(job.lease_until);
      const attempt = job.attempts ?? 1;
      if (!Number.isNaN(lease) && lease < now) {
        const heard = new Date(lease - LEASE_MS);
        return {
          ...base,
          label: "Stopped responding",
          busy: true,
          stalled: true,
          details: [
            `No word from the reader since ${formatClock(heard)} (${formatElapsed(heard.getTime(), now)} ago).`,
            attempt < ATTEMPTS
              ? `The reading service starts it again by itself, as attempt ${attempt + 1} of ${ATTEMPTS}. If nothing changes, the service may be stopped.`
              : `This was the last of ${ATTEMPTS} attempts: the reading service marks it failed, and you can then read it again.`,
          ],
        };
      }
      const done = job.progress_done ?? null;
      const total = job.progress_total ?? null;
      const part = job.stage === "reading" && done !== null && total ? { done, total } : null;
      const label = part
        ? `Reading part ${Math.min(part.done + 1, part.total)} of ${part.total}`
        : (job.stage && STAGE[job.stage]) || "Being read";
      const timing = Number.isNaN(started) ? null : `Started ${formatClock(new Date(started))}, ${formatElapsed(started, now)} so far`;
      const left = part ? remaining(started, part.done, part.total, now) : null;
      return {
        ...base,
        label,
        busy: true,
        part,
        details: [
          ...(timing ? [left ? `${timing}; ${left}.` : `${timing}.`] : []),
          ...(attempt > 1 ? [`Attempt ${attempt} of ${ATTEMPTS}: the last one stopped before it finished.`] : []),
        ],
      };
    }
    case "succeeded":
      return { ...base, label: "Read" };
    case "cancelled":
      return { ...base, label: "Reading cancelled" };
    case "failed": {
      const why = job.error_category ? JOB_ERROR[job.error_category] ?? job.error_category.replace(/_/g, " ") : null;
      return { ...base, label: why ? `Reading failed: ${why}` : "Reading failed", failed: true };
    }
  }
}

/** Each document's reading warnings, said once each, from every run of it. */
export function documentWarnings(runs: ExtractionRun[], versionId: string): string[] {
  return [...new Set(runs.filter((run) => run.document_version_id === versionId).flatMap((run) => run.warnings))];
}
