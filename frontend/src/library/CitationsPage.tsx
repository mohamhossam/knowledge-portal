import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, type Dependency, type Impact } from "../api/client";
import { errorMessage } from "../api/errors";
import { Button, Checkbox, type Column, DataTable, EmptyState, Section, Skeleton, Status, TextField } from "../design/components";
import { formatDay } from "../home/format";
import { useDocumentContext } from "./documentContext";

import { contentLang, humanWhere, plural } from "./where";

/** Requirement work lives at the platform's root; its pages open there. */
const requirementHref = (requirementId: string) => `/requirements/${encodeURIComponent(requirementId)}`;

const PROPOSAL_STATUS: Record<string, string> = {
  pending: "Waiting for its owner",
  accepted: "Accepted",
  edited: "Accepted with edits",
  rejected: "Rejected",
};

const TARGET: Record<string, string> = {
  proposal: "Proposal",
  clarification: "Clarification answer",
  epic: "Epic",
  feature: "Feature",
  story: "Story",
};

/** A link that opens Requirement AI says so (microcopy §1). */
function Leaves() {
  return <><span aria-hidden="true"> ↗</span><span className="ds-visually-hidden"> (opens Requirement AI)</span></>;
}

/** Requirement AI didn't answer: the count is unknown, never zero (§11). */
function Unknown({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <p role="status">
      <Status tone="attention">Couldn't ask Requirement AI: {errorMessage(error)}. The count is unknown, not zero.</Status>{" "}
      <Button variant="link" onClick={onRetry}>Ask again</Button>
    </p>
  );
}

/**
 * Cited by (plan 02 §2): the requirement proposals that cite the document, and
 * the requirement content whose source changed. Read-only here; each
 * requirement's owner decides in Requirement AI.
 */
export function CitationsPage() {
  const { document } = useDocumentContext();
  return (
    <div className="lib-stack">
      <Proposals />
      {document.is_owner ? (
        <SourceImpact />
      ) : (
        <Section title="Source impact">
          <p className="lib-quiet">Which requirement content needs review when this document changes stays with <bdi>{document.owner.display_name}</bdi>, its owner.</p>
        </Section>
      )}
    </div>
  );
}

function Proposals() {
  const { document } = useDocumentContext();
  const pages = useInfiniteQuery({
    queryKey: ["library", "dependencies", document.id],
    queryFn: ({ pageParam }) => api.dependencies(document.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    retry: false,
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: Column<Dependency>[] = [
    {
      id: "requirement",
      header: "Requirement",
      rowHeader: true,
      cell: (item) => (
        <>
          <a href={requirementHref(item.requirement_id)}><bdi lang={contentLang(item.requirement_title)}>{item.requirement_title}</bdi><Leaves /></a>
          <span className="lib-detail lib-detail--plain">{item.current_analysis ? "Current analysis" : "Earlier analysis"}{item.round_number ? `, round ${item.round_number}` : ""}</span>
        </>
      ),
    },
    { id: "statement", header: "Proposal", bidi: true, cell: (item) => <span className="lib-clamp" lang={contentLang(item.statement)}>{item.statement}</span> },
    {
      id: "status",
      header: "Status",
      width: "13rem",
      cell: (item) => {
        const reconcile = item.current_analysis && item.status !== "rejected" && !item.publication_current;
        return (
          <>
            {PROPOSAL_STATUS[item.status] ?? item.status}
            {reconcile && <span className="lib-detail"><Status tone="neutral">Cites a replaced version; its owner should reconcile it.</Status></span>}
          </>
        );
      },
    },
    { id: "cites", header: "Cites", width: "12rem", cell: (item) => <>Version {item.citation.version_number} · <bdi>{humanWhere(item.citation.location)}</bdi><span className="lib-detail lib-detail--plain">{item.publication_current ? "Current" : "Replaced since"}</span></> },
  ];
  return (
    <Section title="Requirement proposals citing it" count={pages.isSuccess && !pages.hasNextPage ? items.length : undefined}>
      <p className="lib-quiet">Proposals in requirements you can see, with the version of this document each one cites.</p>
      {pages.isError ? (
        <Unknown error={pages.error} onRetry={() => void pages.refetch()} />
      ) : pages.isPending ? (
        <Skeleton label="Asking Requirement AI who cites it" rows={3} />
      ) : items.length === 0 ? (
        <EmptyState title="No requirement you can see cites this document.">
          <p>Requirement work cites passages in service; citations appear here as they are made.</p>
        </EmptyState>
      ) : (
        <DataTable caption="Requirement proposals citing this document" captionHidden columns={columns} rows={items} rowId={(item) => item.proposal_id} />
      )}
      {pages.hasNextPage && (
        <p className="lib-more">
          <Button variant="link" busy={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>{pages.isFetchingNextPage ? "Asking…" : "Show more"}</Button>
        </p>
      )}
    </Section>
  );
}

function SourceImpact() {
  const { document } = useDocumentContext();
  const [activeOnly, setActiveOnly] = useState(true);
  const [find, setFind] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(find.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [find]);
  const pages = useInfiniteQuery({
    queryKey: ["library", "source-impact", document.id, activeOnly, query],
    queryFn: ({ pageParam }) => api.sourceImpact(document.id, { offset: pageParam, activeOnly, query }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const waiting = items.filter((item) => item.needs_review).length;
  const columns: Column<Impact>[] = [
    {
      id: "requirement",
      header: "Requirement",
      rowHeader: true,
      cell: (item) => (
        <>
          <a href={requirementHref(item.dependency.requirement_id)}><bdi lang={contentLang(item.dependency.requirement_title)}>{item.dependency.requirement_title}</bdi><Leaves /></a>
          <span className="lib-detail lib-detail--plain">{TARGET[item.dependency.target_kind] ?? item.dependency.target_kind}</span>
        </>
      ),
    },
    {
      id: "content",
      header: "Content",
      bidi: true,
      cell: (item) => (
        <>
          <span className="lib-clamp" lang={contentLang(item.dependency.statement)}>{item.dependency.statement}</span>
          <span className="lib-detail lib-detail--plain">
            {item.dependency.lineage.via.length > 0 ? <>Through <bdi>{item.dependency.lineage.via.join(" › ")}</bdi></> : "Cites it directly"} · version {item.dependency.lineage.citation.version_number}, <bdi>{humanWhere(item.dependency.lineage.citation.location)}</bdi>
          </span>
        </>
      ),
    },
    {
      id: "state",
      header: "State",
      width: "14rem",
      cell: (item) => (
        <>
          {item.needs_review ? <Status tone="neutral">Source changed; awaiting its owner</Status> : item.publication_current ? "Source unchanged" : "Kept as historical"}
          {!item.dependency.active && <span className="lib-detail lib-detail--plain">No longer in use</span>}
        </>
      ),
    },
    {
      id: "decision",
      header: "Last decision",
      width: "14rem",
      cell: (item) => {
        const latest = item.decisions.at(-1);
        return latest ? (
          <>
            {latest.decision === "retain_historical" ? "Kept" : "To be revised"} by <bdi>{latest.actor.display_name}</bdi>, {formatDay(latest.recorded_at)}
            <span className="lib-detail lib-detail--plain" dir="auto">{latest.reason}</span>
          </>
        ) : "—";
      },
    },
  ];
  return (
    <Section title="Source impact">
      <p className="lib-quiet">
        Requirement content built on this document, and whether its source changed. Each requirement's owner decides, in Requirement AI, whether to keep
        what they wrote or revise it.{waiting > 0 && <strong> {plural(waiting, "item waits", "items wait")} for that decision.</strong>}
      </p>
      <div className="lib-toolbar">
        <Checkbox label="Content still in use only" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
        <div className="lib-toolbar__find">
          <TextField label="Find in requirements" type="search" maxLength={200} value={find} onChange={(event) => setFind(event.target.value)} />
        </div>
      </div>
      {pages.isError ? (
        <Unknown error={pages.error} onRetry={() => void pages.refetch()} />
      ) : pages.isPending ? (
        <Skeleton label="Asking Requirement AI" rows={3} />
      ) : items.length === 0 ? (
        <p className="lib-quiet">
          {query ? "Nothing matches." : activeOnly ? "No requirement content still in use is built on this document." : "No requirement content is built on this document."}
        </p>
      ) : (
        <DataTable caption="Requirement content built on this document" captionHidden columns={columns} rows={items} rowId={(item) => item.dependency.id} />
      )}
      {pages.hasNextPage && (
        <p className="lib-more">
          <Button variant="link" busy={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>{pages.isFetchingNextPage ? "Asking…" : "Show more"}</Button>
        </p>
      )}
    </Section>
  );
}
