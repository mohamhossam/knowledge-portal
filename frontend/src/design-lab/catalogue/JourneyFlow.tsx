/**
 * Mock-up 4, a journey's flow: BPMN swimlanes fill the viewport, each lane
 * tinted by its system's layer on the poster, so the flow and the landscape
 * read as one picture. A step's detail and its calls sit in the side panel.
 */
import { type KeyboardEvent, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { journeyView, laneName } from "../../architecture/adapter";
import { download, toBpmn, toCsv, toMermaid, toPlantUml } from "../../architecture/exports";
import { GEOMETRY, layoutFlow } from "../../architecture/flowLayout";
import { ROLE_WORDS, type Step } from "../../architecture/model";
import { EvidenceTag } from "./CatalogueLab";
import { LAB, useLabData } from "./labData";

const LAYER: Record<string, string> = {
  "market-sales": "market",
  product: "market",
  customer: "customer",
  service: "service",
  resource: "resource",
  "engaged-party": "party",
  enterprise: "enterprise",
  integration: "service",
};

function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > width && line) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${(kept[lines - 1] ?? "").replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return out;
}

export function JourneyFlow() {
  const data = useLabData();
  const { journeyId } = useParams();
  const [params, setParams] = useSearchParams();
  const def = data.journeys.find((journey) => journey.id === journeyId);
  const channel = def && params.get("channel") && def.channels.includes(params.get("channel") as string) ? params.get("channel") : def?.channels[0] ?? null;
  const view = useMemo(() => (def ? journeyView(data, def.id, channel) : null), [data, def, channel]);
  const layout = useMemo(() => (view ? layoutFlow(view) : null), [view]);
  const tasks = useMemo(() => (layout ? [...layout.placed.values()].filter((item) => item.step.kind === "task").sort((a, b) => a.column - b.column || a.lane - b.lane) : []), [layout]);
  const [picked, setSelected] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  // The picked step while it is in this view; otherwise the journey's first step.
  const selected = picked && tasks.some((item) => item.step.id === picked) ? picked : tasks[0]?.step.id ?? null;

  if (!def || !view || !layout) return <p>No such journey in this catalogue version.</p>;
  const offering = data.offerings.find((item) => item.id === def.offeringId);
  const number = new Map(tasks.map((item, index) => [item.step.id, index + 1]));
  const step: Step | undefined = view.steps.find((item) => item.id === selected);
  const stepCalls = step ? view.integrations.filter((call) => call.step === step.id) : [];
  const laneTitle = (lane: string) => view.laneLabels[lane] ?? laneName(data, lane);
  const laneDomain = (lane: string) => {
    const system = data.systems.find((item) => item.id === lane);
    return system ? data.domains.find((domain) => domain.id === system.domain) : undefined;
  };
  const tint = (lane: string) => {
    const domain = laneDomain(lane);
    return domain ? `var(--cl-${LAYER[domain.id] ?? "enterprise"})` : "var(--cl-sand)";
  };
  const channelName = (id: string) => data.channels.find((item) => item.id === id)?.name ?? id;
  const file = `${def.id}${channel ? `-${channel}` : ""}`;
  const keyDown = (id: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(id);
    }
  };
  // Lanes drawn tighter than the export's geometry, so more of the flow fits the viewport.
  const LANE = 66;
  const laneY = (y: number) => Math.floor(y / GEOMETRY.laneHeight) * LANE + LANE / 2;
  const W = layout.width;
  const H = layout.lanes.length * LANE;

  return (
    <>
      <nav className="cl-crumbs" aria-label="Where this journey belongs">
        <Link to={LAB}>Catalogue</Link>
        <span aria-hidden="true">›</span>
        {offering ? <Link to={`${LAB}/products/${offering.id}`}>{offering.name}</Link> : <span>Shared</span>}
        <span aria-hidden="true">›</span>
        <span>Journeys</span>
      </nav>
      <div className="cl-head">
        <div>
          <h1>
            {def.name}
            {channel ? ` · ${channelName(channel)}` : ""}
          </h1>
          <p className="cl-lede">
            {def.summary} <strong>{tasks.length} steps</strong> across <strong>{layout.lanes.length} lanes</strong>, <strong>{view.integrations.length} calls</strong>.
          </p>
        </div>
        <div className="cl-head-actions">
          <button type="button" className="cl-btn" onClick={() => download(`${file}.bpmn`, toBpmn(data, view), "application/xml")}>
            BPMN 2.0
          </button>
          <button type="button" className="cl-btn" onClick={() => download(`${file}.puml`, toPlantUml(data, view.name, view.integrations), "text/plain")}>
            PlantUML
          </button>
          <button type="button" className="cl-btn" onClick={() => download(`${file}.mmd`, toMermaid(data, view.name, view.integrations), "text/plain")}>
            Mermaid
          </button>
          <button type="button" className="cl-btn" onClick={() => download(`${file}-register.csv`, toCsv(data, view.integrations), "text/csv")}>
            Register (CSV)
          </button>
        </div>
      </div>
      <div className="cl-flowbar">
        {def.channels.length > 0 && (
          <div className="cl-chips" role="group" aria-label="Channel">
            <span className="cl-chiplabel">Channel</span>
            {def.channels.map((item) => (
              <button
                key={item}
                type="button"
                className="cl-chip"
                aria-pressed={item === channel}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("channel", item);
                  setParams(next, { replace: true });
                }}
              >
                {channelName(item)}
              </button>
            ))}
          </div>
        )}
        <div className="cl-chips" role="group" aria-label="Other journeys of this product">
          <span className="cl-chiplabel">Journey</span>
          {data.journeys
            .filter((journey) => journey.offeringId === def.offeringId)
            .map((journey) => (
              <Link key={journey.id} className="cl-chip" to={`${LAB}/journeys/${journey.id}`} aria-current={journey.id === def.id ? "page" : undefined}>
                {journey.name}
              </Link>
            ))}
        </div>
        <div className="cl-zoom" role="group" aria-label="Zoom" style={{ marginLeft: "auto" }}>
          <button type="button" onClick={() => setScale((value) => Math.max(0.5, +(value - 0.1).toFixed(2)))} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => setScale(1)} aria-label="Actual size">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" onClick={() => setScale((value) => Math.min(1.5, +(value + 0.1).toFixed(2)))} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
      <div className="cl-flowwrap">
        <div className="cl-canvas" role="region" aria-label={`${def.name}, BPMN flow (scrolls)`} tabIndex={0}>
          <svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${def.name} flow`}>
            <defs>
              <marker id="cl-flow-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="var(--cl-ink-2)" />
              </marker>
            </defs>
            {layout.lanes.map((lane, index) => {
              const domain = laneDomain(lane);
              const y = index * LANE;
              return (
                <g key={lane} aria-hidden="true">
                  <rect x={0} y={y} width={W} height={LANE} fill={tint(lane)} opacity={0.32} />
                  <rect x={0} y={y} width={GEOMETRY.laneHeader} height={LANE} fill={tint(lane)} />
                  <line x1={0} x2={W} y1={y + LANE} y2={y + LANE} stroke="var(--cl-page)" strokeWidth={2} />
                  {wrap(laneTitle(lane), 19, 2).slice(0, 2).map((line, row) => (
                    <text key={row} className="cl-lane-label" x={14} y={y + 22 + row * 15} fill="var(--cl-ink)">
                      {line}
                    </text>
                  ))}
                  <text className="cl-lane-domain" x={14} y={y + LANE - 10} fill="var(--cl-ink-2)">
                    {domain ? domain.name : lane.startsWith("team:") ? "Team or party" : "Channel"}
                  </text>
                </g>
              );
            })}
            {layout.edges.map((edge) => {
              const points = edge.points.map(([px, py]): [number, number] => [px, laneY(py)]);
              const [lx, ly] = points[points.length - 2] ?? points[0] ?? [0, 0];
              return (
                <g key={`${edge.from}-${edge.to}`} aria-hidden="true">
                  <polyline className="cl-edge" points={points.map((point) => point.join(",")).join(" ")} markerEnd="url(#cl-flow-arrow)" />
                  {edge.label && (
                    <text className="cl-edge-label" x={lx - 4} y={ly - 6} textAnchor="end">
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
            {[...layout.placed.values()].map(({ step: item, x, y: rawY, width, height: rawHeight }) => {
              const height = item.kind === "task" ? 52 : rawHeight;
              const y = laneY(rawY + rawHeight / 2) - height / 2;
              if (item.kind === "task") {
                const calls = view.integrations.filter((call) => call.step === item.id).length;
                const on = item.id === selected;
                return (
                  <g
                    key={item.id}
                    className={`cl-task${on ? " on" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    aria-label={`Step ${number.get(item.id)}: ${item.name}${calls ? `, ${calls} calls` : ""}`}
                    onClick={() => setSelected(item.id)}
                    onKeyDown={keyDown(item.id)}
                  >
                    <rect x={x} y={y} width={width} height={height} rx={3} />
                    <text className="num" x={x + 8} y={y + 15}>
                      {number.get(item.id)}
                    </text>
                    {wrap(item.name, 21, 2).map((line, row) => (
                      <text key={row} x={x + 8} y={y + 31 + row * 14}>
                        {line}
                      </text>
                    ))}
                    {calls > 0 && (
                      <text className="num" x={x + width - 8} y={y + 15} textAnchor="end">
                        {calls} {calls === 1 ? "call" : "calls"}
                      </text>
                    )}
                    {item.ponr && <path d={`M${x + width - 14} ${y + height - 4}v-14l10 4-10 4`} fill="var(--cl-ochre)" aria-hidden="true" />}
                  </g>
                );
              }
              const cx = x + width / 2;
              const cy = y + height / 2;
              if (item.kind === "exclusive" || item.kind === "parallel") {
                return (
                  <g key={item.id} aria-hidden="true">
                    <path d={`M${cx} ${y}L${x + width} ${cy}L${cx} ${y + height}L${x} ${cy}z`} fill="#fff" stroke="var(--cl-ink-2)" strokeWidth={1.4} />
                    {item.kind === "parallel" ? (
                      <path d={`M${cx - 9} ${cy}h18M${cx} ${cy - 9}v18`} stroke="var(--cl-ink)" strokeWidth={2.4} />
                    ) : (
                      <path d={`M${cx - 7} ${cy - 7}l14 14M${cx + 7} ${cy - 7}l-14 14`} stroke="var(--cl-ink)" strokeWidth={2.4} />
                    )}
                  </g>
                );
              }
              return <circle key={item.id} cx={cx} cy={cy} r={width / 2} fill="#fff" stroke={item.kind === "start" ? "var(--cl-sage)" : "var(--cl-ink)"} strokeWidth={item.kind === "start" ? 2 : 3.5} aria-hidden="true" />;
            })}
          </svg>
        </div>
        <aside className="cl-insp" aria-live="polite">
          {step ? (
            <>
              <p className="cl-sub">
                Step {number.get(step.id)} of {tasks.length}
              </p>
              <h2>{step.name}</h2>
              <p className="cl-sub">
                {laneTitle(step.lane)}
                {step.role ? ` · ${ROLE_WORDS[step.role]}` : ""}
              </p>
              {step.detail && <p>{step.detail}</p>}
              {step.etom && (
                <div className="cl-kv">
                  <span>eTOM</span>
                  <b>{step.etom}</b>
                </div>
              )}
              {step.ponr && (
                <div className="cl-kv">
                  <span>Point of no return</span>
                  <b>{step.ponr}</b>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <EvidenceTag evidence={step.evidence} />
              </div>
              <h3>Calls in this step · {stepCalls.length}</h3>
              {stepCalls.length === 0 && <p>This step makes no system-to-system call.</p>}
              {stepCalls.map((call) => (
                <div key={call.id} style={{ borderTop: "1px solid var(--cl-hairline)", padding: "8px 0" }}>
                  <strong style={{ fontSize: "0.9375rem" }}>
                    {laneName(data, call.from)} → {laneName(data, call.to)}
                    {call.via ? ` (via ${laneName(data, call.via)})` : ""}
                  </strong>
                  <p>{call.purpose}</p>
                  <p className="cl-sub" style={{ margin: "2px 0 0" }}>
                    {[call.operation, call.style, call.mode !== "not stated" ? call.mode : "", call.tmf].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <p>Pick a step in the flow.</p>
          )}
        </aside>
      </div>
    </>
  );
}
