/**
 * The poster component. It measures its column and lays the poster out to
 * fit, so it never overflows. At rest each box carries its integration
 * weight as a bar; links are drawn for the selected system (or all of them,
 * on request). In journey mode only the journey's systems are lit and the
 * calls so far are drawn, the current one in red with its number.
 *
 * Keyboard: the poster is one tab stop; arrow keys move between systems by
 * position, Home/End jump to the first/last, Escape clears the selection.
 */
import { type CSSProperties, type KeyboardEvent, memo, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { CatalogueData } from "../../architecture/adapter";
import type { Integration } from "../../architecture/model";
import { plural } from "./labUtil";
import { type Box, type Degree, layoutPoster, makeRouter, midpoint, partnersOf, type Point, toPath } from "./posterModel";

const FALLBACK_WIDTH = 1008;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  // Measure before paint, then follow the column as the window or the layout changes.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width);
      if (next > 0) setWidth((current) => (current === next ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);
  return { ref, width };
}

type Line = { key: string; d: string; kind: "all" | "mine" | "past" | "now"; width: number };

const STROKE: Record<Line["kind"], CSSProperties> = {
  all: { stroke: "var(--cl-ink-2)", opacity: 0.5 },
  mine: { stroke: "var(--cl-maroon)" },
  past: { stroke: "var(--cl-maroon)", opacity: 0.45 },
  now: { stroke: "var(--cl-red)" },
};

/** The box to move to from `from` in a direction: nearest along the axis, closest across it. */
function neighbour(boxes: Box[], from: Box, key: string): Box | undefined {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const horizontal = key === "ArrowRight" || key === "ArrowLeft";
  let best: Box | undefined;
  let score = Infinity;
  for (const box of boxes) {
    if (box === from) continue;
    const dx = box.x + box.w / 2 - cx;
    const dy = box.y + box.h / 2 - cy;
    const ok = key === "ArrowRight" ? dx > 4 : key === "ArrowLeft" ? dx < -4 : key === "ArrowDown" ? dy > 4 : dy < -4;
    if (!ok) continue;
    const value = (horizontal ? Math.abs(dx) : Math.abs(dy)) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 2.5;
    if (value < score) {
      score = value;
      best = box;
    }
  }
  return best;
}

type Props = {
  data: CatalogueData;
  degrees: Map<string, Degree>;
  linkCounts: Map<string, number>;
  label: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Landscape: draw every link, not only the selected system's. */
  showAll?: boolean;
  /** Journey mode: the systems the journey reaches, its calls in order, the current one. */
  journey?: { lit: Set<string>; entry?: string; calls: Integration[]; current: number };
};

export const Poster = memo(function Poster({ data, degrees, linkCounts, label, selected, onSelect, showAll = false, journey }: Props) {
  const { ref, width } = useWidth();
  // A small margin keeps arrowheads and focus rings at the edge inside the column.
  const layout = useMemo(() => layoutPoster(data, width - 8), [data, width]);
  const marker = useId().replace(/:/g, "");
  const ordered = useMemo(() => [...layout.boxes.values()].sort((a, b) => a.y - b.y || a.x - b.x), [layout]);
  const maxDegree = useMemo(() => Math.max(1, ...[...degrees.values()].map((item) => item.total)), [degrees]);
  const partners = useMemo(() => new Map(selected && !journey ? partnersOf(selected, linkCounts).map((item) => [item.id, item.count]) : []), [selected, journey, linkCounts]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const { lines, now } = useMemo(() => {
    const route = makeRouter(layout);
    const out: Line[] = [];
    let nowPoints: Point[] | null = null;
    const box = (id?: string) => (id ? layout.boxes.get(id) : undefined);
    if (journey) {
      journey.calls.slice(0, journey.current + 1).forEach((call, index) => {
        const hops: [string | undefined, string | undefined][] = call.via ? [[call.from, call.via], [call.via, call.to]] : [[call.from, call.to]];
        const isNow = index === journey.current;
        for (const [a, b] of hops) {
          const from = box(a);
          const to = box(b);
          if (!from || !to || from === to) continue;
          const points = route(from, to);
          if (isNow && (!nowPoints || b === call.to)) nowPoints = points;
          out.push({ key: `${call.id}-${a}-${b}${isNow ? "-now" : ""}`, d: toPath(points), kind: isNow ? "now" : "past", width: isNow ? 3 : 1.5 });
        }
      });
    } else {
      for (const [key, count] of linkCounts) {
        const [a = "", b = ""] = key.split("~");
        const mine = selected !== null && (a === selected || b === selected);
        if (!mine && !showAll) continue;
        const from = box(a);
        const to = box(b);
        if (!from || !to) continue;
        out.push({ key, d: toPath(route(from, to)), kind: mine ? "mine" : "all", width: mine ? 1.5 + Math.min(count, 4) * 0.5 : 1 + Math.min(count, 4) * 0.25 });
      }
      out.sort((x, y) => Number(x.kind === "mine") - Number(y.kind === "mine"));
    }
    return { lines: out, now: nowPoints as Point[] | null };
  }, [layout, journey, linkCounts, selected, showAll]);

  const call = journey?.calls[journey.current];
  const involved = new Set(call ? [call.from, call.to, call.via].filter((id): id is string => Boolean(id)) : []);
  const tabStop = focusId && layout.boxes.has(focusId) ? focusId : selected && layout.boxes.has(selected) ? selected : (ordered[0]?.system.id ?? null);
  const [mx, my] = now ? midpoint(now) : [0, 0];

  const keyDown = (current: Box) => (event: KeyboardEvent<HTMLButtonElement>) => {
    let target: Box | undefined;
    if (event.key.startsWith("Arrow")) target = neighbour(ordered, current, event.key);
    else if (event.key === "Home") target = ordered[0];
    else if (event.key === "End") target = ordered[ordered.length - 1];
    else if (event.key === "Escape" && !journey && selected) {
      event.preventDefault();
      onSelect(null);
      return;
    } else return;
    event.preventDefault();
    if (!target) return;
    setFocusId(target.system.id);
    buttons.current.get(target.system.id)?.focus();
  };

  return (
    <div ref={ref} className="cl-poster-fit">
      <div className="cl-poster-scroll">
        <div
          className={`cl-poster${journey || selected ? " dim" : ""}`}
          style={{ width: layout.width, height: layout.height }}
          role="group"
          aria-label={`${label}: ${plural(layout.boxes.size, "system")}. Arrow keys move between them.`}
        >
          {layout.bands.map((band) => (
            <div key={band.id} className={`cl-band cl-band--${band.id}${band.spine ? " cl-band--spine" : ""}`} style={{ left: band.x, top: band.y, width: band.w, height: band.h }} aria-hidden="true">
              <span>
                {band.name}
                <small>{band.count}</small>
              </span>
            </div>
          ))}
          <svg className="cl-lines" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id={`${marker}-now`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0L8 4L0 8z" fill="var(--cl-red)" />
              </marker>
              <marker id={`${marker}-past`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0 0L8 4L0 8z" fill="var(--cl-maroon)" />
              </marker>
            </defs>
            {lines.map((line) => (
              <g key={line.key}>
                <path d={line.d} fill="none" stroke="var(--cl-page)" strokeWidth={line.width + 3} strokeLinejoin="round" opacity={line.kind === "all" ? 0.6 : 0.9} />
                <path
                  d={line.d}
                  fill="none"
                  strokeWidth={line.width}
                  strokeLinejoin="round"
                  pathLength={line.kind === "now" ? 1 : undefined}
                  className={line.kind === "now" ? "cl-reveal" : undefined}
                  style={STROKE[line.kind]}
                  markerEnd={line.kind === "now" ? `url(#${marker}-now)` : line.kind === "past" ? `url(#${marker}-past)` : undefined}
                />
              </g>
            ))}
            {now && journey && (
              <g className="cl-callno" transform={`translate(${mx} ${my})`}>
                <circle r={11} fill="var(--cl-red)" stroke="var(--cl-page)" strokeWidth={2} />
                <text textAnchor="middle" dy="0.35em">
                  {journey.current + 1}
                </text>
              </g>
            )}
          </svg>
          {ordered.map((box) => {
            const { system, x, y, w, h } = box;
            const total = degrees.get(system.id)?.total ?? 0;
            const partner = partners.get(system.id);
            const lit = journey?.lit.has(system.id) ?? false;
            const classes = ["cl-sys", system.external ? "external" : "", partner ? "partner" : "", lit ? "lit" : "", involved.has(system.id) ? "current" : "", journey?.entry === system.id ? "entry" : ""]
              .filter(Boolean)
              .join(" ");
            const facts = [
              system.external ? "external" : "",
              system.proposedMove ? `placement proposed, from ${system.proposedMove.from}` : "",
              partner ? `${plural(partner, "call")} with the selected system` : "",
              journey ? (lit ? "in this journey" : "not in this journey") : plural(total, "integration"),
            ].filter(Boolean);
            return (
              <button
                key={system.id}
                ref={(element) => {
                  if (element) buttons.current.set(system.id, element);
                  else buttons.current.delete(system.id);
                }}
                type="button"
                className={classes}
                style={{ left: x, top: y, width: w, height: h }}
                tabIndex={system.id === tabStop ? 0 : -1}
                aria-pressed={journey ? undefined : selected === system.id}
                aria-label={`${system.name}: ${facts.join(", ")}`}
                title={system.name}
                onFocus={() => setFocusId(system.id)}
                onKeyDown={keyDown(box)}
                onClick={() => onSelect(journey ? system.id : selected === system.id ? null : system.id)}
              >
                <em translate="no">{system.name}</em>
                {!journey && (partner ?? total) > 0 && <b>{partner ?? total}</b>}
                {!journey && total > 0 && (
                  <i className="cl-deg" aria-hidden="true">
                    <i style={{ width: `${(total / maxDegree) * 100}%` }} />
                  </i>
                )}
                {system.proposedMove && <i className="cl-flag" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
