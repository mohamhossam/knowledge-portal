/**
 * A journey's process flow (catalogue merge, step 4, from the lab's journey
 * page): its steps in BPMN form across one lane per system or party, the lane
 * names staying put while the flow scrolls; zoom and fit to height; the picked
 * step's details (eTOM, point of no return, evidence, the calls it makes) and
 * every step underneath. Keyboard: "All steps" is the way through, one Tab stop
 * per step; the flow's steps answer a pointer, so no step is a Tab stop twice.
 */
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Facts, Status } from "../../../design/components";
import { count } from "../../../home/format";
import { laneKindName, laneName, MODE_WORDS, operationName, roleName, styleName, systemName } from "../../../design-lab/catalogue/words";
import { GEOMETRY, layoutFlow, type Placed } from "../../model/flowLayout";
import { type ActivityStep, type Catalogue, type Evidence, type JourneyView, type Lane, laneKey, systemOf } from "../../model/model";
import { SOURCE_TONE, SOURCE_WORD } from "../../ontology";

/** Each TAM layer's tint for its lanes; the integration layer is the selection tint. */
const LAYER: Record<string, string> = {
  "market-sales": "market",
  product: "product",
  customer: "customer",
  service: "service",
  resource: "resource",
  "engaged-party": "party",
  enterprise: "enterprise",
};
const LANE = 72;
const TASK_H = 58;
const LABEL_W = 176;
/** The flow's canvas: its height before it is measured, and the bounds it takes of the window, with a gap below. */
const CANVAS = { initial: 560, min: 480, max: 820, gapBelow: 16 };
/** Fit to height never shrinks the flow below half size or grows it past 120%. */
const FIT_SCALE = { min: 0.5, max: 1.2 };
const ZOOM = { min: 0.5, max: 1.5, step: 0.1 };
/** A picked step is scrolled into view when it is this close to the canvas's right or bottom edge, and lands this far in. */
const KEEP_IN_VIEW = { right: 160, bottom: 40, lead: 80 };
/** A step's text in its box: the inset, the number's baseline, the name's first baseline and line height, and how the name wraps. */
const STEP_TEXT = { inset: 8, numberY: 15, nameY: 32, lineHeight: 15, chars: 22, lines: 2 };

/** Smooth scrolling, unless the person asked for less motion. */
const scrollBehavior = (): ScrollBehavior => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

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

/** Where a fact comes from: how sure its source is, and which source and place, when said. */
export function EvidenceLine({ evidence }: { evidence: Evidence }) {
  const where = [evidence.source, evidence.where, evidence.note].filter(Boolean).join(" · ");
  return (
    <p className="jf-evidence">
      <Status tone={SOURCE_TONE[evidence.status]}>{SOURCE_WORD[evidence.status]}</Status>
      {where && <span className="cat-detail" dir="auto">{where}</span>}
    </p>
  );
}

export function ProcessFlow({ data, view, title }: { data: Catalogue; view: JourneyView; title: string }) {
  const layout = useMemo(() => layoutFlow(view), [view]);
  const tasks = useMemo(
    () => [...layout.placed.values()].filter((item): item is Placed & { step: ActivityStep } => item.step.kind === "task").sort((a, b) => a.column - b.column || a.lane - b.lane),
    [layout],
  );
  const callsByStep = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of view.integrations) counts.set(call.step, (counts.get(call.step) ?? 0) + 1);
    return counts;
  }, [view]);
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
  }, [view.id]);

  const number = new Map(tasks.map((item, index) => [item.step.id, index + 1]));
  const step = tasks.find((item) => item.step.id === selected)?.step;
  const stepCalls = step ? view.integrations.filter((call) => call.step === step.id) : [];
  const laneTitle = (lane: Lane) => laneName(data, lane);
  const laneDomain = (lane: Lane) => {
    const system = data.systems.find((item) => item.id === systemOf(lane));
    return system ? data.domains.find((domain) => domain.id === system.domain) : undefined;
  };
  const tint = (lane: Lane) => {
    const layer = LAYER[laneDomain(lane)?.id ?? ""];
    return layer ? `var(--color-layer-${layer})` : "var(--color-surface-2)";
  };
  const laneY = (y: number) => Math.floor(y / GEOMETRY.laneHeight) * LANE + LANE / 2;
  // The layout keeps a header column inside the drawing for exports; the lane names live in their own sticky column here.
  const shift = GEOMETRY.laneHeader;
  const W = layout.width - shift;
  const lanesH = layout.lanes.length * LANE;
  // The ways back run under the lanes, one line each (flowLayout).
  const backs = layout.edges.filter((edge) => edge.back);
  const H = lanesH + (backs.length ? GEOMETRY.backBand + backs.length * GEOMETRY.backStep : 0);
  const fitHeight = () => setScale(Math.max(FIT_SCALE.min, Math.min(FIT_SCALE.max, +((height - 8) / H).toFixed(2))));
  const zoom = (by: number) => setScale((value) => Math.min(ZOOM.max, Math.max(ZOOM.min, +(value + by).toFixed(2))));
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
  const facts: [string, ReactNode][] = step
    ? [
      ...(step.etom ? [["eTOM", <span key="etom" translate="no">{step.etom}</span>] as [string, ReactNode]] : []),
      ...(step.ponr ? [["Point of no return", step.ponr] as [string, ReactNode]] : []),
    ]
    : [];

  if (!tasks.length) return <p className="cat-quiet">This journey has no step to draw yet.</p>;
  return (
    <div className="jf">
      <div className="jf-flowbar">
        <p className="cat-quiet">
          {count(tasks.length, "step")} · {count(layout.lanes.length, "lane")} · {count(view.integrations.length, "call")}
        </p>
        <div className="jf-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoom(-ZOOM.step)} aria-disabled={scale <= ZOOM.min} aria-label="Zoom out">
            <span aria-hidden="true">−</span>
          </button>
          <button type="button" className="pct" onClick={() => setScale(1)} aria-label={`${Math.round(scale * 100)}%, back to actual size`}>
            {Math.round(scale * 100)}%
          </button>
          <button type="button" onClick={() => zoom(ZOOM.step)} aria-disabled={scale >= ZOOM.max} aria-label="Zoom in">
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" className="fit" onClick={fitHeight}>Fit height</button>
        </div>
      </div>
      <div className="jf-canvas" ref={canvas} style={{ height }} role="region" aria-label={`${title}, process flow (scrolls)`} tabIndex={-1}>
        <div className="jf-flow" style={{ width: LABEL_W + W * scale, height: H * scale }}>
          <div className="jf-lanes" aria-hidden="true" style={{ height: H * scale }}>
            {layout.lanes.map((lane) => {
              const domain = laneDomain(lane);
              return (
                <div key={laneKey(lane)} className="jf-lane-name" style={{ height: LANE * scale, background: tint(lane) }}>
                  <strong translate="no">{laneTitle(lane)}</strong>
                  <span>{domain ? domain.name : laneKindName(lane)}</span>
                </div>
              );
            })}
          </div>
          <svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${title}: ${count(tasks.length, "step")}`}>
            <defs>
              <marker id="jf-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="var(--color-ink-2)" />
              </marker>
            </defs>
            {layout.lanes.map((lane, index) => (
              <g key={laneKey(lane)} aria-hidden="true">
                <rect x={0} y={index * LANE} width={W} height={LANE} fill={index % 2 ? "var(--color-surface-1)" : "var(--color-surface)"} />
                <line x1={0} x2={W} y1={(index + 1) * LANE} y2={(index + 1) * LANE} stroke="var(--color-rule-soft)" />
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
                    <polyline className="jf-edge jf-edge--back" points={points.map((point) => point.join(",")).join(" ")} markerEnd="url(#jf-arrow)" />
                    {edge.label && <text className="jf-edge-label" x={tx + 6} y={y - 4}>{edge.label}</text>}
                  </g>
                );
              }
              const points = edge.points.map(([px, py]): [number, number] => [px - shift, laneY(py)]);
              const [lx, ly] = points[points.length - 2] ?? points[0] ?? [0, 0];
              return (
                <g key={`${edge.from}-${edge.to}`} aria-hidden="true">
                  <polyline className="jf-edge" points={points.map((point) => point.join(",")).join(" ")} markerEnd="url(#jf-arrow)" />
                  {edge.label && <text className="jf-edge-label" x={lx - 4} y={ly - 6} textAnchor="end">{edge.label}</text>}
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
                    className={`jf-task${on ? " on" : ""}`}
                    role="button"
                    tabIndex={-1}
                    aria-pressed={on}
                    aria-label={`Step ${number.get(item.id)}: ${item.name}, in ${laneTitle(item.lane)}${calls ? `, ${count(calls, "call")}` : ""}`}
                    onClick={() => choose(item.id)}
                    onKeyDown={keyDown(item.id)}
                  >
                    <rect className="ring" x={x - 4} y={y - 4} width={width + 8} height={h + 8} rx={6} />
                    <rect className="box" x={x} y={y} width={width} height={h} rx={3} />
                    <text className="num" x={x + STEP_TEXT.inset} y={y + STEP_TEXT.numberY}>{number.get(item.id)}</text>
                    {calls > 0 && <text className="num" x={x + width - STEP_TEXT.inset} y={y + STEP_TEXT.numberY} textAnchor="end">{count(calls, "call")}</text>}
                    {wrap(item.name, STEP_TEXT.chars, STEP_TEXT.lines).map((line, row) => (
                      <text key={row} className="label" x={x + STEP_TEXT.inset} y={y + STEP_TEXT.nameY + row * STEP_TEXT.lineHeight}>{line}</text>
                    ))}
                    {item.ponr && <path d={`M${x + width - 14} ${y + h - 4}v-12l9 3.5-9 3.5`} fill="var(--color-warning)" aria-hidden="true" />}
                  </g>
                );
              }
              const cx = x + width / 2;
              const cy = y + h / 2;
              if (item.kind === "exclusive" || item.kind === "parallel") {
                return (
                  <g key={item.id} aria-hidden="true">
                    <path d={`M${cx} ${y}L${x + width} ${cy}L${cx} ${y + h}L${x} ${cy}z`} fill="var(--color-surface)" stroke="var(--color-ink-2)" strokeWidth={1.4} />
                    {item.kind === "parallel"
                      ? <path d={`M${cx - 9} ${cy}h18M${cx} ${cy - 9}v18`} stroke="var(--color-ink)" strokeWidth={2.4} />
                      : <path d={`M${cx - 7} ${cy - 7}l14 14M${cx + 7} ${cy - 7}l-14 14`} stroke="var(--color-ink)" strokeWidth={2.4} />}
                  </g>
                );
              }
              return <circle key={item.id} cx={cx} cy={cy} r={width / 2} fill="var(--color-surface)" stroke={item.kind === "start" ? "var(--color-success)" : "var(--color-ink)"} strokeWidth={item.kind === "start" ? 2 : 3.5} aria-hidden="true" />;
            })}
          </svg>
        </div>
      </div>

      <div className="jf-below">
        <section className="jf-stepcard" aria-labelledby="jf-step-h" aria-live="polite">
          {step ? (
            <>
              <p className="cat-quiet">
                Step {number.get(step.id)} of {tasks.length} · <span translate="no">{laneTitle(step.lane)}</span>
                {step.role ? ` · ${roleName(data, step.role)}` : ""}
              </p>
              <h3 id="jf-step-h" dir="auto">{step.name}</h3>
              {step.detail && <p dir="auto">{step.detail}</p>}
              {facts.length > 0 && <Facts items={facts} />}
              <EvidenceLine evidence={step.evidence} />
              <h4>Calls in this step · {stepCalls.length}</h4>
              {stepCalls.length === 0 && <p className="cat-quiet">This step makes no system-to-system call.</p>}
              <ul className="jf-callcards">
                {stepCalls.map((call) => (
                  <li key={call.id}>
                    <strong translate="no">
                      {laneName(data, call.from)} → {laneName(data, call.to)}
                      {call.via ? ` (through ${systemName(data, call.via)})` : ""}
                    </strong>
                    <p dir="auto">{call.purpose}</p>
                    <span translate="no">{[operationName(call), styleName(call), call.mode !== "not-stated" ? MODE_WORDS[call.mode] : "", call.tmf].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <h3 id="jf-step-h">Pick a step in the flow</h3>
          )}
        </section>
        <section className="jf-allsteps" aria-labelledby="jf-all-h">
          <h3 id="jf-all-h">All steps</h3>
          <ol>
            {tasks.map(({ step: item }) => (
              <li key={item.id}>
                <button type="button" aria-current={item.id === selected ? "step" : undefined} onClick={() => choose(item.id)}>
                  <span className="n" aria-hidden="true">{number.get(item.id)}</span>
                  <span className="t">
                    <strong dir="auto">{item.name}</strong>
                    <span translate="no">
                      {laneTitle(item.lane)}
                      {(callsByStep.get(item.id) ?? 0) > 0 ? ` · ${count(callsByStep.get(item.id) ?? 0, "call")}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
