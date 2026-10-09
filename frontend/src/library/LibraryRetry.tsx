import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { api, type LibraryRetryScope } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, ConsequencePanel, Lines } from "../design/components";
import { useDisclosure, useFocusAfterRender } from "../design/hooks";
import { Content, Outcome } from "./parts";
import { plural } from "./where";

const WORDS: Record<LibraryRetryScope, {
  trigger: (n: number) => string;
  title: (n: number) => string;
  happens: string;
  done: (n: number) => string;
}> = {
  reading: {
    trigger: (n) => `Try reading ${n === 1 ? "it" : `all ${n}`} again…`,
    title: (n) => `Try reading ${plural(n, "document")} again`,
    happens: "Each is scanned and read again from the start, whoever owns it. If the file itself is the problem, it stops after three attempts and its owner sees why.",
    done: (n) => `Reading ${plural(n, "document")} again. Jobs shows the progress.`,
  },
  indexing: {
    trigger: (n) => `Try indexing ${n === 1 ? "it" : `all ${n}`} again…`,
    title: (n) => `Try indexing ${plural(n, "document")} again`,
    happens: "Each approved version is indexed for search again, from where it stopped. Nothing is published that wasn't approved already.",
    done: (n) => `Indexing ${plural(n, "document")} again. Jobs shows the progress.`,
  },
};

/**
 * The library's stopped work, retried in one go whoever owns each document
 * (Knowledge Center C): one line per kind, each asking in place first through
 * a consequence panel that names the documents (§5).
 */
export function LibraryRetry({ stopped, onDone }: { stopped: Record<LibraryRetryScope, string[]>; onDone: () => void }) {
  // The outcome outlives the line it came from: once retried, the line has nothing left to offer.
  const [said, setSaid] = useState<string | null>(null);
  const outcome = useRef<HTMLParagraphElement>(null);
  const focusLater = useFocusAfterRender();
  return (
    <>
      {(["reading", "indexing"] as const).map((scope) =>
        stopped[scope].length > 0 ? (
          <RetryLine
            key={scope}
            scope={scope}
            titles={stopped[scope]}
            onDone={(text) => {
              setSaid(text);
              onDone();
              focusLater(() => outcome.current);
            }}
          />
        ) : null,
      )}
      <Outcome text={said} focusRef={outcome} />
    </>
  );
}

function RetryLine({ scope, titles, onDone }: { scope: LibraryRetryScope; titles: string[]; onDone: (text: string) => void }) {
  const panel = useDisclosure();
  const words = WORDS[scope];
  const run = useMutation({
    mutationFn: () => api.retryLibrary(scope),
    onSuccess: (result) => {
      panel.close();
      onDone(words.done(result.documents));
    },
  });
  const n = titles.length;
  return (
    <div className="lib-retry">
      <p className="lib-retry__line">
        {scope === "reading"
          ? `${plural(n, "document")} couldn't be read.`
          : `Indexing stopped for ${plural(n, "document")}: requirement work can't cite ${n === 1 ? "it" : "them"} yet.`}
      </p>
      <ActionGroup>
        <Button aria-expanded={panel.open} onClick={(event) => { if (panel.open) panel.close(); else { run.reset(); panel.show(event); } }}>{words.trigger(n)}</Button>
      </ActionGroup>
      {panel.open && (
        <ConsequencePanel
          panelRef={panel.panel}
          title={words.title(n)}
          happens={words.happens}
          affects={<Lines label="Documents">{titles.map((title, index) => <li key={`${index}-${title}`}><Content text={title} /></li>)}</Lines>}
          reversibility="Their owners still see each one's state and cause in the library and in Jobs."
          confirmLabel={words.title(n)}
          keepLabel="Cancel"
          busy={run.isPending}
          failure={run.isError ? `Not done: ${errorMessage(run.error)}` : null}
          onConfirm={() => run.mutate()}
          onKeep={panel.close}
        />
      )}
    </div>
  );
}
