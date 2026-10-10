import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button, type Column, DataTable, EmptyState, Facts, Section, Tabs, Toolbar } from "../design/components";
import { type CatalogueData, journeyView, journeyViews, laneName } from "./adapter";
import { FlowDiagram, SequenceDiagram } from "./diagrams";
import { download, toBpmn, toCsv, toMermaid, toPlantUml } from "./exports";
import type { Integration, JourneyView, Point, Step } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, RecordDrawer, SystemLink } from "./parts";
import { useImpliedScope, useScope, withScope } from "./scope";

type Tab = "flow" | "integrations" | "tracking" | "steps";

const TABS: { id: Tab; label: string }[] = [
  { id: "flow", label: "Flow (BPMN)" },
  { id: "integrations", label: "Integrations" },
  { id: "tracking", label: "Order tracking" },
  { id: "steps", label: "Steps" },
];

const fileName = (journey: JourneyView, ext: string) => `${journey.id}${journey.channel ? `-${journey.channel}` : ""}.${ext}`;

function Lane({ data, journey, lane }: { data: CatalogueData; journey: JourneyView; lane: string }) {
  const label = journey.laneLabels[lane];
  return label ? <span>{label}</span> : <SystemLink id={lane} label={laneName(data, lane)} />;
}

function integrationColumns(): Column<Integration & { n: number }>[] {
  return [
    { id: "n", header: "#", numeric: true, cell: (row) => row.n, width: "3rem" },
    { id: "call", header: "Call", rowHeader: true, cell: (row) => (
      <>
        <span className="arch-strong">{row.operation}</span>
        {row.purpose && <span className="arch-detail">{row.purpose}</span>}
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

function StepPanel({ data, journey, step }: { data: CatalogueData; journey: JourneyView; step: Step }) {
  const calls = journey.integrations.filter((integration) => integration.step === step.id);
  return (
    <div className="arch-record">
      {step.detail && <p>{step.detail}</p>}
      <Facts
        items={[
          ["Performed by", <Lane key="l" data={data} journey={journey} lane={step.lane} />],
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
  if (call.payload) facts.push(["Payload", <code key="p" translate="no">{call.payload}</code>]);
  facts.push(["TMF equivalent", call.tmf ? `${call.tmf} (hypothesis)` : "—"]);
  facts.push(["Evidence", <EvidenceMark key="e" evidence={call.evidence} />]);
  return (
    <div className="arch-record">
      {call.purpose && <p>{call.purpose}</p>}
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

/** How an offering's orders are tracked: its tracking journey as a sequence, and the facts around it. */
function TrackingView({ data, journey }: { data: CatalogueData; journey: JourneyView }) {
  const offering = data.offerings.find((item) => item.id === journey.offeringId);
  const flow = data.journeys.find((item) => item.offeringId === journey.offeringId && !item.orderType);
  const view = flow ? journeyView(data, flow.id, journey.channel) : null;
  const facts = offering?.tracking;
  if (!view && !facts) return <EmptyState title="No tracking flow for this product">Its sources don't describe how its orders are tracked.</EmptyState>;
  const rows = (view?.integrations ?? []).map((message, index) => ({ ...message, n: index + 1 }));
  return (
    <div className="arch-stack">
      {(facts?.summary || view?.summary) && <p>{facts?.summary || view?.summary}</p>}
      {view && (
        <>
          <Toolbar label="Export the tracking flow">
            <Button icon={<Download size={16} />} onClick={() => download(fileName(view, "puml"), toPlantUml(data, view.name, view.integrations), "text/plain;charset=utf-8")}>PlantUML</Button>
            <Button icon={<Download size={16} />} onClick={() => download(fileName(view, "mmd"), toMermaid(data, view.name, view.integrations), "text/plain;charset=utf-8")}>Mermaid</Button>
            <Button icon={<Download size={16} />} onClick={() => download(fileName(view, "csv"), toCsv(data, view.integrations), "text/csv;charset=utf-8")}>Register (CSV)</Button>
          </Toolbar>
          <div className="arch-canvas" role="region" aria-label="Order tracking sequence diagram (scrolls sideways)" tabIndex={0}>
            <SequenceDiagram data={data} name={view.name} messages={view.integrations} />
          </div>
          <DataTable caption="Order tracking calls, in order" columns={integrationColumns()} rows={rows} rowId={(row) => row.id} />
        </>
      )}
      {facts && (
        <>
          <Section title="Milestones" count={facts.milestones.length}>
            <ul className="arch-points">
              {facts.milestones.map((milestone) => (
                <li key={milestone.name}>
                  <span className="arch-strong">{milestone.name}</span>
                  {milestone.producer && <>, from <SystemLink id={milestone.producer} /></>}. {milestone.detail} <EvidenceMark evidence={milestone.evidence} />
                </li>
              ))}
            </ul>
          </Section>
          <Notes title="How orders are matched" points={facts.correlation} />
          <Notes title="Known issues" points={facts.knownIssues} />
        </>
      )}
    </div>
  );
}

function Journey({ data, journey }: { data: CatalogueData; journey: JourneyView }) {
  const [scope] = useScope(data);
  useImpliedScope({ product: journey.offeringId ?? undefined, order: journey.orderType ?? undefined });
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
  const offering = data.offerings.find((item) => item.id === journey.offeringId);
  const step = journey.steps.find((item) => item.id === stepId && item.kind === "task") ?? null;
  const call = journey.integrations.find((item) => item.id === callId) ?? null;
  const rows = journey.integrations.map((integration, index) => ({ ...integration, n: index + 1 }));
  const tasks = journey.steps.filter((item) => item.kind === "task" || item.kind === "error-end");
  const etoms = [...new Set(tasks.map((item) => item.etom).filter(Boolean))];
  const stepColumns: Column<Step>[] = [
    { id: "name", header: "Step", rowHeader: true, cell: (item) => (
      <button type="button" className="arch-cell-button" onClick={() => setParam("step", item.id, { tab: null })}>
        {item.name}
      </button>
    ) },
    { id: "lane", header: "Performed by", cell: (item) => <Lane data={data} journey={journey} lane={item.lane} /> },
    { id: "etom", header: "eTOM process", cell: (item) => item.etom ?? "—" },
    { id: "next", header: "Then", cell: (item) => item.next.map((next) => {
      const target = journey.steps.find((other) => other.id === next.to);
      const name = target?.kind === "exclusive" || target?.kind === "parallel" ? target.name : target?.kind === "end" ? "End" : target?.name ?? next.to;
      return `${next.label ? `${next.label}: ` : ""}${name}`;
    }).join("; ") || "—" },
    { id: "evidence", header: "Evidence", cell: (item) => <EvidenceMark evidence={item.evidence} /> },
  ];
  const def = data.journeys.find((item) => item.id === journey.id);

  return (
    <>
      <Facts
        items={[
          ["Product", offering ? <Link key="o" to={withScope(`${BASE}/offerings/${offering.id}`, scope)}>{offering.name}</Link> : "—"],
          ["Order type", journey.orderType ? `${data.orderTypes.find((type) => type.code === journey.orderType)?.name ?? journey.orderType} (${journey.orderType})` : "Every order type"],
          ["Size", `${tasks.length} steps · ${new Set(tasks.map((item) => item.lane)).size} lanes · ${journey.integrations.length} integrations`],
          ["eTOM processes", etoms.join("; ") || "—"],
        ]}
      />
      {def && def.channels.length > 1 && (
        <div className="ds-filters" role="group" aria-label="Seen through the channel">
          {def.channels.map((channel) => (
            <button key={channel} type="button" className="ds-filters__button" aria-pressed={journey.channel === channel} onClick={() => setParam("channel", channel, { step: null, call: null })}>
              {data.channels.find((item) => item.id === channel)?.name ?? channel}
            </button>
          ))}
        </div>
      )}
      <Toolbar label="Export this journey">
        <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "bpmn"), toBpmn(data, journey), "application/xml")}>BPMN 2.0</Button>
        <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "puml"), toPlantUml(data, journey.name, journey.integrations), "text/plain;charset=utf-8")}>PlantUML</Button>
        <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "mmd"), toMermaid(data, journey.name, journey.integrations), "text/plain;charset=utf-8")}>Mermaid</Button>
        <Button icon={<Download size={16} />} onClick={() => download(fileName(journey, "csv"), toCsv(data, journey.integrations), "text/csv;charset=utf-8")}>Register (CSV)</Button>
      </Toolbar>
      <Tabs<Tab> label="Journey views" tabs={TABS} selected={tab} onSelect={(next) => setParam("tab", next === "flow" ? null : next)}>
        {tab === "flow" && (
          <div className="arch-stack">
            <p className="arch-quiet">Select a step to see what it does, its eTOM process, its integrations and its source. The Steps tab holds the same flow as a table.</p>
            <div className="arch-canvas" role="region" aria-label="BPMN flow (scrolls both ways)" tabIndex={0}>
              <FlowDiagram data={data} journey={journey} selectedId={stepId} onSelect={(id) => {
                const picked = journey.steps.find((item) => item.id === id);
                if (picked?.kind === "task") setParam("step", id === stepId ? null : id);
              }} />
            </div>
            {step && (
              <RecordDrawer title={step.name} openKey={step.id} onClose={() => setParam("step", null)}>
                <StepPanel data={data} journey={journey} step={step} />
              </RecordDrawer>
            )}
          </div>
        )}
        {tab === "integrations" && (
          <div className="arch-stack">
            <p>Who calls whom, in order, for what, and how. Solid arrows: synchronous or not stated; open heads: asynchronous; dashed: callbacks.</p>
            <div className="arch-canvas" role="region" aria-label="Integration sequence diagram (scrolls sideways)" tabIndex={0}>
              <SequenceDiagram data={data} name={journey.name} messages={journey.integrations} selectedId={callId} onSelect={(id) => setParam("call", id === callId ? null : id)} />
            </div>
            <DataTable caption={`Integration register: ${rows.length} calls`} columns={integrationColumns()} rows={rows} rowId={(row) => row.id} currentId={callId ?? undefined} />
            {call && (
              <RecordDrawer title={call.operation} openKey={call.id} onClose={() => setParam("call", null)}>
                <CallPanel call={call} />
              </RecordDrawer>
            )}
          </div>
        )}
        {tab === "tracking" && <TrackingView data={data} journey={journey} />}
        {tab === "steps" && <DataTable caption={`Steps: ${tasks.length}`} columns={stepColumns} rows={tasks} rowId={(item) => item.id} />}
      </Tabs>
    </>
  );
}

/**
 * One journey seen through one channel: a product's order type as a BPMN flow
 * (one lane per system), the integrations in order, the order-tracking flow and
 * the steps as a table, each exportable for other tools.
 */
export function JourneyPage() {
  const { journeyId } = useParams();
  const [params] = useSearchParams();
  const view = (data: CatalogueData) => (journeyId ? journeyView(data, journeyId, params.get("channel")) : null);
  return (
    <ArchitectureFrame
      title={(data) => view(data)?.name ?? "Journey not found"}
      documentTitle={(data) => `${view(data)?.name ?? "Journey"} · Catalogue`}
      lead={(data) => view(data)?.summary}
    >
      {(data) => {
        const journey = view(data);
        return journey ? (
          <Journey data={data} journey={journey} />
        ) : (
          <EmptyState title="There is no journey at this address" action={<Link to={`${BASE}/journeys`}>See every journey</Link>}>
            It may not be in this version. The journeys list shows every journey modelled in it.
          </EmptyState>
        );
      }}
    </ArchitectureFrame>
  );
}

/** Every journey modelled, one row per channel it is seen through. */
export function JourneysPage() {
  return (
    <ArchitectureFrame title="Journeys" lead="Each journey is one product's order type, seen through each channel it can be ordered in: its flow, its integrations and how the order is tracked.">
      {(data) => <JourneyList data={data} />}
    </ArchitectureFrame>
  );
}

function JourneyList({ data }: { data: CatalogueData }) {
  const [scope] = useScope(data);
  const rows = data.offerings
    .filter((offering) => !scope.product || offering.id === scope.product)
    .flatMap((offering) => journeyViews(data, offering.id, scope.order, scope.channel));
  const columns: Column<JourneyView>[] = [
    { id: "name", header: "Journey", rowHeader: true, cell: (journey) => <Link to={withScope(`${BASE}/journeys/${journey.id}`, scope, { channel: journey.channel })}>{journey.name}</Link> },
    { id: "product", header: "Product", cell: (journey) => data.offerings.find((item) => item.id === journey.offeringId)?.name ?? "—" },
    { id: "order", header: "Order type", cell: (journey) => (journey.orderType ? `${data.orderTypes.find((type) => type.code === journey.orderType)?.name ?? ""} (${journey.orderType})` : "Every order type") },
    { id: "steps", header: "Steps", numeric: true, cell: (journey) => journey.steps.filter((step) => step.kind === "task").length },
    { id: "calls", header: "Integrations", numeric: true, cell: (journey) => journey.integrations.length },
    { id: "lanes", header: "Lanes", numeric: true, cell: (journey) => new Set(journey.steps.filter((step) => step.kind === "task").map((step) => step.lane)).size },
  ];
  return (
    <>
      <DataTable caption={`Journeys: ${rows.length}`} columns={columns} rows={rows} rowId={(journey) => `${journey.id}:${journey.channel ?? ""}`} emptyText="No journey is modelled for this product, order type and channel yet." />
      <p className="arch-quiet">Order types a product supports without a modelled journey are listed on the product's Journeys tab.</p>
    </>
  );
}
