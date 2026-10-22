import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, Field, Status } from "../design/components";
import { count } from "../home/format";
import { HISTORIC_LIST_KEY, historicHref } from "./historic";

const MAX_FILES = 20;
const ACCEPTED = ".docx,.pdf";

type Result = { filename: string; outcome: string; id?: string | null; reason?: string | null };

/**
 * Several old BRDs at once: each starts its own draft and is read, or is refused with why.
 * A form of its own on the record side, opened from the list's head.
 */
export function ImportBrds({ onCancel, panelRef }: { onCancel?: () => void; panelRef?: RefObject<HTMLElement | null> }) {
  const id = useId();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[] | null>(null);
  // Opened from a button, it takes focus once, when it mounts.
  const opened = useRef(onCancel !== undefined);
  useEffect(() => {
    if (opened.current) heading.current?.focus();
  }, []);
  const importing = useMutation({
    mutationFn: () => api.importHistoric(files),
    onSuccess: (response) => {
      setResults(response.results.map((item) => ({ filename: item.filename, outcome: item.outcome, id: item.version_id, reason: item.reason })));
      setFiles([]);
      if (input.current) input.current.value = "";
      void queryClient.invalidateQueries({ queryKey: HISTORIC_LIST_KEY });
    },
  });
  const waits = files.length === 0
    ? "Choose the BRDs first."
    : files.length > MAX_FILES ? `Choose at most ${MAX_FILES} at a time.` : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!waits && !importing.isPending) importing.mutate();
  };
  return (
    <form
      ref={panelRef as RefObject<HTMLFormElement>}
      className="ds-formpanel hist-import"
      aria-labelledby={`${id}-title`}
      onSubmit={submit}
      onKeyDown={(event) => { if (event.key === "Escape" && onCancel && !importing.isPending) onCancel(); }}
    >
      <h2 ref={heading} id={`${id}-title`} tabIndex={-1} className="ds-formpanel__title">Import old BRDs</h2>
      <p className="hist-lead">
        Word (.docx) or PDF, up to 10 MB each and {MAX_FILES} at a time. Each starts its own draft and is read; work-item ids
        it mentions are suggested for you to confirm. A Word 97–2003 .doc file needs saving as .docx first.
      </p>
      <Field label="BRDs" hint="Choose one or more files.">
        {(control) => (
          <input
            ref={input}
            {...control}
            type="file"
            multiple
            className="ds-input hist-file-input"
            accept={ACCEPTED}
            onChange={(event) => { setFiles([...(event.target.files ?? [])]); setResults(null); }}
          />
        )}
      </Field>
      <ActionGroup>
        <Button type="submit" variant="primary" icon={<Upload size={16} />} busy={importing.isPending} unavailableReason={importing.isPending ? null : waits}>
          {importing.isPending ? "Importing…" : files.length > 1 ? `Import the ${files.length} BRDs` : files.length === 1 ? "Import the BRD" : "Import the BRDs"}
        </Button>
        {onCancel && <Button onClick={onCancel}>Close</Button>}
      </ActionGroup>
      {importing.isError && <p className="hist-failure" role="alert"><Status tone="attention">{errorMessage(importing.error)}</Status></p>}
      {results && <ImportResults results={results} />}
    </form>
  );
}

function ImportResults({ results }: { results: Result[] }) {
  const started = results.filter((item) => item.outcome === "added").length;
  const summary = useRef<HTMLParagraphElement>(null);
  // The outcome takes focus once, so the reader goes on from it.
  useEffect(() => summary.current?.focus(), []);
  return (
    <div className="hist-results">
      <p ref={summary} tabIndex={-1} className="hist-results__summary" role="status">
        {started} of {count(results.length, "BRD")} imported{started > 0 ? "; each is being read." : "."}
      </p>
      <ul className="hist-results__list">
        {results.map((item, index) => (
          <li key={`${index}-${item.filename}`}>
            <bdi className="hist-results__name">
              {item.outcome === "added" && item.id ? <Link to={historicHref(item.id)}>{item.filename}</Link> : item.filename}
            </bdi>
            {item.outcome === "added" ? <Status tone="working">Imported, being read</Status> : <Status tone="attention">Refused</Status>}
            {item.reason && <span className="hist-detail">{item.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
