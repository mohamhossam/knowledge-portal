import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import type { ConfirmReview } from "../api/client";

const NOTE_MAX = 500;
const REASON_MAX = 500;

/**
 * Confirming knowledge is still right, asked in place under what it confirms. A note is
 * optional. Confirming for someone else (`onBehalf`) needs a reason, which is recorded.
 */
export function ConfirmReviewForm({ title, lead, detail, onBehalf, noteRequired = false, commit, busy, error, onSubmit, onCancel }: {
  title: ReactNode;
  lead: ReactNode;
  /** What the confirmation covers, named, when it covers more than one thing. */
  detail?: ReactNode;
  /** Whose confirmation this stands in for, when it is not the signed-in person's own. */
  onBehalf: string | null;
  /** Say what was checked: required when one confirmation stands for many. */
  noteRequired?: boolean;
  commit: string;
  busy: boolean;
  error: string | null;
  onSubmit: (body: ConfirmReview) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const first = useRef<HTMLTextAreaElement>(null);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const refusal = useRef<HTMLParagraphElement>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    form.current?.scrollIntoView?.({ block: "nearest" });
    first.current?.focus();
  }, []);
  useEffect(() => {
    // The service's refusal takes focus, so the reader hears it and can go on from there.
    if (error) refusal.current?.focus();
  }, [error]);
  const missing = onBehalf !== null && tried && !reason.trim();
  const noteMissing = noteRequired && tried && !note.trim();
  const reasonInput = onBehalf !== null && (
    <label className="field">
      <span className="field__label">Why you confirm it for {onBehalf} (required)</span>
      <textarea
        ref={(node) => {
          reasonField.current = node;
          first.current = node;
        }}
        className="field__input"
        rows={2}
        maxLength={REASON_MAX}
        value={reason}
        aria-required="true"
        aria-invalid={missing || undefined}
        aria-describedby={missing ? `${id}-missing` : undefined}
        onChange={(event) => setReason(event.target.value)}
      />
    </label>
  );
  return (
    <form
      ref={form}
      className="knowledge__act-form review__form"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setTried(true);
        if (onBehalf !== null && !reason.trim()) {
          reasonField.current?.focus();
          return;
        }
        if (noteRequired && !note.trim()) {
          noteField.current?.focus();
          return;
        }
        onSubmit({ note: note.trim() || null, reason: onBehalf !== null ? reason.trim() : null });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
    >
      <p id={`${id}-title`} className="knowledge__act-title">{title}</p>
      <p className="secondary knowledge__act-lead">{lead}</p>
      {detail}
      {reasonInput}
      {missing && (
        <p id={`${id}-missing`} className="docpage__failure">Say why: it is kept with the confirmation.</p>
      )}
      <label className="field">
        <span className="field__label">{noteRequired ? "What you checked (required)" : "Note (optional)"}</span>
        <textarea
          ref={(node) => {
            noteField.current = node;
            if (onBehalf === null) first.current = node;
          }}
          className="field__input"
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          aria-required={noteRequired || undefined}
          aria-invalid={noteMissing || undefined}
          aria-describedby={noteMissing ? `${id}-note-missing` : `${id}-note-hint`}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {noteMissing ? (
        <p id={`${id}-note-missing`} className="docpage__failure">Say what you checked: it stands for every one of them.</p>
      ) : (
        <p id={`${id}-note-hint`} className="form__hint">What you checked, for whoever confirms it next.</p>
      )}
      {error && (
        <p ref={refusal} tabIndex={-1} className="docpage__failure" role="alert">{error}</p>
      )}
      <p className="govsection__actions">
        <button type="submit" className="action-button" aria-disabled={busy || undefined}>
          {busy ? "Confirming…" : commit}
        </button>
        <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onCancel(); }}>
          Cancel
        </button>
      </p>
    </form>
  );
}
