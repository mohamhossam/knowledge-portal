import "./library.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search, Upload as UploadIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { api, type LibraryDocument } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import {
  ActionGroup, Banner, Button, EmptyState, Facts, Lines, ListFilter, ListFind, ListTools, PageHeader, RecordList, type RecordGroup,
  RecordPlaceholder, RecordView, Section, Skeleton, Status, Workbench,
} from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { REVIEW_STATUS } from "../reviews/review";
import { ButtonLink, RouterLink } from "../shell/links";
import { DOC_STATE_WORDS, DOC_TONE, type DocState, docState } from "./docState";
import { classificationFacts, labelOf, useClassificationOptions } from "./classification";
import { LibraryRetry } from "./LibraryRetry";
import { LifecycleDiagram } from "./LifecycleDiagram";
import { newestState, newestVersion, standing } from "./model";
import { Outcome } from "./parts";
import { plural } from "./where";
import { UploadFlow } from "./UploadFlow";

/** The filters always offered, then any other state only while a document is in it. */
const FILTERS: DocState[] = ["review", "service", "reading", "attention", "withdrawn"];
const OTHERS: DocState[] = ["held", "indexing", "stopped", "none"];

/** The list groups by state, what needs someone first (§15), not the alphabet. */
const URGENCY: DocState[] = ["attention", "held", "stopped", "review", "reading", "indexing", "service", "none", "withdrawn"];

type Row = { doc: LibraryDocument; state: DocState; uploaded: string; inService: number | null };

/**
 * The library on the workbench (UX rebuild, phase 3): every document an admin
 * may see in a narrow list, grouped by where it stands with what needs someone
 * first, beside the chosen document's summary (`?doc=`) with the way into its
 * review. Filters and find live in the address. Upload is a flow opened in
 * place; stopped work across owners is retried from the summary.
 */
export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments });
  const location = useLocation();
  const navigate = useNavigate();
  // Said once (e.g. "… now belongs to …"), then cleared, so a reload or Back doesn't say it again.
  const [notice] = useState(() => (location.state as { notice?: string } | null)?.notice);
  // Whether this address came from choosing a row (not a fresh load): the record then takes focus.
  const [chosenHere] = useState(() => location.key !== "default");
  useEffect(() => {
    if (location.state) navigate({ search: location.search }, { replace: true, state: null });
  }, [location.state, location.search, navigate]);
  const upload = useDisclosure(() => document.getElementById("library-upload"));
  const auth = useAuth();

  const status = (params.get("status") ?? "all") as DocState | "all";
  const owner = params.get("owner") === "mine" ? "mine" : "everyone";
  const find = params.get("q") ?? "";
  const kind = params.get("type") ?? "all";
  const topic = params.get("topic") ?? "all";
  const chosenId = params.get("doc");
  const classification = useClassificationOptions();
  // Typed here, written to the address a moment later: one history update per pause, not per key.
  const [findDraft, setFindDraft] = useState(find);
  const [findFor, setFindFor] = useState(find);
  if (findFor !== find) {
    setFindFor(find);
    setFindDraft(find);
  }

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
    return all.filter((row) =>
      (status === "all" || row.state === status)
      && (owner === "everyone" || row.doc.is_owner)
      && (kind === "all" || (kind === "none" ? !row.doc.document_type : row.doc.document_type === kind))
      && (topic === "all" || (row.doc.topics ?? []).includes(topic))
      && (!needle || row.doc.title.toLocaleLowerCase().includes(needle)));
  }, [all, status, owner, kind, topic, find]);

  // The types and topics given to some document, so a filter never offers an empty choice.
  const givenTypes = useMemo(() => [...new Set(all.flatMap((row) => (row.doc.document_type ? [row.doc.document_type] : [])))], [all]);
  const givenTopics = useMemo(() => [...new Set(all.flatMap((row) => row.doc.topics ?? []))], [all]);

  // A row keeps the list's filters in its address, so the list stays as it was beside the record.
  const hrefFor = useCallback((id: string) => {
    const next = new URLSearchParams(params);
    next.set("doc", id);
    return `/library?${next}`;
  }, [params]);

  const groups = useMemo<RecordGroup[]>(() => URGENCY
    .map((state) => {
      const members = rows.filter((row) => row.state === state).sort((a, b) => b.uploaded.localeCompare(a.uploaded));
      return {
        id: state,
        label: DOC_STATE_WORDS[state],
        items: members.map((row) => ({
          id: row.doc.id,
          href: hrefFor(row.doc.id),
          name: <span>{row.doc.title}</span>,
          bidi: true,
          detail: row.state === "attention" && newestState(row.doc)?.error
            ? newestState(row.doc)?.error
            : row.state === "service" && row.doc.review && row.doc.review.state !== "current"
              ? REVIEW_STATUS[row.doc.review.state]
              : <>{row.doc.is_owner ? "Yours" : <bdi>{row.doc.owner.display_name}</bdi>} · {row.uploaded ? `uploaded ${formatDay(row.uploaded)}` : "not uploaded"}</>,
          meta: row.inService !== null ? <span className="lib-quiet">Version {row.inService}</span> : undefined,
        })),
      };
    }), [rows, hrefFor]);

  // What a knowledge admin can retry in one go, whoever owns it.
  const stopped = {
    reading: all.filter((row) => row.state === "attention" && newestState(row.doc)?.stage === "failed").map((row) => row.doc.title),
    indexing: all.filter((row) => row.state === "attention" && standing(row.doc).kind === "indexing").map((row) => row.doc.title),
  };
  const retried = () => void queryClient.invalidateQueries({ queryKey: ["library", "documents"] });

  const filtering = status !== "all" || owner !== "everyone" || kind !== "all" || topic !== "all" || find !== "";
  const offered = [...FILTERS, ...OTHERS.filter((state) => (counts.get(state) ?? 0) > 0)];
  const chosen = chosenId ? all.find((row) => row.doc.id === chosenId) : undefined;

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
        <p>Upload a policy or reference document. You review what was read before it can be cited.</p>
      </EmptyState>
    );
  } else {
    const list = (
      <>
        <ListTools count={filtering ? `${plural(rows.length, "document")} of ${all.length}` : plural(all.length, "document")}>
          <ListFind label="Find a document by title" value={findDraft} onChange={setFindDraft} placeholder="Find a title" />
          <ListFilter
            label="State"
            value={status}
            options={[{ id: "all", label: "Any state", count: all.length }, ...offered.map((state) => ({ id: state, label: DOC_STATE_WORDS[state], count: counts.get(state) ?? 0 }))]}
            onChange={(id) => set({ status: id === "all" ? null : id })}
          />
          <ListFilter
            label="Owner"
            value={owner}
            options={[{ id: "everyone", label: "Everyone" }, { id: "mine", label: "Mine" }]}
            onChange={(id) => set({ owner: id === "mine" ? "mine" : null })}
          />
          {givenTypes.length > 0 && (
            <ListFilter
              label="Type"
              value={kind}
              options={[
                { id: "all", label: "Any type" },
                ...givenTypes
                  .map((id) => ({ id, label: labelOf(classification.data, "document_types", id), count: all.filter((row) => row.doc.document_type === id).length }))
                  .sort((a, b) => a.label.localeCompare(b.label)),
                { id: "none", label: "No type given", count: all.filter((row) => !row.doc.document_type).length },
              ]}
              onChange={(id) => set({ type: id === "all" ? null : id })}
            />
          )}
          {givenTopics.length > 0 && (
            <ListFilter
              label="Topic"
              value={topic}
              options={[
                { id: "all", label: "Any topic" },
                ...givenTopics
                  .map((id) => ({ id, label: labelOf(classification.data, "topics", id), count: all.filter((row) => (row.doc.topics ?? []).includes(id)).length }))
                  .sort((a, b) => a.label.localeCompare(b.label)),
              ]}
              onChange={(id) => set({ topic: id === "all" ? null : id })}
            />
          )}
          {filtering && <Button variant="link" onClick={() => setParams(chosenId ? { doc: chosenId } : {}, { replace: true })}>Clear filters</Button>}
        </ListTools>
        <RecordList
          label="Documents"
          groups={groups}
          currentId={chosen?.doc.id}
          link={RouterLink}
          empty="No document matches these filters. Clear filters to see every document."
        />
      </>
    );
    const record = chosen ? (
      <DocumentSummary key={chosen.doc.id} row={chosen} takeFocus={chosenHere || location.key !== "default"} stopped={stopped} onRetried={retried} />
    ) : (
      <RecordPlaceholder title={chosenId ? "That document isn't in the library any more." : `${plural(all.length, "document")}. Choose one to see where it stands.`}>
        <LifecycleDiagram counts={counts} active={status} onChoose={(state) => set({ status: state === "all" ? null : state })} />
        <LibraryRetry stopped={stopped} onDone={retried} />
      </RecordPlaceholder>
    );
    body = <Workbench listLabel="Documents" chosen={Boolean(chosen)} list={list} record={record} />;
  }

  return (
    <div className="lib">
      <PageHeader
        title="Library"
        lead="Reviewed reference documents that connected apps can cite."
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

/**
 * One document's summary beside the list: where it stands, what can be cited
 * from it today, its newest upload, and the way into its review and versions.
 */
function DocumentSummary({ row, takeFocus, stopped, onRetried }: {
  row: Row;
  takeFocus: boolean;
  stopped: Record<"reading" | "indexing", string[]>;
  onRetried: () => void;
}) {
  const { doc, state } = row;
  const classification = useClassificationOptions();
  const href = `/library/${encodeURIComponent(doc.id)}`;
  const newest = newestState(doc);
  const version = newestVersion(doc);
  const current = standing(doc);
  const review = doc.review;
  const open = state === "review"
    ? <ButtonLink to={href} variant="primary">Open the review</ButtonLink>
    : <ButtonLink to={href} variant="primary">Open the document</ButtonLink>;
  const mine = (title: string) => title === doc.title;
  return (
    <RecordView
      title={<span>{doc.title}</span>}
      takeFocus={takeFocus}
      meta={<Status tone={DOC_TONE[state]}>{DOC_STATE_WORDS[state]}</Status>}
      actions={
        <ActionGroup label={`Open ${doc.title}`}>
          {open}
          <ButtonLink to={`${href}/versions`}>Versions</ButtonLink>
        </ActionGroup>
      }
    >
      {state === "attention" && newest?.error && (
        <Banner label="Why it needs attention" icon={<AlertTriangle size={16} aria-hidden="true" />}>{newest.error}</Banner>
      )}
      {(stopped.reading.some(mine) || stopped.indexing.some(mine)) && (
        <LibraryRetry stopped={{ reading: stopped.reading.filter(mine), indexing: stopped.indexing.filter(mine) }} onDone={onRetried} />
      )}
      <Facts
        items={[
          [
            "In service",
            current.kind === "service"
              ? `Version ${current.versionNumber ?? "?"}${current.publication.activated_at ? ` since ${formatDay(current.publication.activated_at)}` : ""}`
              : current.kind === "indexing"
                ? current.stuck ? "Not yet: indexing stopped" : "Once indexing finishes"
                : current.kind === "withdrawn" ? `Withdrawn ${current.publication.withdrawn_at ? formatDay(current.publication.withdrawn_at) : ""}`.trim() : "Not yet: nothing approved",
          ],
          ...(review && current.kind === "service"
            ? [["Re-confirmation", review.state === "current" ? `Confirmed ${formatDay(review.last_reviewed_at)} · next due ${formatDay(review.due_at)}` : `${REVIEW_STATUS[review.state]} · due ${formatDay(review.due_at)}`] as [string, ReactNode]]
            : []),
          [
            "Newest upload",
            newest
              ? <>Version {newest.number}{version?.filename ? <>, <bdi>{version.filename}</bdi></> : null} · {formatDay(newest.uploaded_at)} by <bdi>{newest.uploaded_by.display_name}</bdi></>
              : "None",
          ],
          ...(version && version.blocks.length ? [["Passages read", plural(version.blocks.length, "passage")] as [string, ReactNode]] : []),
          ["Owner", doc.is_owner ? "You" : <bdi>{doc.owner.display_name}</bdi>],
          ...classificationFacts(doc, classification.data),
        ]}
      />
      {doc.versions.length > 1 && (
        <Section title="Versions" count={doc.versions.length} headingLevel={3}>
          <Lines>
            {[...doc.versions].reverse().slice(0, 5).map((item) => (
              <li key={item.id}>
                Version {item.number}: <bdi>{item.filename}</bdi>, {formatDay(item.uploaded_at)}
                {current.kind === "service" && current.versionNumber === item.number && <> · <Status tone="done">In service</Status></>}
              </li>
            ))}
          </Lines>
        </Section>
      )}
    </RecordView>
  );
}
