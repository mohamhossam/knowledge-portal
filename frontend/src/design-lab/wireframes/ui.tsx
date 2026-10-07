/**
 * Low-fidelity building blocks for the wireframes. Greyscale and system font
 * by design: they test structure and behaviour, not the visual direction.
 */
import {
  AlertTriangle,
  Check,
  Clock,
  Lightbulb,
  Loader,
  ShieldAlert,
  Square,
} from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useState,
} from "react";
import { Link, NavLink } from "react-router-dom";

import { type JobState, JOB_WORDS } from "./lab-context";

/** Every wireframe page: its title is set first, and its h1 receives focus on arrival (§1). */
export function Page({
  title,
  archetype,
  lead,
  head,
  children,
}: {
  title: string;
  archetype: string;
  lead?: ReactNode;
  head?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Wireframe · Knowledge portal`;
  }, [title]);
  return (
    <article className="wf-page" data-archetype={archetype}>
      <header className="wf-page__head">
        <h1 id="wf-page-title" tabIndex={-1} dir="auto">{title}</h1>
        {lead && <p className="wf-page__lead">{lead}</p>}
        {head}
        <p className="wf-archetype" aria-hidden="true">Archetype: {archetype}</p>
      </header>
      {children}
    </article>
  );
}

/** A wireframe annotation: behaviour the build must keep, said plainly. Hidden from assistive tech. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <aside className="wf-note" aria-hidden="true">
      <span className="wf-note__tag">Wireframe note</span> {children}
    </aside>
  );
}

const JOB_ICON: Record<JobState, typeof Check> = {
  waiting: Clock,
  working: Loader,
  done: Check,
  attention: AlertTriangle,
  stopped: Square,
  held: ShieldAlert,
};

/** A status is always an icon and words, never colour alone (§15). */
export function Status({ state, children }: { state: JobState; children?: ReactNode }) {
  const Icon = JOB_ICON[state];
  return (
    <span className={`wf-status wf-status--${state}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{children ?? JOB_WORDS[state]}</span>
    </span>
  );
}

/** §9: anything a model proposed and nobody decided carries this mark. */
export function Suggested({ basis }: { basis: "stated" | "inferred" }) {
  return (
    <span className="wf-suggested">
      <Lightbulb size={14} aria-hidden="true" />
      Suggested · {basis === "inferred" ? "inferred, not stated in the source" : "stated in the source"}
    </span>
  );
}

/** The sticky line under a head that says which mode and state you are in (§10, IA §3). */
export function StateLine({ children, tone = "plain", innerRef }: { children: ReactNode; tone?: "plain" | "proof"; innerRef?: RefObject<HTMLDivElement | null> }) {
  return (
    <div className={`wf-stateline wf-stateline--${tone}`} ref={innerRef} role="status">
      {children}
    </div>
  );
}

export function ProvenanceLine({ children }: { children: ReactNode }) {
  return <p className="wf-provenance">{children}</p>;
}

/**
 * §1.2: a control that can't act for a reason stays focusable, says why,
 * and does nothing when pressed.
 */
export function ReasonedButton({
  reason,
  onClick,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { reason: string | null }) {
  const id = useId();
  const [said, setSaid] = useState(false);
  return (
    <>
      <button
        type="button"
        {...rest}
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? `${id}-why` : rest["aria-describedby"]}
        onClick={(event) => {
          if (reason) {
            setSaid(true);
            return;
          }
          onClick?.(event);
        }}
      >
        {children}
      </button>
      {reason && (
        <span id={`${id}-why`} className="wf-why" role={said ? "status" : undefined}>
          {reason}
        </span>
      )}
    </>
  );
}

/**
 * §5: the consequence panel, in place, never a modal. What happens, who it
 * affects, reversibility, reason, then the verb button and the safe default.
 */
export function ConsequencePanel({
  title,
  happens,
  affects,
  reversible,
  reasonLabel,
  reasonHint,
  confirm,
  keep,
  onConfirm,
  onKeep,
  busy,
  failure,
  panelRef,
  danger = false,
}: {
  title: string;
  happens: ReactNode;
  affects?: ReactNode;
  reversible: ReactNode;
  reasonLabel?: string;
  reasonHint?: string;
  confirm: string;
  keep: string;
  onConfirm: (reason: string) => void;
  onKeep: () => void;
  busy?: boolean;
  failure?: string | null;
  panelRef?: RefObject<HTMLElement | null>;
  danger?: boolean;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const missing = Boolean(reasonLabel) && reason.trim() === "";
  // §1: focus moves into the panel when it appears: the reason field, else its heading.
  useEffect(() => {
    (document.getElementById(`${id}-r`) ?? document.getElementById(`${id}-t`))?.focus();
  }, [id]);
  return (
    <section
      className={`wf-consequence${danger ? " wf-consequence--danger" : ""}`}
      aria-labelledby={`${id}-t`}
      ref={panelRef as RefObject<HTMLElement>}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onKeep();
        }
      }}
    >
      <h2 id={`${id}-t`} tabIndex={-1} className="wf-consequence__title">
        {danger && <AlertTriangle size={16} aria-hidden="true" />} {title}
      </h2>
      <p className="wf-consequence__happens">{happens}</p>
      {affects && <div className="wf-consequence__affects">{affects}</div>}
      <p className="wf-consequence__reversible">{reversible}</p>
      {reasonLabel && (
        <div className="wf-field">
          <label htmlFor={`${id}-r`}>{reasonLabel}</label>
          {reasonHint && <p id={`${id}-h`} className="wf-hint">{reasonHint}</p>}
          <textarea
            id={`${id}-r`}
            dir="auto"
            rows={2}
            value={reason}
            aria-invalid={tried && missing ? true : undefined}
            aria-describedby={[reasonHint ? `${id}-h` : "", tried && missing ? `${id}-e` : ""].join(" ").trim() || undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {tried && missing && <p id={`${id}-e`} className="wf-field__error">Give a reason. {reasonHint ?? ""}</p>}
        </div>
      )}
      {failure && <p className="wf-outcome wf-outcome--failed" role="status"><AlertTriangle size={14} aria-hidden="true" /> {failure}</p>}
      <div className="wf-actions">
        <button
          type="button"
          className={danger ? "wf-button wf-button--danger" : "wf-button wf-button--primary"}
          aria-disabled={busy ? true : undefined}
          onClick={() => {
            if (busy) return;
            setTried(true);
            if (!missing) onConfirm(reason.trim());
          }}
        >
          {busy ? "Working…" : confirm}
        </button>
        <button type="button" className="wf-button" onClick={onKeep}>{keep}</button>
      </div>
    </section>
  );
}

/** §8: what this is, why it is empty, what to do. */
export function Empty({ title, why, action }: { title: string; why: ReactNode; action?: ReactNode }) {
  return (
    <div className="wf-empty">
      <p className="wf-empty__title">{title}</p>
      <p>{why}</p>
      {action}
    </div>
  );
}

/** §8: skeleton rows, tint only, no shimmer. */
export function Skeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="wf-skeleton" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="wf-skeleton__row" />
      ))}
    </div>
  );
}

export function KeysLine({ keys }: { keys: [string, string][] }) {
  return (
    <p className="wf-keys">
      <span className="wf-keys__label">Keys</span>
      {keys.map(([key, what]) => (
        <span key={key} className="wf-keys__item">
          <kbd>{key}</kbd> {what}
        </span>
      ))}
      <Link to="?help=shortcuts" className="wf-keys__more">All shortcuts</Link>
    </p>
  );
}

/** A record's or area's second level: a labelled nav with aria-current (IA §3). */
export function SubNav({ label, items }: { label: string; items: { to: string; label: ReactNode; end?: boolean }[] }) {
  return (
    <nav className="wf-subnav" aria-label={label}>
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end}>{item.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * §2.2 lists: one tab stop for the whole list; ↑ ↓ Home End move between
 * items, Enter follows the focused item's link.
 */
export function RovingList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      className="wf-queue"
      aria-label={label}
      onKeyDown={(event) => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-roving]"));
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (index < 0) return;
        const next =
          event.key === "ArrowDown" ? items[index + 1] :
          event.key === "ArrowUp" ? items[index - 1] :
          event.key === "Home" ? items[0] :
          event.key === "End" ? items.at(-1) : undefined;
        if (next) {
          event.preventDefault();
          items.forEach((item) => item.setAttribute("tabindex", item === next ? "0" : "-1"));
          next.focus();
        }
      }}
    >
      {children}
    </ul>
  );
}

/** An outcome line under an action (§7, §15): quiet, polite. */
export function Outcome({ text, failed }: { text: string | null; failed?: boolean }) {
  return (
    <p className={`wf-outcome${failed ? " wf-outcome--failed" : ""}`} role="status">
      {text && failed && <AlertTriangle size={14} aria-hidden="true" />} {text}
    </p>
  );
}
