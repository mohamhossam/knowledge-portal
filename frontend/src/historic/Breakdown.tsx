import { ArrowUpRight } from "lucide-react";
import { Fragment, useState } from "react";

import type { HistoricBreakdown, HistoricChange, HistoricWorkItem, LineageNode } from "../api/client";
import { count, formatMoment } from "../home/format";
import { FIELD_WORDS, PROBLEM_WORDS, TYPE_WORDS } from "./historic";

type Row = { item: HistoricWorkItem; depth: number; number: string };

/** The lineage as a timetable's numbered rows: 1 an Epic, 1.1 its Feature, 1.1.1 its Story. */
function rows(nodes: LineageNode[], depth = 0, prefix = ""): Row[] {
  return nodes.flatMap((node, index) => {
    const number = `${prefix}${index + 1}`;
    return [{ item: node.item, depth, number }, ...rows(node.children, depth + 1, `${number}.`)];
  });
}

/** BRD → Epic → Feature → User Story: what the BRD was delivered as, read from Azure DevOps. */
export function BreakdownTable({ breakdown, brds }: { breakdown: HistoricBreakdown; brds: string[] }) {
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
      </p>
      {lines.length === 0 ? (
        <p className="timetable__quiet">None of its root work items could be read.</p>
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
            {lines.map(({ item, depth, number }) => (
              <Fragment key={item.id}>
                <tr className={`row historic__depth historic__depth--${Math.min(depth, 3)}${open === item.id ? " is-acting" : ""}`}>
                  <td className="cell--end historic__no">{number}</td>
                  <th scope="row">
                    <span className="historic__type">{TYPE_WORDS[item.type] ?? item.type}</span>{" "}
                    <a href={item.url} target="_blank" rel="noreferrer" className="historic__id">
                      #{item.id}
                      <span className="visually-hidden"> (opens Azure DevOps)</span>
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </a>{" "}
                    <span dir="auto">{item.title}</span>
                    {(item.description || item.acceptance_criteria) && (
                      <span className="secondary govtable__by">
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
                  <td>{item.state}</td>
                  <td className="cell--p2" dir="auto">{item.iteration_path || "—"}</td>
                  <td className="cell--p3" dir="auto">{item.area_path || "—"}</td>
                </tr>
                {open === item.id && (
                  <tr className="knowledge__act-row">
                    <td colSpan={5}>
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
            ))}
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

/** What a refresh would change, item by item. */
export function ChangeTable({ changes }: { changes: HistoricChange[] }) {
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
        {changes.map((change) => (
          <tr key={`${change.kind}-${change.work_item_id}`} className={`row${change.kind === "removed" ? " row--past" : ""}`}>
            <th scope="row">
              #{change.work_item_id} <span dir="auto">{change.title}</span>
            </th>
            <td>
              {CHANGE_WORDS[change.kind] ?? change.kind}
              {change.fields.length > 0 && (
                <span className="secondary govtable__by">{change.fields.map((field) => FIELD_WORDS[field] ?? field).join(", ")}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
