import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import type { ConfirmReview } from "../api/client";

const NOTE_MAX = 500;
const REASON_MAX = 500;

/**
 * Confirming knowledge is still right, asked in place under what it confirms. A note is
 * optional. Confirming for someone else (`onBehalf`) needs a reason, which is recorded.
 */
export function ConfirmReviewForm({ title, lead, onBehalf, commit, busy, error, onSubmit, onCancel }: {
  title: ReactNode;
  lead: ReactNode;
  /** Whose confirmation this stands in for, when it is not the signed-in person's own. */
  onBehalf: string | null;
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
  const reasonInput = onBehalf !== null && (
    <label className="field">
      <span className="field__label">Why you confirm it for {onBehalf}</span>
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
        onSubmit({ note: note.trim() || null, reason: onBehalf !== null ? reason.trim() : null });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
    >
      <p id={`${id}-title`} className="knowledge__act-title">{title}</p>
      <p className="secondary knowledge__act-lead">{lead}</p>
      {reasonInput}
      {missing && (
        <p id={`${id}-missing`} className="docpage__failure">Say why: it is kept with the confirmation.</p>
      )}
      <label className="field">
        <span className="field__label">Note (optional)</span>
        <textarea
          ref={onBehalf === null ? first : undefined}
          className="field__input"
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          aria-describedby={`${id}-note-hint`}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <p id={`${id}-note-hint`} className="form__hint">What you checked, for whoever confirms it next.</p>
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
