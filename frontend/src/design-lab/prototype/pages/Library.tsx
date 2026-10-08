import { useQuery } from "@tanstack/react-query";
import { Search, Upload as UploadIcon } from "lucide-react";
import { type RefObject, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api, type LibraryDocument } from "../../../api/client";
import {
  ActionGroup,
  Button,
  type Column,
  DataTable,
  EmptyState,
  FilterStrip,
  PageHeader,
  Select,
  Skeleton,
  type Sort,
  Status,
  TextField,
  Upload,
  type UploadItem,
} from "../../../design/components";
import { useDisclosure } from "../../../design/hooks";
import { newestVersion } from "../../../library/model";
import { DOC_STATE_WORDS, type DocState, docState, useDocuments } from "../../wireframes/data";
import { useLab } from "../../wireframes/lab-context";
import { DOC_TONE, proto } from "../paths";
import { ButtonLink, RouterLink } from "../ui";

const FILTERS: { id: DocState | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "Ready for review" },
  { id: "service", label: "In service" },
  { id: "reading", label: "Being read" },
  { id: "attention", label: "Needs attention" },
  { id: "withdrawn", label: "Withdrawn" },
];

type Row = { doc: LibraryDocument; state: DocState; uploaded: string };

/** Browse archetype: filters and sort live in the URL; upload is a flow opened in place. */
export function LibraryDocuments() {
  const [params, setParams] = useSearchParams();
  const documents = useDocuments();
  const status = (params.get("status") ?? "all") as DocState | "all";
  const owner = params.get("owner") === "mine" ? "mine" : "everyone";
  const sort: Sort = { id: params.get("sort") ?? "uploaded", direction: params.get("dir") === "asc" ? "ascending" : "descending" };
  const upload = useDisclosure(() => document.getElementById("proto-upload"));

  const set = (changes: Record<string, string | null>) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    setParams(params, { replace: true });
  };

  const rows = useMemo(() => {
    const all: Row[] = (documents.data ?? []).map((doc) => ({ doc, state: docState(doc), uploaded: newestVersion(doc)?.uploaded_at ?? "" }));
    const filtered = all.filter((row) => (status === "all" || row.state === status) && (owner === "everyone" || row.doc.is_owner));
    const key = (row: Row) => (sort.id === "title" ? row.doc.title : sort.id === "state" ? DOC_STATE_WORDS[row.state] : row.uploaded);
    return filtered.sort((a, b) => key(a).localeCompare(key(b)) * (sort.direction === "descending" ? -1 : 1));
  }, [documents.data, status, owner, sort.id, sort.direction]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of documents.data ?? []) map.set(docState(doc), (map.get(docState(doc)) ?? 0) + 1);
    return map;
  }, [documents.data]);

  const columns: Column<Row>[] = [
    { id: "title", header: "Document", rowHeader: true, sortable: true, bidi: true, cell: (row) => <RouterLink href={proto(`/library/${row.doc.id}`)}>{row.doc.title}</RouterLink> },
    { id: "state", header: "State", sortable: true, cell: (row) => <Status tone={DOC_TONE[row.state]}>{DOC_STATE_WORDS[row.state]}</Status> },
    { id: "owner", header: "Owner", bidi: true, cell: (row) => row.doc.owner.display_name },
    { id: "uploaded", header: "Last upload", sortable: true, numeric: true, cell: (row) => row.uploaded.slice(0, 10) },
  ];

  const filtered = status !== "all" || owner !== "everyone";
  return (
    <>
      <PageHeader
        title="Library"
        lead="Reviewed reference documents that requirement work can cite."
        actions={
          <ActionGroup>
            <Button id="proto-upload" variant="primary" icon={<UploadIcon size={14} />} aria-expanded={upload.open} onClick={(event) => (upload.open ? upload.close() : upload.show(event))}>
              Upload documents
            </Button>
            <ButtonLink to={proto("/library/search")}>Search passages</ButtonLink>
          </ActionGroup>
        }
      />
      {upload.open && <UploadFlow onClose={upload.close} panelRef={upload.panel} />}
      {documents.isPending ? (
        <Skeleton label="Reading the library" />
      ) : (documents.data ?? []).length === 0 ? (
        <EmptyState title="No documents yet." action={<Button variant="primary" onClick={upload.show}>Upload documents</Button>}>
          <p>Upload a policy or reference document. You review what was read before requirement work can cite it.</p>
        </EmptyState>
      ) : (
        <>
          <div className="proto-toolbar">
            <FilterStrip
              label="Filter documents by state"
              filters={FILTERS.map((filter) => ({ ...filter, count: filter.id === "all" ? documents.data?.length : counts.get(filter.id) ?? 0 }))}
              active={status}
              onChange={(id) => set({ status: id === "all" ? null : id })}
              onClear={filtered ? () => setParams({}, { replace: true }) : undefined}
            />
            <Select label="Owner" value={owner} onChange={(event) => set({ owner: event.target.value === "mine" ? "mine" : null })}>
              <option value="everyone">Everyone</option>
              <option value="mine">Mine</option>
            </Select>
          </div>
          <DataTable
            caption={`Documents · ${rows.length} shown`}
            columns={columns}
            rows={rows}
            rowId={(row) => row.doc.id}
            sort={sort}
            onSort={(next) => set({ sort: next.id === "uploaded" ? null : next.id, dir: next.direction === "ascending" ? "asc" : null })}
            emptyText="Nothing matches these filters. Clear filters to see every document."
          />
        </>
      )}
    </>
  );
}

/** Flow in place: choose files → scan → read → review. Simulated: no file leaves the browser. */
function UploadFlow({ onClose, panelRef }: { onClose: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const lab = useLab();
  const id = useId();
  const [names, setNames] = useState<string[]>([]);
  const [started, setStarted] = useState<string[]>([]);
  const items: UploadItem[] = started.length
    ? lab.jobs.filter((job) => job.kind === "Reading" && started.includes(job.id)).map((job) => ({ name: job.subject, state: job.state, note: job.cause }))
    : names.map((name) => ({ name, state: "waiting" }));
  return (
    <section
      ref={panelRef as RefObject<HTMLElement>}
      className="proto-panel"
      aria-labelledby={`${id}-t`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <h2 id={`${id}-t`} tabIndex={-1}>Upload documents</h2>
      <Upload
        label="Choose files"
        hint="PDF, Word, Excel, PowerPoint, CSV, Markdown or text. Each is scanned for malware, then read. You review what was read before anything is published."
        items={items}
        onFiles={(files) => setNames(files.map((file) => file.name))}
      />
      {started.length > 0 ? (
        <>
          <p role="status">Reading has started. You can leave this page; it carries on, and Jobs shows its progress.</p>
          <ActionGroup><Button onClick={onClose}>Close</Button></ActionGroup>
        </>
      ) : (
        <ActionGroup>
          <Button
            variant="primary"
            onClick={() => {
              const chosen = names.length ? names : ["sample-policy.pdf"];
              setStarted(chosen.map((name) => lab.startJob({ kind: "Reading", subject: name, to: proto("/library") }, 5000)));
            }}
          >
            {names.length > 1 ? `Upload ${names.length} files` : "Upload and read"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </ActionGroup>
      )}
    </section>
  );
}

/** Browse archetype: the query lives in the URL; a result opens the document at its passage. */
export function LibrarySearch() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const search = useQuery({ queryKey: ["wf", "search", query], queryFn: () => api.search(query), enabled: Boolean(query) });
  return (
    <>
      <PageHeader title="Search passages" lead="Only passages in service are searched." />
      <form
        role="search"
        aria-label="Published passages"
        className="proto-searchbar"
        onSubmit={(event) => {
          event.preventDefault();
          setParams(draft.trim() ? { q: draft.trim() } : {});
        }}
      >
        <TextField label="Words from a policy" data-find value={draft} onChange={(event) => setDraft(event.target.value)} />
        <Button type="submit" variant="primary" icon={<Search size={14} />}>Search</Button>
      </form>
      {query && search.isPending && <Skeleton label="Searching" rows={3} />}
      {search.data && (
        <>
          <p className="proto-quiet" role="status">{search.data.length} {search.data.length === 1 ? "passage" : "passages"} for '<bdi>{query}</bdi>'</p>
          {search.data.length === 0 ? (
            <EmptyState title={`No published passage matches '${query}'.`} action={<Button onClick={() => { setDraft(""); setParams({}); }}>Clear search</Button>}>
              <p>Only passages in service are searched. Try fewer words, or words from the original language.</p>
            </EmptyState>
          ) : (
            <ol className="proto-results">
              {search.data.map((hit) => (
                <li key={hit.id}>
                  <figure className="ds-quote">
                    <blockquote dir="auto" className="ds-quote__text">{hit.original_text}</blockquote>
                    <figcaption className="ds-quote__source">
                      <bdi>{hit.document_title}</bdi> · version {hit.version_number} · <bdi>{hit.location}</bdi> ·{" "}
                      <RouterLink href={proto(`/library/${hit.document_id}#passage-${hit.block_id}`)}>Open at the passage</RouterLink>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );
}
