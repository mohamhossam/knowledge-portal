/**
 * Mock-up 4, a product's journey: its BPMN flow across the full width (lane
 * names stay put while it scrolls, a minimap shows the whole of it), the
 * picked step and every step underneath, and an Integrations tab with the
 * journey's call register. It sits inside its product's tabs.
 */
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { journeyView, laneName } from "../../architecture/adapter";
import { download, toBpmn, toCsv, toMermaid, toPlantUml } from "../../architecture/exports";
import { GEOMETRY, layoutFlow } from "../../architecture/flowLayout";
import { type JourneyView, ROLE_WORDS, type Step } from "../../architecture/model";
import { AreaTabs, EvidenceTag } from "./CatalogueLab";
import { journeyHref, LAB, useLabData } from "./labData";
import { plural, useTitle } from "./labUtil";
import { ProductHeader } from "./ProductPage";

const LAYER: Record<string, string> = {
  "market-sales": "market",
  product: "market",
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
          <button type="button" onClick={() => download(`${file}.puml`, toPlantUml(data, view.name, view.integrations), "text/plain")}>
            Download PlantUML <small>sequence diagram</small>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => download(`${file}.mmd`, toMermaid(data, view.name, view.integrations), "text/plain")}>
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

/** The journey's calls as a register: who calls whom, how, through what, and on whose word. */
function IntegrationRegister({ view }: { view: JourneyView }) {
  const data = useLabData();
  const [system, setSystem] = useState<string | null>(null);
  const name = (id?: string) => (id ? laneName(data, id) : "");
  const step = (id: string) => view.steps.find((item) => item.id === id);
  const involved = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of view.integrations) for (const id of new Set([call.from, call.to, call.via])) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [view]);
  const styles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of view.integrations) counts.set(call.style || "Not stated", (counts.get(call.style || "Not stated") ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [view]);
  const rows = view.integrations.map((call, index) => ({ call, index })).filter(({ call }) => !system || [call.from, call.to, call.via].includes(system));
  return (
    <section aria-labelledby="cl-reg-h" className="cl-register">
      <h3 id="cl-reg-h" className="ds-visually-hidden">
        Integration register
      </h3>
      <div className="cl-register-summary">
        <p>
          <b>{view.integrations.length}</b> calls between <b>{involved.length}</b> systems and parties.
        </p>
        <ul className="cl-stylebar" aria-label="Calls by style">
          {styles.map(([style, count]) => (
            <li key={style} style={{ flexGrow: count }}>
              <span>{style}</span>
              <b>{count}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="cl-chips" role="group" aria-label="Show the calls of one system">
        <button type="button" className="cl-chip" aria-pressed={system === null} onClick={() => setSystem(null)}>
          Every system
        </button>
        {involved.map(([id, count]) => (
          <button key={id} type="button" className="cl-chip" aria-pressed={system === id} onClick={() => setSystem(system === id ? null : id)}>
            <span translate="no">{name(id)}</span> <small>{count}</small>
          </button>
        ))}
      </div>
      <div className="cl-tablewrap" role="region" aria-label="Calls table (scrolls sideways when narrow)" tabIndex={0}>
        <table className="cl-table cl-regtable">
          <thead>
            <tr>
              <th scope="col" className="num">
                #
              </th>
              <th scope="col">From → to</th>
              <th scope="col">Interface</th>
              <th scope="col">Style</th>
              <th scope="col">TM Forum</th>
              <th scope="col">Purpose</th>
              <th scope="col">Step</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ call, index }) => (
              <tr key={call.id}>
                <td className="num">{index + 1}</td>
                <th scope="row" translate="no">
                  {name(call.from)} → {name(call.to)}
                  {call.via && <small> via {name(call.via)}</small>}
                </th>
                <td translate="no">{call.operation || <span className="gap">Not stated</span>}</td>
                <td>
                  {call.style}
                  {call.mode !== "not stated" ? <small> · {call.mode}</small> : null}
                </td>
                <td translate="no">{call.tmf ?? <span className="gap">None</span>}</td>
                <td>{call.purpose}</td>
                <td>{step(call.step)?.name ?? ""}</td>
                <td>
                  <EvidenceTag evidence={call.evidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function JourneyFlow() {
  const data = useLabData();
  const navigate = useNavigate();
  const { journeyId } = useParams();
  const [params, setParams] = useSearchParams();
  const def = data.journeys.find((journey) => journey.id === journeyId);
  const wanted = params.get("channel");
  const channel = def && wanted && def.channels.includes(wanted) ? wanted : (def?.channels[0] ?? null);
  const tab = params.get("view") === "integrations" ? "integrations" : "flow";
  const view = useMemo(() => (def ? journeyView(data, def.id, channel) : null), [data, def, channel]);
  const layout = useMemo(() => (view ? layoutFlow(view) : null), [view]);
  const tasks = useMemo(() => (layout ? [...layout.placed.values()].filter((item) => item.step.kind === "task").sort((a, b) => a.column - b.column || a.lane - b.lane) : []), [layout]);
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
  const [height, setHeight] = useState(560);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1, height: 1 });

  // The flow takes the rest of the window (the step details sit below it).
  useLayoutEffect(() => {
    const fit = () => {
      const element = canvas.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.min(820, Math.max(480, window.innerHeight - top - 16)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [def?.id, tab]);

  const sync = () => {
    const element = canvas.current;
    if (element) setViewport({ left: element.scrollLeft, top: element.scrollTop, width: element.clientWidth, height: element.clientHeight });
  };
  useEffect(sync, [scale, height, layout, tab]);

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
  const step: Step | undefined = view.steps.find((item) => item.id === selected);
  const stepCalls = step ? view.integrations.filter((call) => call.step === step.id) : [];
  const laneTitle = (lane: string) => view.laneLabels[lane] ?? laneName(data, lane);
  const laneDomain = (lane: string) => {
    const system = data.systems.find((item) => item.id === lane);
    return system ? data.domains.find((domain) => domain.id === system.domain) : undefined;
  };
  const tint = (lane: string) => {
    const domain = laneDomain(lane);
    return domain ? `var(--cl-${LAYER[domain.id] ?? "enterprise"}-lane)` : "var(--cl-sand)";
  };
  const file = `${def.id}${channel ? `-${channel}` : ""}`;
  const laneY = (y: number) => Math.floor(y / GEOMETRY.laneHeight) * LANE + LANE / 2;
  // The export geometry keeps a header column inside the drawing; the lane names live in their own sticky column here.
  const shift = GEOMETRY.laneHeader;
  const W = layout.width - shift;
  const H = layout.lanes.length * LANE;
  const fitHeight = () => setScale(Math.max(0.5, Math.min(1.2, +((height - 8) / H).toFixed(2))));
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
      if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth - LABEL_W - 160) element.scrollTo?.({ left: Math.max(0, x - 80), behavior: "smooth" });
      if (y < element.scrollTop || y > element.scrollTop + element.clientHeight - 40) element.scrollTo?.({ top: Math.max(0, y - 80), behavior: "smooth" });
    }
  };
  const keyDown = (id: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(id);
    }
  };

  // Minimap: the whole drawing in a strip, with the visible part framed.
  const MINI_H = 64;
  const miniScale = MINI_H / H;
  const miniW = W * miniScale;
  const panTo = (event: PointerEvent<SVGSVGElement>) => {
    const element = canvas.current;
    if (!element) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * W * scale;
    const y = ((event.clientY - box.top) / box.height) * H * scale;
    element.scrollTo?.({ left: Math.max(0, x - element.clientWidth / 2), top: Math.max(0, y - element.clientHeight / 2) });
  };
  const miniKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const element = canvas.current;
    if (!element) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-160, 0], ArrowRight: [160, 0], ArrowUp: [0, -160], ArrowDown: [0, 160] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    element.scrollBy?.({ left: move[0], top: move[1] });
  };

  const top: ReactNode = offering ? (
    <ProductHeader offering={offering} current="journeys" compact />
  ) : (
    <>
      <AreaTabs current="journeys" />
      <nav className="cl-crumbs" aria-label="Where this journey belongs">
        <ol>
          <li>
            <Link to={LAB}>Catalogue</Link>
          </li>
          <li aria-current="page">{def.name}</li>
        </ol>
      </nav>
    </>
  );
  const Heading = offering ? "h2" : "h1";
  const query = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(channel ? { channel } : {}), ...extra }).toString()}`;

  return (
    <>
      {top}
      <div className="cl-toolbar">
        <div className="cl-chips" role="group" aria-label="Journey">
          <span className="cl-chiplabel" aria-hidden="true">
            Journey
          </span>
          {data.journeys
            .filter((journey) => journey.offeringId === def.offeringId)
            .map((journey) => (
              <button key={journey.id} type="button" className="cl-chip" aria-pressed={journey.id === def.id} onClick={() => navigate(journeyHref(journey.id, journey.channels[0]))}>
                {journey.name}
              </button>
            ))}
        </div>
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
          Integrations <span className="cl-count">{view.integrations.length}</span>
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
            <div className="cl-minimap">
              <svg
                viewBox={`0 0 ${miniW} ${MINI_H}`}
                width="100%"
                height={MINI_H}
                preserveAspectRatio="none"
                role="img"
                aria-label="Minimap of the whole flow. Click or use the arrow keys to move the view."
                tabIndex={0}
                onPointerDown={panTo}
                onPointerMove={(event) => event.buttons === 1 && panTo(event)}
                onKeyDown={miniKey}
              >
                {layout.lanes.map((lane, index) => (
                  <rect key={lane} x={0} y={index * LANE * miniScale} width={miniW} height={LANE * miniScale} fill={tint(lane)} />
                ))}
                {tasks.map(({ step: item, x, y, height: h }) => (
                  <rect key={item.id} x={(x - shift) * miniScale} y={laneY(y + h / 2) * miniScale - 2} width={Math.max(4, 144 * miniScale)} height={4} fill={item.id === selected ? "var(--cl-red)" : "var(--cl-maroon)"} />
                ))}
                <rect
                  className="cl-minimap-view"
                  x={(viewport.left / scale) * miniScale}
                  y={(viewport.top / scale) * miniScale}
                  width={Math.min(miniW, ((viewport.width - LABEL_W) / scale) * miniScale)}
                  height={Math.min(MINI_H, (viewport.height / scale) * miniScale)}
                />
              </svg>
            </div>
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
          <div className="cl-canvas" ref={canvas} style={{ height }} onScroll={sync} role="region" aria-label={`${def.name}, process flow (scrolls)`} tabIndex={-1}>
            <div className="cl-flow" style={{ width: LABEL_W + W * scale, height: H * scale }}>
              <div className="cl-lanes" aria-hidden="true" style={{ height: H * scale }}>
                {layout.lanes.map((lane) => {
                  const domain = laneDomain(lane);
                  return (
                    <div key={lane} className="cl-lane-name" style={{ height: LANE * scale, background: tint(lane) }}>
                      <strong translate="no">{laneTitle(lane)}</strong>
                      <span>{domain ? domain.name : lane.startsWith("team:") ? "Team or party" : "Channel"}</span>
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
                  <g key={lane} aria-hidden="true">
                    <rect x={0} y={index * LANE} width={W} height={LANE} fill={index % 2 ? "var(--cl-paper)" : "var(--cl-page)"} />
                    <line x1={0} x2={W} y1={(index + 1) * LANE} y2={(index + 1) * LANE} stroke="var(--cl-hairline)" />
                  </g>
                ))}
                {layout.edges.map((edge) => {
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
                        <text className="num" x={x + 8} y={y + 15}>
                          {number.get(item.id)}
                        </text>
                        {calls > 0 && (
                          <text className="num" x={x + width - 8} y={y + 15} textAnchor="end">
                            {plural(calls, "call")}
                          </text>
                        )}
                        {wrap(item.name, 22, 2).map((line, row) => (
                          <text key={row} className="label" x={x + 8} y={y + 32 + row * 15}>
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
                    {step.role ? ` · ${ROLE_WORDS[step.role]}` : ""}
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
                          {call.via ? ` (via ${laneName(data, call.via)})` : ""}
                        </strong>
                        <p>{call.purpose}</p>
                        <span translate="no">{[call.operation, call.style, call.mode !== "not stated" ? call.mode : "", call.tmf].filter(Boolean).join(" · ")}</span>
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
