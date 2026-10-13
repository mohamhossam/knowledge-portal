/**
 * A journey's three diagrams, laid out: the swimlane (one lane per system,
 * steps in step order), the flowchart (levels top to bottom along the flow)
 * and the stage timeline (phases left to right). Pure functions over the
 * journey payload; the views only draw what these return.
 *
 * Geometry is in CSS pixels, so the SVG arrows and the HTML boxes share one
 * coordinate space.
 */
import type { Journey, JourneyActivity } from "../../api/client";
import { orderedSteps, phaseRuns } from "../catalogue";

export type EdgeKind = "sequence" | "decision" | "loop" | "parallel" | "rejoin" | "handover";

/** One arrow of the flow, with what it says: the branch, and the interface it hands over by. */
export type FlowEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
  /** The branch or condition ("Covered"), as the source words it. */
  label: string | null;
  /** How the hand-over happens: the interface, or the interaction when no interface is named. */
  via: string | null;
};

/** When one channel is being read, who its entry system is. */
export type Entry = { channel: string; systemId: string | null };

const KINDS = new Set<EdgeKind>(["sequence", "decision", "loop", "parallel", "rejoin"]);
const MAIN_TRACK = "main";

function kindOf(kind: string): EdgeKind {
  const lower = kind.toLowerCase() as EdgeKind;
  return KINDS.has(lower) ? lower : "sequence";
}

/**
 * The flow the service derived (`edges`), or, when a journey carries none, the
 * same derivation done here (ADR-0096): each step to the next on its own track
 * unless a rule leaves it, every rule, and each parallel track back to where it
 * rejoins. Hand-overs between two steps that no arrow joins are added as their
 * own arrows. Arrows to steps the journey does not have are dropped.
 */
export function flowEdges(journey: Journey): FlowEdge[] {
  const steps = orderedSteps(journey);
  const known = new Set(steps.map((step) => step.number));
  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, kind: EdgeKind, label: string | null) => {
    const key = `${from}>${to}`;
    if (from === to || !known.has(from) || !known.has(to) || seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind, label: label?.trim() || null, via: null });
  };

  if (journey.edges.length) {
    for (const edge of journey.edges) add(edge.from_activity, edge.to_activity, kindOf(edge.kind), edge.kind === "rejoin" ? null : edge.label ?? null);
  } else {
    const leaving = new Set(journey.flow_rules.map((rule) => rule.from_activity));
    const tracks = new Map<string, JourneyActivity[]>();
    for (const step of steps) {
      const track = (step.track ?? MAIN_TRACK).toLowerCase();
      tracks.set(track, [...(tracks.get(track) ?? []), step]);
    }
    const lastOnTrack = new Map<string, string>();
    for (const run of tracks.values()) for (const step of run) lastOnTrack.set(step.number, run.at(-1)!.number);
    for (const run of tracks.values()) {
      run.forEach((step, index) => {
        const following = run[index + 1];
        if (following && !leaving.has(step.number)) add(step.number, following.number, "sequence", null);
      });
    }
    for (const rule of journey.flow_rules) {
      add(rule.from_activity, rule.to_activity, rule.kind, rule.condition ?? rule.branch ?? null);
      if (rule.kind === "parallel" && rule.rejoin_at) {
        const target = steps.find((step) => step.number === rule.to_activity);
        const main = !target?.track || target.track.toLowerCase() === MAIN_TRACK;
        add(main ? rule.to_activity : lastOnTrack.get(rule.to_activity) ?? rule.to_activity, rule.rejoin_at, "rejoin", null);
      }
    }
  }

  for (const link of journey.integrations) {
    if (link.from_activity === link.to_activity) continue;
    add(link.from_activity, link.to_activity, "handover", null);
    const edge = edges.find((item) => item.from === link.from_activity && item.to === link.to_activity);
    const via = link.interface ?? link.interaction ?? null;
    if (edge && via && !edge.via) edge.via = via;
  }
  return edges;
}

/** Where a step goes next, in words: "30 if Covered", "80 alongside", "rejoins at 90", "3 via RTF SR". */
export function nextWords(edges: FlowEdge[], number: string): string[] {
  return edges
    .filter((edge) => edge.from === number)
    .map((edge) => {
      const base =
        edge.kind === "rejoin" ? `rejoins at ${edge.to}`
          : edge.kind === "parallel" ? `${edge.to} alongside`
            : edge.kind === "loop" ? `back to ${edge.to}${edge.label ? ` if ${edge.label}` : ""}`
              : edge.kind === "handover" ? `hands over to ${edge.to}`
                : edge.label ? `${edge.to} if ${edge.label}` : edge.to;
      return edge.via ? `${base} via ${edge.via}` : base;
    });
}

// ── Who performs a step ──────────────────────────────────────────────────────

export type Performer =
  | { kind: "system"; key: string; systemId: string }
  /** A channel-entry step: the entry system, when one channel is read and names it. */
  | { kind: "entry"; key: string; systemId: string | null }
  | { kind: "none"; key: string; systemId: null };

export const NO_SYSTEM = "none";
export const ENTRY = "entry";

/** The step's performing system; the channel's entry system on a channel-entry step; or none named. */
export function performer(step: JourneyActivity, entry?: Entry): Performer {
  if (step.performing_system_id) return { kind: "system", key: `system:${step.performing_system_id}`, systemId: step.performing_system_id };
  if (step.channel_entry) {
    return entry?.systemId
      ? { kind: "entry", key: `system:${entry.systemId}`, systemId: entry.systemId }
      : { kind: "entry", key: ENTRY, systemId: null };
  }
  return { kind: "none", key: NO_SYSTEM, systemId: null };
}

/** A performer in words, for text and for the diagrams' accessible names. */
export function performerWords(who: Performer, systemName: (systemId: string) => string, entry?: Entry): string {
  if (who.systemId) return systemName(who.systemId);
  if (who.kind === "entry") return entry ? `The entry system of ${entry.channel}, not named` : "The channel’s entry system";
  return "No system named";
}

// ── Swimlane ─────────────────────────────────────────────────────────────────

export const LANE = {
  /** The lane-name column, drawn in HTML beside the SVG. */
  labelWidth: 176,
  column: 192,
  box: 160,
  height: 168,
  boxHeight: 144,
  /** Above the boxes: the channel loop-backs run along. */
  inset: 12,
  /** The phase row above the lanes. */
  phaseHeight: 40,
} as const;

export type Lane = {
  key: string;
  kind: "system" | "entry" | "none";
  systemId: string | null;
  /** Steps entered through the channel land in this system's lane. */
  entry: boolean;
  steps: string[];
};

export type PhaseSpan = { phase: string | null; start: number; span: number; again: boolean };

export type Box = { number: string; x: number; y: number; width: number; height: number };

export type Arrow = FlowEdge & { path: string; back: boolean };

export type Swimlane = {
  steps: JourneyActivity[];
  lanes: Lane[];
  /** Each step's lane index and column, by number. */
  place: Map<string, { lane: number; column: number }>;
  phases: PhaseSpan[];
  hasPhases: boolean;
  boxes: Box[];
  arrows: Arrow[];
  width: number;
  height: number;
};

/** One lane per performer, in order of first appearance, "No system named" last; one column per step. */
export function lanes(steps: JourneyActivity[], entry?: Entry): Lane[] {
  const byKey = new Map<string, Lane>();
  for (const step of steps) {
    const who = performer(step, entry);
    const lane = byKey.get(who.key) ?? { key: who.key, kind: who.kind === "entry" && who.systemId ? "system" : who.kind, systemId: who.systemId, entry: false, steps: [] };
    if (who.kind === "entry") lane.entry = true;
    lane.steps.push(step.number);
    byKey.set(who.key, lane);
  }
  const all = [...byKey.values()];
  return [...all.filter((lane) => lane.key !== NO_SYSTEM), ...all.filter((lane) => lane.key === NO_SYSTEM)];
}

/** Phase runs over the columns; a phase the journey comes back to is marked `again`. */
export function phaseSpans(steps: JourneyActivity[]): PhaseSpan[] {
  const spans: PhaseSpan[] = [];
  let start = 0;
  for (const run of phaseRuns(steps)) {
    spans.push({ phase: run.phase, start, span: run.steps.length, again: spans.some((earlier) => earlier.phase !== null && earlier.phase === run.phase) });
    start += run.steps.length;
  }
  return spans;
}

export function swimlane(journey: Journey, entry?: Entry): Swimlane {
  const steps = orderedSteps(journey);
  const laneList = lanes(steps, entry);
  const place = new Map<string, { lane: number; column: number }>();
  steps.forEach((step, column) => {
    const lane = laneList.findIndex((item) => item.steps.includes(step.number));
    place.set(step.number, { lane, column });
  });
  const margin = (LANE.column - LANE.box) / 2;
  const boxes = steps.map((step) => {
    const { lane, column } = place.get(step.number)!;
    return { number: step.number, x: column * LANE.column + margin, y: lane * LANE.height + LANE.inset, width: LANE.box, height: LANE.boxHeight };
  });
  const boxOf = new Map(boxes.map((box) => [box.number, box]));

  const arrows = flowEdges(journey).map((edge): Arrow => {
    const a = boxOf.get(edge.from)!;
    const b = boxOf.get(edge.to)!;
    const from = place.get(edge.from)!;
    const to = place.get(edge.to)!;
    const aMid = a.y + a.height / 2;
    const bMid = b.y + b.height / 2;
    const gutter = (lane: number) => lane * LANE.height + LANE.inset / 2;
    if (to.column > from.column) {
      const boundary = to.column * LANE.column;
      const path = to.column === from.column + 1
        ? from.lane === to.lane
          ? `M ${a.x + a.width} ${aMid} H ${b.x}`
          : `M ${a.x + a.width} ${aMid} H ${boundary} V ${bMid} H ${b.x}`
        // Over the steps between: along the column boundary, then the target lane's gutter.
        : `M ${a.x + a.width} ${aMid} H ${(from.column + 1) * LANE.column} V ${gutter(to.lane)} H ${boundary} V ${bMid} H ${b.x}`;
      return { ...edge, path, back: false };
    }
    // Back to an earlier step: up into this lane's gutter, along it, into the earlier step.
    const ax = a.x + a.width / 2;
    const bx = b.x + b.width / 2;
    const end = to.lane < from.lane ? b.y + b.height : b.y;
    return { ...edge, path: `M ${ax} ${a.y} V ${gutter(from.lane)} H ${bx} V ${end}`, back: true };
  });

  const phases = phaseSpans(steps);
  return {
    steps,
    lanes: laneList,
    place,
    phases,
    hasPhases: phases.some((span) => span.phase !== null),
    boxes,
    arrows,
    width: steps.length * LANE.column,
    height: laneList.length * LANE.height,
  };
}

// ── Flowchart ────────────────────────────────────────────────────────────────

export const FLOW = {
  box: 192,
  boxHeight: 80,
  gapX: 48,
  gapY: 72,
  pad: 56,
  /** Room for a loop's label beside its return line. */
  labelRoom: 176,
  loopStep: 14,
} as const;

export type FlowNode = Box & { level: number; slot: number; decision: boolean; fork: boolean; join: boolean };

export type Bar = { x1: number; x2: number; y: number };

export type Label = { text: string; x: number; y: number; anchor: "start" | "middle" };

export type Flowchart = {
  steps: JourneyActivity[];
  nodes: FlowNode[];
  arrows: Arrow[];
  /** Fork bars under a step that starts parallel tracks; join bars over the step they rejoin at. */
  bars: Bar[];
  labels: Label[];
  levels: number;
  width: number;
  height: number;
};

/** A label short enough for its place: whole words where they fit, then an ellipsis. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Levels by the longest path along forward arrows: an arrow to an earlier step
 * (a loop, or a branch numbered back) is drawn as a return and does not push
 * levels. Steps on one level sit side by side: branches and parallel tracks.
 */
export function flowLevels(steps: JourneyActivity[], edges: FlowEdge[]): Map<string, number> {
  const order = new Map(steps.map((step, index) => [step.number, index]));
  const levels = new Map<string, number>();
  for (const step of steps) {
    const index = order.get(step.number)!;
    const before = edges.filter((edge) => edge.to === step.number && (order.get(edge.from) ?? Infinity) < index);
    levels.set(step.number, before.length ? Math.max(...before.map((edge) => levels.get(edge.from)! + 1)) : 0);
  }
  return levels;
}

export function isBack(edge: FlowEdge, order: Map<string, number>): boolean {
  return (order.get(edge.to) ?? 0) <= (order.get(edge.from) ?? 0);
}

export function flowchart(journey: Journey): Flowchart {
  const steps = orderedSteps(journey);
  const edges = flowEdges(journey);
  const order = new Map(steps.map((step, index) => [step.number, index]));
  const levels = flowLevels(steps, edges);
  const levelCount = steps.length ? Math.max(...levels.values()) + 1 : 0;
  const rows: string[][] = Array.from({ length: levelCount }, () => []);
  for (const step of steps) rows[levels.get(step.number)!]!.push(step.number);
  const slots = Math.max(1, ...rows.map((row) => row.length));

  const slotX = (slot: number) => FLOW.pad + slot * (FLOW.box + FLOW.gapX);
  const levelY = (level: number) => FLOW.pad + level * (FLOW.boxHeight + FLOW.gapY);
  const forward = edges.filter((edge) => !isBack(edge, order));
  const nodes: FlowNode[] = [];
  rows.forEach((row, level) => {
    const offset = Math.floor((slots - row.length) / 2);
    row.forEach((number, index) => {
      const leaving = forward.filter((edge) => edge.from === number && edge.kind !== "handover");
      nodes.push({
        number,
        level,
        slot: offset + index,
        x: slotX(offset + index),
        y: levelY(level),
        width: FLOW.box,
        height: FLOW.boxHeight,
        decision: edges.some((edge) => edge.from === number && edge.kind === "decision") || leaving.length > 1 && !leaving.some((edge) => edge.kind === "parallel"),
        fork: leaving.some((edge) => edge.kind === "parallel"),
        join: edges.some((edge) => edge.to === number && edge.kind === "rejoin"),
      });
    });
  });
  const nodeOf = new Map(nodes.map((node) => [node.number, node]));
  const right = slotX(slots - 1) + FLOW.box;

  const arrows: Arrow[] = [];
  const labels: Label[] = [];
  const incoming = new Map<string, string[]>();
  let loops = 0;
  for (const edge of edges) {
    const a = nodeOf.get(edge.from)!;
    const b = nodeOf.get(edge.to)!;
    const text = edge.label ?? (edge.kind === "decision" ? null : edge.via);
    if (isBack(edge, order)) {
      const x = right + FLOW.gapX / 2 + loops * FLOW.loopStep;
      loops += 1;
      const aGutter = a.x + a.width + FLOW.gapX / 2;
      const bGutter = b.x + b.width + FLOW.gapX / 2;
      const below = a.y + a.height + FLOW.gapY * 0.75;
      const above = b.y - FLOW.gapY * 0.75;
      const path = `M ${a.x + a.width} ${a.y + a.height / 2} H ${aGutter} V ${below} H ${x} V ${above} H ${bGutter} V ${b.y + b.height / 2} H ${b.x + b.width}`;
      arrows.push({ ...edge, path, back: true });
      labels.push({ text: clip(`Back to ${edge.to}${edge.label ? `: ${edge.label}` : ""}`, 22), x: x + 6, y: (below + above) / 2, anchor: "start" });
      continue;
    }
    const ax = a.x + a.width / 2;
    const bx = b.x + b.width / 2;
    const down = a.y + a.height + FLOW.gapY / 2;
    const into = b.y - FLOW.gapY / 2;
    const path = b.level === a.level + 1
      ? `M ${ax} ${a.y + a.height} V ${down} H ${bx} V ${b.y}`
      // Past the levels between: down the gutter beside the step, then across above the target.
      : `M ${ax} ${a.y + a.height} V ${down} H ${b.slot >= a.slot ? a.x + a.width + FLOW.gapX / 2 : a.x - FLOW.gapX / 2} V ${into} H ${bx} V ${b.y}`;
    arrows.push({ ...edge, path, back: false });
    if (text) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), text]);
  }
  for (const [number, texts] of incoming) {
    const b = nodeOf.get(number)!;
    labels.push({ text: clip([...new Set(texts)].join(" / "), 22), x: b.x + b.width / 2 + 6, y: b.y - 8, anchor: "start" });
  }

  const bars: Bar[] = [];
  for (const node of nodes) {
    const cx = node.x + node.width / 2;
    if (node.fork) {
      const xs = [cx, ...forward.filter((edge) => edge.from === node.number).map((edge) => nodeOf.get(edge.to)!.x + FLOW.box / 2)];
      bars.push({ x1: Math.min(...xs), x2: Math.max(...xs), y: node.y + node.height + FLOW.gapY / 2 });
    }
    if (node.join) {
      const xs = [cx, ...forward.filter((edge) => edge.to === node.number).map((edge) => nodeOf.get(edge.from)!.x + FLOW.box / 2)];
      bars.push({ x1: Math.min(...xs), x2: Math.max(...xs), y: node.y - FLOW.gapY / 2 });
    }
  }

  return {
    steps,
    nodes,
    arrows,
    bars: bars.filter((bar) => bar.x2 > bar.x1),
    labels,
    levels: levelCount,
    width: right + FLOW.gapX / 2 + loops * FLOW.loopStep + (loops ? FLOW.labelRoom : FLOW.pad),
    height: levelCount ? levelY(levelCount - 1) + FLOW.boxHeight + FLOW.pad : 0,
  };
}

// ── Stage timeline ───────────────────────────────────────────────────────────

export type Stage = {
  /** The phase; null for the steps no phase holds (or every step, when the journey names none). */
  phase: string | null;
  steps: JourneyActivity[];
  /** The performers, in order of first appearance. */
  performers: Performer[];
};

/** Phases in the order the journey first reaches them, each with every step it holds. */
export function stages(journey: Journey, entry?: Entry): Stage[] {
  const byPhase = new Map<string, Stage>();
  for (const step of orderedSteps(journey)) {
    const key = step.phase ?? "";
    const stage = byPhase.get(key) ?? { phase: step.phase ?? null, steps: [], performers: [] };
    stage.steps.push(step);
    const who = performer(step, entry);
    if (!stage.performers.some((item) => item.key === who.key)) stage.performers.push(who);
    byPhase.set(key, stage);
  }
  return [...byPhase.values()];
}
