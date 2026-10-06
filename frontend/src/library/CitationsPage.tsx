import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import { api, type Dependency, type Impact } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { useDocumentContext } from "./documentContext";

/** Requirement work lives at the platform's root; its pages open there. */
const requirementHref = (requirementId: string) => `/requirements/${encodeURIComponent(requirementId)}`;

const PROPOSAL_STATUS: Record<string, string> = {
  pending: "Awaiting the owner",
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

/**
 * Who relies on this document: the requirement proposals that cite it, and
 * every piece of requirement content whose source changed. Read-only here:
 * each requirement's owner decides in Requirement AI.
 */
export function CitationsPage() {
  const { document } = useDocumentContext();
  return (
    <>
      <Proposals />
      {document.is_owner ? <SourceImpact /> : <SourceImpactStaysWithOwner owner={document.owner.display_name} />}
    </>
  );
}

/** An admin acting for the owner: where its content is cited is the owner's to inspect. */
function SourceImpactStaysWithOwner({ owner }: { owner: string }) {
  const id = useId();
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Source impact</h2>
      <p className="timetable__quiet">
        Which requirement content needs review when this document changes stays with {owner}, its owner.
      </p>
    </section>
  );
}

function Proposals() {
  const { document } = useDocumentContext();
  const id = useId();
  const pages = useInfiniteQuery({
    queryKey: ["library", "dependencies", document.id],
    queryFn: ({ pageParam }) => api.dependencies(document.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Requirement proposals citing it</h2>
      <p className="govsection__lead">
        Proposals in requirements you can see, with the version of this document each one cites.
      </p>
      {pages.isError ? (
        <p className="docpage__failure" role="alert">Requirement work did not answer: {errorMessage(pages.error)}</p>
      ) : pages.isPending ? (
        <p className="timetable__quiet">Asking requirement work…</p>
      ) : items.length === 0 ? (
        <p className="timetable__quiet">No requirement you can see cites this document.</p>
      ) : (
        <table className="govtable">
          <caption className="visually-hidden">Requirement proposals citing this document</caption>
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              <th scope="col" className="cell--p2">Proposal</th>
              <th scope="col">Status</th>
              <th scope="col" className="cell--p3">Cites</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <ProposalRow key={item.proposal_id} item={item} />)}
          </tbody>
        </table>
      )}
      {pages.hasNextPage && (
        <p className="govsection__actions">
          <button type="button" className="text-button" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
            {pages.isFetchingNextPage ? "Asking…" : "Show more"}
          </button>
        </p>
      )}
    </section>
  );
}

function ProposalRow({ item }: { item: Dependency }) {
  const reconcile = item.current_analysis && item.status !== "rejected" && !item.publication_current;
  return (
    <tr className={`row ${reconcile ? "row--due" : item.current_analysis ? "" : "row--past"}`}>
      <th scope="row">
        <a href={requirementHref(item.requirement_id)} dir="auto">{item.requirement_title}</a>
        <span className="secondary govtable__by">
          {item.current_analysis ? "Current analysis" : "Earlier analysis"}
          {item.round_number ? `, round ${item.round_number}` : ""}
        </span>
      </th>
      <td className="cell--p2" dir="auto"><span className="clamp">{item.statement}</span></td>
      <td>
        <span className="status">{PROPOSAL_STATUS[item.status] ?? item.status}</span>
        {reconcile && <span className="secondary govtable__by">Cites a replaced version; its owner should reconcile it.</span>}
      </td>
      <td className="cell--p3">
        version {item.citation.version_number} · {item.citation.location}
        <span className="secondary govtable__by">{item.publication_current ? "Current" : "Replaced since"}</span>
      </td>
    </tr>
  );
}

function SourceImpact() {
  const { document } = useDocumentContext();
  const id = useId();
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
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const waiting = items.filter((item) => item.needs_review).length;
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Source impact</h2>
      <p className="govsection__lead">
        Requirement content built on this document, and whether its source changed. Each requirement's owner decides,
        in Requirement AI, whether to keep what they wrote or revise it.
        {waiting > 0 && <strong> {waiting} {waiting === 1 ? "item waits" : "items wait"} for that decision.</strong>}
      </p>
      <div className="filters">
        <label className="check">
          <input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
          Content still in use only
        </label>
        <label className="field field--inline">
          <span className="field__label">Find in requirements</span>
          <input type="search" className="field__input" maxLength={200} value={find} onChange={(event) => setFind(event.target.value)} />
        </label>
      </div>
      {pages.isError ? (
        <p className="docpage__failure" role="alert">Requirement work did not answer: {errorMessage(pages.error)}</p>
      ) : pages.isPending ? (
        <p className="timetable__quiet">Asking requirement work…</p>
      ) : items.length === 0 ? (
        <p className="timetable__quiet">
          {query
            ? "Nothing matches."
            : activeOnly
              ? "No requirement content still in use is built on this document."
              : "No requirement content is built on this document."}
        </p>
      ) : (
        <table className="govtable">
          <caption className="visually-hidden">Requirement content built on this document</caption>
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              <th scope="col" className="cell--p2">Content</th>
              <th scope="col">State</th>
              <th scope="col" className="cell--p3">Last decision</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <ImpactRow key={item.dependency.id} item={item} />)}
          </tbody>
        </table>
      )}
      {pages.hasNextPage && (
        <p className="govsection__actions">
          <button type="button" className="text-button" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
            {pages.isFetchingNextPage ? "Asking…" : "Show more"}
          </button>
        </p>
      )}
    </section>
  );
}

function ImpactRow({ item }: { item: Impact }) {
  const { dependency } = item;
  const latest = item.decisions.at(-1);
  const via = dependency.lineage.via;
  return (
    <tr className={`row ${item.needs_review ? "row--due" : dependency.active ? "" : "row--past"}`}>
      <th scope="row">
        <a href={requirementHref(dependency.requirement_id)} dir="auto">{dependency.requirement_title}</a>
        <span className="secondary govtable__by">{TARGET[dependency.target_kind] ?? dependency.target_kind}</span>
      </th>
      <td className="cell--p2" dir="auto">
        <span className="clamp">{dependency.statement}</span>
        <span className="secondary govtable__by">
          {via.length > 0 ? `Through ${via.join(" › ")}` : "Cites it directly"} · version {dependency.lineage.citation.version_number}, {dependency.lineage.citation.location}
        </span>
      </td>
      <td>
        <span className="status">
          {item.needs_review ? "Source changed; awaiting its owner" : item.publication_current ? "Source unchanged" : "Kept as historical"}
        </span>
        {!dependency.active && <span className="secondary govtable__by">No longer in use</span>}
      </td>
      <td className="cell--p3">
        {latest ? (
          <>
            {latest.decision === "retain_historical" ? "Kept" : "To be revised"} by {latest.actor.display_name}, {formatDay(latest.recorded_at)}
            <span className="secondary govtable__by" dir="auto">{latest.reason}</span>
          </>
        ) : "—"}
      </td>
    </tr>
  );
}
