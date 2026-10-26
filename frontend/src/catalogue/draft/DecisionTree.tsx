import { type ReactNode, useCallback, useMemo } from "react";

import type { Suggestion } from "../../api/client";
import { Diagram, DiagramLegend, layered } from "../../design/diagram";
import type { Blocker, Lexicon } from "../suggestions";
import { decisionTree, missingId, type NodeMark } from "./decisionTreeModel";

/**
 * The Decide step's chains beside its list (UX rebuild plan, phase 2): press a
 * suggestion to open it in the pane. `missing` draws what suggestions wait for
 * that nothing adds; pressing one shows what waits for it (`onChooseMissing`).
 * Focus mode, one question at a time, passes `keep`, `current` and `mark` (see
 * `decisionTree`) and no `onChoose`.
 */
export function DecisionTree({ suggestions, words, onChoose, onChooseMissing, keep, current, mark, missing, caption, legend }: {
  suggestions: Suggestion[];
  words: Lexicon;
  onChoose?: (suggestionId: string) => void;
  onChooseMissing?: (blocker: Blocker) => void;
  missing?: readonly Blocker[];
  caption?: string;
  legend?: ReactNode;
  keep?: ReadonlySet<string>;
  current?: string | readonly string[];
  mark?: (suggestion: Suggestion) => NodeMark | undefined;
}) {
  const graph = useMemo(() => decisionTree(suggestions, words, { keep, current, mark, missing }), [suggestions, words, keep, current, mark, missing]);
  const layout = useCallback((fitWidth?: number) => layered(graph.nodes, graph.edges, { nodeWidth: 200, columnGap: 64, rowGap: 12, fitWidth }), [graph]);
  if (!graph.nodes.length) return <p className="draft-quiet">No suggestion waits for another, and none needs your decision.</p>;
  const activate = (id: string) => {
    const blocker = missing?.find((item) => missingId(item) === id);
    if (blocker) onChooseMissing?.(blocker);
    else onChoose?.(id);
  };
  return (
    <Diagram
      label="What waits for what"
      caption={caption ?? "What each suggestion waits for is on its left: another suggestion, or something nothing adds yet. Deciding one settles what hangs on it."}
      layout={layout}
      onActivate={onChoose || onChooseMissing ? (node) => activate(node.id) : undefined}
      headers={{ to: "Lets in", from: "Waits for" }}
      legend={legend ?? <DiagramLegend items={[["gap", "Nothing adds it yet"], ["decide", "Needs your decision"], ["ready", "Ready to accept"]]} />}
    />
  );
}
