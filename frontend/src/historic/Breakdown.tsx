import { ArrowUpRight } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import type { HistoricBreakdown, HistoricChange, HistoricSharedRoot, HistoricWorkItem, LineageNode } from "../api/client";
import { count, formatMoment } from "../home/format";
import { FIELD_WORDS, PROBLEM_WORDS, STATUS_WORDS, TYPE_WORDS, historicHref, itemsOf } from "./historic";

type Row = { item: HistoricWorkItem; depth: number; number: string };

/** The lineage as a timetable's numbered rows: 1 an Epic, 1.1 its Feature, 1.1.1 its Story. */
function rows(nodes: LineageNode[], depth = 0, prefix = ""): Row[] {
  return nodes.flatMap((node, index) => {
    const number = `${prefix}${index + 1}`;
    return [{ item: node.item, depth, number }, ...rows(node.children, depth + 1, `${number}.`)];
  });
}

/** A work item's id, linked to it in Azure DevOps. */
export function AdoLink({ id, url }: { id: number; url?: string | null }) {
  if (!url) return <>#{id}</>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="historic__id">
      #{id}
      <span className="visually-hidden"> (opens Azure DevOps)</span>
      <ArrowUpRight size={12} aria-hidden="true" />
    </a>
  );
}

/** "Also the root of ‘Billing statements’, withdrawn": said, never refused (ADR-0102). */
export function SharedRootNote({ holders }: { holders: HistoricSharedRoot[] | undefined }) {
  if (!holders || holders.length === 0) return null;
  return (
    <span className="historic__shared">
      Also the root of{" "}
      {holders.map((holder, index) => (
        <Fragment key={holder.historic_id}>
          {index > 0 && (index === holders.length - 1 ? " and " : ", ")}
          <Link to={historicHref(holder.historic_id)} dir="auto">‘{holder.title}’</Link>, {STATUS_WORDS[holder.status]}
        </Fragment>
      ))}
    </span>
  );
}

/** BRD → Epic → Feature → User Story: what the BRD was delivered as, read from Azure DevOps. */
export function BreakdownTable({ breakdown, brds, shared, past = false, note }: {
  breakdown: HistoricBreakdown;
  brds: string[];
  shared?: Map<number, HistoricSharedRoot[]>;
  /** A withdrawn record's lineage, set as past. */
  past?: boolean;
  /** Said after the lead, e.g. that this is the published read while a newer one waits. */
  note?: ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const lines = rows(breakdown.lineage);
  const others = breakdown.not_imported.map((item) => count(item.count, item.type)).join(", ");
  return (
    <>
      <p className="govsection__lead">
        <span dir="auto">{brds.join(", ")}</span> was delivered as {count(breakdown.epics, "Epic")},{" "}
        {count(breakdown.features, "Feature")} and {count(breakdown.stories, "User Story", "User Stories")}, as read on{" "}
        {formatMoment(new Date(breakdown.fetched_at))}.
        {others && <span className="secondary"> Beneath them, not imported: {others}.</span>}
        {note && <> {note}</>}
      </p>
      {lines.length === 0 ? (
        <p className="timetable__quiet">None of its top-level work items could be read.</p>
      ) : (
        <table className="govtable historic__lineage">
          <caption className="visually-hidden">Its Epics, Features and User Stories, as numbered rows</caption>
          <thead>
            <tr>
              <th scope="col" className="cell--end historic__no">No.</th>
              <th scope="col">Work item</th>
              <th scope="col">State</th>
              <th scope="col" className="cell--p2">Iteration</th>
              <th scope="col" className="cell--p3">Area</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ item, depth, number }) => {
              const level = `historic__depth historic__depth--${Math.min(depth, 3)}`;
              return (
                <Fragment key={item.id}>
                  <tr className={`row ${level}${past ? " row--past" : ""}${open === item.id ? " is-acting" : ""}`}>
                    <td className="cell--end historic__no">{number}</td>
                    <th scope="row">
                      <span className="historic__type">{TYPE_WORDS[item.type] ?? item.type}</span>{" "}
                      <AdoLink id={item.id} url={item.url} />{" "}
                      <span dir="auto">{item.title}</span>
                      {depth === 0 && shared?.has(item.id) && (
                        <span className="secondary govtable__by"><SharedRootNote holders={shared.get(item.id)} /></span>
                      )}
                      {(item.description || item.acceptance_criteria) && (
                        <span className="secondary govtable__by historic__says">
                          <button
                            type="button"
                            className="text-button knowledge__act"
                            aria-expanded={open === item.id}
                            aria-label={`${open === item.id ? "Hide" : "Show"} what #${item.id} says`}
                            onClick={() => setOpen(open === item.id ? null : item.id)}
                          >
                            {open === item.id ? "Hide what it says" : "What it says"}
                          </button>
                        </span>
                      )}
                    </th>
                    <td className="historic__state">{item.state}</td>
                    <td className="cell--p2" dir="auto">{item.iteration_path || "—"}</td>
                    <td className="cell--p3" dir="auto">{item.area_path || "—"}</td>
                  </tr>
                  {open === item.id && (
                    <tr className={`knowledge__act-row ${level}`}>
                      <td className="historic__no" />
                      {/* Set at the item's own indent, under its title. */}
                      <td colSpan={4} className="historic__said-cell">
                        <dl className="historic__said">
                          {item.description && (
                            <div><dt>Description</dt><dd dir="auto">{item.description}</dd></div>
                          )}
                          {item.acceptance_criteria && (
                            <div><dt>Acceptance criteria</dt><dd dir="auto">{item.acceptance_criteria}</dd></div>
                          )}
                          <div>
                            <dt>Revision</dt>
                            <dd>{item.revision}{item.tags.length > 0 ? ` · tagged ${item.tags.join(", ")}` : ""}</dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Work items that could not be imported, and why. */
export function ItemErrors({ errors }: { errors: { work_item_id: number; problem: string; detail: string }[] }) {
  return (
    <table className="govtable historic__errors">
      <caption className="visually-hidden">Work items that could not be read</caption>
      <thead>
        <tr>
          <th scope="col">Work item</th>
          <th scope="col">Why</th>
        </tr>
      </thead>
      <tbody>
        {errors.map((error) => (
          <tr key={error.work_item_id} className="row row--delayed">
            <th scope="row">#{error.work_item_id}</th>
            <td>
              <span className="status">{PROBLEM_WORDS[error.problem] ?? error.problem}</span>
              {error.detail && <span className="secondary govtable__by">{error.detail}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CHANGE_WORDS: Record<string, string> = { added: "Added", removed: "Removed", changed: "Changed" };

/** Fields short enough to set as before → after; longer ones are only named. */
function valueOf(item: HistoricWorkItem, field: string): string | null {
  switch (field) {
    case "title": return item.title;
    case "state": return item.state;
    case "area_path": return item.area_path;
    case "iteration_path": return item.iteration_path;
    case "type": return TYPE_WORDS[item.type] ?? item.type;
    case "parent_id": return item.parent_id ? `#${item.parent_id}` : "";
    case "tags": return item.tags.join(", ");
    default: return null;
  }
}

function Delta({ field, before, after }: { field: string; before?: HistoricWorkItem; after?: HistoricWorkItem }) {
  const word = FIELD_WORDS[field] ?? field;
  const was = before ? valueOf(before, field) : null;
  const now = after ? valueOf(after, field) : null;
  if (was === null || now === null) return <li><span className="historic__field">{word}</span> changed</li>;
  return (
    <li>
      <span className="historic__field">{word}</span> <span dir="auto">{was || "none"}</span>
      <span aria-hidden="true"> → </span>
      <span className="visually-hidden"> became </span>
      <strong dir="auto">{now || "none"}</strong>
    </li>
  );
}

/** What a refresh would change, item by item, from the published read to the newer one. */
export function ChangeTable({ changes, before, after }: {
  changes: HistoricChange[];
  before?: HistoricBreakdown | null;
  after?: HistoricBreakdown | null;
}) {
  const was = itemsOf(before);
  const now = itemsOf(after);
  return (
    <table className="govtable historic__changes">
      <caption className="visually-hidden">What changed in Azure DevOps since it was published</caption>
      <thead>
        <tr>
          <th scope="col">Work item</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => {
          const after = now.get(change.work_item_id);
          return (
            <tr key={`${change.kind}-${change.work_item_id}`} className={`row${change.kind === "removed" ? " row--past" : ""}`}>
              <th scope="row">
                <AdoLink id={change.work_item_id} url={(after ?? was.get(change.work_item_id))?.url} />{" "}
                <span dir="auto">{change.title}</span>
              </th>
              <td>
                <span className="historic__kind">{CHANGE_WORDS[change.kind] ?? change.kind}</span>
                {change.kind === "changed" && change.fields.length > 0 && (
                  <ul className="historic__deltas">
                    {change.fields.map((field) => (
                      <Delta key={field} field={field} before={was.get(change.work_item_id)} after={after} />
                    ))}
                  </ul>
                )}
                {change.kind === "added" && after && (
                  <span className="secondary govtable__by">{TYPE_WORDS[after.type] ?? after.type} · {after.state}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
