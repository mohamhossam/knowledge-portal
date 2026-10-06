import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type ReindexScope } from "../api/client";
import { errorMessage } from "../api/errors";
import { count } from "../home/format";

type Said = { text: string; failed: boolean };

const CONFIRM: Record<ReindexScope, { title: (n: number) => string; lead: (n: number) => string; commit: (n: number) => string }> = {
  failed: {
    title: (n) => `Retry the ${count(n, "requirement")} that stopped indexing?`,
    lead: (n) =>
      `${n === 1 ? "It is" : "Each is"} tried again from where it stopped. If the cause is still there, it stops again after three attempts.`,
    commit: (n) => (n === 1 ? "Retry it" : "Retry them"),
  },
  requirements: {
    title: (n) => `Index ${n === 1 ? "this requirement" : `these ${n} requirements`} again?`,
    lead: () =>
      "Requirement work indexes them again in the background. Text that has not changed is not sent to the model again. Retired requirements are left out.",
    commit: (n) => (n === 1 ? "Reindex it" : "Reindex them"),
  },
};

/**
 * Bulk work on the corpus: retry everything that stopped indexing, or index the requirements
 * shown again. Each asks in place first; requirement work's index worker does the work. The
 * line of actions stays in place while a confirmation is open, so focus always has somewhere
 * to return to.
 */
export function BulkReindex({ failed, shown, offerReindex, onDone }: {
  failed: number;
  shown: string[];
  /** False when the requirements shown are exactly those that stopped indexing. */
  offerReindex: boolean;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState<ReindexScope | null>(null);
  const [outcome, setOutcome] = useState<Said | null>(null);
  const triggers = useRef<Partial<Record<ReindexScope, HTMLButtonElement | null>>>({});
  const title = useRef<HTMLParagraphElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  // Where focus goes once the confirmation closes: its trigger, or the outcome when that has gone.
  const returnTo = useRef<ReindexScope | "outcome" | null>(null);
  useEffect(() => {
    if (confirming) {
      title.current?.focus();
      return;
    }
    const to = returnTo.current;
    if (to === null) return;
    returnTo.current = null;
    ((to === "outcome" ? null : triggers.current[to]) ?? said.current)?.focus();
  }, [confirming]);

  const close = (scope: ReindexScope, to: ReindexScope | "outcome" = scope) => {
    returnTo.current = to;
    setConfirming(null);
  };
  const run = useMutation({
    mutationFn: (scope: ReindexScope) => api.reindexCorpus(scope, scope === "requirements" ? shown : []),
    onSuccess: (result, scope) => {
      setOutcome({
        text: scope === "failed"
          ? `Retrying ${count(result.requirements, "requirement")}. The table updates as each is indexed.`
          : `${count(result.requirements, "requirement")} will be indexed again. The table updates as each is done.`,
        failed: false,
      });
      onDone();
      close(scope, "outcome");
    },
    onError: (error, scope) => {
      setOutcome({ text: `Not done: ${errorMessage(error)}`, failed: true });
      close(scope, "outcome");
    },
  });
  const sizes: Record<ReindexScope, number> = { failed, requirements: shown.length };
  const reindex = offerReindex && shown.length > 0;

  return (
    <div className="knowledge__batch">
      <p
        ref={said}
        tabIndex={-1}
        className={outcome?.failed ? "docpage__failure" : "toolbar__notice"}
        role="status"
      >
        {outcome?.text ?? ""}
      </p>
      {(failed > 0 || reindex) && (
        <p className="knowledge__bulk">
          {failed > 0 && (
            <button
              ref={(node) => { triggers.current.failed = node; }}
              type="button"
              className="next-button"
              aria-expanded={confirming === "failed"}
              onClick={() => { setOutcome(null); setConfirming("failed"); }}
            >
              Retry the {count(failed, "requirement")} that stopped indexing
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
          {reindex && (
            <button
              ref={(node) => { triggers.current.requirements = node; }}
              type="button"
              className="text-button"
              aria-expanded={confirming === "requirements"}
              onClick={() => { setOutcome(null); setConfirming("requirements"); }}
            >
              Reindex the {count(shown.length, "requirement")} shown
            </button>
          )}
        </p>
      )}
      {confirming && (
        <div
          className="knowledge__confirm"
          role="group"
          aria-labelledby="bulk-title"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !run.isPending) close(confirming);
          }}
        >
          <p id="bulk-title" ref={title} tabIndex={-1} className="knowledge__confirm-title">
            {CONFIRM[confirming].title(sizes[confirming])}
          </p>
          <p className="knowledge__confirm-lead">{CONFIRM[confirming].lead(sizes[confirming])}</p>
          <p className="govsection__actions">
            <button
              type="button"
              className="action-button"
              aria-disabled={run.isPending || undefined}
              onClick={() => { if (!run.isPending) run.mutate(confirming); }}
            >
              {run.isPending ? "Asking…" : CONFIRM[confirming].commit(sizes[confirming])}
            </button>
            <button
              type="button"
              className="text-button"
              aria-disabled={run.isPending || undefined}
              onClick={() => { if (!run.isPending) close(confirming); }}
            >
              Cancel
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
