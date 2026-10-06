import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type LibraryRetryScope } from "../api/client";
import { errorMessage } from "../api/errors";
import { count } from "../home/format";

type Said = { text: string; failed: boolean };

const CONFIRM: Record<LibraryRetryScope, {
  trigger: (n: number) => string;
  title: (n: number) => string;
  lead: (n: number) => string;
  commit: (n: number) => string;
  done: (n: number) => string;
}> = {
  reading: {
    trigger: (n) => `Read the ${count(n, "document")} that failed again`,
    title: (n) => `Read ${n === 1 ? "this document" : `these ${n} documents`} again?`,
    lead: (n) =>
      `${n === 1 ? "It is" : "Each is"} scanned and read from the start, whoever owns it. If the file itself is the problem, it fails again after three attempts and its owner sees why.`,
    commit: (n) => (n === 1 ? "Read it again" : "Read them again"),
    done: (n) => `${count(n, "document")} will be read again. The table updates as each is read.`,
  },
  indexing: {
    trigger: (n) => `Retry the ${count(n, "document")} whose indexing stopped`,
    title: (n) => `Index ${n === 1 ? "this document" : `these ${n} documents`} again?`,
    lead: () =>
      "Each approved version is indexed for search again, from where it stopped. Nothing is published that was not already approved.",
    commit: (n) => (n === 1 ? "Retry it" : "Retry them"),
    done: (n) => `Retrying ${count(n, "document")}. The table updates as each is indexed.`,
  },
};

const ORDER: LibraryRetryScope[] = ["reading", "indexing"];

/**
 * Retry the library's stopped work in one go, whoever owns each document (Knowledge Center C).
 * Each asks in place first. The line of actions stays in place while a confirmation is open,
 * so focus always has somewhere to return to.
 */
export function LibraryRetry({ stopped, onDone }: {
  stopped: Record<LibraryRetryScope, number>;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState<LibraryRetryScope | null>(null);
  const [outcome, setOutcome] = useState<Said | null>(null);
  const triggers = useRef<Partial<Record<LibraryRetryScope, HTMLButtonElement | null>>>({});
  const title = useRef<HTMLParagraphElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  // Where focus goes once the confirmation closes: its trigger, or the outcome when that has gone.
  const returnTo = useRef<LibraryRetryScope | "outcome" | null>(null);
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

  const close = (to: LibraryRetryScope | "outcome") => {
    returnTo.current = to;
    setConfirming(null);
  };
  const run = useMutation({
    mutationFn: (scope: LibraryRetryScope) => api.retryLibrary(scope),
    onSuccess: (result, scope) => {
      setOutcome({ text: CONFIRM[scope].done(result.documents), failed: false });
      onDone();
      close("outcome");
    },
    onError: (error) => {
      setOutcome({ text: `Not done: ${errorMessage(error)}`, failed: true });
      close("outcome");
    },
  });
  const offered = ORDER.filter((scope) => stopped[scope] > 0);

  return (
    <div className="knowledge__batch">
      <p ref={said} tabIndex={-1} className={outcome?.failed ? "docpage__failure" : "toolbar__notice"} role="status">
        {outcome?.text ?? ""}
      </p>
      {offered.length > 0 && (
        <p className="knowledge__bulk">
          {offered.map((scope, index) => (
            <button
              key={scope}
              ref={(node) => { triggers.current[scope] = node; }}
              type="button"
              className={index === 0 ? "next-button" : "text-button"}
              aria-expanded={confirming === scope}
              onClick={() => { setOutcome(null); setConfirming(scope); }}
            >
              {CONFIRM[scope].trigger(stopped[scope])}
              {index === 0 && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          ))}
        </p>
      )}
      {confirming && (
        <div
          className="knowledge__confirm"
          role="group"
          aria-labelledby="library-retry-title"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !run.isPending) close(confirming);
          }}
        >
          <p id="library-retry-title" ref={title} tabIndex={-1} className="knowledge__confirm-title">
            {CONFIRM[confirming].title(stopped[confirming])}
          </p>
          <p className="knowledge__confirm-lead">{CONFIRM[confirming].lead(stopped[confirming])}</p>
          <p className="govsection__actions">
            <button
              type="button"
              className="action-button"
              aria-disabled={run.isPending || undefined}
              onClick={() => { if (!run.isPending) run.mutate(confirming); }}
            >
              {run.isPending ? "Asking…" : CONFIRM[confirming].commit(stopped[confirming])}
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
