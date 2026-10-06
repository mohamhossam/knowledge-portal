import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, type CorpusFinding, type FindingAge, type FindingFilters, type FindingKind } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { count, formatDay } from "../home/format";
import { FINDINGS_PATH, knowledgeStepHref, useCorpusSummary } from "./knowledge";
import { KnowledgePage } from "./knowledgeHead";

const DAY = 24 * 60 * 60 * 1000;

const AGES: { key: FindingAge | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "over_30_days", label: "Over 30 days" },
  { key: "from_7_to_30_days", label: "7 to 30 days" },
  { key: "under_7_days", label: "Under 7 days" },
];

const KIND_WORDS: Record<FindingKind, string> = {
  possible_duplicate: "Possible duplicate",
  possible_contradiction: "Possible contradiction",
};

const STATUS: Record<FindingAge, { words: string; rank: string }> = {
  over_30_days: { words: "Overdue", rank: "row--delayed" },
  from_7_to_30_days: { words: "Awaiting owners", rank: "row--due" },
  under_7_days: { words: "With their owners", rank: "" },
};

const isAge = (value: string | null): value is FindingAge =>
  value === "over_30_days" || value === "from_7_to_30_days" || value === "under_7_days";
const isKind = (value: string | null): value is FindingKind =>
  value === "possible_duplicate" || value === "possible_contradiction";

/** "today", "yesterday", "5 days ago". */
function daysAgo(iso: string, now: number): string {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function owners(item: CorpusFinding): string[] {
  const names = [item.subject.owner, item.related.owner]
    .filter((owner): owner is NonNullable<typeof owner> => owner !== null)
    .map((owner) => owner.display_name);
  return [...new Set(names)];
}

/**
 * Possible duplicates and contradictions still in force across the corpus, the longest-standing
 * first. Their owners decide them in requirement work; a knowledge admin can only ask them to.
 */
export function CorpusFindingsPage() {
  const [params, setParams] = useSearchParams();
  const age = params.get("age");
  const kind = params.get("kind");
  const filters: FindingFilters = {
    age: isAge(age) ? age : undefined,
    kind: isKind(kind) ? kind : undefined,
    ownerId: params.get("owner") ?? undefined,
  };
  const summary = useCorpusSummary();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const set = (key: string, value: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });

  const pages = useInfiniteQuery({
    queryKey: ["knowledge-center", "requirement-corpus", "findings", filters],
    queryFn: ({ pageParam }) => api.corpusFindings(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const nudge = useMutation({
    mutationFn: (item: CorpusFinding) => api.nudgeFinding(item.finding_id),
    onMutate: () => {
      setNotice("");
      setFailure("");
    },
    onSuccess: (result, item) => {
      const asked = result.recipients.length ? result.recipients.join(" and ") : "its owners";
      setNotice(
        `Asked ${asked} to decide the ${KIND_WORDS[item.kind].toLowerCase()} between ‘${item.subject.title}’ and ‘${item.related.title}’. It can be nudged again from ${formatDay(result.next_nudge_at)}.`,
      );
    },
    onError: (error) => {
      const conflict = error instanceof ApiError && (error.status === 409 || error.status === 404);
      setFailure(conflict ? `Not sent: ${errorMessage(error)}` : `The nudge was not sent: ${errorMessage(error)}`);
    },
    // Either way the row's last nudge may have changed; read it again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["knowledge-center", "requirement-corpus", "findings"] }),
  });

  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const sides = items.flatMap((item) => [item.subject.owner, item.related.owner]);
  const owner = filters.ownerId ? sides.find((person) => person?.id === filters.ownerId) : undefined;
  const ages = summary.data?.open_findings;
  const counts: Record<string, number | undefined> = ages
    ? {
        all: ages.under_7_days + ages.from_7_to_30_days + ages.over_30_days,
        over_30_days: ages.over_30_days,
        from_7_to_30_days: ages.from_7_to_30_days,
        under_7_days: ages.under_7_days,
      }
    : {};
  const narrowed = Boolean(filters.age || filters.kind || filters.ownerId);
  // Ages are counted to when requirement work answered.
  const now = pages.dataUpdatedAt;

  return (
    <KnowledgePage
      page="Findings"
      edition="Possible duplicates and contradictions still in force, the longest-standing first. Their owners decide them on each requirement's Knowledge step in requirement work; from here you can ask them to, at most once a week."
    >
      <section className="govsection" aria-labelledby="corpus-findings-title">
        <h2 id="corpus-findings-title" className="govsection__title">Findings</h2>
        <div className="filters">
          <div className="filters__set" role="group" aria-label="Show findings by how long they have stood">
            {AGES.map((item) => (
              <button
                key={item.key}
                type="button"
                className="filter"
                aria-pressed={(filters.age ?? "all") === item.key}
                onClick={() => set("age", item.key === "all" ? null : item.key)}
              >
                {item.label}
                {counts[item.key] !== undefined && <span className="filter__count">{counts[item.key]}</span>}
              </button>
            ))}
          </div>
          <label className="field field--inline">
            <span className="field__label">Kind</span>
            <select className="field__input" value={filters.kind ?? ""} onChange={(event) => set("kind", event.target.value || null)}>
              <option value="">Both kinds</option>
              <option value="possible_duplicate">Possible duplicates</option>
              <option value="possible_contradiction">Possible contradictions</option>
            </select>
          </label>
        </div>
        {filters.ownerId && (
          <p className="knowledge__owner">
            Where <strong>{owner?.display_name ?? "one person"}</strong> owns either requirement.{" "}
            <button type="button" className="text-button" onClick={() => set("owner", null)}>Show every owner&rsquo;s</button>
          </p>
        )}
        <p className="toolbar__notice" role="status">{notice}</p>
        {failure && <p className="docpage__failure" role="alert">{failure}</p>}

        {pages.isError ? (
          <p className="docpage__failure" role="alert">
            Requirement work did not answer: {errorMessage(pages.error)}
            <button type="button" className="text-button" onClick={() => void pages.refetch()}>
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          </p>
        ) : pages.isPending ? (
          <p className="timetable__quiet">Asking requirement work…</p>
        ) : items.length === 0 ? (
          <p className="timetable__quiet">
            {narrowed ? "No finding in force matches these filters." : "No possible duplicate or contradiction stands open."}
          </p>
        ) : (
          <table className="govtable knowledge__table knowledge__findings">
            <caption className="visually-hidden">Findings in force, the longest-standing first</caption>
            <thead>
              <tr>
                <th scope="col">Finding</th>
                <th scope="col">Between</th>
                <th scope="col">Status</th>
                <th scope="col">Owners asked</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <FindingRow
                  key={item.finding_id}
                  item={item}
                  now={now}
                  sending={nudge.isPending && nudge.variables?.finding_id === item.finding_id}
                  onNudge={() => nudge.mutate(item)}
                />
              ))}
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
    </KnowledgePage>
  );
}

function Side({ side }: { side: CorpusFinding["subject"] }) {
  return (
    <span className="knowledge__side">
      <a href={knowledgeStepHref(side.requirement_id)} dir="auto">{side.title}</a>
      <span className="secondary govtable__by">
        {side.owner ? (
          <Link
            to={`${FINDINGS_PATH}?owner=${encodeURIComponent(side.owner.id)}`}
            className="knowledge__person"
            aria-label={`${side.owner.display_name}: show only findings on their requirements`}
          >
            {side.owner.display_name}
          </Link>
        ) : "No owner"}
      </span>
    </span>
  );
}

function FindingRow({ item, now, sending, onNudge }: {
  item: CorpusFinding;
  now: number;
  sending: boolean;
  onNudge: () => void;
}) {
  const status = STATUS[item.age];
  const asked = owners(item);
  const reasonId = `nudge-why-${item.finding_id}`;
  const waitReason = item.next_nudge_at
    ? `Asked ${item.last_nudge ? daysAgo(item.last_nudge.at, now) : "lately"}; again from ${formatDay(item.next_nudge_at)}.`
    : asked.length === 0
      ? "Neither requirement has an owner to ask."
      : null;
  const days = Math.max(0, Math.floor((now - new Date(item.raised_at).getTime()) / DAY));
  return (
    <tr className={`row ${status.rank}`}>
      <th scope="row">
        {KIND_WORDS[item.kind]}
        <span className="secondary govtable__by clamp" dir="auto">{item.rationale}</span>
      </th>
      <td>
        <Side side={item.subject} />
        <Side side={item.related} />
      </td>
      <td>
        <span className="status">{status.words}</span>
        <span className="secondary govtable__by">
          Open {count(days, "day")}, since {formatDay(item.raised_at)}
        </span>
      </td>
      <td>
        {item.last_nudge ? (
          <>
            {formatDay(item.last_nudge.at)}
            <span className="secondary govtable__by">by {item.last_nudge.by}</span>
          </>
        ) : (
          <span className="secondary">Not yet</span>
        )}
        <span className="knowledge__nudge">
          <button
            type="button"
            className="text-button"
            aria-disabled={waitReason !== null || sending ? true : undefined}
            aria-describedby={waitReason ? reasonId : undefined}
            onClick={() => {
              if (waitReason === null && !sending) onNudge();
            }}
          >
            {sending ? "Asking…" : asked.length === 1 ? "Nudge the owner" : "Nudge both owners"}
          </button>
          {waitReason && <span id={reasonId} className="secondary govtable__by">{waitReason}</span>}
        </span>
      </td>
    </tr>
  );
}
