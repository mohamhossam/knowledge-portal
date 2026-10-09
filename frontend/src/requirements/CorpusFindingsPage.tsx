import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, type CorpusFinding, type FindingAge, type FindingFilters, type FindingKind } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { count, formatDay } from "../home/format";
import { FINDINGS_PATH, knowledgeStepHref, useCorpusSummary } from "./knowledge";
import { KnowledgePage } from "./knowledgeHead";
import { RequirementLink } from "./RequirementLink";

const DAY = 24 * 60 * 60 * 1000;
const FINDINGS_KEY = ["knowledge-center", "requirement-corpus", "findings"] as const;

type AgeFilter = FindingAge | "all";

const AGES: { key: AgeFilter; label: string }[] = [
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

type Person = NonNullable<CorpusFinding["subject"]["owner"]>;

/** "today", "yesterday", "5 days ago". */
function daysAgo(iso: string, now: number): string {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** "Opened today", "Open 40 days". */
function standing(item: CorpusFinding, now: number): string {
  const days = Math.max(0, Math.floor((now - new Date(item.raised_at).getTime()) / DAY));
  return days === 0 ? "Opened today" : `Open ${count(days, "day")}`;
}

/** The finding's owners, each once: requirement work notifies each distinct owner once. */
function owners(item: CorpusFinding): Person[] {
  const found = new Map<string, Person>();
  for (const owner of [item.subject.owner, item.related.owner]) if (owner) found.set(owner.id, owner);
  return [...found.values()];
}

/** "Ravi Reviewer and you": the others by name, the signed-in admin last, as "you". */
function names(people: Person[], me: string | undefined): string {
  const words = [...people.filter((person) => person.id !== me).map((person) => person.display_name)];
  if (people.some((person) => person.id === me)) words.push("you");
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** A finding the batch may ask about: not waiting out its week, and someone to ask. */
const askable = (item: CorpusFinding) => item.next_nudge_at === null && owners(item).length > 0;

async function allOverdue(): Promise<CorpusFinding[]> {
  const found: CorpusFinding[] = [];
  for (let offset: number | null = 0; offset !== null && found.length < 1000;) {
    const page = await api.corpusFindings({ age: "over_30_days" }, offset);
    found.push(...page.items);
    offset = page.next_offset;
  }
  return found;
}

type Said = { text: string; failed: boolean };

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
  const actor = useAuth()?.actor;
  const me = actor?.id;
  const summary = useCorpusSummary();
  const queryClient = useQueryClient();
  // What each ask came to, said in its own row so no other row moves; and once for screen readers.
  const [said, setSaid] = useState<Record<string, Said>>({});
  const [announce, setAnnounce] = useState("");

  const set = (key: string, value: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });

  const pages = useInfiniteQuery({
    queryKey: [...FINDINGS_KEY, filters],
    queryFn: ({ pageParam }) => api.corpusFindings(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const overdue = useQuery({ queryKey: [...FINDINGS_KEY, "all-overdue"], queryFn: allOverdue });
  const refresh = () => queryClient.invalidateQueries({ queryKey: FINDINGS_KEY });

  const record = (item: CorpusFinding, text: string, failed: boolean) => {
    setSaid((current) => ({ ...current, [item.finding_id]: { text, failed } }));
    setAnnounce(text);
  };
  const nudge = useMutation({
    mutationFn: (item: CorpusFinding) => api.nudgeFinding(item.finding_id),
    onSuccess: (_result, item) => record(item, `Asked ${names(owners(item), me)}.`, false),
    onError: (error, item) => record(item, `Not sent: ${errorMessage(error)}`, true),
    // Either way the row's last ask may have changed; read it again.
    onSettled: refresh,
  });

  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const sides = items.flatMap((item) => [item.subject.owner, item.related.owner]);
  const owner = filters.ownerId ? sides.find((person) => person?.id === filters.ownerId) : undefined;
  const ages = summary.data?.open_findings;
  const pressed: AgeFilter = filters.age ?? "all";
  // The strip counts the whole corpus; with a kind or an owner chosen those counts would mislead.
  const counts: Partial<Record<AgeFilter, number>> = ages && !filters.kind && !filters.ownerId
    ? {
        all: ages.under_7_days + ages.from_7_to_30_days + ages.over_30_days,
        over_30_days: ages.over_30_days,
        from_7_to_30_days: ages.from_7_to_30_days,
        under_7_days: ages.under_7_days,
      }
    : {};
  const shown = AGES.filter((item) => item.key === "all" || item.key === pressed || !ages || ages[item.key] > 0);
  const narrowed = Boolean(filters.age || filters.kind || filters.ownerId);
  // Ages are counted to when requirement work answered.
  const now = pages.dataUpdatedAt;

  return (
    <KnowledgePage page="Findings">
      <section className="govsection" aria-labelledby="corpus-findings-title">
        <h2 id="corpus-findings-title" className="govsection__title">Findings in force, the longest-standing first</h2>
        <p className="govsection__lead">
          Possible duplicates and contradictions between requirements. Their owners decide them on each
          requirement&rsquo;s Knowledge step in requirement work. From here you can ask them to: requirement work sends
          each owner a notification that links to that step, at most once a week per finding.
        </p>
        <div className="filters">
          <div className="filters__set" role="group" aria-label="Show findings by how long they have stood">
            {shown.map((item) => (
              <button
                key={item.key}
                type="button"
                className="filter"
                aria-pressed={pressed === item.key}
                onClick={() => set("age", item.key === "all" ? null : item.key)}
              >
                {item.label}
                {counts[item.key] !== undefined && (
                  <>
                    <span className="visually-hidden">, </span>
                    <span className="filter__count">{counts[item.key]}</span>
                  </>
                )}
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
            {owner ? <>Where <strong>{owner.display_name}</strong> owns either requirement.</> : "Narrowed to one owner."}{" "}
            <button type="button" className="text-button" onClick={() => set("owner", null)}>Show every owner&rsquo;s</button>
          </p>
        )}
        <BatchAsk overdue={(overdue.data ?? []).filter(askable)} me={me} onDone={refresh} />
        <p className="visually-hidden" role="status">{announce}</p>

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
            {narrowed ? (
              <>
                No finding in force matches these filters.{" "}
                <button type="button" className="text-button" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Show all findings
                </button>
              </>
            ) : "No possible duplicate or contradiction stands open."}
          </p>
        ) : (
          <table className="govtable knowledge__table knowledge__findings">
            <caption className="visually-hidden">Findings in force, the longest-standing first</caption>
            <thead>
              <tr>
                <th scope="col">Finding</th>
                <th scope="col">Between</th>
                <th scope="col" className="knowledge__wide">Status</th>
                <th scope="col">Last asked</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <FindingRow
                  key={item.finding_id}
                  item={item}
                  now={now}
                  me={me}
                  meName={actor?.display_name}
                  said={said[item.finding_id]}
                  sending={nudge.isPending && nudge.variables?.finding_id === item.finding_id}
                  onAsk={() => nudge.mutate(item)}
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

/**
 * Ask the owners of every overdue finding at once. The confirmation names everyone it reaches
 * before anything is sent; findings waiting out their week, or with no owner, are left out.
 */
function BatchAsk({ overdue, me, onDone }: { overdue: CorpusFinding[]; me: string | undefined; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState("");
  const [outcome, setOutcome] = useState<Said | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) panel.current?.focus();
  }, [confirming]);

  const run = useMutation({
    mutationFn: async (findings: CorpusFinding[]) => {
      const refused: string[] = [];
      for (const [index, item] of findings.entries()) {
        setProgress(`Asking about finding ${index + 1} of ${findings.length}…`);
        try {
          await api.nudgeFinding(item.finding_id);
        } catch (error) {
          refused.push(`‘${item.subject.title}’ and ‘${item.related.title}’: ${errorMessage(error)}`);
        }
      }
      return { asked: findings.length - refused.length, refused };
    },
    onSuccess: ({ asked, refused }) => {
      setOutcome({
        text: refused.length
          ? `Asked the owners of ${count(asked, "overdue finding")}. Not sent for ${refused.length}: ${refused.join("; ")}.`
          : `Asked the owners of ${count(asked, "overdue finding")}.`,
        failed: refused.length > 0,
      });
    },
    onSettled: () => {
      setProgress("");
      setConfirming(false);
      onDone();
      trigger.current?.focus();
    },
  });

  // Who would be asked, and about how many findings each.
  const reach = new Map<string, { person: Person; findings: number }>();
  for (const item of overdue) {
    for (const person of owners(item)) {
      const entry = reach.get(person.id) ?? { person, findings: 0 };
      entry.findings += 1;
      reach.set(person.id, entry);
    }
  }
  const people = [...reach.values()].sort((a, b) =>
    a.person.id === me ? 1 : b.person.id === me ? -1 : a.person.display_name.localeCompare(b.person.display_name),
  );

  return (
    <div className="knowledge__batch">
      {outcome && <p className={outcome.failed ? "docpage__failure" : "toolbar__notice"} role="status">{outcome.text}</p>}
      {overdue.length > 0 && !confirming && (
        <p className="timetable__next">
          <button ref={trigger} type="button" className="next-button" onClick={() => { setOutcome(null); setConfirming(true); }}>
            Ask the owners of {overdue.length === 1 ? "the overdue finding" : `all ${overdue.length} overdue findings`}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </p>
      )}
      {confirming && (
        <div ref={panel} className="knowledge__confirm" tabIndex={-1} role="group" aria-labelledby="batch-title">
          <p id="batch-title" className="knowledge__confirm-title">
            Ask the owners of {count(overdue.length, "overdue finding")}?
          </p>
          <p>Requirement work sends each of them one notification per finding, linked to its Knowledge step:</p>
          <ul className="knowledge__reach">
            {people.map(({ person, findings }) => (
              <li key={person.id}>
                {person.id === me ? `${person.display_name} (you)` : person.display_name}, about {count(findings, "finding")}
              </li>
            ))}
          </ul>
          <p className="secondary">Findings asked about in the last week, and findings with no owner, are left out.</p>
          <p className="govsection__actions">
            <button type="button" className="action-button" disabled={run.isPending} onClick={() => run.mutate(overdue)}>
              {run.isPending ? "Asking…" : "Ask them"}
            </button>
            <button type="button" className="text-button" disabled={run.isPending} onClick={() => { setConfirming(false); trigger.current?.focus(); }}>
              Cancel
            </button>
            {progress && <span className="secondary" role="status">{progress}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

function Side({ side }: { side: CorpusFinding["subject"] }) {
  return (
    <span className="knowledge__side">
      <RequirementLink href={knowledgeStepHref(side.requirement_id)} className="knowledge__title">
        {side.title}
      </RequirementLink>
      <span className="secondary govtable__by knowledge__owned">
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

function FindingRow({ item, now, me, meName, said, sending, onAsk }: {
  item: CorpusFinding;
  now: number;
  me: string | undefined;
  meName: string | undefined;
  said: Said | undefined;
  sending: boolean;
  onAsk: () => void;
}) {
  const status = STATUS[item.age];
  const people = owners(item);
  const reasonId = `ask-why-${item.finding_id}`;
  const mine = people.length > 0 && people.every((person) => person.id === me);
  const waitReason = item.next_nudge_at
    ? `Asked ${item.last_nudge ? daysAgo(item.last_nudge.at, now) : "lately"}; again from ${formatDay(item.next_nudge_at)}.`
    : people.length === 0
      ? "Neither requirement has an owner to ask."
      : null;
  const mySide = item.subject.owner?.id === me ? item.subject : item.related;
  // Nudges are recorded by the asking admin's display name.
  const byMe = item.last_nudge !== null && meName !== undefined && item.last_nudge.by === meName;
  return (
    <tr className={`row ${status.rank}`}>
      <th scope="row">
        {KIND_WORDS[item.kind]}
        <span className="secondary govtable__by clamp knowledge__wide" dir="auto">{item.rationale}</span>
        {/* On phones the Status column folds into this line. */}
        <span className="secondary govtable__by knowledge__narrow">
          <span className="status">{status.words}</span> · {standing(item, now).toLowerCase()}
        </span>
      </th>
      <td>
        <Side side={item.subject} />
        <Side side={item.related} />
      </td>
      <td className="knowledge__wide">
        <span className="status">{status.words}</span>
        <span className="secondary govtable__by">
          {standing(item, now)}, since {formatDay(item.raised_at)}
        </span>
      </td>
      <td>
        {item.last_nudge ? (
          <>
            {formatDay(item.last_nudge.at)}
            <span className="secondary govtable__by">by {item.last_nudge.by}{byMe ? " (you)" : ""}</span>
          </>
        ) : (
          <span className="secondary">Not yet</span>
        )}
        <span className="knowledge__nudge">
          {mine ? (
            <RequirementLink href={knowledgeStepHref(mySide.requirement_id)} className="knowledge__decide">
              Decide it yourself
            </RequirementLink>
          ) : (
            <button
              type="button"
              className="text-button"
              aria-disabled={waitReason !== null || sending ? true : undefined}
              aria-describedby={waitReason ? reasonId : undefined}
              onClick={() => {
                if (waitReason === null && !sending) onAsk();
              }}
            >
              {sending ? "Asking…" : people.length === 0 ? "No owner to ask" : `Ask ${names(people, me)}`}
            </button>
          )}
          {!mine && waitReason && <span id={reasonId} className="secondary govtable__by">{waitReason}</span>}
          {said && <span className={said.failed ? "govtable__by knowledge__said--failed" : "secondary govtable__by"}>{said.text}</span>}
        </span>
      </td>
    </tr>
  );
}

