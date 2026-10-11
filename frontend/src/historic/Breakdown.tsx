import { ArrowUpRight } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import type { HistoricBreakdown, HistoricChange, HistoricSharedRoot, HistoricWorkItem, LineageNode } from "../api/client";
import { Button, type Column, DataTable, Status } from "../design/components";
import { count, formatMoment } from "../home/format";
import { FIELD_WORDS, PROBLEM_WORDS, STATUS_WORDS, TYPE_WORDS, historicHref, itemsOf } from "./historic";

type Row = { item: HistoricWorkItem; depth: number; number: string };

/** The lineage as numbered rows: 1 an Epic, 1.1 its Feature, 1.1.1 its Story. */
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
    <a href={url} target="_blank" rel="noreferrer" className="rk-ado">
      #{id}{" "}
      <span className="ds-visually-hidden">(opens Azure DevOps)</span>
      <ArrowUpRight size={12} aria-hidden="true" />
    </a>
  );
}

/** "Also the root of ‘Billing statements’, withdrawn": said, never refused (ADR-0102). */
export function SharedRootNote({ holders }: { holders: HistoricSharedRoot[] | undefined }) {
  if (!holders || holders.length === 0) return null;
  return (
    <span className="rk-detail">
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
  const columns: Column<Row>[] = [
    { id: "number", header: "No.", numeric: true, cell: (row) => row.number },
    {
      id: "item",
      header: "Work item",
      rowHeader: true,
      cell: ({ item, depth }) => (
        <span className={`rk-depth rk-depth--${Math.min(depth, 3)}`}>
          <span className="rk-type">{TYPE_WORDS[item.type] ?? item.type}</span>{" "}
          <AdoLink id={item.id} url={item.url} />{" "}
          <bdi>{item.title}</bdi>
          {depth === 0 && shared?.has(item.id) && <SharedRootNote holders={shared.get(item.id)} />}
          {(item.description || item.acceptance_criteria) && (
            <span className="rk-says">
              <Button
                variant="link"
                aria-expanded={open === item.id}
                aria-label={`${open === item.id ? "Hide" : "Show"} what #${item.id} says`}
                onClick={() => setOpen(open === item.id ? null : item.id)}
              >
                {open === item.id ? "Hide what it says" : "What it says"}
              </Button>
            </span>
          )}
          {open === item.id && (
            <dl className="rk-said-by">
              {item.description && <div><dt>Description</dt><dd dir="auto">{item.description}</dd></div>}
              {item.acceptance_criteria && <div><dt>Acceptance criteria</dt><dd dir="auto">{item.acceptance_criteria}</dd></div>}
              <div><dt>Revision</dt><dd>{item.revision}{item.tags.length > 0 ? ` · tagged ${item.tags.join(", ")}` : ""}</dd></div>
            </dl>
          )}
        </span>
      ),
    },
    { id: "state", header: "State", cell: ({ item }) => (past ? <span className="rk-quiet">{item.state}</span> : item.state) },
    { id: "iteration", header: "Iteration", bidi: true, cell: ({ item }) => item.iteration_path || "—" },
    { id: "area", header: "Area", bidi: true, cell: ({ item }) => item.area_path || "—" },
  ];
  return (
    <>
      <p className="rk-lead">
        <bdi>{brds.join(", ")}</bdi> was delivered as {count(breakdown.epics, "Epic")},{" "}
        {count(breakdown.features, "Feature")} and {count(breakdown.stories, "User Story", "User Stories")}, as read on{" "}
        {formatMoment(new Date(breakdown.fetched_at))}.
        {others && <> Beneath them, not imported: {others}.</>}
        {note && <> {note}</>}
      </p>
      {lines.length === 0 ? (
        <p className="rk-quiet">None of its top-level work items could be read.</p>
      ) : (
        <DataTable
          caption="Its Epics, Features and User Stories, as numbered rows"
          captionHidden
          columns={columns}
          rows={lines}
          rowId={(row) => String(row.item.id)}
        />
      )}
    </>
  );
}

/** Work items that could not be imported, and why. */
export function ItemErrors({ errors }: { errors: { work_item_id: number; problem: string; detail: string }[] }) {
  type Error = (typeof errors)[number];
  const columns: Column<Error>[] = [
    { id: "item", header: "Work item", rowHeader: true, cell: (error) => `#${error.work_item_id}` },
    {
      id: "why",
      header: "Why",
      cell: (error) => (
        <>
          <Status tone="attention">{PROBLEM_WORDS[error.problem] ?? error.problem}</Status>
          {error.detail && <span className="rk-detail">{error.detail}</span>}
        </>
      ),
    },
  ];
  return <DataTable caption="Work items that could not be read" captionHidden columns={columns} rows={errors} rowId={(error) => String(error.work_item_id)} />;
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
  if (was === null || now === null) return <li><span className="rk-field">{word}</span> changed</li>;
  return (
    <li>
      <span className="rk-field">{word}</span> <bdi>{was || "none"}</bdi>
      <span aria-hidden="true"> → </span>
      <span className="ds-visually-hidden">became</span>{" "}
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
  const columns: Column<HistoricChange>[] = [
    {
      id: "item",
      header: "Work item",
      rowHeader: true,
      cell: (change) => (
        <>
          <AdoLink id={change.work_item_id} url={(now.get(change.work_item_id) ?? was.get(change.work_item_id))?.url} />{" "}
          <bdi>{change.title}</bdi>
        </>
      ),
    },
    {
      id: "change",
      header: "Change",
      cell: (change) => {
        const later = now.get(change.work_item_id);
        return (
          <>
            <span className="rk-kind">{CHANGE_WORDS[change.kind] ?? change.kind}</span>
            {change.kind === "changed" && change.fields.length > 0 && (
              <ul className="rk-deltas">
                {change.fields.map((field) => <Delta key={field} field={field} before={was.get(change.work_item_id)} after={later} />)}
              </ul>
            )}
            {change.kind === "added" && later && <span className="rk-detail">{TYPE_WORDS[later.type] ?? later.type} · {later.state}</span>}
          </>
        );
      },
    },
  ];
  return (
    <DataTable
      caption="What changed in Azure DevOps since it was published"
      captionHidden
      columns={columns}
      rows={changes}
      rowId={(change) => `${change.kind}-${change.work_item_id}`}
    />
  );
}
