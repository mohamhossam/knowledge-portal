import { useEffect, useId, useRef, useState } from "react";

import type { CorpusRequirement } from "../api/client";
import { count } from "../home/format";

export type CorpusActionKind = "retire" | "reinstate";

const WORDS: Record<CorpusActionKind, { title: string; commit: string; busy: string }> = {
  retire: { title: "Retire it from the corpus", commit: "Retire it", busy: "Retiring…" },
  reinstate: { title: "Return it to the corpus", commit: "Reinstate it", busy: "Reinstating…" },
};

/** Who requirement work will tell, in words: the owner by name, "you", or nobody. */
function told(item: CorpusRequirement, me: string | undefined): string {
  if (!item.owner) return "It has no owner to tell.";
  return item.owner.id === me ? "You own it, so you are told why." : `${item.owner.display_name} is told why.`;
}

/** What follows, for this requirement: its own findings and its own owner. */
function consequence(item: CorpusRequirement, kind: CorpusActionKind, me: string | undefined): string {
  if (kind === "reinstate") {
    return `It is indexed again, and screened afresh the next time its Knowledge step is opened. ${told(item, me)}`;
  }
  const findings = item.open_findings === 0
    ? "It has no open findings."
    : `${item.open_findings === 1 ? "Its open finding closes" : `Its ${count(item.open_findings, "open finding")} close`} as “source retired”.`;
  return `It leaves screening, knowledge search and suggestions until someone reinstates it, and stays readable in requirement work. ${findings} ${told(item, me)}`;
}

/**
 * The reason for a corpus action, asked in place under the requirement's row. Requirement work
 * records it with the action and tells the owner, so it is required.
 */
export function CorpusActionForm({ item, kind, me, busy, error, onSubmit, onCancel }: {
  item: CorpusRequirement;
  kind: CorpusActionKind;
  /** The signed-in admin, to say "you" when they own the requirement. */
  me: string | undefined;
  busy: boolean;
  error: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const refusal = useRef<HTMLParagraphElement>(null);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    form.current?.scrollIntoView?.({ block: "nearest" });
    field.current?.focus();
  }, []);
  useEffect(() => {
    // Requirement work's refusal takes focus, so the reader hears it and can go on from there.
    if (error) refusal.current?.focus();
  }, [error]);
  const words = WORDS[kind];
  const missing = tried && !reason.trim();
  return (
    <form
      ref={form}
      className="knowledge__act-form"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setTried(true);
        if (reason.trim()) onSubmit(reason.trim());
        else field.current?.focus();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
    >
      <p id={`${id}-title`} className="knowledge__act-title">
        {words.title}: <span dir="auto">‘{item.title}’</span>
      </p>
      <p className="secondary knowledge__act-lead">{consequence(item, kind, me)}</p>
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
      {missing && (
        <p id={`${id}-missing`} className="docpage__failure">Say why: requirement work records it and tells the owner.</p>
      )}
      {error && (
        <p ref={refusal} tabIndex={-1} className="docpage__failure" role="alert">{error}</p>
      )}
      <p className="govsection__actions">
        <button type="submit" className="action-button" aria-disabled={busy || undefined}>
          {busy ? words.busy : words.commit}
        </button>
        <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onCancel(); }}>
          Cancel
        </button>
      </p>
    </form>
  );
}
