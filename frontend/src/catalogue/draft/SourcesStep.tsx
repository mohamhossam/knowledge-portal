import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RotateCw, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { api, type CatalogueDocument, type CatalogueFileFormat, type DocumentLanguage, type Release } from "../../api/client";
import type { components } from "../../api/schema";
import { errorMessage } from "../../api/errors";
import {
  ActionGroup, Button, type Column, ConsequencePanel, DataTable, EmptyState, Lines, Section, Select, Status, type StatusTone, TextField,
  Upload, type UploadItem,
} from "../../design/components";
import { useDisclosure } from "../../design/hooks";
import { count } from "../../home/format";
import { ButtonLink } from "../../shell/links";
import { traceLine, useChangeRequests } from "../inbox";
import { ACCEPTED_FILES, documentWarnings, type Reading, reading, warningInWords } from "../suggestions";
import { useCatalogueContext } from "../useCatalogue";
import { type DraftHook, type UploadLine, useDraft } from "../useDraft";
import { saveBlob, useCatalogueFile } from "../useEditing";
import { ChangeTable } from "./ChangeTable";
import { Said } from "./parts";

type Schemas = components["schemas"];

const LANGUAGE: Record<string, string> = { en: "English", ar: "Arabic", mixed: "English and Arabic" };
const MAX_FILES = 20;

/**
 * Step 1 of a draft: where its changes come from. Its documents and how their
 * reading stands, the change requests read into it, and the catalogue as a
 * file. Nothing here changes the draft until a suggestion is accepted on Decide
 * (or a catalogue file replaces its content, which says so first).
 */
export function SourcesStep() {
  const { book, actorName, base } = useCatalogueContext();
  const release = book.release;
  const draft = useDraft(release);
  const waiting = (draft.suggestions.data?.suggestions ?? []).filter((item) => item.status === "proposed").length;
  return (
    <div className="draft-step">
      <Documents release={release} draft={draft} actorName={actorName} />
      <AddDocuments key={release.id} draft={draft} />
      <ChangeRequests release={release} draft={draft} />
      <CatalogueFile release={release} />
      <p className="draft-next">
        <ButtonLink to={`${base}/decide`} variant={waiting ? "primary" : "secondary"}>
          {waiting ? `Next: decide ${count(waiting, "suggestion")}` : "Next: decide"}
        </ButtonLink>
      </p>
    </div>
  );
}

type NoLongerStated = Schemas["NoLongerStatedResponse"];
type DocumentRow = {
  document: CatalogueDocument; tone: StatusTone; state: Reading; notes: string[]; found: number | null; waiting: number;
  // What the catalogue took from an earlier version of the document that this one no longer says.
  dropped: NoLongerStated[];
};

function Documents({ release, draft, actorName }: { release: Release; draft: DraftHook; actorName: (id: string | null | undefined) => string }) {
  const removing = useDisclosure();
  const { open: replacingOpen, show: showReplacing, close: closeReplacing, panel: replacingPanel } = useDisclosure();
  const [chosen, setChosen] = useState<CatalogueDocument | null>(null);
  const jobs = new Map((draft.extractions.data ?? []).map((item) => [item.document_version_id, item.job]));
  // Each answer is read against the moment it arrived, so elapsed times move with the polling.
  const now = draft.extractions.dataUpdatedAt;
  const runs = draft.suggestions.data?.runs ?? [];
  const waiting = new Map<string, number>();
  for (const suggestion of draft.suggestions.data?.suggestions ?? []) {
    if (suggestion.status === "proposed") waiting.set(suggestion.document_version_id, (waiting.get(suggestion.document_version_id) ?? 0) + 1);
  }
  const rows: DocumentRow[] = release.documents.map((document) => {
    const state = reading(jobs.get(document.id), now);
    const last = runs.filter((run) => run.document_version_id === document.id).at(-1);
    return {
      document,
      tone: state.failed ? "attention" : state.stalled ? "warning" : state.busy ? "working" : state.label === "Read" ? "done" : "neutral",
      state,
      // The last reading's notes; a reading under way has its own lines to say.
      notes: state.busy ? [] : documentWarnings(runs, document.id).map(warningInWords),
      found: last && !state.busy && state.label === "Read" ? last.candidate_count : null,
      waiting: waiting.get(document.id) ?? 0,
      dropped: last && !state.busy ? last.no_longer_stated ?? [] : [],
    };
  });
  const failure = [draft.read, draft.cancel, draft.retry].find((item) => item.isError)?.error;

  const columns: Column<DocumentRow>[] = [
    {
      id: "document",
      header: "Document",
      rowHeader: true,
      bidi: true,
      cell: ({ document }) => (
        <>
          {document.title}
          <span className="draft-detail" dir="ltr">
            <bdi>{document.filename}</bdi> · {LANGUAGE[document.language] ?? document.language} · added by <bdi>{actorName(document.uploaded_by)}</bdi>
          </span>
          {document.supersedes && <EarlierVersions document={document} />}
        </>
      ),
    },
    {
      id: "reading",
      header: "Reading",
      width: "20rem",
      cell: (row) => (
        <>
          <Status tone={row.tone}>{row.state.label}</Status>
          {row.state.part && (
            <progress
              className="draft-parts"
              max={row.state.part.total}
              value={row.state.part.done}
              aria-label={`Parts of ${row.document.title} read`}
              aria-valuetext={`${row.state.part.done} of ${row.state.part.total} parts read`}
            />
          )}
          {row.state.details.map((line) => <span key={line} className="draft-detail">{line}</span>)}
          {row.state.busy && !row.state.stalled && <span className="draft-detail">Its suggestions arrive on Decide when the reading ends.</span>}
          {row.found !== null && <span className="draft-detail">{count(row.found, "suggestion")} on its last reading</span>}
          {row.notes.length > 0 && (
            <Lines label={`What the reading of ${row.document.title} noted`}>
              {row.notes.map((note) => <li key={note} className="draft-detail" dir="auto">{note}</li>)}
            </Lines>
          )}
          {row.dropped.length > 0 && (
            <Lines label={`No longer said in this version of ${row.document.title}; still in the catalogue`}>
              {row.dropped.map((item) => (
                <li key={`${item.kind}:${item.subject}:${item.label}`} className="draft-detail" dir="auto">
                  {item.label}
                  {item.quote && <> (earlier version{item.location ? `, ${item.location}` : ""}: “{item.quote}”)</>}
                </li>
              ))}
            </Lines>
          )}
        </>
      ),
    },
    {
      id: "waiting",
      header: "Waiting",
      numeric: true,
      width: "6rem",
      // Nothing can wait on Decide before the reading ends; a 0 would read as "it found nothing".
      cell: (row) => (row.state.busy && !row.waiting ? <span className="draft-detail">Not yet</span> : row.waiting.toLocaleString("en")),
    },
    {
      id: "actions",
      header: <span className="ds-visually-hidden">Actions</span>,
      width: "13rem",
      cell: ({ document }) => {
        const job = jobs.get(document.id);
        return (
          <ActionGroup label={`Act on ${document.title}`}>
            {!job && <Button variant="link" busy={draft.read.isPending} onClick={() => draft.read.mutate(document.id)}>Read it</Button>}
            {job?.status === "queued" && (
              <Button variant="link" icon={<X size={14} />} busy={draft.cancel.isPending} onClick={() => draft.cancel.mutate(job.id)}>Cancel the reading</Button>
            )}
            {(job?.status === "failed" || job?.status === "cancelled") && (
              <Button
                variant="link"
                icon={<RotateCw size={14} />}
                busy={draft.retry.isPending || draft.read.isPending}
                onClick={() => (job.status === "failed" ? draft.retry.mutate(job.id) : draft.read.mutate(document.id))}
              >
                Read it again
              </Button>
            )}
            <Button
              variant="link"
              aria-label={`Add a new version of ${document.title}…`}
              aria-expanded={replacingOpen && chosen?.id === document.id}
              onClick={(event) => {
                setChosen(document);
                showReplacing(event);
              }}
            >
              New version…
            </Button>
            <Button
              variant="link"
              aria-label={`Remove ${document.title}…`}
              aria-expanded={removing.open && chosen?.id === document.id}
              onClick={(event) => {
                setChosen(document);
                removing.show(event);
              }}
            >
              Remove…
            </Button>
          </ActionGroup>
        );
      },
    },
  ];

  return (
    <Section title="Documents" count={release.documents.length}>
      <p className="draft-lead">Each document is read for catalogue changes. What it says arrives on Decide as suggestions; nothing reaches the draft until one is accepted.</p>
      {failure ? <p role="status"><Status tone="attention">{errorMessage(failure)}</Status></p> : null}
      {rows.length ? (
        <DataTable caption="The draft's documents and how their reading stands" captionHidden columns={columns} rows={rows} rowId={(row) => row.document.id} />
      ) : (
        <EmptyState title="No document yet.">
          <p>Add the documents that describe the change below: design documents, integration specs, spreadsheets or images.</p>
        </EmptyState>
      )}
      {removing.open && chosen && (
        <ConsequencePanel
          panelRef={removing.panel}
          title={<>Remove <bdi>‘{chosen.title}’</bdi> from the draft</>}
          happens="It is no longer one of the draft's documents."
          affects={<p>{count(waiting.get(chosen.id) ?? 0, "suggestion")} from it {waiting.get(chosen.id) === 1 ? "waits" : "wait"} on Decide; they stay listed, without their passages.</p>}
          reversibility="You can add the file again; it is then read afresh."
          confirmLabel="Remove it"
          busyLabel="Removing…"
          keepLabel="Keep it"
          busy={draft.removeDocument.isPending}
          failure={draft.removeDocument.isError ? errorMessage(draft.removeDocument.error) : null}
          onConfirm={() => draft.removeDocument.mutate(chosen.id, { onSuccess: removing.close })}
          onKeep={removing.close}
        />
      )}
      {replacingOpen && chosen && (
        <section ref={replacingPanel} tabIndex={-1} aria-label={`New version of ${chosen.title}`}>
          <NewVersion key={chosen.id} document={chosen} draft={draft} onDone={closeReplacing} />
        </section>
      )}
    </Section>
  );
}

/** The versions a document replaced, newest first, as the curator uploaded them. */
function EarlierVersions({ document }: { document: CatalogueDocument }) {
  const versions = useQuery({ queryKey: ["architecture", "documents"], queryFn: () => api.documentVersions() });
  const known = new Map((versions.data ?? []).map((item) => [item.id, item]));
  const chain: CatalogueDocument[] = [];
  for (let at = document.supersedes; at && !chain.some((item) => item.id === at); at = known.get(at)?.supersedes) {
    const earlier = known.get(at);
    if (!earlier) break;
    chain.push(earlier);
  }
  return (
    <span className="draft-detail">
      A new version: it took an earlier version's place
      {chain.length > 0 && <>; before it {chain.map((item) => `${item.filename} (${item.uploaded_at.slice(0, 10)})`).join(", ")}</>}
    </span>
  );
}

/** A new version of a document: it takes the old version's place in the draft and is read; what
 * the catalogue took from the old one and the new one no longer says is listed after its reading. */
function NewVersion({ document, draft, onDone }: { document: CatalogueDocument; draft: DraftHook; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [said, setSaid] = useState<{ text: string; failed?: boolean } | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.addDocument.isPending) return;
    if (!file) {
      setSaid({ text: "Choose the new version's file first.", failed: true });
      return;
    }
    draft.addDocument.mutate(
      { file, title: document.title, language: document.language as DocumentLanguage, replaces: document.id },
      { onSuccess: () => { setSaid(null); onDone(); } },
    );
  };
  return (
    <form className="draft-form" aria-label={`Upload the new version of ${document.title}`} onSubmit={submit}>
      <h3 className="draft-subhead">New version of <bdi>‘{document.title}’</bdi></h3>
      <p className="draft-lead">
        It takes this version's place in the draft and is read. The earlier version stays in the versions already
        published. What the catalogue took from it that the new version no longer says is listed here once read.
      </p>
      <Upload
        label="File"
        multiple={false}
        accept={ACCEPTED_FILES}
        items={file ? [{ name: file.name, state: "waiting", note: "Chosen" }] : []}
        onFiles={(chosen) => setFile(chosen[0] ?? null)}
      />
      <ActionGroup>
        <Button type="submit" variant="primary" busy={draft.addDocument.isPending}>
          {draft.addDocument.isPending ? "Adding and reading…" : "Use this version and read it"}
        </Button>
        <Button variant="secondary" onClick={onDone}>Keep the current version</Button>
      </ActionGroup>
      <Said
        text={draft.addDocument.isError ? errorMessage(draft.addDocument.error) : said?.text ?? null}
        failed={draft.addDocument.isError || said?.failed}
      />
    </form>
  );
}

const LINE: Record<UploadLine["state"], { state: UploadItem["state"]; word: string }> = {
  reading: { state: "working", word: "Added; being read" },
  unread: { state: "held", word: "Added; not read yet" },
  refused: { state: "attention", word: "Not added" },
};

/** Adding documents: one with its title, or several titled by their file names; each starts being read. */
function AddDocuments({ draft }: { draft: DraftHook }) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<DocumentLanguage>("en");
  const [tried, setTried] = useState(false);
  const [lines, setLines] = useState<UploadLine[] | null>(null);
  const [said, setSaid] = useState<{ text: string; failed?: boolean } | null>(null);
  // A new key empties the file control once its files are sent.
  const [round, setRound] = useState(0);
  const several = files.length > 1;
  const pending = draft.addDocument.isPending || draft.addDocuments.isPending;
  const problem = files.length === 0
    ? "Choose a file first."
    : files.length > MAX_FILES
      ? `Choose at most ${MAX_FILES} files at a time.`
      : !several && !title.trim() ? "Give the document a title." : null;
  const done = () => {
    setFiles([]);
    setTitle("");
    setTried(false);
    setRound((value) => value + 1);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    const [first] = files;
    if (pending) return;
    if (!first || problem) {
      setSaid({ text: problem ?? "Choose a file first.", failed: true });
      return;
    }
    setSaid(null);
    setLines(null);
    if (several) {
      draft.addDocuments.mutate({ files, language }, { onSuccess: (result) => { setLines(result); done(); } });
    } else {
      draft.addDocument.mutate({ file: first, title: title.trim(), language }, {
        onSuccess: (document) => {
          setSaid(document ? { text: `‘${document.title}’ was added and is being read.` } : null);
          done();
        },
      });
    }
  };
  const failure = [draft.addDocument, draft.addDocuments].find((item) => item.isError)?.error;
  const items: UploadItem[] = lines
    ? lines.map((line) => ({ name: line.filename, state: LINE[line.state].state, note: line.state === "reading" ? LINE.reading.word : `${LINE[line.state].word}: ${line.reason}` }))
    : files.map((file) => ({ name: file.name, state: "waiting", note: "Chosen" }));
  const added = lines?.filter((line) => line.state !== "refused").length ?? 0;
  return (
    <Section title="Add documents" headingLevel={2}>
      <form className="draft-form" aria-label="Add documents" onSubmit={submit}>
        <Upload
          key={round}
          label="Files"
          hint={`PDF, Word (.docx), Excel, CSV, Markdown, plain text or images, up to 10 MB each and ${MAX_FILES} at a time. A Word 97–2003 .doc file needs saving as .docx first.`}
          accept={ACCEPTED_FILES}
          items={items}
          onFiles={(chosen) => {
            setFiles(chosen);
            setLines(null);
            const [only] = chosen;
            if (only && chosen.length === 1 && !title) setTitle(only.name.replace(/\.[^.]+$/, ""));
          }}
        />
        <div className="draft-form__row">
          {several ? (
            <p className="draft-quiet">{count(files.length, "file")} chosen; each is titled by its file name.</p>
          ) : (
            <TextField label="Title" maxLength={300} value={title} error={tried && files.length === 1 && !title.trim() ? "Give the document a title." : null} onChange={(event) => setTitle(event.target.value)} />
          )}
          <Select label={several ? "All written in" : "Written in"} value={language} onChange={(event) => setLanguage(event.target.value as DocumentLanguage)}>
            {Object.entries(LANGUAGE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
        <ActionGroup>
          <Button type="submit" variant="primary" busy={pending}>
            {pending ? "Adding and reading…" : several ? `Add the ${files.length} files and read them` : "Add it and read it"}
          </Button>
        </ActionGroup>
        <Said
          text={failure ? errorMessage(failure) : said?.text ?? (lines ? `${added} of ${count(lines.length, "file")} added${lines.some((line) => line.state === "unread") ? "; some wait to be read" : ""}.` : null)}
          failed={Boolean(failure) || said?.failed}
        />
        {lines?.some((line) => line.state === "unread") && (
          <ActionGroup label="Files not read yet">
            {lines.flatMap((line) => line.state === "unread" ? [
              <Button key={line.versionId} variant="link" busy={draft.read.isPending} onClick={() => draft.read.mutate(line.versionId)}>Read {line.filename}</Button>,
            ] : [])}
          </ActionGroup>
        )}
      </form>
    </Section>
  );
}

/** The change requests read into this draft: what their reading could not match, and how many of theirs still wait. */
function ChangeRequests({ release, draft }: { release: Release; draft: DraftHook }) {
  const queryClient = useQueryClient();
  const inbox = useChangeRequests();
  const read = useMutation({
    mutationFn: (changeRequestId: string) => api.readChangeRequest(changeRequestId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["architecture"] }),
  });
  const suggestions = draft.suggestions.data?.suggestions ?? [];
  const readings = useMemo(
    () => new Map((draft.suggestions.data?.runs ?? []).flatMap((run) => (run.change_request_id ? [[run.change_request_id, run] as const] : []))),
    [draft.suggestions.data],
  );
  const items = (inbox.data ?? []).filter((item) => readings.has(item.id) || item.read_into === release.id);
  if (!items.length) return null;
  type Row = (typeof items)[number];
  const columns: Column<Row>[] = [
    {
      id: "request",
      header: "Change request",
      rowHeader: true,
      bidi: true,
      cell: (item) => (
        <>
          <span className="draft-code">{item.id}</span> {item.title}
          <span className="draft-detail">{traceLine(item.trace)}</span>
        </>
      ),
    },
    {
      id: "reading",
      header: "Reading",
      width: "18rem",
      cell: (item) => {
        const run = readings.get(item.id);
        return (
          <>
            <Status tone="done">Read</Status>
            {run && <span className="draft-detail">{count(run.candidate_count, "suggestion")} on its last reading</span>}
            {run && run.warnings.length > 0 && (
              <Lines label={`What the reading of ${item.id} could not match`}>
                {run.warnings.map((warning) => <li key={warning} className="draft-detail" dir="auto">{warningInWords(warning)}</li>)}
              </Lines>
            )}
          </>
        );
      },
    },
    {
      id: "waiting",
      header: "Waiting",
      numeric: true,
      width: "6rem",
      cell: (item) => suggestions.filter((each) => each.change_request?.change_request_id === item.id && each.status === "proposed").length.toLocaleString("en"),
    },
    {
      id: "actions",
      header: <span className="ds-visually-hidden">Actions</span>,
      width: "13rem",
      cell: (item) => (
        <Button variant="link" icon={<RotateCw size={14} />} aria-label={`Read ${item.id} again`} busy={read.isPending && read.variables === item.id} onClick={() => !read.isPending && read.mutate(item.id)}>
          {read.isPending && read.variables === item.id ? "Reading…" : "Read it again"}
        </Button>
      ),
    },
  ];
  return (
    <Section title="Change requests" count={items.length}>
      <p className="draft-lead">
        Approved backlogs and closed Epics from Requirement AI, read with fixed rules: each approved feature asks a question of the offering it
        names, and each closed Epic suggests the capabilities it delivered.
      </p>
      {read.isError && <p role="status"><Status tone="attention">{errorMessage(read.error)}</Status></p>}
      <DataTable caption="The change requests read into this draft" captionHidden columns={columns} rows={items} rowId={(item) => item.id} />
    </Section>
  );
}

const FORMATS: { format: CatalogueFileFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "yaml", label: "YAML" },
  { format: "json", label: "JSON" },
];

const fileName = (release: Release, format: string) =>
  `${(release.name || release.id).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.${format}`;

/**
 * The catalogue as a file: the template, the draft as it stands, and a file
 * brought back, shown as its differences before it replaces anything.
 */
function CatalogueFile({ release }: { release: Release }) {
  const { preview, replace } = useCatalogueFile(release);
  const [file, setFile] = useState<File | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const confirm = useDisclosure();
  const shown = preview.data && file ? preview.data : null;

  const download = async (blob: Promise<Blob>, name: string) => {
    setFailure(null);
    try {
      saveBlob(await blob, name);
    } catch (error) {
      setFailure(error);
    }
  };
  const reset = () => {
    setFile(null);
    preview.reset();
    setRound((value) => value + 1);
  };

  return (
    <Section title="Catalogue file">
      <p className="draft-lead">
        Fill in the Excel template, or take the draft as a file, change it, and bring it back. A file replaces the draft's systems,
        connections, domains, offerings and journeys; its documents and their suggestions stay.
      </p>
      <ActionGroup label="Download">
        <Button variant="quiet" icon={<Download size={14} />} onClick={() => void download(api.catalogueTemplate(), "catalogue-template.xlsx")}>The empty template</Button>
        {FORMATS.map(({ format, label }) => (
          <Button key={format} variant="quiet" icon={<Download size={14} />} onClick={() => void download(api.catalogueFile(release.id, format), fileName(release, format))}>
            The draft as {label}
          </Button>
        ))}
      </ActionGroup>
      {failure ? <p role="status"><Status tone="attention">{errorMessage(failure)}</Status></p> : null}
      <form
        className="draft-form"
        aria-label="Bring back a catalogue file"
        onSubmit={(event) => {
          event.preventDefault();
          if (file) preview.mutate(file);
        }}
      >
        <Upload
          key={round}
          label="A catalogue file (Excel, YAML or JSON)"
          accept=".xlsx,.yaml,.yml,.json"
          multiple={false}
          items={file ? [{ name: file.name, state: preview.isPending ? "working" : "waiting", note: preview.isPending ? "Reading it" : "Chosen" }] : []}
          onFiles={([chosen]) => {
            setFile(chosen ?? null);
            setSaid(null);
            preview.reset();
          }}
        />
        <ActionGroup>
          <Button type="submit" busy={preview.isPending} unavailableReason={file ? null : "Choose a file first."}>
            {preview.isPending ? "Reading it…" : "Show what it would change"}
          </Button>
        </ActionGroup>
        <Said text={preview.isError ? errorMessage(preview.error) : said} failed={preview.isError} />
      </form>
      {shown && file && (
        <section className="draft-preview" aria-labelledby="catalogue-file-preview">
          <h3 id="catalogue-file-preview" className="draft-preview__title">What <bdi>‘{file.name}’</bdi> would change in the draft</h3>
          <ChangeTable diff={shown} release={release} caption={`What ${file.name} would change in the draft`} />
          {confirm.open ? (
            <ConsequencePanel
              panelRef={confirm.panel}
              tone="danger"
              title={<>Replace the draft's content with <bdi>‘{file.name}’</bdi></>}
              happens="The draft's systems, connections, domains, offerings and journeys become what the file says."
              affects={<p>{count(shown.changes.length, "change")}, as listed above. Its documents and their suggestions stay.</p>}
              reversibility="Hand edits made since are replaced too. To go back, bring back a file of the draft taken before."
              confirmLabel="Replace the draft's content"
              busyLabel="Replacing…"
              keepLabel="Keep the draft as it is"
              busy={replace.isPending}
              failure={replace.isError ? errorMessage(replace.error) : null}
              onConfirm={() =>
                replace.mutate(file, {
                  onSuccess: () => {
                    setSaid(`The draft now holds what ‘${file.name}’ says.`);
                    confirm.close();
                    reset();
                  },
                })
              }
              onKeep={confirm.close}
            />
          ) : (
            <ActionGroup>
              <Button variant="primary" unavailableReason={shown.changes.length ? null : "It changes nothing."} onClick={confirm.show}>
                Replace the draft's content…
              </Button>
              <Button onClick={reset}>Keep the draft as it is</Button>
            </ActionGroup>
          )}
        </section>
      )}
    </Section>
  );
}
