/**
 * The TAM wheel: the SMB estate as the TM Forum application map drawn round
 * its integration layer. The domains sit on the rim as arcs, each split into
 * its functional groups; every system is a point on the ring with its name
 * reading outwards; the integration layer (TIBCO, B2B BFF) is the hub. The
 * calls between systems are bundled through the hierarchy (system → group →
 * domain → hub), so the estate's shape reads at a glance and one system's
 * links stand out when it is picked or pointed at.
 *
 * Keyboard: the wheel is one tab stop; arrow keys move round it, Home/End
 * jump to the first/last system, Enter or Space picks, Escape clears.
 */
import { type KeyboardEvent, memo, useMemo, useRef, useState } from "react";

import type { CatalogueData } from "../../architecture/adapter";
import type { System } from "../../architecture/model";
import { plural, shortFunction } from "./labUtil";

const SIZE = 880;
const R = 236; // the ring the systems sit on
const BAND_IN = R + 158; // the domain band
const BAND_OUT = BAND_IN + 12;
const HUB = 58;
const ORDER = [
  "market-sales",
  "product",
  "customer",
  "service",
  "resource",
  "engaged-party",
  "enterprise",
];
const TONE: Record<string, string> = {
  "market-sales": "market",
  product: "product",
  customer: "customer",
  service: "service",
  resource: "resource",
  "engaged-party": "party",
  enterprise: "enterprise",
};

type Pt = [number, number];
type Node = {
  system: System;
  angle: number;
  group: string;
  domain: string;
  at: Pt;
  hub?: boolean;
};
type Arc = {
  id: string;
  name: string;
  from: number;
  to: number;
  count: number;
};

const polar = (r: number, angle: number): Pt => [
  r * Math.sin(angle),
  -r * Math.cos(angle),
];
const deg = (angle: number) => (angle * 180) / Math.PI;

/** d3's curveBundle: the control points pulled towards the straight line, then a uniform B-spline through them. */
function bundle(points: Pt[], beta = 0.82): string {
  const n = points.length - 1;
  const [x0, y0] = points[0] as Pt;
  const [xn, yn] = points[n] as Pt;
  const pulled = points.map(([x, y], i): Pt => [
    beta * x + (1 - beta) * (x0 + ((xn - x0) * i) / n),
    beta * y + (1 - beta) * (y0 + ((yn - y0) * i) / n),
  ]);
  let d = "";
  let a: Pt = [0, 0];
  let b: Pt = [0, 0];
  const curve = ([x, y]: Pt) => {
    d += `C${((2 * a[0] + b[0]) / 3).toFixed(1)} ${((2 * a[1] + b[1]) / 3).toFixed(1)} ${((a[0] + 2 * b[0]) / 3).toFixed(1)} ${((a[1] + 2 * b[1]) / 3).toFixed(1)} ${((a[0] + 4 * b[0] + x) / 6).toFixed(1)} ${((a[1] + 4 * b[1] + y) / 6).toFixed(1)}`;
  };
  pulled.forEach((p, i) => {
    if (i === 0) d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    else if (i === 2) {
      d += `L${((5 * a[0] + b[0]) / 6).toFixed(1)} ${((5 * a[1] + b[1]) / 6).toFixed(1)}`;
      curve(p);
    } else if (i > 2) curve(p);
    a = b;
    b = p;
  });
  if (pulled.length === 2) d += `L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  else if (pulled.length > 2) {
    curve(b);
    d += `L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return d;
}

/** An arc's path, drawn so its label reads upright whichever half of the wheel it is on. */
function arcPath(r: number, from: number, to: number, upright = false): string {
  const bottom =
    upright &&
    (from + to) / 2 > Math.PI / 2 &&
    (from + to) / 2 < (3 * Math.PI) / 2;
  const [a, b] = bottom ? [to, from] : [from, to];
  const [x1, y1] = polar(r, a);
  const [x2, y2] = polar(r, b);
  const large = Math.abs(to - from) > Math.PI ? 1 : 0;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${large} ${bottom ? 0 : 1} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function bandPath(from: number, to: number): string {
  const [ax, ay] = polar(BAND_OUT, from);
  const [bx, by] = polar(BAND_OUT, to);
  const [cx, cy] = polar(BAND_IN, to);
  const [dx, dy] = polar(BAND_IN, from);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${ax} ${ay}A${BAND_OUT} ${BAND_OUT} 0 ${large} 1 ${bx} ${by}L${cx} ${cy}A${BAND_IN} ${BAND_IN} 0 ${large} 0 ${dx} ${dy}Z`;
}

function short(name: string, max = 24): string {
  return name.length <= max ? name : `${name.slice(0, max - 1).trimEnd()}…`;
}

type Props = {
  data: CatalogueData;
  label: string;
  linkCounts: Map<string, number>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** A domain to bring forward, from the side panel or its band. */
  focusDomain: string | null;
  onFocusDomain: (id: string | null) => void;
};

export const TamWheel = memo(function TamWheel({
  data,
  label,
  linkCounts,
  selected,
  onSelect,
  focusDomain,
  onFocusDomain,
}: Props) {
  const [hot, setHot] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGGElement>());

  const layout = useMemo(() => {
    const domains = ORDER.map((id) =>
      data.domains.find((domain) => domain.id === id),
    ).filter((domain) => domain !== undefined);
    const extra = data.domains.filter(
      (domain) => !ORDER.includes(domain.id) && domain.id !== "integration",
    );
    const rim = [...domains, ...extra].map((domain) => ({
      domain,
      groups: domain.groups
        .map((group) => ({
          group,
          systems: data.systems.filter(
            (system) =>
              system.domain === domain.id && system.group === group.id,
          ),
        }))
        .filter((item) => item.systems.length),
    }));
    const loose = (id: string) =>
      data.systems.filter(
        (system) =>
          system.domain === id &&
          !data.domains
            .find((domain) => domain.id === id)
            ?.groups.some((group) => group.id === system.group),
      );
    for (const item of rim) {
      const rest = loose(item.domain.id);
      if (rest.length)
        item.groups.push({
          group: { id: `${item.domain.id}-other`, name: "Other" },
          systems: rest,
        });
    }
    const filled = rim.filter((item) => item.groups.length);
    // Angle units: one per system, a little air between groups, more between domains.
    const GROUP_GAP = 0.7;
    const DOMAIN_GAP = 2.2;
    const units = filled.reduce(
      (sum, item) =>
        sum +
        item.groups.reduce((s, g) => s + g.systems.length, 0) +
        (item.groups.length - 1) * GROUP_GAP +
        DOMAIN_GAP,
      0,
    );
    const step = (2 * Math.PI) / units;
    const nodes: Node[] = [];
    const domainArcs: Arc[] = [];
    const groupArcs: (Arc & { domain: string })[] = [];
    let u = DOMAIN_GAP / 2;
    for (const { domain, groups } of filled) {
      const start = u;
      groups.forEach(({ group, systems }, index) => {
        if (index) u += GROUP_GAP;
        const gStart = u;
        for (const system of systems) {
          const angle = (u + 0.5) * step;
          nodes.push({
            system,
            angle,
            group: group.id,
            domain: domain.id,
            at: polar(R, angle),
          });
          u += 1;
        }
        groupArcs.push({
          id: group.id,
          name: group.name,
          from: gStart * step,
          to: u * step,
          count: systems.length,
          domain: domain.id,
        });
      });
      domainArcs.push({
        id: domain.id,
        name: domain.name,
        from: start * step,
        to: u * step,
        count: groups.reduce((s, g) => s + g.systems.length, 0),
      });
      u += DOMAIN_GAP;
    }
    const hubSystems = data.systems.filter(
      (system) => system.domain === "integration",
    );
    hubSystems.forEach((system, index) => {
      const y = (index - (hubSystems.length - 1) / 2) * 26;
      nodes.push({
        system,
        angle: 0,
        group: "hub",
        domain: "integration",
        at: [0, y],
        hub: true,
      });
    });
    return { nodes, domainArcs, groupArcs, step };
  }, [data]);

  const byId = useMemo(
    () => new Map(layout.nodes.map((node) => [node.system.id, node])),
    [layout],
  );
  const groupMid = useMemo(
    () =>
      new Map(layout.groupArcs.map((arc) => [arc.id, (arc.from + arc.to) / 2])),
    [layout],
  );
  const domainMid = useMemo(
    () =>
      new Map(
        layout.domainArcs.map((arc) => [arc.id, (arc.from + arc.to) / 2]),
      ),
    [layout],
  );

  const edges = useMemo(() => {
    const out: { key: string; a: string; b: string; d: string }[] = [];
    const climb = (node: Node): Pt[] => {
      if (node.hub) return [node.at];
      return [
        polar(R - 6, node.angle),
        polar(R * 0.7, groupMid.get(node.group) ?? node.angle),
        polar(R * 0.4, domainMid.get(node.domain) ?? node.angle),
      ];
    };
    for (const key of linkCounts.keys()) {
      const [a = "", b = ""] = key.split("~");
      const na = byId.get(a);
      const nb = byId.get(b);
      if (!na || !nb) continue;
      let points: Pt[];
      if (!na.hub && !nb.hub && na.group === nb.group)
        points = [
          polar(R - 6, na.angle),
          polar(R * 0.72, groupMid.get(na.group) ?? na.angle),
          polar(R - 6, nb.angle),
        ];
      else if (!na.hub && !nb.hub && na.domain === nb.domain)
        points = [
          ...climb(na).slice(0, 2),
          polar(R * 0.48, domainMid.get(na.domain) ?? na.angle),
          ...climb(nb).slice(0, 2).reverse(),
        ];
      else {
        const up = climb(na);
        const down = climb(nb).reverse();
        points = na.hub || nb.hub ? [...up, ...down] : [...up, [0, 0], ...down];
      }
      out.push({ key, a, b, d: bundle(points) });
    }
    return out;
  }, [linkCounts, byId, groupMid, domainMid]);

  const partners = useMemo(() => {
    const found = new Set<string>();
    const centre = selected ?? hot;
    if (!centre) return found;
    for (const key of linkCounts.keys()) {
      const [a = "", b = ""] = key.split("~");
      if (a === centre) found.add(b);
      else if (b === centre) found.add(a);
    }
    return found;
  }, [selected, hot, linkCounts]);

  const centre = selected ?? hot;
  const ordered = layout.nodes;
  const tabStop = focusId ?? selected ?? ordered[0]?.system.id ?? null;
  const move = (id: string, by: number | "first" | "last") => {
    const index = ordered.findIndex((node) => node.system.id === id);
    const next =
      by === "first"
        ? ordered[0]
        : by === "last"
          ? ordered.at(-1)
          : ordered[(index + by + ordered.length) % ordered.length];
    if (!next) return;
    setFocusId(next.system.id);
    refs.current.get(next.system.id)?.focus();
  };
  const keyDown = (id: string) => (event: KeyboardEvent<SVGGElement>) => {
    const keys: Record<string, number | "first" | "last"> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: "first",
      End: "last",
    };
    if (event.key in keys) {
      event.preventDefault();
      move(id, keys[event.key] as number | "first" | "last");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(selected === id ? null : id);
    } else if (event.key === "Escape" && selected) {
      event.preventDefault();
      onSelect(null);
    }
  };

  const state = (node: Node) => {
    const id = node.system.id;
    if (id === selected) return "is-selected";
    if (centre && id === centre) return "is-hot";
    if (centre) return partners.has(id) ? "is-partner" : "is-quiet";
    if (focusDomain) return node.domain === focusDomain ? "" : "is-quiet";
    return "";
  };
  const edgeState = (a: string, b: string) => {
    if (centre) return a === centre || b === centre ? "is-on" : "is-off";
    if (focusDomain)
      return byId.get(a)?.domain === focusDomain ||
        byId.get(b)?.domain === focusDomain
        ? "is-on is-soft"
        : "is-off";
    return "";
  };

  // A hover card for the system pointed at, beside its dot (names on the ring can be cut short).
  const tip = hot && hot !== selected ? byId.get(hot) : undefined;
  const tipAt = tip ? (tip.hub ? tip.at : polar(R, tip.angle)) : null;

  return (
    <div className="tw-scroll">
      <div className="tw" translate="no">
        {tip && tipAt && (
          <div
            className="tw-tip"
            style={{
              left: `${((tipAt[0] + SIZE / 2) / SIZE) * 100}%`,
              top: `${((tipAt[1] + SIZE / 2) / SIZE) * 100}%`,
            }}
            aria-hidden="true"
          >
            <strong>{tip.system.name}</strong>
            <span>
              {data.domains.find((domain) => domain.id === tip.domain)?.name}
              {tip.hub
                ? ""
                : ` › ${layout.groupArcs.find((arc) => arc.id === tip.group)?.name ?? ""}`}
            </span>
            {tip.system.function && (
              <span>{shortFunction(tip.system.function)}</span>
            )}
          </div>
        )}
        <svg
          className={`tw-svg${centre || focusDomain ? " is-focused" : ""}`}
          viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
          role="group"
          aria-label={`${label}: ${plural(data.systems.length, "system")} in ${plural(layout.domainArcs.length, "domain")} round the integration layer. Arrow keys move round the wheel.`}
          onPointerLeave={() => setHot(null)}
        >
          <defs>
            {layout.domainArcs.map((arc) => (
              <path
                key={arc.id}
                id={`tw-label-${arc.id}`}
                d={arcPath(BAND_OUT + 14, arc.from, arc.to, true)}
              />
            ))}
          </defs>
          <circle className="tw-guide" r={R} />
          <circle className="tw-guide tw-guide--inner" r={R * 0.4} />
          {layout.domainArcs.map((arc) => {
            const quiet = focusDomain !== null && focusDomain !== arc.id;
            return (
              <g
                key={arc.id}
                className={`tw-domain tw-domain--${TONE[arc.id] ?? "enterprise"}${quiet ? " is-quiet" : ""}${focusDomain === arc.id ? " is-on" : ""}`}
                onClick={() =>
                  onFocusDomain(focusDomain === arc.id ? null : arc.id)
                }
                aria-hidden="true"
              >
                <path
                  className="tw-sector"
                  d={`M0 0L${polar(BAND_IN, arc.from).join(" ")}A${BAND_IN} ${BAND_IN} 0 ${arc.to - arc.from > Math.PI ? 1 : 0} 1 ${polar(BAND_IN, arc.to).join(" ")}Z`}
                />
                <path className="tw-band" d={bandPath(arc.from, arc.to)} />
                <text
                  className="tw-domain-name"
                  dy={
                    (arc.from + arc.to) / 2 > Math.PI / 2 &&
                    (arc.from + arc.to) / 2 < (3 * Math.PI) / 2
                      ? 9
                      : 0
                  }
                >
                  <textPath
                    href={`#tw-label-${arc.id}`}
                    startOffset="50%"
                    textAnchor="middle"
                  >
                    {arc.name.toUpperCase()} · {arc.count}
                  </textPath>
                </text>
              </g>
            );
          })}
          {layout.groupArcs.map((arc) => (
            <path
              key={arc.id}
              className={`tw-group tw-group--${TONE[arc.domain] ?? "enterprise"}`}
              d={arcPath(
                R + 8,
                arc.from + layout.step * 0.12,
                arc.to - layout.step * 0.12,
              )}
              aria-hidden="true"
            >
              <title>{arc.name}</title>
            </path>
          ))}
          <g className="tw-edges" aria-hidden="true">
            {edges.map((edge) => (
              <path
                key={edge.key}
                className={`tw-edge ${edgeState(edge.a, edge.b)}`}
                d={edge.d}
              />
            ))}
          </g>
          <circle className="tw-hub" r={HUB} aria-hidden="true" />
          <text
            className="tw-hub-name"
            y={-HUB - 10}
            textAnchor="middle"
            aria-hidden="true"
          >
            INTEGRATION LAYER
          </text>
          {layout.nodes.map((node) => {
            const { system } = node;
            const id = system.id;
            const flip = !node.hub && node.angle > Math.PI;
            const facts = [
              data.domains.find((domain) => domain.id === node.domain)?.name,
              layout.groupArcs.find((arc) => arc.id === node.group)?.name,
              system.external ? "external" : "",
              system.proposedMove
                ? `placement proposed, from ${system.proposedMove.from}`
                : "",
              partners.has(id) && selected
                ? "linked to the selected system"
                : "",
            ].filter(Boolean);
            return (
              <g
                key={id}
                ref={(element) => {
                  if (element) refs.current.set(id, element);
                  else refs.current.delete(id);
                }}
                className={`tw-node ${state(node)}${system.external ? " is-external" : ""}${node.hub ? " is-hub" : ""}${focusId === id ? " has-focus" : ""}`}
                role="button"
                tabIndex={id === tabStop ? 0 : -1}
                aria-pressed={selected === id}
                aria-label={`${system.name}: ${facts.join(", ")}`}
                onFocus={() => setFocusId(id)}
                onBlur={() =>
                  setFocusId((value) => (value === id ? null : value))
                }
                onPointerEnter={() => setHot(id)}
                onClick={() => onSelect(selected === id ? null : id)}
                onKeyDown={keyDown(id)}
              >
                {node.hub ? (
                  <g transform={`translate(${node.at[0]} ${node.at[1]})`}>
                    <rect
                      className="tw-pill"
                      x={-46}
                      y={-11}
                      width={92}
                      height={22}
                      rx={11}
                    />
                    <text className="tw-label" textAnchor="middle" dy="0.35em">
                      {system.name}
                    </text>
                  </g>
                ) : (
                  <g transform={`rotate(${deg(node.angle) - 90})`}>
                    <rect
                      className="tw-hit"
                      x={R - 8}
                      y={-9}
                      width={150}
                      height={18}
                      rx={3}
                    />
                    <circle className="tw-dot" cx={R} cy={0} r={4.5} />
                    {system.proposedMove && (
                      <circle className="tw-flag" cx={R} cy={0} r={8} />
                    )}
                    <text
                      className="tw-label"
                      x={flip ? -(R + 14) : R + 14}
                      dy="0.35em"
                      textAnchor={flip ? "end" : "start"}
                      transform={flip ? "rotate(180)" : undefined}
                    >
                      {short(system.name)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});
