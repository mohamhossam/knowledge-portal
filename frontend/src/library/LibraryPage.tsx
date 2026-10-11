import "./library.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Upload as UploadIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { api, type LibraryDocument } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { ActionGroup, Button, type Column, DataTable, EmptyState, FilterStrip, PageHeader, Select, Skeleton, type Sort, Status } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { REVIEW_STATUS } from "../reviews/review";
import { ButtonLink } from "../shell/links";
import { DOC_STATE_WORDS, DOC_TONE, type DocState, docState } from "./docState";
import { LibraryRetry } from "./LibraryRetry";
import { newestState, standing } from "./model";
import { DocumentLink, Outcome } from "./parts";
import { plural } from "./where";
import { UploadFlow } from "./UploadFlow";

/** The filters always offered, then any other state only while a document is in it. */
const FILTERS: DocState[] = ["review", "service", "reading", "attention", "withdrawn"];
const OTHERS: DocState[] = ["held", "indexing", "stopped", "none"];

/** Sorting by state puts what needs someone first (§15), not the alphabet. */
const URGENCY: Record<DocState, number> = { attention: 0, held: 1, stopped: 2, review: 3, reading: 4, indexing: 5, service: 6, none: 7, withdrawn: 8 };

type Row = { doc: LibraryDocument; state: DocState; uploaded: string; inService: number | null };

const SORTS = ["title", "state", "uploaded"];

/**
 * Browse archetype (plan 02 §1): every document an admin may see, its state in
 * words and icon, with the filters, owner and sort in the URL. Upload is a flow
 * opened in place; stopped work across owners is retried from here.
 */
export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments });
  const location = useLocation();
  const navigate = useNavigate();
  // Said once (e.g. "… now belongs to …"), then cleared, so a reload or Back doesn't say it again.
  const [notice] = useState(() => (location.state as { notice?: string } | null)?.notice);
  useEffect(() => {
    if (location.state) navigate({ search: location.search }, { replace: true, state: null });
  }, [location.state, location.search, navigate]);
  const upload = useDisclosure(() => document.getElementById("library-upload"));
  const auth = useAuth();

  const status = (params.get("status") ?? "all") as DocState | "all";
  const owner = params.get("owner") === "mine" ? "mine" : "everyone";
  const find = params.get("q") ?? "";
  // Typed here, written to the address a moment later: one history update per pause, not per key.
  const [findDraft, setFindDraft] = useState(find);
  const [findFor, setFindFor] = useState(find);
  if (findFor !== find) {
    setFindFor(find);
    setFindDraft(find);
  }
  const sortId = SORTS.includes(params.get("sort") ?? "") ? params.get("sort")! : "uploaded";
  const sort: Sort = { id: sortId, direction: params.get("dir") === "asc" ? "ascending" : "descending" };

  const set = (changes: Record<string, string | null>) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (findDraft === find) return;
    const timer = window.setTimeout(() => set({ q: findDraft }), 250);
    return () => window.clearTimeout(timer);
    // `set` writes through the router's functional update: only the draft matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findDraft, find]);

  const all = useMemo<Row[]>(() => (documents.data ?? []).map((doc) => {
    const current = standing(doc);
    return { doc, state: docState(doc), uploaded: newestState(doc)?.uploaded_at ?? "", inService: current.kind === "service" ? current.versionNumber ?? null : null };
  }), [documents.data]);

  const counts = useMemo(() => {
    const map = new Map<DocState, number>();
    for (const row of all) map.set(row.state, (map.get(row.state) ?? 0) + 1);
    return map;
  }, [all]);

  const rows = useMemo(() => {
    const needle = find.trim().toLocaleLowerCase();
    const shown = all.filter((row) =>
      (status === "all" || row.state === status)
      && (owner === "everyone" || row.doc.is_owner)
      && (!needle || row.doc.title.toLocaleLowerCase().includes(needle)));
    const flip = sort.direction === "descending" ? -1 : 1;
    const by = (a: Row, b: Row) =>
      sort.id === "title" ? a.doc.title.localeCompare(b.doc.title)
        : sort.id === "state" ? URGENCY[a.state] - URGENCY[b.state] || a.doc.title.localeCompare(b.doc.title)
          : a.uploaded.localeCompare(b.uploaded);
    return [...shown].sort((a, b) => by(a, b) * flip);
  }, [all, status, owner, find, sort.id, sort.direction]);

  // What a knowledge admin can retry in one go, whoever owns it.
  const stopped = {
    reading: all.filter((row) => row.state === "attention" && newestState(row.doc)?.stage === "failed").map((row) => row.doc.title),
    indexing: all.filter((row) => row.state === "attention" && standing(row.doc).kind === "indexing").map((row) => row.doc.title),
  };

  const columns: Column<Row>[] = [
    { id: "title", header: "Document", rowHeader: true, sortable: true, bidi: true, cell: (row) => <DocumentLink id={row.doc.id} title={row.doc.title} /> },
    {
      id: "state",
      header: "State",
      sortable: true,
      width: "13rem",
      cell: (row) => {
        const newest = newestState(row.doc);
        const review = row.doc.review;
        return (
          <>
            <Status tone={DOC_TONE[row.state]}>{DOC_STATE_WORDS[row.state]}</Status>
            {row.state === "attention" && newest?.error && <span className="lib-detail">{newest.error}</span>}
            {row.state === "service" && review && review.state !== "current" && <span className="lib-detail">{REVIEW_STATUS[review.state]}</span>}
          </>
        );
      },
    },
    { id: "service", header: "In service", numeric: true, width: "6.5rem", cell: (row) => (row.inService === null ? <None /> : `Version ${row.inService}`) },
    {
      id: "cited",
      header: "Cited by",
      numeric: true,
      width: "7.5rem",
      cell: (row) => (row.doc.citations === null || row.doc.citations === undefined ? <span title="Requirement AI didn't say">—<span className="ds-visually-hidden">unknown</span></span> : row.doc.citations === 0 ? "None" : plural(row.doc.citations, "requirement")),
    },
    { id: "owner", header: "Owner", width: "9rem", cell: (row) => (row.doc.is_owner ? "You" : <bdi>{row.doc.owner.display_name}</bdi>) },
    { id: "uploaded", header: "Last upload", sortable: true, numeric: true, width: "8rem", cell: (row) => formatDay(row.uploaded) },
  ];

  const filtering = status !== "all" || owner !== "everyone" || find !== "";
  const offered = [...FILTERS, ...OTHERS.filter((state) => (counts.get(state) ?? 0) > 0)];

  let body;
  if (documents.isPending) {
    body = <Skeleton label="Reading the library" rows={8} />;
  } else if (documents.error instanceof ApiError && documents.error.status === 403) {
    body = (
      <EmptyState title="Seeing the library needs the Knowledge admin role.">
        <p>You're signed in as <bdi>{auth?.actor?.display_name ?? "someone else"}</bdi>. Ask your platform administrator to add the role.</p>
      </EmptyState>
    );
  } else if (documents.isError && !documents.data) {
    body = (
      <EmptyState title="Couldn't read the library." action={<Button onClick={() => void documents.refetch()}>Try again</Button>}>
        <p>The knowledge service didn't answer: {errorMessage(documents.error)}</p>
      </EmptyState>
    );
  } else if (all.length === 0) {
    body = (
      <EmptyState title="No documents yet." action={<Button variant="primary" onClick={upload.show}>Upload documents</Button>}>
        <p>Upload a policy or reference document. You review what was read before requirement work can cite it.</p>
      </EmptyState>
    );
  } else {
    body = (
      <>
        <LibraryRetry stopped={stopped} onDone={() => void queryClient.invalidateQueries({ queryKey: ["library", "documents"] })} />
        <div className="lib-toolbar">
          <FilterStrip
            label="Show documents"
            filters={[{ id: "all", label: "All", count: all.length }, ...offered.map((state) => ({ id: state, label: DOC_STATE_WORDS[state], count: counts.get(state) ?? 0 }))]}
            active={status}
            onChange={(id) => set({ status: id === "all" ? null : id })}
            find={{ label: "Find a document by title", value: findDraft, onChange: setFindDraft, placeholder: "A title…" }}
            onClear={filtering ? () => setParams({}, { replace: true }) : undefined}
          />
          <div className="lib-toolbar__owner">
            <Select label="Owner" value={owner} onChange={(event) => set({ owner: event.target.value === "mine" ? "mine" : null })}>
              <option value="everyone">Everyone</option>
              <option value="mine">Mine</option>
            </Select>
          </div>
        </div>
        <DataTable
          caption={filtering ? `Documents · ${rows.length} of ${all.length} shown` : `Documents · ${all.length}`}
          columns={columns}
          rows={rows}
          rowId={(row) => row.doc.id}
          sort={sort}
          onSort={(next) => set({ sort: next.id === "uploaded" ? null : next.id, dir: next.direction === "ascending" ? "asc" : null })}
          emptyText="No document matches these filters. Clear filters to see every document."
        />
      </>
    );
  }

  return (
    <div className="lib">
      <PageHeader
        title="Library"
        lead="Reviewed reference documents that requirement work can cite."
        actions={
          <ActionGroup>
            <Button id="library-upload" variant="primary" icon={<UploadIcon size={14} />} aria-expanded={upload.open} onClick={(event) => (upload.open ? upload.close() : upload.show(event))}>
              Upload documents
            </Button>
            <ButtonLink to="/library/search"><Search size={14} aria-hidden="true" className="lib-inline-icon" /> Search passages</ButtonLink>
          </ActionGroup>
        }
      />
      <Outcome text={notice} />
      {upload.open && <UploadFlow onClose={upload.close} panelRef={upload.panel} />}
      {body}
    </div>
  );
}

function None() {
  return <span className="lib-none"><span aria-hidden="true">—</span><span className="ds-visually-hidden">none</span></span>;
}
