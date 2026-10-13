/**
 * A catalogue journey read three ways (the owner's order): a swimlane by
 * system, a flowchart along the flow, and a timeline by stage. Under every
 * view, the same steps as a table, so the whole journey reads without the
 * drawing. Loaded on its own (`lazy()`), so the diagrams cost a page nothing
 * until a journey is opened.
 */
import "./journey.css";

import { type ReactNode, useMemo, useState } from "react";

import type { Journey, JourneyActivity } from "../../api/client";
import { type Column, DataTable, EmptyState, Tabs } from "../../design/components";
import { orderedSteps } from "../catalogue";
import { Flowchart } from "./Flowchart";
import { flowEdges, nextWords, performer, performerWords } from "./layout";
import { MarkLines, type ViewProps } from "./parts";
import { Swimlane } from "./Swimlane";
import { Timeline } from "./Timeline";

export type JourneyView = "swimlane" | "flowchart" | "timeline";

export type JourneyViewsProps = {
  journey: Journey;
  /** A system's name. */
  systemName: (systemId: string) => string;
  /** How a system name renders: a link on catalogue pages, text in the explorer. */
  system: (systemId: string) => ReactNode;
  channelName?: (channelId: string) => string;
  /** When one channel is being read (explorer), who its entry system is. */
  entry?: { channel: string; systemId: string | null };
  /** Controlled view, so the page can keep it in the URL (?view=flowchart). */
  view?: JourneyView;
  onViewChange?: (view: JourneyView) => void;
};

const VIEWS: { id: JourneyView; label: string }[] = [
  { id: "swimlane", label: "Swimlane" },
  { id: "flowchart", label: "Flowchart" },
  { id: "timeline", label: "Stage timeline" },
];

export function JourneyViews({ view, onViewChange, ...props }: JourneyViewsProps) {
  const [own, setOwn] = useState<JourneyView>("swimlane");
  const current = view ?? own;
  const select = (next: JourneyView) => {
    if (view === undefined) setOwn(next);
    onViewChange?.(next);
  };
  const empty = props.journey.activities.length === 0;

  return (
    <div className="journey">
      <Tabs label={`Ways to read ${props.journey.name}`} tabs={VIEWS} selected={current} onSelect={select}>
        {empty ? (
          <EmptyState title="No step is recorded">This journey has no steps yet, so there is nothing to draw.</EmptyState>
        ) : current === "flowchart" ? (
          <Flowchart {...props} />
        ) : current === "timeline" ? (
          <Timeline {...props} />
        ) : (
          <Swimlane {...props} />
        )}
      </Tabs>
      {!empty && <StepsTable {...props} />}
    </div>
  );
}

export default JourneyViews;

type Row = { step: JourneyActivity; next: string[] };

/** The journey as text: every step with its phase, who performs it, with what, and where it goes next. */
function StepsTable({ journey, system, systemName, channelName, entry }: ViewProps) {
  const rows = useMemo<Row[]>(() => {
    const edges = flowEdges(journey);
    return orderedSteps(journey).map((step) => ({ step, next: nextWords(edges, step.number) }));
  }, [journey]);

  const columns: Column<Row>[] = [
    { id: "number", header: "No.", numeric: true, cell: (row) => row.step.number },
    {
      id: "step",
      header: "Step",
      rowHeader: true,
      bidi: true,
      cell: (row) => (
        <>
          {row.step.name}
          <MarkLines step={row.step} channelName={channelName} />
        </>
      ),
    },
    { id: "phase", header: "Phase", bidi: true, cell: (row) => row.step.phase ?? <span className="journey-quiet">None named</span> },
    {
      id: "by",
      header: "Performed by",
      bidi: true,
      cell: (row) => {
        const who = performer(row.step, entry);
        if (!who.systemId) return <span className="journey-quiet">{performerWords(who, systemName, entry)}</span>;
        return (
          <>
            {system(who.systemId)}
            {who.kind === "entry" && entry && <span className="journey-line">The entry system of <bdi>{entry.channel}</bdi></span>}
          </>
        );
      },
    },
    {
      id: "with",
      header: "With",
      bidi: true,
      cell: (row) =>
        row.step.supporting_system_ids.length ? (
          row.step.supporting_system_ids.map((systemId, index) => (
            <span key={systemId}>{index > 0 && ", "}{system(systemId)}</span>
          ))
        ) : (
          <span className="journey-quiet">None</span>
        ),
    },
    { id: "next", header: "Next", bidi: true, cell: (row) => (row.next.length ? row.next.join("; ") : <span className="journey-quiet">The journey ends</span>) },
  ];

  return (
    <details className="journey-table">
      <summary className="journey-table__summary">Steps as a table ({rows.length.toLocaleString("en")})</summary>
      <DataTable caption={`Steps of ${journey.name}, in order`} captionHidden columns={columns} rows={rows} rowId={(row) => row.step.number} />
    </details>
  );
}
