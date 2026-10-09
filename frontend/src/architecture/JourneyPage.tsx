import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button, type Column, DataTable, EmptyState, Facts, Section, Tabs, Toolbar } from "../design/components";
import { laneName } from "./data/landscape";
import { JOURNEYS, TRACKING, journeyById } from "./data/journeys";
import { channelById, offeringById, orderTypeByCode } from "./data/portfolio";
import { FlowDiagram, SequenceDiagram } from "./diagrams";
import { download, toBpmn, toCsv, toMermaid, toPlantUml } from "./exports";
import type { Integration, Journey, Point, Step } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, RecordDrawer, SystemLink } from "./parts";
import { scopeQuery, useImpliedScope, useScope } from "./scope";

type Tab = "flow" | "integrations" | "tracking" | "steps";

const TABS: { id: Tab; label: string }[] = [
  { id: "flow", label: "Flow (BPMN)" },
  { id: "integrations", label: "Integrations" },
  { id: "tracking", label: "Order tracking" },
  { id: "steps", label: "Steps" },
];

const fileName = (journey: Journey, ext: string) => `${journey.id}.${ext}`;

function Lane({ journey, lane }: { journey: Journey; lane: string }) {
  const label = journey.laneLabels?.[lane];
  return label ? <span>{label}</span> : <SystemLink id={lane} label={laneName(lane)} />;
}

function integrationColumns(): Column<Integration & { n: number }>[] {
  return [
    { id: "n", header: "#", numeric: true, cell: (row) => row.n, width: "3rem" },
    { id: "call", header: "Call", rowHeader: true, cell: (row) => (
      <>
        <span className="arch-strong">{row.operation}</span>
        <span className="arch-detail">{row.purpose}</span>
      </>
    ) },
    { id: "route", header: "From → to", cell: (row) => (
      <>
        <SystemLink id={row.from} /> → <SystemLink id={row.to} />
        {row.via && <span className="arch-detail">via <SystemLink id={row.via} /></span>}
      </>
    ) },
    { id: "style", header: "Style · timing", cell: (row) => (
      <>
        {row.style}
        <span className="arch-detail">{row.mode === "not stated" ? "Timing not stated" : row.mode === "sync" ? "Synchronous" : "Asynchronous"}</span>
      </>
    ) },
    { id: "tmf", header: "TMF equivalent", cell: (row) => (row.tmf ? <>{row.tmf}<span className="arch-detail">Hypothesis</span></> : <span className="arch-quiet">—</span>) },
    { id: "evidence", header: "Evidence", cell: (row) => <EvidenceMark evidence={row.evidence} /> },
  ];
}

function StepPanel({ journey, step }: { journey: Journey; step: Step }) {
  const calls = journey.integrations.filter((integration) => integration.step === step.id);
  return (
    <div className="arch-record">
      {step.detail && <p>{step.detail}</p>}
      <Facts
        items={[
          ["Performed by", <Lane key="l" journey={journey} lane={step.lane} />],
          ["eTOM process", step.etom ?? "—"],
          ...(step.ponr ? ([["Point of no return", step.ponr]] as [string, string][]) : []),
          ["Evidence", <EvidenceMark key="e" evidence={step.evidence} />],
        ]}
      />
      {calls.length > 0 && (
        <Section title="Integrations in this step" count={calls.length} headingLevel={3}>
          <ul className="arch-list">
            {calls.map((call) => (
              <li key={call.id}>
                <span className="arch-strong">{call.operation}</span>: <SystemLink id={call.from} /> → <SystemLink id={call.to} />
                {call.via && <> via <SystemLink id={call.via} /></>}
                <span className="arch-detail">{call.style} · {call.mode}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function CallPanel({ call }: { call: Integration }) {
  const facts: [string, ReactNode][] = [
    ["From", <SystemLink key="f" id={call.from} />],
    ["To", <SystemLink key="t" id={call.to} />],
  ];
  if (call.via) facts.push(["Via", <SystemLink key="v" id={call.via} />]);
  facts.push(["Style", call.style]);
  facts.push(["Timing", call.mode === "not stated" ? "Not stated" : call.mode === "sync" ? "Synchronous" : "Asynchronous"]);
  if (call.payload) facts.push(["Payload", <code key="p">{call.payload}</code>]);
  facts.push(["TMF equivalent", call.tmf ? `${call.tmf} (hypothesis)` : "—"]);
  facts.push(["Evidence", <EvidenceMark key="e" evidence={call.evidence} />]);
  return (
    <div className="arch-record">
      <p>{call.purpose}</p>
      <Facts items={facts} />
    </div>
  );
}

function Notes({ title, points }: { title: string; points: Point[] }) {
  if (!points.length) return null;
  return (
    <Section title={title} count={points.length}>
      <ul className="arch-points">
        {points.map((point) => (
          <li key={point.title}>
            <span className="arch-strong">{point.title}.</span> {point.detail} <EvidenceMark evidence={point.evidence} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function TrackingView({ journey }: { journey: Journey }) {
  const flow = TRACKING.find((item) => item.id === journey.trackingId);
  if (!flow) return <EmptyState title="No tracking flow for this journey">Neither source describes how this order is tracked.</EmptyState>;
  const rows = flow.messages.map((message, index) => ({ ...message, n: index + 1 }));
  return (
    <div className="arch-stack">
      <p>{flow.summary}</p>
      <Toolbar label="Export the tracking flow">
        <Button icon={<Download size={16} />} onClick={() => download(`${flow.id}.puml`, toPlantUml(flow.name, flow.messages), "text/plain;charset=utf-8")}>PlantUML</Button>
        <Button icon={<Download size={16} />} onClick={() => download(`${flow.id}.mmd`, toMermaid(flow.name, flow.messages), "text/plain;charset=utf-8")}>Mermaid</Button>
        <Button icon={<Download size={16} />} onClick={() => download(`${flow.id}.csv`, toCsv(flow.messages), "text/csv;charset=utf-8")}>Register (CSV)</Button>
      </Toolbar>
      <div className="arch-canvas" role="region" aria-label="Order tracking sequence diagram (scrolls sideways)" tabIndex={0}>
        <SequenceDiagram name={flow.name} messages={flow.messages} />
      </div>
      <DataTable caption="Order tracking calls, in order" columns={integrationColumns()} rows={rows} rowId={(row) => row.id} />
      <Section title="Milestones" count={flow.milestones.length}>
        <ul className="arch-points">
          {flow.milestones.map((milestone) => (
            <li key={milestone.name}>
              <span className="arch-strong">{milestone.name}</span>, from <SystemLink id={milestone.producer} />. {milestone.detail} <EvidenceMark evidence={milestone.evidence} />
            </li>
          ))}
        </ul>
      </Section>
      <Notes title="How orders are matched" points={flow.correlation} />
      <Notes title="Known issues" points={flow.knownIssues} />
    </div>
  );
}

/**
 * One journey: a product's order type through its channels, as a BPMN flow
 * (one lane per system), the integrations in order, the order-tracking flow
 * and the steps as a table, each exportable for other tools.
 */
export function JourneyPage() {
  const { journeyId } = useParams();
  const journey = journeyById(journeyId);
  const [scope] = useScope();
  useImpliedScope({ product: journey?.offeringId, order: journey?.orderType });
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "flow") as Tab;
  const stepId = params.get("step");
  const callId = params.get("call");
  const setParam = (key: string, value: string | null, also: Record<string, string | null> = {}) =>
    setParams((previous) => {
      const merged = new URLSearchParams(previous);
      for (const [name, next] of Object.entries({ [key]: value, ...also })) {
        if (next) merged.set(name, next);
        else merged.delete(name);
      }
      return merged;
    }, { replace: true });

  if (!journey) {
    return (
      <ArchitectureFrame title="Journey not found">
        <EmptyState title="There is no journey at this address" action={<Link to={`${BASE}/journeys${scopeQuery(scope)}`}>See every journey</Link>}>
          It may have been renamed. The journeys list shows every journey modelled so far.
        </EmptyState>
      </ArchitectureFrame>
    );
  }

  const offering = offeringById(journey.offeringId);
  const step = journey.steps.find((item) => item.id === stepId) ?? null;
  const call = journey.integrations.find((item) => item.id === callId) ?? null;
  const rows = journey.integrations.map((integration, index) => ({ ...integration, n: index + 1 }));
  const etoms = [...new Set(journey.steps.map((item) => item.etom).filter(Boolean))];
  const stepRows = journey.steps.filter((item) => item.kind !== "start");
  const stepColumns: Column<Step>[] = [
    { id: "name", header: "Step", rowHeader: true, cell: (item) => (
      <button type="button" className="arch-cell-button" onClick={() => setParam("step", item.id, { tab: null })}>
        {item.name}
      </button>
    ) },
    { id: "lane", header: "Performed by", cell: (item) => <Lane journey={journey} lane={item.lane} /> },
    { id: "etom", header: "eTOM process", cell: (item) => item.etom ?? "—" },
    { id: "next", header: "Then", cell: (item) => item.next.map((next) => `${next.label ? `${next.label}: ` : ""}${journey.steps.find((target) => target.id === next.to)?.name ?? next.to}`).join("; ") || "—" },
    { id: "evidence", header: "Evidence", cell: (item) => <EvidenceMark evidence={item.evidence} /> },
  ];

  return (
    <ArchitectureFrame
      title={journey.name}
      documentTitle={`${journey.name} · ${offering?.name ?? "Journey"} · Catalogue`}
      lead={journey.summary}
      actions={
        <Toolbar label="Export this journey">
          <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "bpmn"), toBpmn(journey), "application/xml")}>BPMN 2.0</Button>
          <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "puml"), toPlantUml(journey.name, journey.integrations), "text/plain;charset=utf-8")}>PlantUML</Button>
          <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "mmd"), toMermaid(journey.name, journey.integrations), "text/plain;charset=utf-8")}>Mermaid</Button>
          <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "csv"), toCsv(journey.integrations), "text/csv;charset=utf-8")}>Register (CSV)</Button>
        </Toolbar>
      }
    >
      <Facts
        items={[
          ["Product", offering ? <Link key="o" to={`${BASE}/offerings/${offering.id}${scopeQuery(scope)}`}>{offering.name}</Link> : "—"],
          ["Order type", `${orderTypeByCode(journey.orderType)?.name ?? journey.orderType} (${journey.orderType})`],
          ["Channels", journey.channels.map((id) => channelById(id)?.name ?? id).join(", ")],
          ["Size", `${journey.steps.filter((item) => item.kind === "task").length} steps · ${new Set(journey.steps.map((item) => item.lane)).size} lanes · ${journey.integrations.length} integrations`],
          ["eTOM processes", etoms.join("; ")],
        ]}
      />
      <Tabs<Tab> label="Journey views" tabs={TABS} selected={tab} onSelect={(next) => setParam("tab", next === "flow" ? null : next)}>
        {tab === "flow" && (
          <div className="arch-stack">
            <p className="arch-quiet">Select a step to see what it does, its eTOM process, its integrations and its source. The Steps tab holds the same flow as a table.</p>
            <div className="arch-canvas" role="region" aria-label="BPMN flow (scrolls both ways)" tabIndex={0}>
              <FlowDiagram journey={journey} selectedId={stepId} onSelect={(id) => setParam("step", id === stepId ? null : id)} />
            </div>
            {step && (
              <RecordDrawer title={step.name} openKey={step.id} onClose={() => setParam("step", null)}>
                <StepPanel journey={journey} step={step} />
              </RecordDrawer>
            )}
          </div>
        )}
        {tab === "integrations" && (
          <div className="arch-stack">
            <p>Who calls whom, in order, for what, and how. Solid arrows: synchronous or not stated; open heads: asynchronous; dashed: callbacks.</p>
            <div className="arch-canvas" role="region" aria-label="Integration sequence diagram (scrolls sideways)" tabIndex={0}>
              <SequenceDiagram name={journey.name} messages={journey.integrations} selectedId={callId} onSelect={(id) => setParam("call", id === callId ? null : id)} />
            </div>
            <DataTable caption={`Integration register: ${rows.length} calls`} columns={integrationColumns()} rows={rows} rowId={(row) => row.id} currentId={callId ?? undefined} />
            {call && (
              <RecordDrawer title={call.operation} openKey={call.id} onClose={() => setParam("call", null)}>
                <CallPanel call={call} />
              </RecordDrawer>
            )}
          </div>
        )}
        {tab === "tracking" && <TrackingView journey={journey} />}
        {tab === "steps" && <DataTable caption={`Steps: ${stepRows.length}`} columns={stepColumns} rows={stepRows} rowId={(item) => item.id} />}
      </Tabs>
      <Notes title="Notes" points={journey.notes} />
    </ArchitectureFrame>
  );
}

/** Every journey modelled, and the order types each product supports but hasn't modelled yet. */
export function JourneysPage() {
  const [scope] = useScope();
  const query = scopeQuery(scope);
  const rows = JOURNEYS.filter(
    (journey) => (!scope.product || journey.offeringId === scope.product) && (!scope.order || journey.orderType === scope.order) && (!scope.channel || journey.channels.includes(scope.channel)),
  );
  const columns: Column<Journey>[] = [
    { id: "name", header: "Journey", rowHeader: true, cell: (journey) => <Link to={`${BASE}/journeys/${journey.id}${query}`}>{journey.name}</Link> },
    { id: "product", header: "Product", cell: (journey) => offeringById(journey.offeringId)?.name },
    { id: "order", header: "Order type", cell: (journey) => `${orderTypeByCode(journey.orderType)?.name} (${journey.orderType})` },
    { id: "channels", header: "Channels", cell: (journey) => journey.channels.map((id) => channelById(id)?.name ?? id).join(", ") },
    { id: "steps", header: "Steps", numeric: true, cell: (journey) => journey.steps.filter((step) => step.kind === "task").length },
    { id: "calls", header: "Integrations", numeric: true, cell: (journey) => journey.integrations.length },
    { id: "lanes", header: "Systems", numeric: true, cell: (journey) => new Set(journey.steps.map((step) => step.lane)).size },
  ];
  return (
    <ArchitectureFrame title="Journeys" lead="Each journey is one product's order type through one or more channels: its flow, its integrations and how the order is tracked.">
      <DataTable caption={`Journeys modelled: ${rows.length}`} columns={columns} rows={rows} rowId={(journey) => journey.id} emptyText="No journey is modelled for this product, order type and channel yet." />
      <p className="arch-quiet">Order types a product supports without a modelled journey are listed on the product's Journeys tab.</p>
    </ArchitectureFrame>
  );
}
