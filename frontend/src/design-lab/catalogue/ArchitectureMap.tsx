/**
 * The architecture map: the SMB estate as a TAM layer map. Each layer is a
 * block with its number, name and scope; inside it, its functional groups as
 * columns of system cards. The integration layer is drawn as the bus the
 * blocks hang from. Links are soft curves measured from the cards themselves,
 * drawn only for what is asked: the selected system's partners, every link on
 * request, or a journey's calls so far.
 *
 * Product mode lights the product's footprint in three calm tiers (core, used,
 * carries only) and names each system's role for the product; the rest stays
 * quiet but readable.
 *
 * Keyboard: the map is one tab stop; arrow keys move between systems by
 * position, Home/End jump to the first/last, Escape clears the selection.
 */
import { type CSSProperties, type KeyboardEvent, memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { CatalogueData } from "../../architecture/adapter";
import type { Integration, StepRole, System, TamDomain } from "../../architecture/model";
import { plural, shortFunction } from "./labUtil";

/** Which layers share a row, top to bottom; the integration layer runs between them as a bus. */
const ROWS: string[][] = [["market-sales", "product"], ["customer"], ["integration"], ["service", "resource"], ["engaged-party", "enterprise"]];

/** Short role names for a card; the inspector uses the long ones. */
const ROLE_SHORT: Record<StepRole, string> = {
  capture: "Captures",
  catalog: "Catalogue",
  "customer-data": "Customer data",
  orchestrate: "Orchestrates",
  validate: "Validates",
  activate: "Activates",
  field: "Field work",
  logistics: "Logistics",
  track: "Tracks",
  notify: "Notifies",
  bill: "Bills",
  record: "Records",
};

export type Foot = { tier: "core" | "used" | "carries"; roles: StepRole[]; journeys: number };

type Rect = { x: number; y: number; w: number; h: number };
type Line = { key: string; d: string; kind: "all" | "mine" | "past" | "now"; mid: [number, number] };

/** A soft curve between two cards, leaving and entering on the facing edges. */
function curve(a: Rect, b: Rect): { d: string; mid: [number, number] } {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  let p0: [number, number];
  let p3: [number, number];
  let c1: [number, number];
  let c2: [number, number];
  if (Math.abs(by - ay) > Math.abs(bx - ax) * 0.5) {
    const down = by > ay;
    p0 = [ax, down ? a.y + a.h : a.y];
    p3 = [bx, down ? b.y : b.y + b.h];
    const k = Math.max(28, Math.abs(p3[1] - p0[1]) * 0.5) * (down ? 1 : -1);
    c1 = [p0[0], p0[1] + k];
    c2 = [p3[0], p3[1] - k];
  } else {
    const right = bx > ax;
    p0 = [right ? a.x + a.w : a.x, ay];
    p3 = [right ? b.x : b.x + b.w, by];
    const k = Math.max(28, Math.abs(p3[0] - p0[0]) * 0.5) * (right ? 1 : -1);
    c1 = [p0[0] + k, p0[1]];
    c2 = [p3[0] - k, p3[1]];
  }
  const mid: [number, number] = [(p0[0] + 3 * c1[0] + 3 * c2[0] + p3[0]) / 8, (p0[1] + 3 * c1[1] + 3 * c2[1] + p3[1]) / 8];
  return { d: `M${p0[0]} ${p0[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p3[0]} ${p3[1]}`, mid };
}

/** The card to move to from `from` in a direction: nearest along the axis, closest across it. */
function neighbour(rects: [string, Rect][], from: Rect, key: string): string | undefined {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const horizontal = key === "ArrowRight" || key === "ArrowLeft";
  let best: string | undefined;
  let score = Infinity;
  for (const [id, rect] of rects) {
    const dx = rect.x + rect.w / 2 - cx;
    const dy = rect.y + rect.h / 2 - cy;
    const ok = key === "ArrowRight" ? dx > 4 : key === "ArrowLeft" ? dx < -4 : key === "ArrowDown" ? dy > 4 : dy < -4;
    if (!ok) continue;
    const value = (horizontal ? Math.abs(dx) : Math.abs(dy)) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 2.5;
    if (value < score) {
      score = value;
      best = id;
    }
  }
  return best;
}

type Props = {
  data: CatalogueData;
  label: string;
  linkCounts: Map<string, number>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Draw every link, not only the selected system's. */
  showLinks?: boolean;
  /** Keep one layer in focus; the others go quiet. */
  focusLayer?: string | null;
  /** Product mode: the product's footprint, by system. */
  footprint?: Map<string, Foot>;
  /** Journey mode: the systems the journey reaches, its calls in order, the current one. */
  journey?: { lit: Set<string>; entry?: string; calls: Integration[]; current: number };
};

export const ArchitectureMap = memo(function ArchitectureMap({ data, label, linkCounts, selected, onSelect, showLinks = false, focusLayer = null, footprint, journey }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const marker = useId().replace(/:/g, "");
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [focusId, setFocusId] = useState<string | null>(null);

  const domains = useMemo(() => new Map(data.domains.map((domain) => [domain.id, domain])), [data]);
  const bySystem = useMemo(() => {
    const map = new Map<string, System[]>();
    for (const system of data.systems) map.set(system.domain, [...(map.get(system.domain) ?? []), system]);
    return map;
  }, [data]);
  const rows = useMemo(() => {
    const named = new Set(ROWS.flat());
    return [...ROWS.map((row) => row.filter((id) => bySystem.has(id))), ...data.domains.filter((domain) => !named.has(domain.id) && bySystem.has(domain.id)).map((domain) => [domain.id])].filter((row) => row.length);
  }, [bySystem, data]);
  const numbers = useMemo(() => new Map(rows.flat().filter((id) => id !== "integration").map((id, index) => [id, String(index + 1).padStart(2, "0")])), [rows]);
  const order = useMemo(() => rows.flat().flatMap((id) => bySystem.get(id) ?? []), [rows, bySystem]);

  // Measure every card against the map, so curves meet the cards wherever the layout put them.
  const measure = useCallback(() => {
    const host = box.current;
    if (!host) return;
    const origin = host.getBoundingClientRect();
    const next = new Map<string, Rect>();
    for (const [id, element] of cards.current) {
      const r = element.getBoundingClientRect();
      next.set(id, { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    }
    setRects(next);
    setSize({ w: origin.width, h: origin.height });
  }, []);
  useLayoutEffect(() => {
    measure();
    const host = box.current;
    const observer = typeof ResizeObserver === "undefined" || !host ? null : new ResizeObserver(measure);
    if (host) observer?.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, footprint, journey?.lit]);

  const partners = useMemo(() => {
    const found = new Map<string, number>();
    if (!selected || journey) return found;
    for (const [key, count] of linkCounts) {
      const [a = "", b = ""] = key.split("~");
      if (a === selected) found.set(b, count);
      else if (b === selected) found.set(a, count);
    }
    return found;
  }, [selected, journey, linkCounts]);

  const lines = useMemo(() => {
    const out: Line[] = [];
    const at = (id?: string) => (id ? rects.get(id) : undefined);
    if (journey) {
      journey.calls.slice(0, journey.current + 1).forEach((call, index) => {
        const hops: [string | undefined, string | undefined][] = call.via ? [[call.from, call.via], [call.via, call.to]] : [[call.from, call.to]];
        const now = index === journey.current;
        for (const [a, b] of hops) {
          const from = at(a);
          const to = at(b);
          if (!from || !to || a === b) continue;
          const { d, mid } = curve(from, to);
          out.push({ key: `${call.id}-${a}-${b}${now ? "-now" : ""}`, d, kind: now ? "now" : "past", mid });
        }
      });
      return out;
    }
    for (const key of linkCounts.keys()) {
      const [a = "", b = ""] = key.split("~");
      const mine = selected !== null && (a === selected || b === selected);
      if (!mine && !showLinks) continue;
      const from = at(mine && b === selected ? b : a);
      const to = at(mine && b === selected ? a : b);
      if (!from || !to) continue;
      out.push({ key, ...curve(from, to), kind: mine ? "mine" : "all" });
    }
    return out.sort((x, y) => Number(x.kind === "mine") - Number(y.kind === "mine"));
  }, [rects, journey, linkCounts, selected, showLinks]);
  const now = journey ? lines.filter((line) => line.kind === "now").at(-1) : undefined;

  const call = journey?.calls[journey.current];
  const involved = new Set(call ? [call.from, call.to, call.via].filter((id): id is string => Boolean(id)) : []);
  const tabStop = focusId && cards.current.has(focusId) ? focusId : selected && bySystem.size ? selected : (order[0]?.id ?? null);

  const keyDown = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    let target: string | undefined;
    if (event.key.startsWith("Arrow")) {
      const live = [...cards.current].map(([key, element]): [string, Rect] => {
        const r = element.getBoundingClientRect();
        return [key, { x: r.left, y: r.top, w: r.width, h: r.height }];
      });
      const from = live.find(([key]) => key === id)?.[1];
      target = from ? neighbour(live, from, event.key) : undefined;
    } else if (event.key === "Home") target = order[0]?.id;
    else if (event.key === "End") target = order.at(-1)?.id;
    else if (event.key === "Escape" && !journey && selected) {
      event.preventDefault();
      onSelect(null);
      return;
    } else return;
    event.preventDefault();
    if (!target) return;
    setFocusId(target);
    cards.current.get(target)?.focus();
  };

  const quietMode = Boolean(journey || footprint || selected || focusLayer);
  const usedIn = (id: string) => (journey ? journey.lit.has(id) : footprint ? footprint.has(id) : false);

  const card = (system: System, domain: TamDomain | undefined) => {
    const foot = footprint?.get(system.id);
    const lit = journey?.lit.has(system.id) ?? false;
    const partner = partners.get(system.id);
    const isSelected = !journey && selected === system.id;
    const inFocus = focusLayer ? system.domain === focusLayer : true;
    const quiet = quietMode && !isSelected && !partner && !lit && !foot && !(focusLayer && inFocus && !selected);
    const classes = [
      "am-card",
      system.external ? "is-external" : "",
      foot ? `is-${foot.tier}` : "",
      lit ? "is-lit" : "",
      partner ? "is-partner" : "",
      involved.has(system.id) ? "is-current" : "",
      quiet ? "is-quiet" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const group = domain?.groups.find((item) => item.id === system.group);
    const caption = foot && foot.roles.length ? foot.roles.slice(0, 2).map((role) => ROLE_SHORT[role]).join(" · ") : foot?.tier === "carries" ? "Carries calls" : shortFunction(system.function || group?.name || "");
    const facts = [
      domain?.name,
      group?.name,
      system.external ? "external" : "",
      system.proposedMove ? `placement proposed, from ${system.proposedMove.from}` : "",
      partner ? `${plural(partner, "call")} with the selected system` : "",
      foot ? `${foot.tier === "core" ? "core to" : foot.tier === "carries" ? "carries calls for" : "used by"} the product, in ${plural(foot.journeys, "journey")}` : footprint ? "not used by the product" : "",
      journey ? (lit ? "in this journey" : "not in this journey") : "",
    ].filter(Boolean);
    return (
      <button
        key={system.id}
        ref={(element) => {
          if (element) cards.current.set(system.id, element);
          else cards.current.delete(system.id);
        }}
        type="button"
        className={classes}
        tabIndex={system.id === tabStop ? 0 : -1}
        aria-pressed={journey ? undefined : isSelected}
        aria-label={`${system.name}: ${facts.join(", ")}`}
        onFocus={() => setFocusId(system.id)}
        onKeyDown={keyDown(system.id)}
        onClick={() => onSelect(journey ? system.id : isSelected ? null : system.id)}
      >
        <span className="am-card-name" translate="no">
          {system.name}
        </span>
        {caption && <span className="am-card-fn">{caption}</span>}
        {journey?.entry === system.id && <span className="am-tag">Entry</span>}
        {system.proposedMove && <i className="am-flag" aria-hidden="true" />}
      </button>
    );
  };

  const meter = (systems: System[]) => {
    const used = systems.filter((system) => usedIn(system.id)).length;
    return (
      <span className="am-meter" aria-label={`${used} of ${systems.length} used`}>
        <span aria-hidden="true">
          {systems.map((system) => (
            <i key={system.id} className={usedIn(system.id) ? "on" : undefined} />
          ))}
        </span>
        <b>
          {used}/{systems.length}
        </b>
      </span>
    );
  };

  const layer = (id: string, half: boolean) => {
    const domain = domains.get(id);
    const systems = bySystem.get(id) ?? [];
    const groups = (domain?.groups ?? []).map((group) => ({ ...group, systems: systems.filter((system) => system.group === group.id) })).filter((group) => group.systems.length);
    const loose = systems.filter((system) => !domain?.groups.some((group) => group.id === system.group));
    if (loose.length) groups.push({ id: `${id}-other`, name: "Other", systems: loose });
    const dim = focusLayer !== null && focusLayer !== id;
    return (
      <div key={id} className={`am-layer am-layer--${id}${half ? " am-layer--half" : ""}${dim ? " is-dim" : ""}`}>
        <div className="am-layer-head">
          <span className="am-layer-no" aria-hidden="true">
            {numbers.get(id)}
          </span>
          <span className="am-layer-name">{domain?.name ?? id}</span>
          <span className="am-layer-scope">{domain?.scope}</span>
          {journey || footprint ? meter(systems) : <span className="am-layer-count">{plural(systems.length, "system")}</span>}
        </div>
        <div className="am-groups">
          {groups.map((group) => (
            <div key={group.id} className="am-group" style={{ "--am-weight": group.systems.length } as CSSProperties}>
              <span className="am-group-name">{group.name}</span>
              <div className="am-cards">{group.systems.map((system) => card(system, domain))}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const bus = (id: string) => {
    const domain = domains.get(id);
    const systems = bySystem.get(id) ?? [];
    return (
      <div key={id} className={`am-bus${focusLayer && focusLayer !== id ? " is-dim" : ""}`}>
        <div className="am-bus-head">
          <span className="am-layer-name">{domain?.name ?? id}</span>
          <span className="am-layer-scope">{domain?.scope}</span>
        </div>
        <div className="am-bus-line">{systems.map((system) => card(system, domain))}</div>
      </div>
    );
  };

  return (
    <div ref={box} className={`am${quietMode ? " is-focused" : ""}`} role="group" aria-label={`${label}: ${plural(data.systems.length, "system")} in ${plural(rows.flat().length, "layer")}. Arrow keys move between them.`}>
      {rows.map((row) =>
        row.length === 1 && row[0] === "integration" ? (
          bus("integration")
        ) : (
          <div key={row.join("+")} className={`am-row${row.length > 1 ? " am-row--split" : ""}`}>
            {row.map((id) => layer(id, row.length > 1))}
          </div>
        ),
      )}
      <svg className="am-links" width={size.w} height={size.h} aria-hidden="true">
        <defs>
          <marker id={`${marker}-now`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" fill="var(--cl-red)" />
          </marker>
          <marker id={`${marker}-mine`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" fill="var(--cl-maroon)" />
          </marker>
        </defs>
        {lines.map((line) => (
          <g key={line.key} className={`am-line am-line--${line.kind}`}>
            <path className="halo" d={line.d} />
            <path className="ink" d={line.d} pathLength={1} markerEnd={line.kind === "now" ? `url(#${marker}-now)` : line.kind === "past" ? `url(#${marker}-mine)` : undefined} />
          </g>
        ))}
        {now && journey && (
          <g className="am-callno" transform={`translate(${now.mid[0]} ${now.mid[1]})`}>
            <circle r={11} />
            <text textAnchor="middle" dy="0.35em">
              {journey.current + 1}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
});
