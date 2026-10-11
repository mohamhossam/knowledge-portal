import { useMemo } from "react";

import type { Suggestion } from "../../api/client";
import { Diagram, DiagramLegend, layered } from "../../design/diagram";
import type { Lexicon } from "../suggestions";
import { decisionTree } from "./decisionTree";

/**
 * The Decide step's chains beside its list (UX rebuild plan, phase 2): press a
 * suggestion to open it in the pane.
 */
export function DecisionTree({ suggestions, words, onChoose }: {
  suggestions: Suggestion[];
  words: Lexicon;
  onChoose: (suggestionId: string) => void;
}) {
  const graph = useMemo(() => decisionTree(suggestions, words), [suggestions, words]);
  const layout = useMemo(() => layered(graph.nodes, graph.edges, { nodeWidth: 200, columnGap: 64, rowGap: 12 }), [graph]);
  if (!graph.nodes.length) return <p className="draft-quiet">No suggestion waits for another, and none needs your decision.</p>;
  return (
    <Diagram
      label="What waits for what"
      caption="Suggestions that wait for another, from what they wait for on the left. Deciding one settles what hangs on it."
      layout={layout}
      onActivate={(node) => onChoose(node.id)}
      headers={{ to: "Lets in", from: "Waits for" }}
      legend={<DiagramLegend items={[["decide", "Needs your decision"], ["ready", "Ready to accept"]]} />}
    />
  );
}
