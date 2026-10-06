import { useEffect, useId, useRef, useState } from "react";

import type { CorpusRequirement } from "../api/client";

export type CorpusActionKind = "retire" | "reinstate";

const WORDS: Record<CorpusActionKind, { title: string; lead: string; commit: string; busy: string }> = {
  retire: {
    title: "Retire it from the corpus",
    lead: "It leaves screening, knowledge search and suggestions until someone reinstates it. Its open findings close as “source retired”, and its owner is told why. It stays readable in requirement work.",
    commit: "Retire it",
    busy: "Retiring…",
  },
  reinstate: {
    title: "Return it to the corpus",
    lead: "It is indexed again, and screened afresh the next time its Knowledge step is opened. Its owner is told why.",
    commit: "Reinstate it",
    busy: "Reinstating…",
  },
};

/**
 * The reason for a corpus action, asked in place under the requirement's row. Requirement work
 * records it with the action and tells the owner, so it is required.
 */
export function CorpusActionForm({ item, kind, busy, error, onSubmit, onCancel }: {
  item: CorpusRequirement;
  kind: CorpusActionKind;
  busy: boolean;
  error: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    field.current?.focus();
  }, []);
  const words = WORDS[kind];
  const missing = tried && !reason.trim();
  return (
    <form
      className="knowledge__act-form"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (reason.trim() && !busy) onSubmit(reason.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
    >
      <p id={`${id}-title`} className="knowledge__act-title">
        {words.title}: <span dir="auto">‘{item.title}’</span>
      </p>
      <p className="secondary knowledge__act-lead">{words.lead}</p>
      <label className="field">
        <span className="field__label">Why</span>
        <textarea
          ref={field}
          className="field__input"
          rows={2}
          maxLength={500}
          value={reason}
          aria-required="true"
          aria-invalid={missing || undefined}
          aria-describedby={missing ? `${id}-missing` : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {missing && <p id={`${id}-missing`} className="docpage__failure">Say why: requirement work records it and tells the owner.</p>}
      {error && <p className="docpage__failure" role="alert">{error}</p>}
      <p className="govsection__actions">
        <button type="submit" className="action-button" disabled={busy}>{busy ? words.busy : words.commit}</button>
        <button type="button" className="text-button" disabled={busy} onClick={onCancel}>Cancel</button>
      </p>
    </form>
  );
}
