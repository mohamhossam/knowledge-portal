import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Upload } from "lucide-react";
import { type RefObject, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../../../api/client";
import { newestVersion } from "../../../library/model";
import { DOC_STATE_WORDS, type DocState, docState, useDocuments } from "../data";
import { useDisclosure } from "../hooks";
import { useLab, wf } from "../lab-context";
import { Empty, Note, Page, Skeleton, Status } from "../ui";

const STATE_ICON: Record<DocState, "waiting" | "working" | "done" | "attention" | "stopped" | "held"> = {
  reading: "working",
  review: "waiting",
  service: "done",
  withdrawn: "stopped",
  attention: "attention",
  held: "held",
  stopped: "stopped",
  none: "waiting",
};

const FILTERS: { id: DocState | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "Ready for review" },
  { id: "service", label: "In service" },
  { id: "reading", label: "Being read" },
  { id: "attention", label: "Needs attention" },
  { id: "withdrawn", label: "Withdrawn" },
];

type Sort = "title" | "state" | "uploaded";

/** Browse archetype: filters and sort live in the URL; upload is a Flow drawer. */
export function LibraryDocuments() {
  const [params, setParams] = useSearchParams();
  const documents = useDocuments();
  const status = (params.get("status") ?? "all") as DocState | "all";
  const owner = params.get("owner") === "mine" ? "mine" : "everyone";
  const sort = (params.get("sort") ?? "uploaded") as Sort;
  const descending = params.get("dir") !== "asc";
  const upload = useDisclosure(() => document.getElementById("wf-upload"));

  const set = (key: string, value: string | null) => {
    if (value === null) params.delete(key);
    else params.set(key, value);
    setParams(params, { replace: true });
  };

  const rows = useMemo(() => {
    const all = (documents.data ?? []).map((doc) => ({ doc, state: docState(doc), uploaded: newestVersion(doc)?.uploaded_at ?? "" }));
    const filtered = all.filter((row) => (status === "all" || row.state === status) && (owner === "everyone" || row.doc.is_owner));
    const key = (row: (typeof all)[number]) => (sort === "title" ? row.doc.title : sort === "state" ? DOC_STATE_WORDS[row.state] : row.uploaded);
    return filtered.sort((a, b) => key(a).localeCompare(key(b)) * (descending ? -1 : 1));
  }, [documents.data, status, owner, sort, descending]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of documents.data ?? []) map.set(docState(doc), (map.get(docState(doc)) ?? 0) + 1);
    return map;
  }, [documents.data]);

  const header = (id: Sort, label: string) => (
    <th scope="col" aria-sort={sort === id ? (descending ? "descending" : "ascending") : "none"}>
      <button type="button" className="wf-sort" onClick={() => { set("sort", id); set("dir", sort === id && descending ? "asc" : null); }}>
        {label} {sort === id && (descending ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <Page
      title="Library"
      archetype="Browse"
      lead="Reviewed reference documents that requirement work can cite."
      head={
        <div className="wf-actions">
          <button id="wf-upload" type="button" className="wf-button wf-button--primary" aria-expanded={upload.open} onClick={upload.show}>
            <Upload size={14} aria-hidden="true" /> Upload documents
          </button>
          <Link to={wf("/library/search")} className="wf-button">Search passages</Link>
        </div>
      }
    >
      {upload.open && <UploadFlow onClose={upload.close} panelRef={upload.panel} />}
      {documents.isPending ? (
        <Skeleton label="Reading the library" />
      ) : (documents.data ?? []).length === 0 ? (
        <Empty title="No documents yet." why="Upload a policy or reference document; you review what was read before requirement work can cite it." />
      ) : (
        <>
          <div className="wf-filters" role="group" aria-label="Filter documents">
            {FILTERS.map((filter) => (
              <button key={filter.id} type="button" aria-pressed={status === filter.id} onClick={() => set("status", filter.id === "all" ? null : filter.id)}>
                {filter.label} <span className="wf-quiet">{filter.id === "all" ? documents.data?.length : counts.get(filter.id) ?? 0}</span>
              </button>
            ))}
            <label className="wf-inline">
              Owner{" "}
              <select value={owner} onChange={(event) => set("owner", event.target.value === "mine" ? "mine" : null)}>
                <option value="everyone">Everyone</option>
                <option value="mine">Mine</option>
              </select>
            </label>
          </div>
          <p className="wf-quiet" role="status">{rows.length} documents</p>
          {rows.length === 0 ? (
            <Empty title="Nothing matches these filters." why="" action={<button type="button" className="wf-button" onClick={() => setParams({}, { replace: true })}>Clear filters</button>} />
          ) : (
            <table className="wf-table">
              <caption className="visually-hidden">Documents, sorted by {sort}</caption>
              <thead>
                <tr>
                  {header("title", "Document")}
                  {header("state", "State")}
                  <th scope="col">Owner</th>
                  {header("uploaded", "Last upload")}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ doc, state, uploaded }) => (
                  <tr key={doc.id}>
                    <th scope="row"><Link to={wf(`/library/${doc.id}`)} dir="auto">{doc.title}</Link></th>
                    <td><Status state={STATE_ICON[state]}>{DOC_STATE_WORDS[state]}</Status></td>
                    <td>{doc.owner.display_name}</td>
                    <td className="wf-num">{uploaded.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Page>
  );
}

/** Flow archetype in a drawer: choose files → scan → read → open the review. All simulated. */
function UploadFlow({ onClose, panelRef }: { onClose: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const lab = useLab();
  const [files, setFiles] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  return (
    <section className="wf-flowpanel" aria-labelledby="wf-upload-title" ref={panelRef as RefObject<HTMLElement>} onKeyDown={(event) => event.key === "Escape" && onClose()}>
      <h2 id="wf-upload-title" tabIndex={-1}>Upload documents</h2>
      <ol className="wf-stepper" aria-label="Upload steps">
        <li aria-current={!started ? "step" : undefined}>1 Choose files</li>
        <li aria-current={started ? "step" : undefined}>2 Scan and read</li>
        <li>3 Review</li>
      </ol>
      {!started ? (
        <>
          <div className="wf-field">
            <label htmlFor="wf-files">Files (PDF, Word, Excel, PowerPoint, CSV, Markdown, text)</label>
            <input id="wf-files" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).map((file) => file.name))} />
            <p className="wf-hint">Each file is scanned for malware, then read. You review what was read before anything is published.</p>
          </div>
          <div className="wf-actions">
            <button
              type="button"
              className="wf-button wf-button--primary"
              onClick={() => {
                const names = files.length ? files : ["sample-policy.pdf"];
                names.forEach((name) => lab.startJob({ kind: "Reading", subject: name, to: wf("/library") }, 5000));
                setStarted(true);
              }}
            >
              Upload {files.length > 1 ? `${files.length} files` : "and read"}
            </button>
            <button type="button" className="wf-button" onClick={onClose}>Cancel</button>
          </div>
          <Note>No file leaves the browser: the lab starts a simulated reading job instead.</Note>
        </>
      ) : (
        <>
          <p>Reading has started. You can leave this page; it continues. Progress is in Jobs.</p>
          <ul className="wf-lines">
            {lab.jobs.filter((job) => job.kind === "Reading").slice(0, 5).map((job) => (
              <li key={job.id}><Status state={job.state} /> <bdi>{job.subject}</bdi>{job.cause ? ` — ${job.cause}` : ""}</li>
            ))}
          </ul>
          <button type="button" className="wf-button" onClick={onClose}>Close</button>
        </>
      )}
    </section>
  );
}

/** Browse archetype: the query lives in the URL; results open at the passage. Search is a read. */
export function LibrarySearch() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const search = useQuery({ queryKey: ["wf", "search", query], queryFn: () => api.search(query), enabled: Boolean(query) });
  return (
    <Page title="Search passages" archetype="Browse" lead="Only passages in service are searched.">
      <form
        role="search"
        className="wf-searchbar"
        onSubmit={(event) => {
          event.preventDefault();
          setParams(draft.trim() ? { q: draft.trim() } : {});
        }}
      >
        <label htmlFor="wf-q" className="visually-hidden">Search published passages</label>
        <input id="wf-q" data-wf-find dir="auto" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Words from a policy" />
        <button type="submit" className="wf-button wf-button--primary">Search</button>
      </form>
      {query && search.isPending && <Skeleton label="Searching" rows={3} />}
      {search.data && (
        <>
          <p className="wf-quiet" role="status">{search.data.length} passages</p>
          {search.data.length === 0 ? (
            <Empty title={`No published passage matches '${query}'.`} why="Only passages in service are searched." action={<button type="button" className="wf-button" onClick={() => { setDraft(""); setParams({}); }}>Clear search</button>} />
          ) : (
            <ol className="wf-results">
              {search.data.map((hit) => (
                <li key={hit.id}>
                  <p dir="auto">{hit.original_text}</p>
                  <p className="wf-quiet">
                    <bdi>{hit.document_title}</bdi> · version {hit.version_number} · <bdi>{hit.location}</bdi> ·{" "}
                    <Link to={wf(`/library/${hit.document_id}#passage-${hit.block_id}`)}>Open at the passage</Link>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <Note>The query is in the URL, so Back and shared links keep it. A result opens the document at that passage, not at its head.</Note>
    </Page>
  );
}
