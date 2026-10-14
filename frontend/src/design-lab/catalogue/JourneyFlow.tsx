/**
 * Mock-up 4, a product's journey: its BPMN flow across the full width (lane
 * names stay put while it scrolls), the picked step and every step underneath, and an Integrations tab with the
 * journey's call register. It sits inside its product's tabs.
 */
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { journeyView } from "../../architecture/adapter";
import { download, toBpmn, toCsv, toMermaid, toPlantUml } from "../../architecture/exports";
import { GEOMETRY, layoutFlow, type Placed } from "../../architecture/flowLayout";
import { type ActivityStep, type JourneyView, type Lane, laneKey, systemOf } from "../../architecture/model";
import { AreaTabs, EvidenceTag, PathBar } from "./labChrome";
import { JourneyPicker } from "./JourneyPicker";
import { journeyHref, LAB, useLabData } from "./labData";
import { plural, scrollBehavior, useTitle } from "./labUtil";
import { ProductHeader } from "./productParts";
import { channelMissingText, laneKindName, laneName, MODE_WORDS, operationName, roleName, styleName, systemName, viewTitle } from "./words";

import { IntegrationRegister } from "./IntegrationRegister";
const LAYER: Record<string, string> = {
  "market-sales": "market",
  product: "product",
  customer: "customer",
  service: "service",
  resource: "resource",
  "engaged-party": "party",
  enterprise: "enterprise",
  integration: "spine",
};
const LANE = 72;
const TASK_H = 58;
const LABEL_W = 176;
/** The flow's canvas: its height before it is measured, and the bounds it takes of the window, with a gap below. */
const CANVAS = { initial: 560, min: 480, max: 820, gapBelow: 16 };
/** Fit to height never shrinks the flow below half size or grows it past 120%. */
const FIT_SCALE = { min: 0.5, max: 1.2 };
/** A picked step is scrolled into view when it is this close to the canvas's right or bottom edge, and lands this far in. */
const KEEP_IN_VIEW = { right: 160, bottom: 40, lead: 80 };
/** A step's text in its box: the inset, the number's baseline, the name's first baseline and line height, and how the name wraps. */
const STEP_TEXT = { inset: 8, numberY: 15, nameY: 32, lineHeight: 15, chars: 22, lines: 2 };

function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (`${line} ${word}`.trim().length > width && line) {
      out.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) out.push(line);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${(kept[lines - 1] ?? "").replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return out;
}


function ExportMenu({ file, view }: { file: string; view: JourneyView }) {
  const data = useLabData();
  const title = viewTitle(data, view);
  return (
    <details className="cl-menu">
      <summary className="cl-btn">Export</summary>
      <ul>
        <li>
          <button type="button" onClick={() => download(`${file}.bpmn`, toBpmn(data, view), "application/xml")}>
            Download BPMN 2.0 <small>.bpmn, opens laid out</small>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => download(`${file}.puml`, toPlantUml(data, title, view.integrations), "text/plain")}>
            Download PlantUML <small>sequence diagram</small>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => download(`${file}.mmd`, toMermaid(data, title, view.integrations), "text/plain")}>
            Download Mermaid <small>sequence diagram</small>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => download(`${file}-register.csv`, toCsv(data, view.integrations), "text/csv")}>
            Download the register <small>CSV, one row per call</small>
          </button>
        </li>
      </ul>
    </details>
  );
}

export function JourneyFlow() {
  const data = useLabData();
  const navigate = useNavigate();
  const { journeyId } = useParams();
  const [params, setParams] = useSearchParams();
  const def = data.journeys.find((journey) => journey.id === journeyId);
  const wanted = params.get("channel");
  const tab = params.get("view") === "integrations" ? "integrations" : "flow";
  // The channel asked for, or the journey's first when it isn't offered through that one (the view says so).
  const view = useMemo(() => (def ? journeyView(data, def.id, wanted) : null), [data, def, wanted]);
  const channel = view?.channel ?? null;
  const layout = useMemo(() => (view ? layoutFlow(view) : null), [view]);
  const tasks = useMemo(
    () => (layout ? [...layout.placed.values()].filter((item): item is Placed & { step: ActivityStep } => item.step.kind === "task").sort((a, b) => a.column - b.column || a.lane - b.lane) : []),
    [layout],
  );
  const callsByStep = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of view?.integrations ?? []) counts.set(call.step, (counts.get(call.step) ?? 0) + 1);
    return counts;
  }, [view]);
  const channelName = (id: string) => data.channels.find((item) => item.id === id)?.name ?? id;
  useTitle(def ? `${def.name}${channel ? ` · ${channelName(channel)}` : ""}` : "Journey");

  const [picked, setPicked] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const selected = picked && tasks.some((item) => item.step.id === picked) ? picked : (tasks[0]?.step.id ?? null);
  const canvas = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(CANVAS.initial);

  // The flow takes the rest of the window (the step details sit below it).
  useLayoutEffect(() => {
    const fit = () => {
      const element = canvas.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.min(CANVAS.max, Math.max(CANVAS.min, window.innerHeight - top - CANVAS.gapBelow)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [def?.id, tab]);

  if (!def || !view || !layout) {
    return (
      <div className="cl-empty">
        <h1>No such journey</h1>
        <p>
          It isn't in this catalogue version. <Link to={LAB}>Back to the landscape</Link>.
        </p>
      </div>
    );
  }
  const offering = data.offerings.find((item) => item.id === def.offeringId);
  const number = new Map(tasks.map((item, index) => [item.step.id, index + 1]));
  const step = tasks.find((item) => item.step.id === selected)?.step;
  const stepCalls = step ? view.integrations.filter((call) => call.step === step.id) : [];
  const laneTitle = (lane: Lane) => laneName(data, lane);
  const laneDomain = (lane: Lane) => {
    const system = data.systems.find((item) => item.id === systemOf(lane));
    return system ? data.domains.find((domain) => domain.id === system.domain) : undefined;
  };
  const tint = (lane: Lane) => {
    const domain = laneDomain(lane);
    return domain ? `var(--cl-${LAYER[domain.id] ?? "enterprise"})` : "var(--cl-sand)";
  };
  const file = `${def.id}${channel ? `-${channel}` : ""}`;
  const laneY = (y: number) => Math.floor(y / GEOMETRY.laneHeight) * LANE + LANE / 2;
  // The export geometry keeps a header column inside the drawing; the lane names live in their own sticky column here.
  const shift = GEOMETRY.laneHeader;
  const W = layout.width - shift;
  const lanesH = layout.lanes.length * LANE;
  // The ways back run under the lanes, one line each (flowLayout).
  const backs = layout.edges.filter((edge) => edge.back);
  const H = lanesH + (backs.length ? GEOMETRY.backBand + backs.length * GEOMETRY.backStep : 0);
  const fitHeight = () => setScale(Math.max(FIT_SCALE.min, Math.min(FIT_SCALE.max, +((height - 8) / H).toFixed(2))));
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const choose = (id: string) => {
    setPicked(id);
    const placed = layout.placed.get(id);
    const element = canvas.current;
    if (placed && element) {
      const x = (placed.x - shift) * scale;
      const y = laneY(placed.y + placed.height / 2) * scale;
      if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth - LABEL_W - KEEP_IN_VIEW.right) element.scrollTo?.({ left: Math.max(0, x - KEEP_IN_VIEW.lead), behavior: scrollBehavior() });
      if (y < element.scrollTop || y > element.scrollTop + element.clientHeight - KEEP_IN_VIEW.bottom) element.scrollTo?.({ top: Math.max(0, y - KEEP_IN_VIEW.lead), behavior: scrollBehavior() });
    }
  };
  const keyDown = (id: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(id);
    }
  };

  const top: ReactNode = offering ? (
    <ProductHeader offering={offering} current="journeys" compact />
  ) : (
    <>
      <AreaTabs current="journeys" />
      <PathBar label="Where this journey belongs" items={[{ level: "Catalogue", name: "SMB architecture", to: LAB }, { level: "Journey", name: def.name }]} />
    </>
  );
  const Heading = offering ? "h2" : "h1";
  const query = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(channel ? { channel } : {}), ...extra }).toString()}`;

  return (
    <>
      {top}
      <div className="cl-toolbar">
        <JourneyPicker journeys={data.journeys.filter((journey) => journey.offeringId === def.offeringId)} current={def} onPick={(journey) => navigate(journeyHref(journey.id, journey.channels[0]))} />
        {def.channels.length > 0 && (
          <div className="cl-chips" role="group" aria-label="Channel">
            <span className="cl-chiplabel" aria-hidden="true">
              Channel
            </span>
            {def.channels.map((item) => (
              <button key={item} type="button" className="cl-chip" aria-pressed={item === channel} onClick={() => setParam("channel", item)}>
                {channelName(item)}
              </button>
            ))}
          </div>
        )}
      </div>
      {view.channelMissing && (
        <p className="cl-note cl-channel-missing" role="status">
          {channelMissingText(def.name, channelName(view.channelMissing), channelName(channel ?? ""))}
        </p>
      )}
      <header className="cl-jhead">
        <div>
          <Heading className="cl-jtitle">
            {def.name}
            {channel ? (
              <>
                {" "}
                <span className="cl-h1-sub">· {channelName(channel)}</span>
              </>
            ) : null}
          </Heading>
          <p className="cl-lede cl-lede--one">{def.summary}</p>
          <p className="cl-meta-line">
            {plural(tasks.length, "step")} · {plural(layout.lanes.length, "lane")} · {plural(view.integrations.length, "call")}
          </p>
        </div>
      </header>
      <nav className="cl-tabs cl-tabs--inner" aria-label={`${def.name} views`}>
        <Link to={query({})} aria-current={tab === "flow" ? "page" : undefined}>
          Flow (BPMN)
        </Link>
        <Link to={query({ view: "integrations" })} aria-current={tab === "integrations" ? "page" : undefined}>
          Integrations
        </Link>
        <span className="cl-tabs-end">
          <ExportMenu file={file} view={view} />
        </span>
      </nav>

      {tab === "integrations" ? (
        <IntegrationRegister view={view} />
      ) : (
        <>
          <div className="cl-flowbar">
            <div className="cl-zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => setScale((value) => Math.max(0.5, +(value - 0.1).toFixed(2)))} aria-disabled={scale <= 0.5}>
                <span aria-hidden="true">−</span>
                <span className="ds-visually-hidden">Zoom out</span>
              </button>
              <button type="button" className="pct" onClick={() => setScale(1)} aria-label={`${Math.round(scale * 100)}%, reset to actual size`}>
                {Math.round(scale * 100)}%
              </button>
              <button type="button" onClick={() => setScale((value) => Math.min(1.5, +(value + 0.1).toFixed(2)))} aria-disabled={scale >= 1.5}>
                <span aria-hidden="true">+</span>
                <span className="ds-visually-hidden">Zoom in</span>
              </button>
              <button type="button" className="fit" onClick={fitHeight}>
                Fit height
              </button>
            </div>
          </div>
          <div className="cl-canvas" ref={canvas} style={{ height }} role="region" aria-label={`${def.name}, process flow (scrolls)`} tabIndex={-1}>
            <div className="cl-flow" style={{ width: LABEL_W + W * scale, height: H * scale }}>
              <div className="cl-lanes" aria-hidden="true" style={{ height: H * scale }}>
                {layout.lanes.map((lane) => {
                  const domain = laneDomain(lane);
                  return (
                    <div key={laneKey(lane)} className="cl-lane-name" style={{ height: LANE * scale, background: tint(lane) }}>
                      <strong translate="no">{laneTitle(lane)}</strong>
                      <span>{domain ? domain.name : laneKindName(lane)}</span>
                    </div>
                  );
                })}
              </div>
              <svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${def.name}: ${plural(tasks.length, "step")}`}>
                <defs>
                  <marker id="cl-flow-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10z" fill="var(--cl-ink-2)" />
                  </marker>
                </defs>
                {layout.lanes.map((lane, index) => (
                  <g key={laneKey(lane)} aria-hidden="true">
                    <rect x={0} y={index * LANE} width={W} height={LANE} fill={index % 2 ? "var(--cl-paper)" : "var(--cl-page)"} />
                    <line x1={0} x2={W} y1={(index + 1) * LANE} y2={(index + 1) * LANE} stroke="var(--cl-hairline)" />
                  </g>
                ))}
                {layout.edges.map((edge) => {
                  if (edge.back) {
                    // From under the later step, along the band, up into the earlier one.
                    const from = layout.placed.get(edge.from);
                    const to = layout.placed.get(edge.to);
                    if (!from || !to) return null;
                    const bottom = (placed: typeof from) => laneY(placed.y + placed.height / 2) + (placed.step.kind === "task" ? TASK_H : placed.height) / 2;
                    const y = lanesH + GEOMETRY.backBand + backs.indexOf(edge) * GEOMETRY.backStep;
                    const sx = from.x + from.width / 2 - shift;
                    const tx = to.x + to.width / 2 - shift;
                    const points: [number, number][] = [[sx, bottom(from)], [sx, y], [tx, y], [tx, bottom(to)]];
                    return (
                      <g key={`${edge.from}-${edge.to}`} aria-hidden="true">
                        <polyline className="cl-edge cl-edge--back" points={points.map((point) => point.join(",")).join(" ")} markerEnd="url(#cl-flow-arrow)" />
                        {edge.label && (
                          <text className="cl-edge-label" x={tx + 6} y={y - 4}>
                            {edge.label}
                          </text>
                        )}
                      </g>
                    );
                  }
                  const points = edge.points.map(([px, py]): [number, number] => [px - shift, laneY(py)]);
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
                {[...layout.placed.values()].map(({ step: item, x: rawX, y: rawY, width, height: rawHeight }) => {
                  const x = rawX - shift;
                  const h = item.kind === "task" ? TASK_H : rawHeight;
                  const y = laneY(rawY + rawHeight / 2) - h / 2;
                  if (item.kind === "task") {
                    const calls = callsByStep.get(item.id) ?? 0;
                    const on = item.id === selected;
                    return (
                      <g
                        key={item.id}
                        className={`cl-task${on ? " on" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={on}
                        aria-label={`Step ${number.get(item.id)}: ${item.name}, in ${laneTitle(item.lane)}${calls ? `, ${plural(calls, "call")}` : ""}`}
                        onClick={() => choose(item.id)}
                        onKeyDown={keyDown(item.id)}
                      >
                        <rect className="ring" x={x - 4} y={y - 4} width={width + 8} height={h + 8} rx={6} />
                        <rect className="box" x={x} y={y} width={width} height={h} rx={3} />
                        <text className="num" x={x + STEP_TEXT.inset} y={y + STEP_TEXT.numberY}>
                          {number.get(item.id)}
                        </text>
                        {calls > 0 && (
                          <text className="num" x={x + width - STEP_TEXT.inset} y={y + STEP_TEXT.numberY} textAnchor="end">
                            {plural(calls, "call")}
                          </text>
                        )}
                        {wrap(item.name, STEP_TEXT.chars, STEP_TEXT.lines).map((line, row) => (
                          <text key={row} className="label" x={x + STEP_TEXT.inset} y={y + STEP_TEXT.nameY + row * STEP_TEXT.lineHeight}>
                            {line}
                          </text>
                        ))}
                        {item.ponr && <path d={`M${x + width - 14} ${y + h - 4}v-12l9 3.5-9 3.5`} fill="var(--cl-ochre)" aria-hidden="true" />}
                      </g>
                    );
                  }
                  const cx = x + width / 2;
                  const cy = y + h / 2;
                  if (item.kind === "exclusive" || item.kind === "parallel") {
                    return (
                      <g key={item.id} aria-hidden="true">
                        <path d={`M${cx} ${y}L${x + width} ${cy}L${cx} ${y + h}L${x} ${cy}z`} fill="var(--cl-page)" stroke="var(--cl-ink-2)" strokeWidth={1.4} />
                        {item.kind === "parallel" ? <path d={`M${cx - 9} ${cy}h18M${cx} ${cy - 9}v18`} stroke="var(--cl-ink)" strokeWidth={2.4} /> : <path d={`M${cx - 7} ${cy - 7}l14 14M${cx + 7} ${cy - 7}l-14 14`} stroke="var(--cl-ink)" strokeWidth={2.4} />}
                      </g>
                    );
                  }
                  return <circle key={item.id} cx={cx} cy={cy} r={width / 2} fill="var(--cl-page)" stroke={item.kind === "start" ? "var(--cl-sage)" : "var(--cl-ink)"} strokeWidth={item.kind === "start" ? 2 : 3.5} aria-hidden="true" />;
                })}
              </svg>
            </div>
          </div>

          <div className="cl-below">
            <section className="cl-stepcard" aria-labelledby="cl-step-h" aria-live="polite">
              {step ? (
                <>
                  <p className="cl-sub">
                    Step {number.get(step.id)} of {tasks.length} · <span translate="no">{laneTitle(step.lane)}</span>
                    {step.role ? ` · ${roleName(data, step.role)}` : ""}
                  </p>
                  <h3 id="cl-step-h">{step.name}</h3>
                  {step.detail && <p className="cl-body">{step.detail}</p>}
                  {(step.etom || step.ponr) && (
                    <dl className="cl-pairs">
                      {step.etom && (
                        <div>
                          <dt>eTOM</dt>
                          <dd translate="no">{step.etom}</dd>
                        </div>
                      )}
                      {step.ponr && (
                        <div>
                          <dt>Point of no return</dt>
                          <dd>{step.ponr}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  <EvidenceTag evidence={step.evidence} />
                  <h4>Calls in this step · {stepCalls.length}</h4>
                  {stepCalls.length === 0 && <p className="cl-body">This step makes no system-to-system call.</p>}
                  <ul className="cl-callcards">
                    {stepCalls.map((call) => (
                      <li key={call.id}>
                        <strong translate="no">
                          {laneName(data, call.from)} → {laneName(data, call.to)}
                          {call.via ? ` (via ${systemName(data, call.via)})` : ""}
                        </strong>
                        <p>{call.purpose}</p>
                        <span translate="no">{[operationName(call), styleName(call), call.mode !== "not-stated" ? MODE_WORDS[call.mode] : "", call.tmf].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <h3 id="cl-step-h">Pick a step in the flow</h3>
              )}
            </section>
            <section className="cl-allsteps" aria-labelledby="cl-all-h">
              <h3 id="cl-all-h">All steps</h3>
              <ol>
                {tasks.map(({ step: item }) => (
                  <li key={item.id}>
                    <button type="button" aria-current={item.id === selected ? "step" : undefined} onClick={() => choose(item.id)}>
                      <span className="n" aria-hidden="true">
                        {number.get(item.id)}
                      </span>
                      <span className="t">
                        <strong>{item.name}</strong>
                        <span translate="no">
                          {laneTitle(item.lane)}
                          {(callsByStep.get(item.id) ?? 0) > 0 ? ` · ${plural(callsByStep.get(item.id) ?? 0, "call")}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </>
  );
}
