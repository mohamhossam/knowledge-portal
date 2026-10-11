import "./work.css";

import { AlertTriangle, Clock, ListTodo } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ActionGroup, Button, type Column, DataTable, EmptyState, FilterStrip, PageHeader, Section, Skeleton, Status } from "../design/components";
import { type JobAction, useJobActions } from "../library/actions";
import { FileButton } from "../library/FileButton";
import { RouterLink } from "../shell/links";
import { type Entry, type SectionKey, useWorkQueue } from "./queue";

type Ranked = Exclude<SectionKey, "gaps">;

const SECTIONS: { key: Ranked; title: string; teamTitle?: string; icon: typeof AlertTriangle; clear: string; source: string }[] = [
  { key: "attention", title: "Needs attention", icon: AlertTriangle, clear: "nothing has failed or is held", source: "the documents" },
  { key: "decisions", title: "Decisions waiting on you", teamTitle: "Decisions waiting", icon: ListTodo, clear: "no review or suggestion is waiting", source: "the documents and the draft's suggestions" },
  { key: "due", title: "Re-confirmations due", icon: Clock, clear: "no re-confirmations are due", source: "your re-confirmations" },
];

const DAY = 86_400_000;

/** "today", "1 day", "12 days": how long something has waited, at a glance (the date is in its tooltip). */
function Age({ at, now }: { at: string; now: number }) {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return <>—</>;
  const days = Math.max(0, Math.floor((now - time) / DAY));
  const date = new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  // The date is also said, not only in the tooltip (keyboard and touch can't reach a title).
  return (
    <time dateTime={at} title={date}>
      {days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`}
      <span className="ds-visually-hidden">, since {date}</span>
    </time>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("en")} ${count === 1 ? one : many}`;
}

/** The row's name: the link to where it is decided, isolated for either language. */
function Name({ entry }: { entry: Entry }) {
  return <RouterLink href={entry.to}><bdi>{entry.subject}</bdi></RouterLink>;
}

type Act = (entry: Entry, action: JobAction, file?: File) => void;

/** The row's own remedy (model §6): try again where retrying can help, else the specific fix. */
function Remedy({ entry, act, busy }: { entry: Entry; act: Act; busy: boolean }) {
  if ((entry.kind !== "unreadable" && entry.kind !== "unsearchable") || !entry.document.can_edit) return <span className="work__none">—</span>;
  const named = <span className="ds-visually-hidden">: {entry.subject}</span>;
  if (entry.kind === "unsearchable") {
    return entry.document.is_owner ? <Button busy={busy} onClick={() => act(entry, "retry-indexing")}>Try indexing again{named}</Button> : <span className="work__none">—</span>;
  }
  return (
    // The fix first, the retry second: the same words and order as the document and Jobs (§6).
    <ActionGroup>
      {entry.document.is_owner && (
        <FileButton busy={busy} onFile={([file]) => file && act(entry, "upload", file)}>
          {entry.held ? "Upload a clean copy" : "Upload a new version"}{named}
        </FileButton>
      )}
      {!entry.held && <Button busy={busy} onClick={() => act(entry, "retry")}>Try reading again{named}</Button>}
    </ActionGroup>
  );
}

function attentionColumns(now: number, act: Act, busyId: string | undefined): Column<Entry>[] {
  return [
    { id: "name", header: "Item", rowHeader: true, bidi: true, cell: (entry) => <Name entry={entry} /> },
    {
      id: "what",
      header: "What happened",
      cell: (entry) =>
        entry.kind === "unreadable" ? (
          <>
            <Status tone={entry.held ? "held" : "attention"}>{entry.held ? "Held by the malware scan" : "Couldn't read"}</Status>
            <span className="work__detail">{entry.held ? "It won't be read. Upload a clean copy." : <>{entry.cause ?? `The ${entry.fileType} file couldn't be read.`}</>}</span>
          </>
        ) : entry.kind === "unsearchable" ? (
          <>
            <Status tone="attention">Couldn't make it searchable</Status>
            <span className="work__detail">Requirement work can't cite it yet.</span>
          </>
        ) : null,
    },
    { id: "remedy", header: "Next step", width: "22rem", cell: (entry) => <Remedy entry={entry} act={act} busy={busyId === entry.id} /> },
    { id: "waiting", header: "Waiting", numeric: true, width: "7rem", cell: (entry) => ("sinceAt" in entry ? <Age at={entry.sinceAt} now={now} /> : "—") },
  ];
}

function decisionColumns(now: number, team: boolean): Column<Entry>[] {
  return [
    { id: "name", header: "Item", rowHeader: true, bidi: true, cell: (entry) => <Name entry={entry} /> },
    {
      id: "decision",
      header: "Decision",
      cell: (entry) =>
        entry.kind === "review" ? (
          <>
            Review version {entry.facts.number}
            <span className="work__detail">
              {entry.facts.fileType} · {entry.facts.replaces ? `replaces version ${entry.facts.replaces} in service` : "not in service yet"}
            </span>
          </>
        ) : entry.kind === "suggestions" ? (
          <>
            Decide suggestions
            <span className="work__detail">in the draft catalogue version</span>
          </>
        ) : null,
    },
    {
      id: "size",
      header: "Size",
      numeric: true,
      width: "9rem",
      cell: (entry) => (entry.kind === "review" ? plural(entry.facts.passages, "passage", "passages") : entry.kind === "suggestions" ? plural(entry.count, "suggestion", "suggestions") : "—"),
    },
    {
      id: "flags",
      header: "Flags",
      numeric: true,
      width: "10rem",
      cell: (entry) =>
        entry.kind !== "review" || entry.facts.flagged === 0 ? (
          <span className="work__none"><span aria-hidden="true">—</span><span className="ds-visually-hidden">none</span></span>
        ) : entry.facts.blocking > 0 ? (
          <Status tone="attention">{plural(entry.facts.blocking, "passage blocks", "passages block")} approval</Status>
        ) : (
          `${entry.facts.flagged.toLocaleString("en")} flagged`
        ),
    },
    ...(team
      ? [{ id: "owner", header: "Owner", bidi: true, cell: (entry: Entry) => (entry.kind === "review" ? <bdi>{entry.mine ? "You" : entry.owner}</bdi> : "Any admin") }]
      : []),
    { id: "waiting", header: "Waiting", numeric: true, width: "7rem", cell: (entry) => (entry.kind === "review" ? <Age at={entry.sinceAt} now={now} /> : "—") },
  ];
}

const dueColumns: Column<Entry>[] = [
  { id: "name", header: "Item", rowHeader: true, bidi: true, cell: (entry) => <Name entry={entry} /> },
  { id: "kind", header: "Kind", width: "8rem", cell: (entry) => (entry.kind === "due" ? (entry.what === "document" ? "Document" : "System") : null) },
  {
    id: "when",
    header: "Due",
    width: "14rem",
    cell: (entry) => (entry.kind === "due" ? (entry.overdue ? <Status tone="attention">Overdue since {entry.when}</Status> : <>Due {entry.when}</>) : null),
  },
];

/**
 * Queue archetype (IA §3), as the Calm Ledger sets it: each kind of work a
 * ruled table with the item's name as its link, and what you need to choose
 * by (version, size, flags, how long it has waited) in condensed numerals.
 * Severity is carried by order, icon and words, never colour. Empty kinds
 * fold into one line; the standing gaps backlog sits below the queue.
 */
export function YourWork() {
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") === "everyone" ? "everyone" : "mine";
  const team = scope === "everyone";
  const queue = useWorkQueue();
  // Ages read one clock per visit (a render must stay pure).
  const [now] = useState(() => Date.now());

  const rows = (key: SectionKey) => queue.sections[key].filter((entry) => team || entry.mine);
  const sections = SECTIONS.map((section) => ({ ...section, rows: rows(section.key), failed: queue.failed[section.key], pending: queue.pending[section.key] }));
  const shown = sections.filter((section) => section.pending || section.failed || section.rows.length > 0);
  const clear = sections.filter((section) => !section.pending && !section.failed && section.rows.length === 0);
  const needs = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const anyFailed = sections.some((section) => section.failed);
  const anyPending = sections.some((section) => section.pending);
  const settledEmpty = !queue.loading && needs === 0 && !anyFailed && !anyPending;
  const gap = queue.sections.gaps[0];

  // After "Try again" succeeds, its button is gone: focus goes to the section it repaired.
  // A ref, not state: the effect below runs when the reads settle and clears it, without a re-render.
  const retried = useRef<Ranked | null>(null);
  // If the repaired section is now empty, it folds into the "Also clear" line: focus goes there.
  const regions = useRef(new Map<Ranked, HTMLElement>());
  const clearLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const key = retried.current;
    if (!key || queue.failed[key] || queue.pending[key]) return;
    const region = regions.current.get(key);
    const target = region?.isConnected ? region : clearLine.current;
    target?.setAttribute("tabindex", "-1");
    target?.focus();
    retried.current = null;
  }, [queue.failed, queue.pending]);

  const lead = queue.loading || (needs === 0 && anyPending)
    ? "Reading what needs you…"
    : settledEmpty && !team
      ? undefined
      : needs === 0
        ? anyFailed ? "Some of your work couldn't be read." : "Nothing needs the team today."
        : `${plural(needs, "thing needs", "things need")} ${team ? "the team" : "you"}, most urgent first.`;

  // Acting from the queue (area 2): the row's remedy runs here; once its row has gone, focus goes to what was said.
  const actions = useJobActions();
  const said = useRef<HTMLParagraphElement>(null);
  const busyId = actions.busy ? `doc-${actions.busy.document.id}` : undefined;
  // Counts settled actions; each one moves focus to what was said (an effect, not a ref read in render).
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (settled > 0) said.current?.focus();
  }, [settled]);
  const act: Act = (entry, action, file) => {
    if (entry.kind !== "unreadable" && entry.kind !== "unsearchable") return;
    actions.act(entry.document, action, file, () => setSettled((n) => n + 1));
  };
  const columns = (key: Ranked) => (key === "attention" ? attentionColumns(now, act, busyId) : key === "decisions" ? decisionColumns(now, team) : dueColumns);

  let body: ReactNode;
  if (queue.loading) {
    body = <Skeleton label="Reading what needs you" rows={6} />;
  } else if (settledEmpty && !team) {
    body = (
      <EmptyState title="Nothing needs you." action={<RouterLink href="/?scope=everyone">See everyone's work</RouterLink>}>
        <p>{queue.summary.nextDue ? <>Next re-confirmation: {queue.summary.nextDue}.</> : "No re-confirmations are scheduled."}</p>
      </EmptyState>
    );
  } else {
    body = (
      <>
        {shown.map((section) => (
          <div key={section.key} ref={(element) => { if (element) regions.current.set(section.key, element); }} className="work__section">
            <Section
              title={<><section.icon size={16} aria-hidden="true" /> {team && section.teamTitle ? section.teamTitle : section.title}</>}
              count={section.failed || section.pending ? undefined : section.rows.length}
            >
              {section.pending ? (
                <Skeleton label={`Reading ${section.source}`} rows={2} />
              ) : section.failed ? (
                <p className="work__none">
                  Couldn't read {section.source}.{" "}
                  <Button variant="link" busy={queue.retrying} onClick={() => { retried.current = section.key; queue.retry(); }}>Try again</Button>
                </p>
              ) : (
                <DataTable<Entry> caption={team && section.teamTitle ? section.teamTitle : section.title} captionHidden columns={columns(section.key)} rows={section.rows} rowId={(entry) => entry.id} />
              )}
            </Section>
          </div>
        ))}
        {clear.length > 0 && (
          <p className="work__clear" ref={clearLine}>
            Also clear: {clear.map((section) => section.clear).join("; ")}.
            {clear.some((section) => section.key === "due") && queue.summary.nextDue ? <> Next re-confirmation: {queue.summary.nextDue}.</> : null}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="work">
      <PageHeader
        title="Your work"
        lead={lead}
        actions={
          <FilterStrip
            label="Whose work"
            filters={[{ id: "mine", label: "Mine" }, { id: "everyone", label: "Everyone's" }]}
            active={scope}
            onChange={(id) => {
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                if (id === "everyone") next.set("scope", "everyone");
                else next.delete("scope");
                return next;
              }, { replace: true });
            }}
          />
        }
      />
      <p ref={said} tabIndex={-1} className="work__said" role="status">
        {actions.said ? actions.said.failed ? <Status tone="attention">{actions.said.text}</Status> : actions.said.text : null}
      </p>
      {body}
      {/* A standing backlog, not a decision waiting on you: one quiet line, outside the count. */}
      {queue.pending.gaps ? null : queue.failed.gaps ? (
        <p className="work__backlog">Couldn't read who runs the systems in service.</p>
      ) : gap?.kind === "gaps" ? (
        <p className="work__backlog">
          Standing backlog: {plural(gap.count, "system in service has", "systems in service have")} no squad or no contact, starting with '<bdi>{gap.subject}</bdi>'.{" "}
          <RouterLink href={gap.to}>See who runs what</RouterLink>
        </p>
      ) : null}
    </div>
  );
}
