/**
 * The hi-fi prototype's address space (Phase 6). It mirrors the wireframe
 * lab's routes under its own base, so the two can be compared page by page.
 */
import type { StatusTone } from "../../design/components";
import type { DocState } from "../wireframes/data";

export const PROTO_BASE = "/design-lab/prototype";

export function proto(path = ""): string {
  return `${PROTO_BASE}${path}`;
}

export function elapsed(from: number, to = Date.now()): string {
  const s = Math.max(0, Math.round((to - from) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Clock time in words for check and publish lines ("14:05"). */
export function clock(at: number): string {
  return new Date(at).toTimeString().slice(0, 5);
}

/** Locations in words (content guide): "Worksheet 1!2:2" becomes "Sheet 1, row 2". */
export function humanWhere(where: string): string {
  return where.replace(/Worksheet (\d+)!(\d+):\d+/g, "Sheet $1, row $2").replace(/Worksheet (\d+)/g, "Sheet $1");
}

/** A document's state as a status tone: routine states stay neutral, severe ones carry weight. */
export const DOC_TONE: Record<DocState, StatusTone> = {
  reading: "working",
  review: "neutral",
  service: "done",
  withdrawn: "stopped",
  attention: "attention",
  held: "held",
  stopped: "stopped",
  none: "neutral",
};

