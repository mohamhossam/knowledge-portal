import type { ReactNode } from "react";

import type { KnowledgeSource, Offering, SourceConflict } from "../api/client";
import { CONFIDENCE } from "./catalogue";
import { byLevel, LEVEL, levelTag, questionOf, useSourceText } from "./governance";

type Sourced = { confidence?: string | null; source?: string | null };

/** "Inferred, not stated in its source · BPP SDD §11 · L2", or nothing when confirmed and unsourced. */
function Provenance({ item }: { item: Sourced }) {
  const sourceText = useSourceText();
  const confidence = item.confidence && item.confidence !== "confirmed" ? CONFIDENCE[item.confidence as keyof typeof CONFIDENCE] : null;
  const line = [confidence, sourceText(item.source)].filter(Boolean).join(" · ");
  return line ? <span className="secondary govtable__by" dir="auto">{line}</span> : null;
}

const sourceName = (source: KnowledgeSource) => source.short ?? source.title;

/** A level as a tag with its word: "L2 Primary". */
function Level({ level }: { level: KnowledgeSource["level"] }) {
  return (
    <span className="governance__level">
      <abbr title={LEVEL[level].long}>{level}</abbr> {LEVEL[level].word}
    </span>
  );
}

/**
 * The sources the catalogue's knowledge is read from (requirement-portal ADR-0101,
 * step 5), canonical first: each with its level, what it is the authority for, and
 * what it cannot tell. A source carried forward without being supplied is due.
 */
export function SourceRegister({ sources, headingId, action }: { sources: KnowledgeSource[]; headingId: string; action?: ReactNode }) {
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h2 id={headingId} className="govsection__title">
        Sources {sources.length > 0 && <span className="govsection__count">{sources.length}</span>}
      </h2>
      <p className="govsection__lead">
        Where the catalogue’s knowledge is read from: L1 the canonical landscape, L2 a primary source for its scope, L3 a baseline carried forward.
      </p>
      {action && <p className="govsection__actions">{action}</p>}
      {sources.length ? (
        <table className="govtable governance__table governance__sources" role="table">
          <caption className="visually-hidden">Sources, by level</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Source</th>
              <th scope="col" role="columnheader">Level</th>
              <th scope="col" role="columnheader">What it is the authority for</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {byLevel(sources).map((source) => (
              <tr key={source.id} role="row" className={source.supplied === false ? "row row--due" : "row"}>
                <th scope="row" role="rowheader" dir="auto">
                  {source.title}
                  <span className="secondary govtable__by" dir="auto">
                    {[source.short, source.version && `version ${source.version}`, source.file].filter(Boolean).join(" · ")}
                  </span>
                  {source.supplied === false && <span className="governance__due">Not supplied: carried forward unread</span>}
                </th>
                <td role="cell" data-head="Level"><Level level={source.level} /></td>
                <td role="cell" data-head="Authority for" dir="auto">
                  {source.authority ?? <span className="secondary">Not stated</span>}
                  {source.scope && <span className="secondary govtable__by" dir="auto">Covers {source.scope}</span>}
                  {source.boundary && <span className="secondary govtable__by" dir="auto">Cannot tell: {source.boundary}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No source is registered.</p>
      )}
    </section>
  );
}

/**
 * Conflicts between sources, never reconciled by the catalogue: each a due row
 * with both statements and where each is said, what differs, what it affects, and
 * the decision it needs. Used for the whole register and for one offering's.
 */
export function ConflictList({ conflicts, sources, headingId, title, lead, action, affects, raises, level = 2 }: {
  conflicts: SourceConflict[];
  sources: KnowledgeSource[];
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
  const Heading = level === 2 ? "h2" : "h3";
  const said = (side: SourceConflict["a"]) => {
    const source = sources.find((item) => item.id === side.source_id);
    return [source ? `${sourceName(source)} ${levelTag(source)}` : side.source_id, side.reference].filter(Boolean).join(" ");
  };
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <Heading id={headingId} className="govsection__title">
        {title} {conflicts.length > 0 && <span className="govsection__count">{conflicts.length}</span>}
      </Heading>
      {conflicts.length > 0 && <p className="govsection__lead">{lead}</p>}
      {action && <p className="govsection__actions">{action}</p>}
      {conflicts.length ? (
        <table className="govtable governance__table governance__conflicts" role="table">
          <caption className="visually-hidden">{title}</caption>
          <colgroup>
            <col className="governance__col-conflict" />
            <col className="governance__col-sides" />
            <col className="governance__col-decision" />
          </colgroup>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Conflict</th>
              <th scope="col" role="columnheader">What each source says</th>
              <th scope="col" role="columnheader">Decision needed</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {conflicts.map((conflict) => (
              <tr key={conflict.id} id={`conflict-${conflict.id}`} role="row" className="row row--due">
                <th scope="row" role="rowheader" dir="auto">
                  <span className="governance__id">{conflict.id}</span> {conflict.title}
                  {conflict.difference && <span className="secondary govtable__by" dir="auto">{conflict.difference}</span>}
                  {affects?.(conflict)}
                  {raises?.(conflict) && (
                    <span className="secondary govtable__by">
                      Raises the question <span className="governance__id">{raises(conflict)}</span>
                    </span>
                  )}
                </th>
                <td role="cell" data-head="What each source says">
                  <dl className="governance__sides">
                    {[conflict.a, conflict.b].map((side, index) => (
                      <div key={index}>
                        <dt dir="auto">{said(side)}</dt>
                        <dd dir="auto">{side.statement}</dd>
                      </div>
                    ))}
                  </dl>
                </td>
                <td role="cell" data-head="Decision needed" dir="auto">
                  <span className="governance__decision">{conflict.decision ?? "Not stated"}</span>
                  {conflict.impact && <span className="secondary govtable__by" dir="auto">Meanwhile: {conflict.impact}</span>}
                  <Provenance item={conflict} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No conflict between its sources is recorded.</p>
      )}
    </section>
  );
}

/** The questions an offering's sources leave open; one a conflict raises says which. */
export function OpenQuestions({ offering, conflicts, headingId, action, beside }: {
  offering: Offering;
  /** Every conflict that concerns the offering. */
  conflicts: SourceConflict[];
  headingId: string;
  action?: ReactNode;
  /**
   * The conflicts listed with the questions, which say the questions they raise; the
   * questions of the offering's other conflicts concern other order types and are left out.
   */
  beside?: SourceConflict[];
}) {
  const all = offering.questions ?? [];
  const raised = (id: string) => conflicts.filter((conflict) => questionOf(conflict, offering.id)?.toLocaleLowerCase() === id.toLocaleLowerCase());
  const shown = beside ? all.filter((question) => raised(question.id).length === 0) : all;
  const withConflicts = beside ? all.filter((question) => raised(question.id).some((conflict) => beside.includes(conflict))).length : 0;
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">
        Open questions {shown.length > 0 && <span className="govsection__count">{shown.length}</span>}
      </h3>
      {withConflicts > 0 && (
        <p className="govsection__lead">
          {withConflicts === 1 ? "1 more is raised" : `${withConflicts} more are raised`} by the decisions needed, and named with them.
        </p>
      )}
      {action && <p className="govsection__actions">{action}</p>}
      {shown.length ? (
        <ol className="governance__list">
          {shown.map((question) => {
            const conflicts = raised(question.id);
            return (
              <li key={question.id} id={`question-${question.id}`}>
                <span className="governance__id">{question.id}</span>
                <div>
                  <p dir="auto">{question.text}</p>
                  {question.impact && <span className="secondary govtable__by" dir="auto">Meanwhile: {question.impact}</span>}
                  {conflicts.length > 0 && (
                    <span className="secondary govtable__by">Raised by {conflicts.map((item) => `the conflict ${item.id}`).join(", ")}</span>
                  )}
                  <Provenance item={question} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="timetable__quiet">No open question is recorded.</p>
      )}
    </section>
  );
}

/** The architecture decisions taken for an offering. */
export function ArchitectureDecisions({ offering, headingId, action }: { offering: Offering; headingId: string; action?: ReactNode }) {
  const decisions = offering.decisions ?? [];
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">
        Architecture decisions {decisions.length > 0 && <span className="govsection__count">{decisions.length}</span>}
      </h3>
      {action && <p className="govsection__actions">{action}</p>}
      {decisions.length ? (
        <ul className="governance__list">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <span className="governance__id">{decision.id}</span>
              <div>
                <p className="governance__title" dir="auto">{decision.title}</p>
                {decision.text && <p dir="auto">{decision.text}</p>}
                <Provenance item={decision} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="timetable__quiet">No architecture decision is recorded.</p>
      )}
    </section>
  );
}

/** The sources an offering is read from, the primary one first, what they cover, and what it no longer uses. */
export function OfferingSourceList({ offering, sources, headingId, action }: {
  offering: Offering;
  sources: KnowledgeSource[];
  headingId: string;
  action?: ReactNode;
}) {
  const named = (offering.sources ?? []).map((id) => sources.find((item) => item.id === id)).filter((item): item is KnowledgeSource => !!item);
  const ordered = [...named].sort((a, b) => Number(b.id === offering.primary_source) - Number(a.id === offering.primary_source));
  const boundaries = offering.boundaries ?? [];
  const notUsed = offering.not_used ?? [];
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">Sources and boundaries</h3>
      {action && <p className="govsection__actions">{action}</p>}
      {ordered.length ? (
        <ul className="governance__list governance__list--sources">
          {ordered.map((source) => (
            <li key={source.id} className={source.supplied === false ? "governance__item--due" : undefined}>
              <Level level={source.level} />
              <div>
                <p dir="auto">
                  {source.title}
                  {source.id === offering.primary_source && <span className="governance__primary"> · its primary source</span>}
                </p>
                <span className="secondary govtable__by" dir="auto">
                  {[source.short, source.version && `version ${source.version}`].filter(Boolean).join(" · ")}
                </span>
                {source.supplied === false && <span className="governance__due">Not supplied: carried forward unread</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="timetable__quiet">No source is named for it.</p>
      )}
      {boundaries.length > 0 && (
        <>
          <h4 className="govsection__part">What its sources cover</h4>
          <ul className="sheet__list">
            {boundaries.map((item) => <li key={item} dir="auto">{item}</li>)}
          </ul>
        </>
      )}
      {notUsed.length > 0 && (
        <p className="secondary governance__not-used" dir="auto">No longer uses: {notUsed.join(", ")}</p>
      )}
    </section>
  );
}
