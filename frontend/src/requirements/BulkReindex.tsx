import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, type ReindexScope } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, ConsequencePanel, Status } from "../design/components";
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
 * listed again. Each asks in place first; requirement work's index worker does the work. The
 * buttons stay in place while a confirmation is open, so focus always has somewhere to return.
 */
export function BulkReindex({ failed, shown, offerReindex, onDone }: {
  failed: number;
  shown: string[];
  /** False when the requirements listed are exactly those that stopped indexing. */
  offerReindex: boolean;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState<ReindexScope | null>(null);
  const [outcome, setOutcome] = useState<Said | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  // Where focus goes once the confirmation closes: its trigger, or the outcome when that has gone.
  const returnTo = useRef<ReindexScope | "outcome" | null>(null);
  useEffect(() => {
    if (confirming) return;
    const to = returnTo.current;
    if (to === null) return;
    returnTo.current = null;
    ((to === "outcome" ? null : root.current?.querySelector<HTMLElement>(`[data-trigger="${to}"]`)) ?? said.current)?.focus();
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
          ? `Retrying ${count(result.requirements, "requirement")}. The list updates as each is indexed.`
          : `${count(result.requirements, "requirement")} will be indexed again. The list updates as each is done.`,
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
    <div ref={root} className="rk-bulk">
      <p ref={said} tabIndex={-1} className="rk-said" role="status">
        {outcome && <Status tone={outcome.failed ? "attention" : "done"}>{outcome.text}</Status>}
      </p>
      {(failed > 0 || reindex) && (
        <ActionGroup>
          {failed > 0 && (
            <Button
              data-trigger="failed"
              variant="primary"
              aria-expanded={confirming === "failed"}
              onClick={() => { setOutcome(null); setConfirming("failed"); }}
            >
              Retry the {count(failed, "requirement")} that stopped indexing
            </Button>
          )}
          {reindex && (
            <Button
              data-trigger="requirements"
              variant="tertiary"
              aria-expanded={confirming === "requirements"}
              onClick={() => { setOutcome(null); setConfirming("requirements"); }}
            >
              Reindex the {count(shown.length, "requirement")} listed
            </Button>
          )}
        </ActionGroup>
      )}
      {confirming && (
        <ConsequencePanel
          title={CONFIRM[confirming].title(sizes[confirming])}
          happens={CONFIRM[confirming].lead(sizes[confirming])}
          reversibility="Nothing to undo: indexing changes no requirement, only how it is found."
          confirmLabel={CONFIRM[confirming].commit(sizes[confirming])}
          busyLabel="Asking…"
          keepLabel="Cancel"
          busy={run.isPending}
          onConfirm={() => run.mutate(confirming)}
          onKeep={() => { if (!run.isPending) close(confirming); }}
        />
      )}
    </div>
  );
}
