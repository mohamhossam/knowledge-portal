import { CornerLeftUp, RotateCw, Upload, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import type { CatalogueDocument, DocumentLanguage, Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { count } from "../home/format";
import { ACCEPTED_FILES, documentWarnings, reading, warningInWords } from "./suggestions";
import type { DraftHook, UploadLine } from "./useDraft";

const LANGUAGE: Record<string, string> = { en: "English", ar: "Arabic", mixed: "English and Arabic" };

/**
 * The draft's documents: how the reading of each stands, what the reading
 * warned about (as numbered notes), and adding another.
 */
export function DraftDocuments({ release, draft, actorName }: {
  release: Release;
  draft: DraftHook;
  actorName: (id: string | null | undefined) => string;
}) {
  const id = useId().replace(/:/g, "");
  const [lit, light] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const jobs = new Map((draft.extractions.data ?? []).map((item) => [item.document_version_id, item.job]));
  const runs = draft.suggestions.data?.runs ?? [];
  const waiting = new Map<string, number>();
  for (const suggestion of draft.suggestions.data?.suggestions ?? []) {
    if (suggestion.status === "proposed") {
      waiting.set(suggestion.document_version_id, (waiting.get(suggestion.document_version_id) ?? 0) + 1);
    }
  }
  // Notes in reading order: one per warning, numbered by the documents' order.
  const notes = release.documents.flatMap((document) =>
    documentWarnings(runs, document.id).map((text, index) => ({ id: `${document.id}-${index}`, document: document.id, text: warningInWords(text) })),
  );
  const failure = [draft.read, draft.cancel, draft.retry, draft.removeDocument].find((item) => item.isError)?.error;

  return (
    <section className="govsection catalogue__first" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Documents</h2>
      <p className="govsection__lead">
        Read for catalogue changes; nothing reaches the draft until it is accepted below.
      </p>
      {failure ? <p className="docpage__failure" role="alert">{errorMessage(failure)}</p> : null}
      {release.documents.length ? (
        <table className="govtable documents">
          <caption className="visually-hidden">The draft's documents and how their reading stands</caption>
          <thead>
            <tr>
              <th scope="col">Document</th>
              <th scope="col">Reading</th>
              <th scope="col" className="cell--end">Waiting</th>
            </tr>
          </thead>
          <tbody>
            {release.documents.map((document) => {
              const job = jobs.get(document.id);
              const state = reading(job);
              const marks = notes.filter((note) => note.document === document.id);
              const read = runs.filter((run) => run.document_version_id === document.id).at(-1);
              return (
                <tr
                  key={document.id}
                  className={[
                    "row",
                    state.failed ? "row--delayed" : state.busy ? "row--running" : "",
                    marks.some((note) => note.id === lit) ? "is-lit" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <th scope="row">
                    <span dir="auto">{document.title}</span>
                    <span className="secondary govtable__by" dir="ltr">
                      <bdi>{document.filename}</bdi> · {LANGUAGE[document.language] ?? document.language} · added by {actorName(document.uploaded_by)}
                    </span>
                  </th>
                  <td>
                    <span className="status">{state.label}</span>
                    {marks.map((note) => (
                      <sup key={note.id} className="mark-wrap">
                        <a
                          id={`${id}-ref-${note.id}`}
                          href={`#${id}-note-${note.id}`}
                          className={lit === note.id ? "mark is-lit" : "mark"}
                          aria-label={`Note ${notes.indexOf(note) + 1}`}
                          onMouseEnter={() => light(note.id)}
                          onMouseLeave={() => light(null)}
                          onFocus={() => light(note.id)}
                          onBlur={() => light(null)}
                        >
                          {notes.indexOf(note) + 1}
                        </a>
                      </sup>
                    ))}
                    {read && state.label === "Read" && (
                      <span className="secondary govtable__by">{count(read.candidate_count, "suggestion")} on its last reading</span>
                    )}
                    <span className="documents__actions">
                      {!job && (
                        <button type="button" className="text-button" disabled={draft.read.isPending} onClick={() => draft.read.mutate(document.id)}>
                          Read it
                        </button>
                      )}
                      {job?.status === "queued" && (
                        <button type="button" className="text-button" disabled={draft.cancel.isPending} onClick={() => draft.cancel.mutate(job.id)}>
                          <X size={14} aria-hidden="true" />
                          Cancel the reading
                        </button>
                      )}
                      {(job?.status === "failed" || job?.status === "cancelled") && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={draft.retry.isPending || draft.read.isPending}
                          onClick={() => (job.status === "failed" ? draft.retry.mutate(job.id) : draft.read.mutate(document.id))}
                        >
                          <RotateCw size={14} aria-hidden="true" />
                          Read it again
                        </button>
                      )}
                      {removing === document.id ? (
                        <RemoveConfirm
                          document={document}
                          busy={draft.removeDocument.isPending}
                          onKeep={() => setRemoving(null)}
                          onRemove={() => draft.removeDocument.mutate(document.id, { onSuccess: () => setRemoving(null) })}
                        />
                      ) : (
                        <button type="button" className="text-button" onClick={() => setRemoving(document.id)}>
                          Remove it<span className="visually-hidden"> ({document.title})</span>
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="cell--end">{waiting.get(document.id) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No document yet. Add one below, or edit the draft by hand in the next edition of the portal.</p>
      )}

      {notes.length > 0 && (
        <ol className="timetable__notes documents__notes" aria-label="Notes on the readings">
          {notes.map((note, index) => (
            <li
              key={note.id}
              id={`${id}-note-${note.id}`}
              className={lit === note.id ? "note is-lit" : "note"}
              onMouseEnter={() => light(note.id)}
              onMouseLeave={() => light(null)}
            >
              <span className="note__number">{index + 1}</span>
              <span className="note__text">
                {note.text}
                <a
                  className="note__back"
                  href={`#${id}-ref-${note.id}`}
                  aria-label={`Back to the mark for note ${index + 1}`}
                  onFocus={() => light(note.id)}
                  onBlur={() => light(null)}
                >
                  <CornerLeftUp size={14} aria-hidden="true" />
                </a>
              </span>
            </li>
          ))}
        </ol>
      )}

      <AddDocument draft={draft} collapsed={release.documents.length > 0} />
    </section>
  );
}

function RemoveConfirm({ document, busy, onKeep, onRemove }: {
  document: CatalogueDocument;
  busy: boolean;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="documents__confirm" role="group" aria-label={`Remove ${document.title}`}>
      <span className="secondary">Its waiting suggestions stay listed, without their passages.</span>
      <button type="button" className="text-button documents__remove" disabled={busy} onClick={onRemove}>
        {busy ? "Removing…" : "Remove it from the draft"}
      </button>
      <button type="button" className="text-button" onClick={onKeep}>Keep it</button>
    </span>
  );
}

const MAX_FILES = 20;

const LINE: Record<UploadLine["state"], string> = {
  reading: "Added; reading started",
  unread: "Added; not yet read",
  refused: "Not added",
};

/** What became of each file of a multi-file upload, one line each, in the order chosen. */
function UploadResults({ lines, draft }: { lines: UploadLine[]; draft: DraftHook }) {
  const added = lines.filter((line) => line.state !== "refused").length;
  const summary = useRef<HTMLParagraphElement>(null);
  // The outcome takes focus once, so the reader goes on from it; only its summary is announced.
  useEffect(() => summary.current?.focus(), []);
  return (
    <div className="uploads">
      <p ref={summary} tabIndex={-1} className="uploads__summary" role="status">
        {added} of {count(lines.length, "file")} added
        {lines.some((line) => line.state === "unread") ? ". Some wait to be read." : "."}
      </p>
      <ul className="uploads__list">
        {lines.map((line, index) => (
          <li key={`${index}-${line.filename}`} className={`uploads__item uploads__item--${line.state}`}>
            <span className="uploads__name" dir="auto">{line.filename}</span>
            <span className="status">{LINE[line.state]}</span>
            {line.state !== "reading" && <span className="secondary uploads__why">{line.reason}</span>}
            {line.state === "unread" && (
              <button type="button" className="text-button" disabled={draft.read.isPending} onClick={() => draft.read.mutate(line.versionId)}>
                Read it
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddDocument({ draft, collapsed }: { draft: DraftHook; collapsed: boolean }) {
  const id = useId();
  const [opened, setOpened] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<DocumentLanguage>("en");
  const [added, setAdded] = useState<string | null>(null);
  const [lines, setLines] = useState<UploadLine[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  // Opening the form moves focus to its heading; cancelling returns it to "Add more documents".
  const focusOn = useRef<"form" | "more" | null>(null);
  useEffect(() => {
    if (focusOn.current === "form") heading.current?.focus();
    if (focusOn.current === "more") more.current?.focus();
    focusOn.current = null;
  }, [opened]);
  const several = files.length > 1;
  const pending = draft.addDocument.isPending || draft.addDocuments.isPending;
  const waits = files.length === 0
    ? "Choose a file first."
    : files.length > MAX_FILES
      ? `Choose at most ${MAX_FILES} files at a time.`
      : !several && !title.trim() ? "Give the document a title." : null;
  const reset = () => {
    setOpened(false);
    setFiles([]);
    setTitle("");
    if (input.current) input.current.value = "";
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const [first] = files;
    if (!first || waits) return;
    setAdded(null);
    setLines(null);
    if (several) {
      draft.addDocuments.mutate({ files, language }, {
        onSuccess: (result) => {
          setLines(result);
          reset();
        },
      });
      return;
    }
    draft.addDocument.mutate(
      { file: first, title: title.trim(), language },
      {
        onSuccess: (document) => {
          setAdded(document ? `‘${document.title}’ was added and is being read.` : null);
          reset();
        },
      },
    );
  };
  const failure = [draft.addDocument, draft.addDocuments].find((item) => item.isError)?.error;
  if (collapsed && !opened) {
    return (
      <>
        <p className="documents__more">
          <button ref={more} type="button" className="text-button" onClick={() => { focusOn.current = "form"; setOpened(true); }}>
            <Upload size={14} aria-hidden="true" />
            Add more documents
          </button>
          {added && <span className="toolbar__notice" role="status">{added}</span>}
        </p>
        {lines && <UploadResults lines={lines} draft={draft} />}
      </>
    );
  }
  return (
    <form className="add documents__add" aria-labelledby={`${id}-title`} onSubmit={submit}>
      <h3 ref={heading} tabIndex={-1} id={`${id}-title`} className="add__title">Add documents</h3>
      <p className="add__lead">
        PDF, Word (.docx), Excel, CSV, Markdown, plain text or images, up to 10 MB each and {MAX_FILES} at a time. Markdown
        tables of domains, systems, offerings and journeys are read row by row. A Word 97–2003 .doc file needs saving as
        .docx first.
      </p>
      <div className="form__grid">
        <label className="field form__field" htmlFor={`${id}-file`}>
          <span className="field__label">Files</span>
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            multiple
            className="field__input field__input--file"
            accept={ACCEPTED_FILES}
            aria-describedby={several ? `${id}-chosen` : undefined}
            onChange={(event) => {
              const chosen = [...(event.target.files ?? [])];
              setFiles(chosen);
              const [only] = chosen;
              if (only && chosen.length === 1 && !title) setTitle(only.name.replace(/\.[^.]+$/, ""));
            }}
          />
        </label>
        {several ? (
          <p id={`${id}-chosen`} className="form__field add__chosen">
            {count(files.length, "file")} chosen; each is titled by its file name.
          </p>
        ) : (
          <label className="field form__field" htmlFor={`${id}-name`}>
            <span className="field__label">Title</span>
            <input id={`${id}-name`} className="field__input" dir="auto" value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} />
          </label>
        )}
        <label className="field form__field" htmlFor={`${id}-language`}>
          <span className="field__label">{several ? "All written in" : "Written in"}</span>
          <select
            id={`${id}-language`}
            className="field__input form__select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as DocumentLanguage)}
          >
            {Object.entries(LANGUAGE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <p className="add__actions">
        <button type="submit" className="action-button" disabled={!!waits || pending} aria-describedby={waits ? `${id}-waits` : undefined}>
          <Upload size={16} aria-hidden="true" />
          {pending ? "Adding and reading…" : several ? `Add the ${files.length} files and read them` : "Add it and read it"}
        </button>
        {collapsed && (
          <button type="button" className="text-button" aria-disabled={pending || undefined}
            onClick={() => { if (!pending) { focusOn.current = "more"; reset(); } }}>
            Cancel
          </button>
        )}
      </p>
      {waits && <p id={`${id}-waits`} className="versions__waits">{waits}</p>}
      {failure && <p className="docpage__failure" role="alert">{errorMessage(failure)}</p>}
      {added && <p className="toolbar__notice" role="status">{added}</p>}
      {lines && <UploadResults lines={lines} draft={draft} />}
    </form>
  );
}
