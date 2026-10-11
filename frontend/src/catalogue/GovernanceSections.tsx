import "./offering/offering.css";

import type { ReactNode } from "react";

import type { ChangeRecord, KnowledgeSource, Offering, SourceConflict } from "../api/client";
import { type Column, DataTable, Lines, Section, Status, Suggested } from "../design/components";
import { formatDay } from "../home/format";
import { CONFIDENCE } from "./catalogue";
import { traceLine } from "./inbox";
import { byLevel, LEVEL, levelTag, questionOf, useSourceText } from "./governance";

type Sourced = { confidence?: string | null; source?: string | null };

/**
 * How a fact stands against its source, as a mark: inferred is the Suggested mark,
 * a gap its source leaves is a status needing attention; confirmed says nothing.
 */
export function ConfidenceMark({ confidence }: { confidence?: string | null }) {
  if (confidence === "inferred") return <Suggested basis="inferred" />;
  if (confidence === "gap") return <Status tone="attention">{CONFIDENCE.gap}</Status>;
  return null;
}

/** A fact's mark and its source, "BPP SDD (L2) §11", on a quiet line; nothing when confirmed and unsourced. */
export function Provenance({ item }: { item: Sourced }) {
  const sourceText = useSourceText();
  const source = sourceText(item.source);
  const marked = item.confidence === "inferred" || item.confidence === "gap";
  if (!marked && !source) return null;
  return (
    <span className="offering-by">
      <ConfidenceMark confidence={item.confidence} />
      {source && <span dir="auto">{source}</span>}
    </span>
  );
}

/** A section's sub-heading, one level under its title. */
export function PartHeading({ level, children }: { level: 2 | 3; children: ReactNode }) {
  const Heading = level === 2 ? "h3" : "h4";
  return <Heading className="offering-part">{children}</Heading>;
}

const sourceName = (source: KnowledgeSource) => source.short ?? source.title;
const counted = (n: number) => (n > 0 ? n : undefined);

/** A level as a tag with its word: "L2 Primary". */
function Level({ level }: { level: KnowledgeSource["level"] }) {
  return (
    <span className="offering-level">
      <abbr title={LEVEL[level].long}>{level}</abbr> {LEVEL[level].word}
    </span>
  );
}

const NOT_SUPPLIED = "Not supplied: carried forward unread";

/**
 * The sources the catalogue's knowledge is read from (requirement-portal ADR-0101,
 * step 5), canonical first: each with its level, what it is the authority for, and
 * what it cannot tell. A source carried forward without being supplied is due.
 */
export function SourceRegister({ sources, action, level = 2 }: {
  sources: KnowledgeSource[];
  /** Kept for callers; the section names its own heading. */
  headingId: string;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const columns: Column<KnowledgeSource>[] = [
    {
      id: "source",
      header: "Source",
      rowHeader: true,
      bidi: true,
      cell: (source) => (
        <>
          {source.title}
          <span className="offering-by" dir="auto">
            {[source.short, source.version && `version ${source.version}`, source.file].filter(Boolean).join(" · ")}
          </span>
          {source.supplied === false && <span className="offering-by"><Status tone="attention">{NOT_SUPPLIED}</Status></span>}
        </>
      ),
    },
    { id: "level", header: "Level", width: "8rem", cell: (source) => <Level level={source.level} /> },
    {
      id: "authority",
      header: "What it is the authority for",
      bidi: true,
      cell: (source) => (
        <>
          {source.authority ?? <span className="offering-quiet">Not stated</span>}
          {source.scope && <span className="offering-by" dir="auto">Covers {source.scope}</span>}
          {source.boundary && <span className="offering-by" dir="auto">Cannot tell: {source.boundary}</span>}
        </>
      ),
    },
  ];
  return (
    <Section title="Sources" count={counted(sources.length)} actions={action} headingLevel={level}>
      <p className="offering-lead">
        Where the catalogue’s knowledge is read from: L1 the canonical landscape, L2 a primary source for its scope, L3 a baseline carried forward.
      </p>
      {sources.length ? (
        <DataTable caption="Sources, by level" captionHidden columns={columns} rows={byLevel(sources)} rowId={(source) => source.id} />
      ) : (
        <p className="offering-quiet">No source is registered.</p>
      )}
    </Section>
  );
}

/**
 * Conflicts between sources, never reconciled by the catalogue: each a row needing
 * a decision, with both statements and where each is said, what differs, what it
 * affects, and the decision it needs. Used for the whole register and for one offering's.
 */
export function ConflictList({ conflicts, sources, title, lead, action, affects, raises, level = 2 }: {
  conflicts: SourceConflict[];
  sources: KnowledgeSource[];
  /** Kept for callers; the section names its own heading. Each conflict is at `#conflict-<id>`. */
  headingId: string;
  title: string;
  lead: string;
  action?: ReactNode;
  /** What a conflict affects, in words, for the register; an offering's list leaves it out. */
  affects?: (conflict: SourceConflict) => ReactNode;
  /** The question a conflict raises for the offering being read, for an offering's list. */
  raises?: (conflict: SourceConflict) => string | null;
  level?: 2 | 3;
}) {
  const said = (side: SourceConflict["a"]) => {
    const source = sources.find((item) => item.id === side.source_id);
    return [source ? `${sourceName(source)} ${levelTag(source)}` : side.source_id, side.reference].filter(Boolean).join(" ");
  };
  const columns: Column<SourceConflict>[] = [
    {
      id: "conflict",
      header: "Conflict",
      rowHeader: true,
      bidi: true,
      width: "32%",
      cell: (conflict) => {
        const question = raises?.(conflict);
        return (
          <>
            <span id={`conflict-${conflict.id}`} className="offering-id">{conflict.id}</span> {conflict.title}
            {conflict.difference && <span className="offering-by" dir="auto">{conflict.difference}</span>}
            {affects?.(conflict)}
            {question && (
              <span className="offering-by">
                <span>Raises the question <span className="offering-id">{question}</span></span>
              </span>
            )}
          </>
        );
      },
    },
    {
      id: "sides",
      header: "What each source says",
      width: "38%",
      cell: (conflict) => (
        <dl className="offering-sides">
          {[conflict.a, conflict.b].map((side, index) => (
            <div key={index}>
              <dt dir="auto">{said(side)}</dt>
              <dd dir="auto">{side.statement}</dd>
            </div>
          ))}
        </dl>
      ),
    },
    {
      id: "decision",
      header: "Decision needed",
      bidi: true,
      cell: (conflict) => (
        <>
          {conflict.decision ? <span className="offering-due">{conflict.decision}</span> : <Status tone="attention">Not stated</Status>}
          {conflict.impact && <span className="offering-by" dir="auto">Meanwhile: {conflict.impact}</span>}
          <Provenance item={conflict} />
        </>
      ),
    },
  ];
  return (
    <Section title={title} count={counted(conflicts.length)} actions={action} headingLevel={level}>
      {conflicts.length > 0 && <p className="offering-lead">{lead}</p>}
      {conflicts.length ? (
        <DataTable caption={title} captionHidden columns={columns} rows={conflicts} rowId={(conflict) => conflict.id} />
      ) : (
        <p className="offering-quiet">No conflict between its sources is recorded.</p>
      )}
    </Section>
  );
}

/** The questions an offering's sources leave open; one a conflict raises says which. */
export function OpenQuestions({ offering, conflicts, action, beside, level = 3 }: {
  offering: Offering;
  /** Every conflict that concerns the offering. */
  conflicts: SourceConflict[];
  /** Kept for callers; the section names its own heading. Each question is at `#question-<id>`. */
  headingId: string;
  action?: ReactNode;
  /**
   * The conflicts listed with the questions, which say the questions they raise; the
   * questions of the offering's other conflicts concern other order types and are left out.
   */
  beside?: SourceConflict[];
  level?: 2 | 3;
}) {
  const all = offering.questions ?? [];
  const raised = (id: string) => conflicts.filter((conflict) => questionOf(conflict, offering.id)?.toLocaleLowerCase() === id.toLocaleLowerCase());
  const shown = beside ? all.filter((question) => raised(question.id).length === 0) : all;
  const withConflicts = beside ? all.filter((question) => raised(question.id).some((conflict) => beside.includes(conflict))).length : 0;
  return (
    <Section title="Open questions" count={counted(shown.length)} actions={action} headingLevel={level}>
      {withConflicts > 0 && (
        <p className="offering-lead">
          {withConflicts === 1 ? "1 more is raised" : `${withConflicts} more are raised`} by the decisions needed, and named with them.
        </p>
      )}
      {shown.length ? (
        <ol className="offering-items">
          {shown.map((question) => {
            const by = raised(question.id);
            const asked = (question.order_types ?? []).map((code) => offering.order_types.find((type) => type.code === code)?.name ?? code);
            return (
              <li key={question.id} id={`question-${question.id}`}>
                <span className="offering-id">{question.id}</span>
                <div>
                  <p dir="auto">{question.text}</p>
                  {asked.length > 0 && <span className="offering-by" dir="auto">Asked for {asked.join(", ")}</span>}
                  {question.impact && <span className="offering-by" dir="auto">Meanwhile: {question.impact}</span>}
                  {by.length > 0 && <span className="offering-by">Raised by {by.map((item) => `the conflict ${item.id}`).join(", ")}</span>}
                  <Provenance item={question} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="offering-quiet">No open question is recorded.</p>
      )}
    </Section>
  );
}

/** The architecture decisions taken for an offering. */
export function ArchitectureDecisions({ offering, action, level = 3 }: {
  offering: Offering;
  /** Kept for callers; the section names its own heading. */
  headingId: string;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const decisions = offering.decisions ?? [];
  return (
    <Section title="Architecture decisions" count={counted(decisions.length)} actions={action} headingLevel={level}>
      {decisions.length ? (
        <ul className="offering-items">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <span className="offering-id">{decision.id}</span>
              <div>
                <p className="offering-items__title" dir="auto">{decision.title}</p>
                {decision.text && <p dir="auto">{decision.text}</p>}
                <Provenance item={decision} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="offering-quiet">No architecture decision is recorded.</p>
      )}
    </Section>
  );
}

/** The sources an offering is read from, the primary one first, what they cover, and what it no longer uses. */
export function OfferingSourceList({ offering, sources, action, level = 3 }: {
  offering: Offering;
  sources: KnowledgeSource[];
  /** Kept for callers; the section names its own heading. */
  headingId: string;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const named = (offering.sources ?? []).map((id) => sources.find((item) => item.id === id)).filter((item): item is KnowledgeSource => !!item);
  const ordered = [...named].sort((a, b) => Number(b.id === offering.primary_source) - Number(a.id === offering.primary_source));
  const boundaries = offering.boundaries ?? [];
  const notUsed = offering.not_used ?? [];
  return (
    <Section title="Sources and boundaries" actions={action} headingLevel={level}>
      {ordered.length ? (
        <ul className="offering-items">
          {ordered.map((source) => (
            <li key={source.id}>
              <Level level={source.level} />
              <div>
                <p dir="auto">
                  {source.title}
                  {source.id === offering.primary_source && <span className="offering-items__title"> · its primary source</span>}
                </p>
                <span className="offering-by" dir="auto">
                  {[source.short, source.version && `version ${source.version}`].filter(Boolean).join(" · ")}
                </span>
                {source.supplied === false && <span className="offering-by"><Status tone="attention">{NOT_SUPPLIED}</Status></span>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="offering-quiet">No source is named for it.</p>
      )}
      {boundaries.length > 0 && (
        <>
          <PartHeading level={level}>What its sources cover</PartHeading>
          <Lines>
            {boundaries.map((item) => <li key={item} dir="auto">{item}</li>)}
          </Lines>
        </>
      )}
      {notUsed.length > 0 && <p className="offering-quiet" dir="auto">No longer uses: {notUsed.join(", ")}</p>}
    </Section>
  );
}

const ITEM_STATUS: Record<ChangeRecord["items"][number]["status"] & string, string | null> = {
  recorded: null,
  inferred: "mapped automatically",
  gap: "needs an architect's review",
  conflict: "needs a decision",
};

/**
 * The change requests applied to this version (requirement-portal ADR-0101, step 7), newest
 * last as they were applied: who asked and why, and what each changed. History is written by
 * accepting from a change request, never edited by hand.
 */
export function ChangeHistory({ history, offering, level = 2 }: {
  history: ChangeRecord[];
  /** The offering a record changed, linked to its sheet. */
  offering: (id: string) => ReactNode;
  /** Kept for callers; the section names its own heading. */
  headingId: string;
  level?: 2 | 3;
}) {
  const columns: Column<ChangeRecord>[] = [
    {
      id: "request",
      header: "Change request",
      rowHeader: true,
      width: "40%",
      cell: (record) => (
        <>
          <span className="offering-id">{record.id}</span>{" "}
          <span className="offering-items__title" dir="auto">{record.title}</span>
          <span className="offering-by" dir="auto">
            {record.origin === "explorer" ? "Drafted in the original explorer" : "From Requirement AI"}
            {record.requester && record.requester !== record.trace?.approved_by && `, asked by ${record.requester}`}
            {record.priority && ` · ${record.priority} priority`}
            {record.target_date && ` · wanted by ${formatDay(record.target_date)}`}
          </span>
          {record.trace && <span className="offering-by" dir="auto">{traceLine(record.trace)}</span>}
          {record.reason && <span className="offering-by" dir="auto">Why: {record.reason}</span>}
        </>
      ),
    },
    {
      id: "applied",
      header: "Applied",
      width: "10rem",
      cell: (record) => (
        <>
          {record.applied_at ? formatDay(record.applied_at) : <span className="offering-quiet">Not recorded</span>}
          {record.product_id && <span className="offering-by"><span>to {offering(record.product_id)}</span></span>}
        </>
      ),
    },
    {
      id: "changed",
      header: "What it changed",
      cell: (record) => (
        <>
          {record.items.length ? (
            <ul className="offering-changes">
              {record.items.map((item, index) => {
                const status = ITEM_STATUS[item.status ?? "recorded"];
                const due = item.status === "gap" || item.status === "conflict";
                return (
                  <li key={`${item.kind}:${item.feature_id ?? index}`}>
                    {item.feature_id && <span className="offering-id">{item.feature_id}</span>} <span dir="auto">{item.summary}</span>
                    {status && (due ? <> <Status tone="attention">{status}</Status></> : <span className="offering-quiet"> ({status})</span>)}
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="offering-quiet">Nothing recorded</span>
          )}
          {record.gaps.map((text) => (
            <span key={text} className="offering-by"><Status tone="attention"><span dir="auto">Not mapped: {text}</span></Status></span>
          ))}
        </>
      ),
    },
  ];
  return (
    <Section title="Change history" count={counted(history.length)} headingLevel={level}>
      <p className="offering-lead">
        The change requests applied to this version: those from Requirement AI as their questions are accepted, and those the
        original explorer applied.
      </p>
      {history.length ? (
        <DataTable caption="Change requests applied to this version" captionHidden columns={columns} rows={history} rowId={(record) => record.id} />
      ) : (
        <p className="offering-quiet">No change request has been applied to this version.</p>
      )}
    </Section>
  );
}
