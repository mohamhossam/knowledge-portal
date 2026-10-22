import "./feedback.css";

import { AlertTriangle, Check, Clock, Flag, Lightbulb, Loader, ShieldAlert, Square } from "lucide-react";
import type { ReactNode } from "react";

import { type JobState, JOB_WORDS } from "../words";
import { Button } from "./actions";
import type { LinkLike } from "./layout";

export type { JobState };

/**
 * One status vocabulary across the portal (interaction model §6, content guide §7). `warning`
 * is a note to check (a flagged passage, a flag icon): lighter than `attention`, and not `held`,
 * the malware scan's shield.
 */
export type StatusTone = "neutral" | "working" | "done" | "attention" | "warning" | "held" | "stopped";

const ICON: Record<StatusTone, typeof Check> = {
  neutral: Clock,
  working: Loader,
  done: Check,
  attention: AlertTriangle,
  warning: Flag,
  held: ShieldAlert,
  stopped: Square,
};

/** A status is always an icon and words, never colour alone (§15). Severe is never lighter than routine. */
export function Status({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = ICON[tone];
  return (
    <span className={`ds-status ds-status--${tone}`}>
      <Icon size={14} aria-hidden="true" className="ds-status__icon" />
      <span>{children}</span>
    </span>
  );
}

/** A neutral count. Counts never turn red; `label` completes the sentence for screen readers. */
export function Badge({ count, label }: { count: number; label?: string }) {
  return (
    <span className="ds-badge">
      <span aria-hidden="true">{count.toLocaleString("en")}</span>
      {/* One phrase; the badge box already separates it from the label before it. */}
      <span className="ds-visually-hidden">{`${count.toLocaleString("en")}${label ? ` ${label}` : ""}`}</span>
    </span>
  );
}

/**
 * What a record is missing, as one quiet badge ("3 gaps") instead of a column
 * of "Not stated" per field (UX rebuild, phase 1). It names the fields for
 * screen readers and on hover; the record says the rest. Nothing missing,
 * nothing shown.
 */
export function GapBadge({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return null;
  const list = gaps.join(", ");
  return (
    <span className="ds-gaps" title={`Missing: ${list}`}>
      <span aria-hidden="true">{gaps.length === 1 ? "1 gap" : `${gaps.length} gaps`}</span>
      <span className="ds-visually-hidden">{`Missing: ${list}`}</span>
    </span>
  );
}

/**
 * §9: anything a model proposed and nobody decided carries this mark,
 * readable without colour. Model details sit one step away (`detail`).
 */
export function Suggested({ basis, detail }: { basis: "stated" | "inferred"; detail?: ReactNode }) {
  return (
    <span className="ds-suggested">
      <Lightbulb size={14} aria-hidden="true" />
      <span>Suggested · {basis === "inferred" ? "inferred, not stated in the source" : "stated in the source"}</span>
      {detail && <span className="ds-suggested__detail">{detail}</span>}
    </span>
  );
}

/** §8: what this is, why it's empty (or where the data comes from), what to do. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ds-empty">
      <p className="ds-empty__title">{title}</p>
      {children && <div className="ds-empty__why">{children}</div>}
      {action && <div className="ds-empty__action">{action}</div>}
    </div>
  );
}

/** §8: skeleton rows, tint only, no shimmer; the region says it is busy. */
export function Skeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="ds-skeleton" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ds-skeleton__row" />
      ))}
    </div>
  );
}

const JOB_TONE: Record<JobState, StatusTone> = {
  waiting: "neutral",
  working: "working",
  done: "done",
  attention: "attention",
  stopped: "stopped",
  held: "held",
};

export function JobStatus({ state, children }: { state: JobState; children?: ReactNode }) {
  return <Status tone={JOB_TONE[state]}>{children ?? JOB_WORDS[state]}</Status>;
}

export type Job = {
  id: string;
  kind: string;
  subject: string;
  state: JobState;
  /** Elapsed or ended text, already in words ("1 min 20 s so far"). */
  timing?: string;
  cause?: string;
  /** The specific fix when retrying can't help ("Upload a new version"). */
  fix?: ReactNode;
  onRetry?: () => void;
  /** The retry's words when "Try again" is too vague ("Try reading again"), the same as at the object. */
  retryLabel?: string;
  onCancel?: () => void;
  subjectHref?: string;
  /** The press in flight for this job: its button says so and ignores a second press. */
  busy?: "retry" | "cancel";
};

/**
 * §6: the Jobs panel body: running, needing attention, recently done; each with
 * its object, elapsed time, cause and fix. Background news is polite, never assertive.
 */
export function JobTray({ jobs, empty = "No jobs are running. Reading, indexing and building appear here while they run.", link: Link }: { jobs: Job[]; empty?: string; link?: LinkLike }) {
  const order: Record<JobState, number> = { attention: 0, held: 1, working: 2, waiting: 3, stopped: 4, done: 5 };
  const sorted = [...jobs].sort((a, b) => order[a.state] - order[b.state]);
  if (sorted.length === 0) return <p className="ds-jobs__empty">{empty}</p>;
  return (
    <ul className="ds-jobs" aria-label="Jobs">
      {sorted.map((job) => (
        <li key={job.id} className="ds-jobs__item">
          <JobStatus state={job.state} />
          <p className="ds-jobs__what">
            {job.kind}:{" "}
            {job.subjectHref ? (Link ? <Link href={job.subjectHref}><bdi>{job.subject}</bdi></Link> : <a href={job.subjectHref}><bdi>{job.subject}</bdi></a>) : <bdi>{job.subject}</bdi>}
          </p>
          {job.timing && <p className="ds-jobs__timing">{job.timing}</p>}
          {job.cause && <p className="ds-jobs__cause">{job.cause}</p>}
          {(job.onRetry || job.onCancel || job.fix) && (
            <div className="ds-actions">
              {job.fix}
              {job.onRetry && <Button busy={job.busy === "retry"} onClick={job.onRetry}>{job.busy === "retry" ? "Trying again…" : job.retryLabel ?? "Try again"}<span className="ds-visually-hidden">: {job.kind} {job.subject}</span></Button>}
              {job.onCancel && <Button variant="quiet" busy={job.busy === "cancel"} onClick={job.onCancel}>{job.busy === "cancel" ? "Stopping…" : "Stop"}<span className="ds-visually-hidden">: {job.kind} {job.subject}</span></Button>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One polite live region per purpose (§15). Render it once; change `message` to announce. */
export function LiveMessage({ message }: { message: string }) {
  return (
    <p className="ds-visually-hidden" role="status" aria-live="polite">
      {message}
    </p>
  );
}

/**
 * A calm line across the top of a page about something in progress elsewhere
 * (a draft being prepared), with the way to it. A labelled region, not a live
 * one: it is read in page order, never announced over the page. Never an alert
 * colour: a neutral band with an icon and words.
 */
export function Banner({ label, icon, children, action }: { label: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="ds-banner" aria-label={label}>
      {icon && <span className="ds-banner__icon" aria-hidden="true">{icon}</span>}
      <p className="ds-banner__text">{children}</p>
      {action && <div className="ds-banner__action">{action}</div>}
    </section>
  );
}
