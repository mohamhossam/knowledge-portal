/**
 * Lays a journey out as BPMN swimlanes: one lane per system (or team), in the
 * order the flow first reaches it, and one column per step along the longest
 * path from the start. A step never shares a cell with another step of its
 * lane. The same geometry draws the diagram and feeds the BPMN 2.0 export's
 * diagram interchange, so the exported file opens laid out as it is shown.
 */
import type { Journey, Step } from "./model";

export const GEOMETRY = {
  laneHeader: 168,
  column: 172,
  laneHeight: 92,
  task: { width: 144, height: 60 },
  gateway: 44,
  event: 34,
  pad: 24,
};

export type Placed = { step: Step; lane: number; column: number; x: number; y: number; width: number; height: number };
export type Edge = { from: string; to: string; label?: string; points: [number, number][] };

export type FlowLayout = {
  lanes: string[];
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

export function layoutFlow(journey: Journey): FlowLayout {
  const byId = new Map(journey.steps.map((step) => [step.id, step]));
  const incoming = new Map<string, string[]>();
  for (const step of journey.steps) for (const next of step.next) incoming.set(next.to, [...(incoming.get(next.to) ?? []), step.id]);

  // Topological order from the start event (the flow has no loops).
  const order: Step[] = [];
  const pending = new Map(journey.steps.map((step) => [step.id, (incoming.get(step.id) ?? []).length]));
  const ready = journey.steps.filter((step) => (pending.get(step.id) ?? 0) === 0);
  while (ready.length) {
    const step = ready.shift() as Step;
    order.push(step);
    for (const next of step.next) {
      const left = (pending.get(next.to) ?? 1) - 1;
      pending.set(next.to, left);
      if (left === 0) {
        const target = byId.get(next.to);
        if (target) ready.push(target);
      }
    }
  }

  const lanes: string[] = [];
  for (const step of order) if (!lanes.includes(step.lane)) lanes.push(step.lane);

  const column = new Map<string, number>();
  const taken = new Set<string>();
  for (const step of order) {
    let at = Math.max(-1, ...(incoming.get(step.id) ?? []).map((id) => column.get(id) ?? 0)) + 1;
    while (taken.has(`${step.lane}:${at}`)) at += 1;
    column.set(step.id, at);
    taken.add(`${step.lane}:${at}`);
  }

  const placed = new Map<string, Placed>();
  for (const step of order) {
    const lane = lanes.indexOf(step.lane);
    const col = column.get(step.id) ?? 0;
    const { width, height } = size(step);
    const cx = GEOMETRY.laneHeader + GEOMETRY.pad + col * GEOMETRY.column + GEOMETRY.task.width / 2;
    const cy = lane * GEOMETRY.laneHeight + GEOMETRY.laneHeight / 2;
    placed.set(step.id, { step, lane, column: col, x: cx - width / 2, y: cy - height / 2, width, height });
  }

  const edges: Edge[] = [];
  for (const step of order) {
    const from = placed.get(step.id);
    if (!from) continue;
    for (const next of step.next) {
      const to = placed.get(next.to);
      if (!to) continue;
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
    height: lanes.length * GEOMETRY.laneHeight,
  };
}
