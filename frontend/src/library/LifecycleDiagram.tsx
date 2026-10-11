import { useMemo } from "react";

import { Diagram, DiagramLegend, layered } from "../design/diagram";
import { DOC_STATE_WORDS, type DocState } from "./docState";
import { lifecycle } from "./lifecycle";

/**
 * The library's state filter, drawn as the lifecycle (UX rebuild plan, phase
 * 2): press a state to show its documents, press it again to show them all.
 */
export function LifecycleDiagram({ counts, active, onChoose }: {
  counts: Map<DocState, number>;
  active: DocState | "all";
  onChoose: (state: DocState | "all") => void;
}) {
  const graph = useMemo(() => lifecycle(counts, active), [counts, active]);
  const layout = useMemo(() => layered(graph.nodes, graph.edges, { nodeWidth: 168, columnGap: 64, rowGap: 12 }), [graph]);
  return (
    <Diagram
      label="Show documents by state"
      caption={active === "all" ? "Where documents are in their lifecycle. Press a state to show only its documents." : `Showing documents that are ${DOC_STATE_WORDS[active].toLocaleLowerCase()}. Press it again to show every document.`}
      layout={layout}
      onActivate={(node) => onChoose(node.id === active ? "all" : (node.id as DocState))}
      headers={{ detail: "Documents", to: "Goes on to", from: "Comes from" }}
      legend={<DiagramLegend items={active === "all" ? [["dashed", "Dashed line: when something stops it"]] : [["subject", "Shown in the list"], ["dashed", "Dashed line: when something stops it"]]} />}
    />
  );
}
