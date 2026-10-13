import { type InfiniteData, type UseInfiniteQueryResult, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";

import { api, type CorpusFilters, type CorpusRequirement, type IndexState } from "../api/client";
import { errorMessage } from "../api/errors";
import { REQUIREMENT_APP_URL } from "../auth/paths";
import {
  Button, Checkbox, EmptyState, Facts, ListFilter, ListFind, ListTools, RecordList, RecordPlaceholder, Section, Skeleton,
  Status, Workbench,
} from "../design/components";
import { requirementOverview } from "../home/derive";
import { count, formatDay } from "../home/format";
import { useFindParam } from "../catalogue/frame/useFindParam";
import { RouterLink } from "../shell/links";
import { BulkReindex } from "./BulkReindex";
import { STALE_DAYS, isState, standingOf } from "./corpus";
import { CORPUS_KEY, REQUIREMENTS_PATH, requirementHref, searchOf, useCorpusSummary, useHistoricCounts } from "./knowledge";
import { ListBody } from "./ListBody";
import { RequirementRecord } from "./RequirementRecord";
import { RequirementsHeader } from "./RequirementsHeader";

type StateFilter = IndexState | "all" | "retired";

const STATES: { key: StateFilter; label: string; exceptional: boolean }[] = [
  { key: "all", label: "Any state", exceptional: false },
  { key: "failed", label: "Stopped indexing", exceptional: true },
  { key: "waiting", label: "Waiting", exceptional: true },
  { key: "current", label: "Current", exceptional: false },
  { key: "retired", label: "Retired", exceptional: true },
];

/** "Owned by Amina Owner · screened 1 Oct 2026". */
const rowDetail = (item: CorpusRequirement) =>
  `${item.owner ? item.owner.display_name : "No owner"} · ${item.last_screened_at ? `screened ${formatDay(item.last_screened_at)}` : "never screened"}`;

/** Every filter the address holds; the list reads requirement work with them. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const state = params.get("state");
  const filters: CorpusFilters = {
    indexState: isState(state) ? state : undefined,
    ownerId: params.get("owner") ?? undefined,
    query: params.get("q")?.trim() || undefined,
    openFindingsOnly: params.get("open") === "1",
    notScreenedForDays: params.get("stale") ? STALE_DAYS : undefined,
    retiredOnly: state === "retired",
  };
  const set = (key: string, value: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  const narrowed = Boolean(filters.indexState || filters.retiredOnly || filters.query || filters.openFindingsOnly || filters.notScreenedForDays || filters.ownerId);
  return { params, setParams, filters, set, narrowed };
}

/**
 * The area's old overview address: Requirements, which now carries the overview beside its
 * list, rendered in place. A redirect would count as a navigation and move focus to the h1,
 * so a typed or bookmarked address would no longer start at the skip link.
 */
export function RequirementKnowledgeIndex() {
  return <RequirementsPage />;
}

/**
 * Requirement work's corpus on the workbench (UX rebuild, phase 3): every requirement in a
 * narrow list, filtered by its index and screening, beside the record of the one chosen.
 * With none chosen, the record side says what in the corpus needs someone.
 */
export function RequirementsPage() {
  const { requirementId } = useParams();
  const location = useLocation();
  const { params, filters, narrowed } = useFilters();
  const queryClient = useQueryClient();
  const pages = useInfiniteQuery({
    queryKey: [...CORPUS_KEY, "requirements", filters],
    queryFn: ({ pageParam }) => api.corpusRequirements(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const chosen = requirementId !== undefined ? items.find((item) => item.requirement_id === requirementId) : undefined;
  const refresh = () => queryClient.invalidateQueries({ queryKey: CORPUS_KEY });
  const search = searchOf(params);

  const record = chosen ? (
    <RequirementRecord key={chosen.requirement_id} item={chosen} takeFocus={location.key !== "default"} onChanged={refresh} />
  ) : requirementId !== undefined ? (
    pages.isPending ? (
      <Skeleton label="Reading the requirement" rows={4} />
    ) : (
      <EmptyState
        title={`“${requirementId}” is not in this list.`}
        action={
          pages.hasNextPage ? (
            <Button onClick={() => void pages.fetchNextPage()}>Show more requirements</Button>
          ) : (
            <RouterLink href={REQUIREMENTS_PATH}>See every requirement</RouterLink>
          )
        }
      >
        {pages.hasNextPage
          ? `It is not among the first ${items.length} listed. Show more, or find it by title.`
          : narrowed
            ? "It may not match these filters, or it has left the corpus."
            : "Requirement work's corpus does not hold it."}
      </EmptyState>
    )
  ) : (
    <CorpusOverview shown={items.filter((item) => !item.retired).map((item) => item.requirement_id)} offerReindex={filters.indexState !== "failed"} onDone={refresh} />
  );

  return (
    <>
      <RequirementsHeader page="requirements" record={chosen?.title} />
      <Workbench
        listLabel="Requirements"
        chosen={Boolean(chosen)}
        list={<RequirementsList pages={pages} items={items} current={chosen?.requirement_id} search={search} />}
        record={record}
      />
    </>
  );
}

type Pages = UseInfiniteQueryResult<InfiniteData<{ items: CorpusRequirement[]; next_offset: number | null }>>;

function RequirementsList({ pages, items, current, search }: { pages: Pages; items: CorpusRequirement[]; current?: string; search: string }) {
  const { filters, set, setParams, narrowed } = useFilters();
  const summary = useCorpusSummary();
  const tally = summary.data;
  const [find, setFind] = useFindParam("q");

  // The filter's counts are the whole corpus's; once another filter narrows the list they would mislead.
  const otherwise = Boolean(filters.query || filters.openFindingsOnly || filters.notScreenedForDays || filters.ownerId);
  const counts: Partial<Record<StateFilter, number>> = tally && !otherwise
    ? { all: tally.requirements, failed: tally.failed, waiting: tally.waiting, current: tally.current, retired: tally.retired }
    : {};
  const pressed: StateFilter = filters.retiredOnly ? "retired" : filters.indexState ?? "all";
  const exceptional = (key: StateFilter) => (!tally ? 1 : key === "failed" ? tally.failed : key === "waiting" ? tally.waiting : tally.retired);
  const states = STATES.filter((item) => !item.exceptional || item.key === pressed || exceptional(item.key) > 0)
    .map((item) => ({ id: item.key, label: item.label, count: counts[item.key] }));
  const owner = filters.ownerId ? items.find((item) => item.owner?.id === filters.ownerId)?.owner : undefined;
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  const said = pages.isPending
    ? "Asking requirement work…"
    : pages.hasNextPage
      ? `The first ${items.length} listed`
      : narrowed
        ? `${count(items.length, "requirement")} ${items.length === 1 ? "matches" : "match"}`
        : count(items.length, "requirement");

  return (
    <>
      <ListTools count={said}>
        <ListFind label="Find a requirement" value={find} onChange={setFind} placeholder="Title" />
        <ListFilter label="Index" value={pressed} options={states} onChange={(value) => set("state", value === "all" ? null : value)} />
        <div className="rk-checks">
          <Checkbox label="With open findings only" checked={Boolean(filters.openFindingsOnly)} onChange={(event) => set("open", event.target.checked ? "1" : null)} />
          <Checkbox label={`Not screened in ${STALE_DAYS} days`} checked={Boolean(filters.notScreenedForDays)} onChange={(event) => set("stale", event.target.checked ? "1" : null)} />
        </div>
        {filters.ownerId && (
          <p className="rk-owner">
            {owner ? <>Owned by <strong><bdi>{owner.display_name}</bdi></strong>.</> : "Narrowed to one owner."}{" "}
            <Button variant="link" onClick={() => set("owner", null)}>Show every owner&rsquo;s</Button>
          </p>
        )}
      </ListTools>
      <ListBody
        pages={pages}
        empty={
          narrowed ? (
            <>No requirement matches these filters. <Button variant="link" onClick={clear}>Show all requirements</Button></>
          ) : "Requirement work's corpus holds no requirements yet."
        }
      >
        <RecordList
          label="Requirements in requirement work's corpus, by title"
          items={items.map((item) => {
            const standing = standingOf(item);
            return {
              id: item.requirement_id,
              href: requirementHref(item.requirement_id, search),
              name: item.title,
              bidi: true,
              detail: rowDetail(item),
              meta: standing
                ? <Status tone={standing.tone}>{standing.words}</Status>
                : item.open_findings > 0
                  ? <Status tone="neutral">{count(item.open_findings, "finding")}</Status>
                  : undefined,
            };
          })}
          currentId={current}
          link={RouterLink}
        />
      </ListBody>
    </>
  );
}

/**
 * With no requirement chosen: what in the corpus needs someone, the one next decision, and
 * the corpus's bulk work (retry what stopped indexing, reindex what is listed).
 */
function CorpusOverview({ shown, offerReindex, onDone }: { shown: string[]; offerReindex: boolean; onDone: () => void }) {
  const summary = useCorpusSummary();
  const historic = useHistoricCounts();
  const corpus = summary.data;
  if (summary.isPending) return <Skeleton label="Reading requirement work's counts" rows={3} />;
  if (!corpus) {
    return (
      <EmptyState title="Requirement work did not answer with its counts." action={<Button icon={<RotateCw size={14} />} onClick={() => void summary.refetch()}>Try again</Button>}>
        {errorMessage(summary.error)}
      </EmptyState>
    );
  }
  if (corpus.requirements === 0) {
    return (
      <EmptyState
        title="Requirement work's corpus holds no requirements yet."
        action={REQUIREMENT_APP_URL ? <a href={REQUIREMENT_APP_URL}>Open Requirement AI</a> : undefined}
      >
        Requirement work keeps the requirements and their findings. Each requirement it indexes is listed here, with
        whose it is and how its index stands, so you can retire, reinstate or reindex it.
      </EmptyState>
    );
  }
  const overview = requirementOverview(corpus, REQUIREMENT_APP_URL, historic.data ?? null);
  const next = overview.next;
  return (
    <RecordPlaceholder title={`${count(corpus.requirements, "requirement")} in requirement work's corpus. Choose one to read its record.`}>
      {corpus.rebuild_required && (
        <p className="rk-notice">
          <Status tone="attention">The embedding model changed.</Status> Every requirement waits for the index to be
          rebuilt in requirement work, so each reads &ldquo;Waits for the rebuild&rdquo;.
        </p>
      )}
      <p className="rk-next">
        {next.to ? (
          <RouterLink href={next.to}>{next.label}</RouterLink>
        ) : next.href ? (
          <a href={next.href}>{next.label}{" "}<span className="ds-visually-hidden">({next.leaves})</span></a>
        ) : (
          <span>{next.label}</span>
        )}
      </p>
      <BulkReindex failed={corpus.failed} shown={shown} offerReindex={offerReindex} onDone={onDone} />
      {overview.lines.length > 0 && (
        <Section title="Needs someone" count={overview.lines.length}>
          <ul className="rk-lines">
            {overview.lines.map((line) => (
              <li key={line.key}>
                {line.to ? <RouterLink href={line.to}>{line.name}</RouterLink> : <span>{line.name}</span>}
                <span className="rk-lines__status">{line.cells.status}</span>
                <span className="rk-lines__count">{line.cells.count}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="In counts">
        <Facts items={overview.totals.map((total) => [total.label, total.value])} />
        <p className="rk-quiet">Requirement work keeps the requirements and their findings, and answers with these counts.</p>
      </Section>
    </RecordPlaceholder>
  );
}
