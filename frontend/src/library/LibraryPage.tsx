import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { errorMessage } from "../api/errors";
import { libraryOverview } from "../home/derive";
import { formatDay } from "../home/format";
import { type Column, NoteMark, TimetableTable } from "../timetable/TimetableTable";
import { RANK_ORDER, libraryRow } from "./libraryRow";

const COLUMNS: Column[] = [
  { key: "name", label: "Document" },
  { key: "status", label: "Status" },
  { key: "version", label: "In service", align: "end", priority: 2 },
  { key: "owner", label: "Owner", priority: 3 },
  { key: "since", label: "Since", align: "end", priority: 2 },
];

/** The library: every document an admin may see, and a way to add one. */
export function LibraryPage() {
  const documents = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments });
  const [find, setFind] = useState("");
  const findId = useId();

  useEffect(() => {
    window.document.title = "Library · Knowledge portal";
  }, []);

  const rows = useMemo(() => {
    const needle = find.trim().toLocaleLowerCase();
    return (documents.data ?? [])
      .filter((item) => !needle || item.title.toLocaleLowerCase().includes(needle))
      .map((item) => ({ document: item, ...libraryRow(item) }))
      .sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || a.document.title.localeCompare(b.document.title));
  }, [documents.data, find]);
  const overview = documents.data ? libraryOverview(documents.data) : null;
  // In the table's own order, so "the first" is the first row a reader sees.
  const ranked = (documents.data ?? [])
    .map((item) => ({ document: item, ...libraryRow(item) }))
    .sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || a.document.title.localeCompare(b.document.title));
  const yours = ranked.filter((item) => item.rank === "due" && item.document.can_edit);
  const broken = ranked.filter((item) => item.rank === "delayed" && item.document.can_edit);
  const next = yours[0]
    ? {
        to: `/library/${encodeURIComponent(yours[0].document.id)}`,
        label: yours.length === 1
          ? `Review ‘${yours[0].document.title}’`
          : `Review ‘${yours[0].document.title}’, the first of ${yours.length} documents awaiting your review`,
      }
    : broken[0]
      ? { to: `/library/${encodeURIComponent(broken[0].document.id)}`, label: `‘${broken[0].document.title}’ could not be read` }
      : { label: documents.data ? "Nothing in the library awaits you." : "" };

  return (
    <>
      <TimetableTable
        number={1}
        title="Library"
        headingLevel="h1"
        edition={overview
          ? <>{overview.edition.text}{overview.edition.note && <NoteMark note={overview.edition.note} />}</>
          : documents.isError ? "The library could not be read." : "Reading the library…"}
        columns={COLUMNS}
        rows={rows.map(({ document, rank, status, inService, since }) => ({
          key: document.id,
          rank,
          cells: {
            name: <Link to={`/library/${encodeURIComponent(document.id)}`} dir="auto">{document.title}</Link>,
            status: <span className="status">{status}</span>,
            version: inService,
            owner: document.can_edit ? `${document.owner.display_name} (you)` : document.owner.display_name,
            since: formatDay(since),
          },
        }))}
        notes={overview?.notes.filter((note) => note.id === "latest") ?? []}
        quiet={documents.isError
          ? `The knowledge service did not answer: ${errorMessage(documents.error)}`
          : documents.isPending ? "Reading…" : find ? "No document matches." : "The library is empty. Add the first document below."}
        failure={documents.isError ? () => void documents.refetch() : undefined}
        next={next}
        toolbar={
          <label className="field field--inline" htmlFor={findId}>
            <span className="field__label">Find a document</span>
            <input id={findId} type="search" className="field__input" value={find} onChange={(event) => setFind(event.target.value)} />
          </label>
        }
      />
      <AddDocument />
    </>
  );
}

const ACCEPT = ".pdf,.docx,.xlsx,.pptx,.csv,.tsv,.txt,.md,.png,.jpg,.jpeg";

function AddDocument() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = useId();
  const upload = useMutation({
    mutationFn: () => api.upload({ file: file!, title: title.trim() }),
    onSuccess: (document) => {
      void queryClient.invalidateQueries({ queryKey: ["library", "documents"] });
      navigate(`/library/${encodeURIComponent(document.id)}`);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (file && title.trim()) upload.mutate();
  };
  return (
    <section className="add" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="add__title">Add a document</h2>
      <p className="add__lead">
        The file is scanned and read first. Nothing from it reaches requirement work until you review its passages and
        approve them. Until then it is private to you.
      </p>
      <form className="add__form" onSubmit={submit}>
        <label className="field" htmlFor={`${id}-name`}>
          <span className="field__label">Title</span>
          <input id={`${id}-name`} className="field__input" maxLength={200} required value={title}
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field" htmlFor={`${id}-file`}>
          <span className="field__label">File (PDF, Word, Excel, PowerPoint, CSV, text, Markdown or image; up to 10 MB)</span>
          <input id={`${id}-file`} type="file" className="field__input field__input--file" accept={ACCEPT} required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <p className="add__actions">
          <button type="submit" className="action-button" disabled={!file || !title.trim() || upload.isPending}>
            <Upload size={16} aria-hidden="true" />
            {upload.isPending ? "Uploading…" : "Upload for review"}
          </button>
        </p>
        {upload.isError && <p className="docpage__failure" role="alert">{errorMessage(upload.error)}</p>}
      </form>
    </section>
  );
}
