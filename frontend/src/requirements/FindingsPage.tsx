import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";

import { api, type CorpusFinding, type FindingAge, type FindingFilters, type FindingKind } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import {
  ActionGroup, Button, ConsequencePanel, EmptyState, Facts, ListFilter, ListTools, RecordList, type RecordGroup,
  RecordPlaceholder, Section, Skeleton, Status, Workbench,
} from "../design/components";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { KIND_WORDS } from "./corpus";
import { FindingRecord } from "./FindingRecord";
import { AGE_WORDS, FINDINGS_KEY, type Person, allOverdue, askable, isAge, owners } from "./findings";
import { FINDINGS_PATH, findingHref, searchOf, useCorpusSummary } from "./knowledge";
import { ListBody } from "./ListBody";
import { RequirementsHeader } from "./RequirementsHeader";

const ALL = "all";
const AGES: FindingAge[] = ["over_30_days", "from_7_to_30_days", "under_7_days"];

const isKind = (value: string | null): value is FindingKind =>
  value === "possible_duplicate" || value === "possible_contradiction";

/** A finding's name: the two requirements it stands between. */
const findingName = (item: CorpusFinding) => `${item.subject.title} and ${item.related.title}`;

/**
 * Possible duplicates and contradictions still in force, on the workbench (UX rebuild,
 * phase 3): the longest-standing first, grouped by how long they have stood, beside the
 * record of the one chosen. Their owners decide them in requirement work; a knowledge admin
 * can ask them to. With none chosen, the record side offers to ask about every overdue one.
 */
export function FindingsPage() {
  const { findingId } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const age = params.get("age");
  const kind = params.get("kind");
  const filters: FindingFilters = {
    age: isAge(age) ? age : undefined,
    kind: isKind(kind) ? kind : undefined,
    ownerId: params.get("owner") ?? undefined,
  };
  const queryClient = useQueryClient();
  const pages = useInfiniteQuery({
    queryKey: [...FINDINGS_KEY, filters],
    queryFn: ({ pageParam }) => api.corpusFindings(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: FINDINGS_KEY });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const chosen = findingId !== undefined ? items.find((item) => item.finding_id === findingId) : undefined;
  // Ages are counted to when requirement work answered.
  const now = pages.dataUpdatedAt;
  const narrowed = Boolean(filters.age || filters.kind || filters.ownerId);
  const set = (key: string, value: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });

  const record = chosen ? (
    <FindingRecord key={chosen.finding_id} item={chosen} now={now} takeFocus={location.key !== "default"} onChanged={refresh} />
  ) : findingId !== undefined ? (
    pages.isPending ? (
      <Skeleton label="Reading the finding" rows={4} />
    ) : (
      <EmptyState
        title="This finding is not in the list."
        action={
          pages.hasNextPage
            ? <Button onClick={() => void pages.fetchNextPage()}>Show more findings</Button>
            : <RouterLink href={FINDINGS_PATH}>See every open finding</RouterLink>
        }
      >
        {pages.hasNextPage
          ? `It is not among the first ${items.length} listed.`
          : narrowed
            ? "It may not match these filters, or its owners have decided it."
            : "Its owners may have decided it: only findings still in force are listed."}
      </EmptyState>
    )
  ) : (
    <FindingsOverview onDone={refresh} />
  );

  const groups: RecordGroup[] = AGES.map((key) => ({
    id: key,
    label: AGE_WORDS[key].group,
    items: items.filter((item) => item.age === key).map((item) => ({
      id: item.finding_id,
      href: findingHref(item.finding_id, searchOf(params)),
      name: item.subject.title,
      bidi: true,
      detail: `${KIND_WORDS[item.kind]} ${item.kind === "possible_duplicate" ? "of" : "with"} ${item.related.title}`,
      meta: item.next_nudge_at ? <Status tone="done">Asked</Status> : undefined,
    })),
  }));

  const summary = useCorpusSummary();
  const ages = summary.data?.open_findings;
  const pressed = filters.age ?? ALL;
  // The counts are the whole corpus's; with a kind or an owner chosen they would mislead.
  const counted = ages && !filters.kind && !filters.ownerId;
  const ageOptions = [
    { id: ALL, label: "Any age", count: counted ? ages.under_7_days + ages.from_7_to_30_days + ages.over_30_days : undefined },
    ...AGES.filter((key) => key === pressed || !ages || ages[key] > 0).map((key) => ({ id: key, label: AGE_WORDS[key].group, count: counted ? ages[key] : undefined })),
  ];
  const sides = items.flatMap((item) => [item.subject.owner, item.related.owner]);
  const owner = filters.ownerId ? sides.find((person) => person?.id === filters.ownerId) : undefined;

  const list = (
    <>
      <ListTools
        count={pages.isPending ? "Asking requirement work…" : pages.hasNextPage ? `The first ${items.length} listed` : count(items.length, "finding")}
      >
        <ListFilter label="Open for" value={pressed} options={ageOptions} onChange={(value) => set("age", value === ALL ? null : value)} />
        <ListFilter
          label="Kind"
          value={filters.kind ?? ALL}
          options={[
            { id: ALL, label: "Both kinds" },
            { id: "possible_duplicate", label: "Possible duplicates" },
            { id: "possible_contradiction", label: "Possible contradictions" },
          ]}
          onChange={(value) => set("kind", value === ALL ? null : value)}
        />
        {filters.ownerId && (
          <p className="rk-owner">
            {owner ? <>Where <strong><bdi>{owner.display_name}</bdi></strong> owns either requirement.</> : "Narrowed to one owner."}{" "}
            <Button variant="link" onClick={() => set("owner", null)}>Show every owner&rsquo;s</Button>
          </p>
        )}
      </ListTools>
      <ListBody
        pages={pages}
        empty={
          narrowed ? (
            <>No finding in force matches these filters. <Button variant="link" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Show all findings</Button></>
          ) : "No possible duplicate or contradiction stands open."
        }
      >
        <RecordList label="Findings in force, the longest-standing first" groups={groups} currentId={chosen?.finding_id} link={RouterLink} />
      </ListBody>
    </>
  );

  return (
    <>
      <RequirementsHeader page="findings" record={chosen ? findingName(chosen) : undefined} />
      <Workbench listLabel="Findings" chosen={Boolean(chosen)} list={list} record={record} />
    </>
  );
}

/** With no finding chosen: how long the open findings have stood, and the ask about every overdue one. */
function FindingsOverview({ onDone }: { onDone: () => void }) {
  const summary = useCorpusSummary();
  const me = useAuth()?.actor?.id;
  const overdue = useQuery({ queryKey: [...FINDINGS_KEY, "all-overdue"], queryFn: allOverdue });
  if (summary.isPending) return <Skeleton label="Reading requirement work's counts" rows={3} />;
  const ages = summary.data?.open_findings;
  const open = ages ? ages.under_7_days + ages.from_7_to_30_days + ages.over_30_days : 0;
  if (ages && open === 0) {
    return (
      <EmptyState title="No possible duplicate or contradiction stands open.">
        Requirement work screens each requirement against the others and raises a finding when two may say the same thing
        or the opposite. Its owners decide it on the requirement&rsquo;s Knowledge step; from here you can ask them to.
      </EmptyState>
    );
  }
  return (
    <RecordPlaceholder title={ages ? `${count(open, "open finding")}. Choose one to see who decides it.` : "Choose a finding to see who decides it."}>
      <p className="rk-lead">
        Their owners decide them on each requirement&rsquo;s Knowledge step in requirement work. Asking sends each owner a
        notification that links to that step, at most once a week per finding.
      </p>
      <BatchAsk overdue={(overdue.data ?? []).filter(askable)} me={me} onDone={onDone} />
      {ages && (
        <Section title="How long they have stood">
          <Facts items={AGES.map((key) => [AGE_WORDS[key].group, `${ages[key]}${key === "over_30_days" && ages[key] > 0 ? ", overdue" : ""}`])} />
        </Section>
      )}
    </RecordPlaceholder>
  );
}

/**
 * Ask the owners of every overdue finding at once. The confirmation names everyone it reaches
 * before anything is sent; findings waiting out their week, or with no owner, are left out.
 */
function BatchAsk({ overdue, me, onDone }: { overdue: CorpusFinding[]; me: string | undefined; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState("");
  const [outcome, setOutcome] = useState<{ text: string; failed: boolean } | null>(null);

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
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-batch-ask], [data-batch-said]")?.focus());
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
    <div className="rk-bulk">
      <p className="rk-said" role="status" tabIndex={-1} data-batch-said>
        {outcome && <Status tone={outcome.failed ? "attention" : "done"}>{outcome.text}</Status>}
        {progress && <span>{progress}</span>}
      </p>
      {overdue.length > 0 && !confirming && (
        <ActionGroup>
          <Button variant="primary" data-batch-ask onClick={() => { setOutcome(null); setConfirming(true); }}>
            Ask the owners of {overdue.length === 1 ? "the overdue finding" : `all ${overdue.length} overdue findings`}
          </Button>
        </ActionGroup>
      )}
      {confirming && (
        <ConsequencePanel
          title={`Ask the owners of ${count(overdue.length, "overdue finding")}?`}
          happens="Requirement work sends each of them one notification per finding, linked to its Knowledge step:"
          affects={
            <ul className="rk-reach">
              {people.map(({ person, findings }) => (
                <li key={person.id}>
                  <bdi>{person.id === me ? `${person.display_name} (you)` : person.display_name}</bdi>, about {count(findings, "finding")}
                </li>
              ))}
            </ul>
          }
          reversibility="A notification cannot be taken back. Findings asked about in the last week, and findings with no owner, are left out."
          confirmLabel="Ask them"
          busyLabel="Asking…"
          keepLabel="Cancel"
          busy={run.isPending}
          onConfirm={() => run.mutate(overdue)}
          onKeep={() => {
            if (run.isPending) return;
            setConfirming(false);
            window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-batch-ask]")?.focus());
          }}
        />
      )}
    </div>
  );
}
