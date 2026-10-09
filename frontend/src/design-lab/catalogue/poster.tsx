/**
 * The poster component: draws a layout from posterModel.ts, with every link
 * faint (the landscape) or one journey's calls numbered (a product's footprint).
 */
import { type CSSProperties, useMemo } from "react";

import type { Integration } from "../../architecture/model";
import { elbow, partnersOf, type PosterLayout } from "./posterModel";

type Lit = { order: number; channelEntry?: boolean };

export function Poster({
  layout,
  linkCounts,
  counts,
  selected,
  onSelect,
  lit,
  calls,
  current,
  label,
}: {
  layout: PosterLayout;
  linkCounts: Map<string, number>;
  counts: Map<string, number>;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Journey mode: the systems the journey reaches, numbered in the order it reaches them. */
  lit?: Map<string, Lit>;
  /** Journey mode: the calls in order, drawn as numbered connectors. */
  calls?: Integration[];
  current?: number;
  label: string;
}) {
  const partners = useMemo(() => new Map(selected ? partnersOf(selected, linkCounts).map((item) => [item.id, item.count]) : []), [selected, linkCounts]);
  const journeyMode = Boolean(lit);
  const box = (id?: string) => (id ? layout.boxes.get(id) : undefined);

  const lines: { d: string; key: string; className: string; width: number }[] = [];
  if (journeyMode && calls) {
    calls.forEach((call, index) => {
      const hops: [string | undefined, string | undefined][] = call.via ? [[call.from, call.via], [call.via, call.to]] : [[call.from, call.to]];
      for (const [a, b] of hops) {
        const from = box(a);
        const to = box(b);
        if (!from || !to || from === to) continue;
        const now = index === current;
        lines.push({ d: elbow(from, to), key: `${call.id}-${a}-${b}`, className: now ? "now" : "call", width: now ? 3.5 : 1.6 });
      }
    });
  } else {
    for (const [key, count] of linkCounts) {
      const [a = "", b = ""] = key.split("~");
      const from = box(a);
      const to = box(b);
      if (!from || !to) continue;
      const mine = selected !== null && (a === selected || b === selected);
      lines.push({ d: elbow(from, to), key, className: mine ? "mine" : selected ? "other" : "all", width: mine ? 1.5 + Math.min(count, 4) * 0.6 : 1 + Math.min(count, 4) * 0.25 });
    }
    lines.sort((x, y) => (x.className === "mine" ? 1 : 0) - (y.className === "mine" ? 1 : 0));
  }
  const stroke: Record<string, CSSProperties> = {
    all: { stroke: "var(--cl-ink-2)", opacity: 0.28 },
    other: { stroke: "var(--cl-ink-2)", opacity: 0.1 },
    mine: { stroke: "var(--cl-maroon)", opacity: 0.95 },
    call: { stroke: "var(--cl-maroon)", opacity: 0.55 },
    now: { stroke: "var(--cl-red)", opacity: 1 },
  };

  return (
    <div className="cl-poster-scroll" role="region" aria-label={`${label} (scrolls sideways when narrow)`} tabIndex={0}>
      <div className={`cl-poster${journeyMode || selected ? " dim" : ""}`} style={{ width: layout.width, height: layout.height }}>
        {layout.bands.map((band) => (
          <div key={band.id} className={`cl-band ${band.id}`} style={{ left: band.x, top: band.y, width: band.w, height: band.h }}>
            <span>
              {band.name}
              <small>{band.count}</small>
            </span>
          </div>
        ))}
        <svg className="cl-lines" width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="cl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L8 4L0 8z" fill="var(--cl-red)" />
            </marker>
          </defs>
          {lines.map((line) => (
            <path key={line.key} d={line.d} fill="none" strokeWidth={line.width} strokeLinejoin="round" style={stroke[line.className]} markerEnd={line.className === "now" ? "url(#cl-arrow)" : undefined} />
          ))}
        </svg>
        {[...layout.boxes.values()].map(({ system, x, y, w, h }) => {
          const count = counts.get(system.id) ?? 0;
          const partner = partners.get(system.id);
          const litEntry = lit?.get(system.id);
          const isCurrent = journeyMode && calls && current !== undefined && calls[current] && [calls[current].from, calls[current].to, calls[current].via].includes(system.id);
          const classes = ["cl-sys", system.external ? "external" : "", partner ? "partner" : "", litEntry ? "lit" : "", isCurrent ? "current" : ""].filter(Boolean).join(" ");
          const described = [system.external ? "external system" : "", system.proposedMove ? `placement proposed (from ${system.proposedMove.from})` : "", litEntry ? `step ${litEntry.order} in this journey` : "", `${count} integrations`].filter(Boolean).join(", ");
          return (
            <button
              key={system.id}
              type="button"
              className={classes}
              style={{ left: x, top: y, width: w, height: h }}
              aria-pressed={selected === system.id}
              aria-label={`${system.name}, ${described}`}
              title={system.name}
              onClick={() => onSelect(system.id)}
            >
              {litEntry && <span className="cl-order" aria-hidden="true">{litEntry.order}</span>}
              <em>{system.name}</em>
              {partner ? <b>{partner}</b> : !journeyMode && count > 0 ? <b>{count}</b> : null}
              {system.proposedMove && <i className="cl-flag" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
