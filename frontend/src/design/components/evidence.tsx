import "./evidence.css";

import { AlertTriangle } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useId, useState } from "react";

import { Button } from "./actions";
import { Status, type StatusTone } from "./feedback";

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
  /**
   * When the API takes a reason: its label and who reads it. With `value` and `onChange` the
   * caller keeps the text, so it outlives the panel (a review summary written, then "Not yet").
   */
  reason?: { label: string; hint: string; value?: string; onChange?: (text: string) => void; maxLength?: number; /** A note the API takes but doesn't need. */ optional?: boolean };
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
  const [own, setOwn] = useState("");
  const text = reason?.value ?? own;
  const setText = reason?.onChange ?? setOwn;
  const [tried, setTried] = useState(false);
  const missing = Boolean(reason) && !reason?.optional && text.trim() === "";
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
        {/* One flex item: a name in <bdi> inside it doesn't pick up the gap. */}
        <span>{title}</span>
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
            maxLength={reason.maxLength}
            value={text}
            aria-required={reason.optional ? undefined : true}
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

/**
 * The cited passage with the quoted line highlighted (not the whole chunk),
 * in its own direction, and its source underneath. `lang` is the passage's
 * language, set on the quote alone: the source line is the portal's English.
 */
export function EvidenceQuote({ text, quote, source, lang }: {
  text: string;
  /** The line within `text` the citation quotes; marked when found, else nothing is. */
  quote?: string;
  source: ReactNode;
  /** The passage's language ("ar", "en"), when known. */
  lang?: string;
}) {
  const at = quote ? text.indexOf(quote) : -1;
  return (
    <figure className="ds-quote">
      <blockquote dir="auto" lang={lang} className="ds-quote__text">
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

export type CheckItem = {
  id: string;
  /** done: ready · attention: blocks the action · held: worth a look first · neutral: for information. */
  tone: StatusTone;
  /** The state in words beside its icon ("Ready", "Blocks publishing"). */
  word: string;
  title: ReactNode;
  detail?: ReactNode;
  /** The way to settle it: a link to the step, or the button that does it. */
  action?: ReactNode;
};

/**
 * A pre-flight checklist before a consequential action (publishing a draft):
 * one line per check, its state as a Status (icon and words), what it means,
 * and the way to settle it. The summary says first how many block and how
 * many are worth a look, so the reader knows before reading every line.
 */
export function Checklist({ label, items }: { label: string; items: CheckItem[] }) {
  const id = useId();
  const blocking = items.filter((item) => item.tone === "attention").length;
  const held = items.filter((item) => item.tone === "held").length;
  const summary = blocking
    ? `${blocking} ${blocking === 1 ? "check blocks" : "checks block"} it${held ? `; ${held} worth a look` : ""}.`
    : held
      ? `Nothing blocks it; ${held} ${held === 1 ? "check is" : "checks are"} worth a look.`
      : "Every check is ready.";
  return (
    <div className="ds-checklist">
      <p id={`${id}-sum`} className="ds-checklist__summary">{summary}</p>
      <ul className="ds-checklist__list" aria-label={label} aria-describedby={`${id}-sum`}>
        {items.map((item) => (
          <li key={item.id} className="ds-checklist__item">
            <span className="ds-checklist__state"><Status tone={item.tone}>{item.word}</Status></span>
            <span className="ds-checklist__body">
              <span className="ds-checklist__title">{item.title}</span>
              {item.detail && <span className="ds-checklist__detail">{item.detail}</span>}
            </span>
            {item.action && <span className="ds-checklist__action">{item.action}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
