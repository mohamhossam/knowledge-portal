/**
 * Lays a journey out as BPMN swimlanes: one lane per system (or team), in the
 * order the flow first reaches it, and one column per step along the longest
 * path from the start. A step never shares a cell with another step of its
 * lane. A way back to an earlier step (a loop, or any arrow that closes a
 * cycle) is left out of the ordering, so no step of a cycle is ever dropped,
 * and is routed under the lanes. The same geometry draws the diagram and feeds
 * the BPMN 2.0 export's diagram interchange, so the exported file opens laid
 * out as it is shown.
 */
import { type JourneyView, type Lane, laneKey, type Step } from "./model";

export const GEOMETRY = {
  laneHeader: 168,
  column: 172,
  laneHeight: 92,
  task: { width: 144, height: 60 },
  gateway: 44,
  event: 34,
  pad: 24,
  /** Under the lanes, where the ways back run: the first one this far below, each next one this much lower. */
  backBand: 16,
  backStep: 12,
};

export type Placed = { step: Step; lane: number; column: number; x: number; y: number; width: number; height: number };
/** `back`: a way back to an earlier step, routed under the lanes. */
export type Edge = { from: string; to: string; label?: string; points: [number, number][]; back?: boolean };

export type FlowLayout = {
  lanes: Lane[];
  placed: Map<string, Placed>;
  edges: Edge[];
  width: number;
  height: number;
};

function size(step: Step): { width: number; height: number } {
  if (step.kind === "task") return GEOMETRY.task;
  if (step.kind === "exclusive" || step.kind === "parallel") return { width: GEOMETRY.gateway, height: GEOMETRY.gateway };
  return { width: GEOMETRY.event, height: GEOMETRY.event };
}

/**
 * The arrows that go back: a loop, or one to a step still being walked depth-first from
 * the first step (it closes a cycle), keyed "from>to".
 */
export function waysBack(steps: Step[]): Set<string> {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const back = new Set<string>();
  const state = new Map<string, "walking" | "done">();
  const walk = (step: Step) => {
    state.set(step.id, "walking");
    for (const next of step.next) {
      const target = byId.get(next.to);
      if (!target) continue;
      if (next.loop || state.get(next.to) === "walking") back.add(`${step.id}>${next.to}`);
      else if (!state.has(next.to)) walk(target);
    }
    state.set(step.id, "done");
  };
  for (const step of steps) if (!state.has(step.id)) walk(step);
  return back;
}

export function layoutFlow(journey: JourneyView): FlowLayout {
  const byId = new Map(journey.steps.map((step) => [step.id, step]));
  const back = waysBack(journey.steps);
  const forward = (step: Step) => step.next.filter((next) => !back.has(`${step.id}>${next.to}`));
  const incoming = new Map<string, string[]>();
  for (const step of journey.steps) for (const next of forward(step)) incoming.set(next.to, [...(incoming.get(next.to) ?? []), step.id]);

  // Topological order from the start event, the ways back left out: every step is reached.
  const order: Step[] = [];
  const pending = new Map(journey.steps.map((step) => [step.id, (incoming.get(step.id) ?? []).length]));
  const ready = journey.steps.filter((step) => (pending.get(step.id) ?? 0) === 0);
  while (ready.length) {
    const step = ready.shift() as Step;
    order.push(step);
    for (const next of forward(step)) {
      const left = (pending.get(next.to) ?? 1) - 1;
      pending.set(next.to, left);
      if (left === 0) {
        const target = byId.get(next.to);
        if (target) ready.push(target);
      }
    }
  }

  // Never drop a step: anything the ordering missed follows in the journey's own order.
  const ordered = new Set(order);
  for (const step of journey.steps) if (!ordered.has(step)) order.push(step);

  const lanes: Lane[] = [];
  const laneIndex = new Map<string, number>();
  for (const step of order) {
    const key = laneKey(step.lane);
    if (!laneIndex.has(key)) {
      laneIndex.set(key, lanes.length);
      lanes.push(step.lane);
    }
  }

  const column = new Map<string, number>();
  const taken = new Set<string>();
  for (const step of order) {
    let at = Math.max(-1, ...(incoming.get(step.id) ?? []).map((id) => column.get(id) ?? 0)) + 1;
    while (taken.has(`${laneKey(step.lane)}:${at}`)) at += 1;
    column.set(step.id, at);
    taken.add(`${laneKey(step.lane)}:${at}`);
  }

  const placed = new Map<string, Placed>();
  for (const step of order) {
    const lane = laneIndex.get(laneKey(step.lane)) ?? 0;
    const col = column.get(step.id) ?? 0;
    const { width, height } = size(step);
    const cx = GEOMETRY.laneHeader + GEOMETRY.pad + col * GEOMETRY.column + GEOMETRY.task.width / 2;
    const cy = lane * GEOMETRY.laneHeight + GEOMETRY.laneHeight / 2;
    placed.set(step.id, { step, lane, column: col, x: cx - width / 2, y: cy - height / 2, width, height });
  }

  const edges: Edge[] = [];
  const lanesHeight = lanes.length * GEOMETRY.laneHeight;
  let backs = 0;
  for (const step of order) {
    const from = placed.get(step.id);
    if (!from) continue;
    for (const next of step.next) {
      const to = placed.get(next.to);
      if (!to) continue;
      if (back.has(`${step.id}>${next.to}`)) {
        // Down from the step, along under the lanes, and up into the earlier one.
        const y = lanesHeight + GEOMETRY.backBand + backs * GEOMETRY.backStep;
        const sx = from.x + from.width / 2;
        const tx = to.x + to.width / 2;
        backs += 1;
        edges.push({ from: step.id, to: next.to, label: next.label, back: true, points: [[sx, from.y + from.height], [sx, y], [tx, y], [tx, to.y + to.height]] });
        continue;
      }
      const sx = from.x + from.width;
      const sy = from.y + from.height / 2;
      const tx = to.x;
      const ty = to.y + to.height / 2;
      // Turn just before the target's column, so lines run along the gaps, not through boxes.
      const turn = tx - (GEOMETRY.column - GEOMETRY.task.width) / 2;
      const points: [number, number][] = sy === ty ? [[sx, sy], [tx, ty]] : [[sx, sy], [turn, sy], [turn, ty], [tx, ty]];
      edges.push({ from: step.id, to: next.to, label: next.label, points });
    }
  }

  const columns = Math.max(0, ...[...column.values()]) + 1;
  return {
    lanes,
    placed,
    edges,
    width: GEOMETRY.laneHeader + GEOMETRY.pad * 2 + columns * GEOMETRY.column,
    height: lanesHeight + (backs ? GEOMETRY.backBand + backs * GEOMETRY.backStep : 0),
  };
}
