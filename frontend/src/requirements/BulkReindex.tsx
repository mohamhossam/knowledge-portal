import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type ReindexScope } from "../api/client";
import { errorMessage } from "../api/errors";
import { count } from "../home/format";

type Said = { text: string; failed: boolean };

const CONFIRM: Record<ReindexScope, { title: (n: number) => string; lead: string; commit: string }> = {
  failed: {
    title: (n) => `Retry the ${count(n, "requirement")} that stopped indexing?`,
    lead: "Each is tried again from where it stopped. If the cause is still there, it stops again after three attempts.",
    commit: "Retry them",
  },
  requirements: {
    title: (n) => `Index ${n === 1 ? "this requirement" : `these ${n} requirements`} again?`,
    lead: "Requirement work indexes them again in the background. Text that has not changed is not sent to the model again.",
    commit: "Reindex them",
  },
};

/**
 * Bulk work on the corpus: retry everything that stopped indexing, or index the requirements
 * shown again. Each asks in place first; requirement work's index worker does the work.
 */
export function BulkReindex({ failed, shown, onDone }: { failed: number; shown: string[]; onDone: () => void }) {
  const [confirming, setConfirming] = useState<ReindexScope | null>(null);
  const [outcome, setOutcome] = useState<Said | null>(null);
  const triggers = useRef<Partial<Record<ReindexScope, HTMLButtonElement | null>>>({});
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) panel.current?.focus();
  }, [confirming]);

  const close = (scope: ReindexScope) => {
    setConfirming(null);
    triggers.current[scope]?.focus();
  };
  const run = useMutation({
    mutationFn: (scope: ReindexScope) => api.reindexCorpus(scope, scope === "requirements" ? shown : []),
    onSuccess: (result, scope) =>
      setOutcome({
        text: scope === "failed"
          ? `Retrying ${count(result.requirements, "requirement")}. The table updates as each is indexed.`
          : `${count(result.requirements, "requirement")} will be indexed again. The table updates as each is done.`,
        failed: false,
      }),
    onError: (error) => setOutcome({ text: `Not done: ${errorMessage(error)}`, failed: true }),
    onSettled: (_result, _error, scope) => {
      onDone();
      close(scope);
    },
  });
  const sizes: Record<ReindexScope, number> = { failed, requirements: shown.length };

  return (
    <div className="knowledge__batch">
      {outcome && <p className={outcome.failed ? "docpage__failure" : "toolbar__notice"} role="status">{outcome.text}</p>}
      {!confirming && (failed > 0 || shown.length > 0) && (
        <p className="knowledge__bulk">
          {failed > 0 && (
            <button
              ref={(node) => { triggers.current.failed = node; }}
              type="button"
              className="next-button"
              onClick={() => { setOutcome(null); setConfirming("failed"); }}
            >
              Retry the {count(failed, "requirement")} that stopped indexing
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
          {shown.length > 0 && (
            <button
              ref={(node) => { triggers.current.requirements = node; }}
              type="button"
              className="text-button"
              onClick={() => { setOutcome(null); setConfirming("requirements"); }}
            >
              Reindex the {count(shown.length, "requirement")} shown
            </button>
          )}
        </p>
      )}
      {confirming && (
        <div ref={panel} className="knowledge__confirm" tabIndex={-1} role="group" aria-labelledby="bulk-title">
          <p id="bulk-title" className="knowledge__confirm-title">{CONFIRM[confirming].title(sizes[confirming])}</p>
          <p>{CONFIRM[confirming].lead}</p>
          <p className="govsection__actions">
            <button type="button" className="action-button" disabled={run.isPending} onClick={() => run.mutate(confirming)}>
              {run.isPending ? "Asking…" : CONFIRM[confirming].commit}
            </button>
            <button type="button" className="text-button" disabled={run.isPending} onClick={() => close(confirming)}>
              Cancel
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
