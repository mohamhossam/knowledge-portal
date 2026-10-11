import type { DiagramEdge, DiagramNode } from "../design/diagram";
import { DOC_STATE_WORDS, type DocState } from "./docState";
import { plural } from "./where";

/** The states every document passes through, in order; a stuck reading branches off the first. */
const MAIN: DocState[] = ["reading", "review", "indexing", "service", "withdrawn"];
/** Where a reading or indexing can stop instead; drawn only while a document is there, except "Needs attention". */
const SIDE: { state: DocState; from: DocState; label: string }[] = [
  { state: "attention", from: "reading", label: "fails" },
  { state: "held", from: "reading", label: "held" },
  { state: "stopped", from: "reading", label: "stopped" },
  { state: "none", from: "review", label: "not put in service" },
];

/**
 * A document's lifecycle with how many documents sit in each state. The active
 * filter is the subject; states holding work for someone are marked to decide.
 * "Being indexed" shows only while a document is being indexed.
 */
export function lifecycle(counts: Map<DocState, number>, active: DocState | "all") {
  const n = (state: DocState) => counts.get(state) ?? 0;
  const node = (state: DocState): DiagramNode => {
    const many = plural(n(state), "document");
    const chosen = active === state;
    return {
      id: state,
      label: DOC_STATE_WORDS[state],
      status: many,
      pressed: active === state,
      tone: chosen ? "subject" : (state === "attention" || state === "held") && n(state) ? "decide" : state === "service" ? "ready" : state === "withdrawn" ? "muted" : "plain",
    };
  };
  const main = MAIN.filter((state) => state !== "indexing" || n(state) > 0);
  const nodes = main.map(node);
  const edges: DiagramEdge[] = main.slice(1).map((state, at) => ({ from: main[at]!, to: state }));
  for (const side of SIDE) {
    if (side.state !== "attention" && n(side.state) === 0) continue;
    nodes.push(node(side.state));
    edges.push({ from: side.from, to: side.state, label: side.label, dashed: true });
  }
  return { nodes, edges };
}
