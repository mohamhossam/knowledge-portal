import "./evidence.css";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useId, useState } from "react";

import { Button } from "./actions";
import { Status } from "./feedback";
import type { LinkLike } from "./layout";

/**
 * §5: the consequence panel, in place, never a modal. In order: what happens,
 * who and what it affects, whether it can be undone, a reason where the API
 * takes one, then the verb with its object and the safe default. Focus moves
 * in when it appears; Escape or the safe default closes it.
 */
export function ConsequencePanel({
  title,
  happens,
  affects,
  reversibility,
  reason,
  confirmLabel,
  keepLabel,
  onConfirm,
  onKeep,
  tone = "neutral",
  busy,
  failure,
  busyLabel = "Working…",
  panelRef,
}: {
  /** May hold a name (wrap it in <bdi> so a title in either language reads in order). */
  title: ReactNode;
  happens: ReactNode;
  affects?: ReactNode;
  reversibility: ReactNode;
  /** When the API takes a reason: its label and who reads it. */
  reason?: { label: string; hint: string };
  confirmLabel: ReactNode;
  keepLabel: string;
  onConfirm: (reason: string) => void;
  onKeep: () => void;
  tone?: "neutral" | "danger";
  busy?: boolean;
  failure?: ReactNode;
  /** The verb in its -ing form while it runs ("Publishing…"). */
  busyLabel?: string;
  panelRef?: RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const missing = Boolean(reason) && text.trim() === "";
  useEffect(() => {
    (document.getElementById(`${id}-reason`) ?? document.getElementById(`${id}-title`))?.focus();
  }, [id]);
  return (
    <section
      ref={panelRef as RefObject<HTMLElement>}
      className={`ds-consequence ds-consequence--${tone}`}
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onKeep();
        }
      }}
    >
      <h2 id={`${id}-title`} tabIndex={-1} className="ds-consequence__title">
        {tone === "danger" && <AlertTriangle size={16} aria-hidden="true" />}
        {title}
      </h2>
      {/* Focus lands in the reason field: these are its description, so the consequence is heard first. */}
      <p id={`${id}-happens`} className="ds-consequence__happens">{happens}</p>
      {affects && <div id={`${id}-affects`} className="ds-consequence__affects">{affects}</div>}
      <p id={`${id}-reversibility`} className="ds-consequence__reversibility">{reversibility}</p>
      {reason && (
        <div className="ds-field">
          <label htmlFor={`${id}-reason`} className="ds-field__label">{reason.label}</label>
          <p id={`${id}-hint`} className="ds-field__hint">{reason.hint}</p>
          <textarea
            id={`${id}-reason`}
            className="ds-input ds-input--area"
            dir="auto"
            rows={2}
            value={text}
            aria-required="true"
            aria-invalid={tried && missing ? true : undefined}
            aria-describedby={`${id}-happens${affects ? ` ${id}-affects` : ""} ${id}-reversibility ${id}-hint${tried && missing ? ` ${id}-error` : ""}`}
            onChange={(event) => setText(event.target.value)}
          />
          {tried && missing && <p id={`${id}-error`} className="ds-field__error">Give a reason. {reason.hint}</p>}
        </div>
      )}
      {/* Mounted before it has anything to say, so a failure is announced. */}
      <p className="ds-consequence__failure" role="status">{failure ? <Status tone="attention">{failure}</Status> : null}</p>
      <div className="ds-actions">
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          icon={tone === "danger" ? <AlertTriangle size={14} /> : undefined}
          busy={busy}
          onClick={() => {
            setTried(true);
            // A missing reason: back to its field, where the error is part of its description.
            if (missing) document.getElementById(`${id}-reason`)?.focus();
            else onConfirm(text.trim());
          }}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
        <Button onClick={onKeep}>{keepLabel}</Button>
      </div>
    </section>
  );
}

export type ImpactState =
  | { kind: "not-checked" }
  | { kind: "checking" }
  | { kind: "checked"; at: string }
  | { kind: "stale"; at: string }
  | { kind: "unknown"; why: string };

/**
 * §11: what a change does to requirement work, beside the action that makes
 * it. Counts first, then named items, with the visibility caveat; states say
 * honestly when the impact is unchecked, stale or unknown (never "0").
 */
export function ImpactPanel({
  title,
  state,
  counts,
  items,
  caveat,
  onCheck,
}: {
  title: string;
  state: ImpactState;
  counts?: { label: string; value: number }[];
  items?: ReactNode[];
  caveat?: string;
  onCheck?: () => void;
}) {
  const id = useId();
  // The button that started the check goes away while it runs; focus stays in the panel, on its title.
  const check = onCheck && (() => {
    onCheck();
    document.getElementById(`${id}-t`)?.focus();
  });
  return (
    <section className="ds-impact" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="ds-impact__title" tabIndex={-1}>{title}</h3>
      {state.kind === "unknown" ? (
        <p><Status tone="attention">{state.why} The impact is unknown, not zero.</Status></p>
      ) : state.kind === "not-checked" ? (
        <p className="ds-impact__state">Not checked yet.{check && <>{" "}<Button variant="link" onClick={check}>Check now</Button></>}</p>
      ) : state.kind === "checking" ? (
        <p className="ds-impact__state"><Status tone="working">Checking…</Status></p>
      ) : (
        <>
          <p className="ds-impact__state">
            {state.kind === "stale" ? <Status tone="held">Out of date: changed since the check at {state.at}</Status> : <>Checked at {state.at}</>}
            {state.kind === "stale" && check && <>{" "}<Button variant="link" onClick={check}>Check again</Button></>}
          </p>
          {counts && (
            <dl className="ds-impact__counts">
              {counts.map((count) => (
                <div key={count.label}>
                  <dt>{count.label}</dt>
                  <dd className="ds-num">{count.value.toLocaleString("en")}</dd>
                </div>
              ))}
            </dl>
          )}
          {items && items.length > 0 && <ul className="ds-impact__items">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>}
        </>
      )}
      {caveat && <p className="ds-impact__caveat">{caveat}</p>}
    </section>
  );
}

export type Hop = { label: string; value: ReactNode; href?: string };

/**
 * §10: the provenance trail, one hop per link: fact → evidence passage →
 * document and version → catalogue version → decided by.
 */
export function ProvenanceTrail({ hops, label = "Where this comes from", link: Link }: { hops: Hop[]; label?: string; link?: LinkLike }) {
  return (
    <nav className="ds-trail" aria-label={label}>
      <ol>
        {hops.map((hop, index) => (
          <li key={hop.label} className="ds-trail__hop">
            {index > 0 && <ChevronRight size={14} aria-hidden="true" className="ds-trail__sep" />}
            <span className="ds-trail__label">{hop.label}</span>
            {hop.href ? (Link ? <Link href={hop.href}><bdi>{hop.value}</bdi></Link> : <a href={hop.href}><bdi>{hop.value}</bdi></a>) : <bdi>{hop.value}</bdi>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The cited passage with the quoted line highlighted (not the whole chunk),
 * in its own direction, and its source underneath.
 */
export function EvidenceQuote({ text, quote, source }: { text: string; quote?: string; source: ReactNode }) {
  const at = quote ? text.indexOf(quote) : -1;
  return (
    <figure className="ds-quote">
      <blockquote dir="auto" className="ds-quote__text">
        {at < 0 || !quote ? (
          text
        ) : (
          <>
            {text.slice(0, at)}
            <mark>{quote}</mark>
            {text.slice(at + quote.length)}
          </>
        )}
      </blockquote>
      <figcaption className="ds-quote__source">{source}</figcaption>
    </figure>
  );
}
