import type { Suggestion } from "../../api/client";
import type { DiagramEdge, DiagramNode } from "../../design/diagram";
import { type Lexicon, provides, requires, STATE_LABEL, suggestionState } from "../suggestions";

/** A suggestion on a node, short: what it names, then what kind of change it is. */
function named(suggestion: Suggestion, words: Lexicon): { label: string; detail: string } {
  const { content } = suggestion;
  const system = words.system(content.system_id);
  switch (content.kind) {
    case "system":
      return { label: content.name, detail: "System" };
    case "component":
      return { label: content.name, detail: `Component of ${system}` };
    case "capability":
      return { label: content.name, detail: `Capability of ${system}` };
    case "constraint":
      return { label: content.text, detail: `Constraint on ${system}` };
    case "relationship":
      return { label: `${system} → ${words.system(content.target_system_id ?? "")}`, detail: "Connection" };
    case "placement":
      return { label: system, detail: `Placed in ${words.domain(content.landscape_domain_id ?? "")}` };
    case "landscape_domain":
      return { label: content.name, detail: "Landscape domain" };
    case "product":
      return { label: content.name, detail: "Offering" };
    case "journey":
      return { label: content.name, detail: "Journey" };
    case "channel":
      return { label: content.name, detail: "Channel" };
    case "question":
      return { label: content.text, detail: `Question for ${words.offering(content.system_id)}` };
    default:
      return { label: content.name || content.text, detail: "Suggestion" };
  }
}

/** What a screen changes on a node: the person's answer so far, say. */
export type NodeMark = Pick<DiagramNode, "status" | "tone">;

/**
 * The draft's open decisions as chains: each suggestion that adds something
 * points at the ones waiting for it. Only suggestions in a chain, or needing a
 * person, are drawn; deciding one at the left settles what hangs on it.
 * `keep` draws exactly those suggestions instead, whatever their status;
 * `current` marks the one in hand and `mark` overrides a node's status and tone.
 */
export function decisionTree(
  suggestions: Suggestion[],
  words: Lexicon,
  options: { keep?: ReadonlySet<string>; current?: string; mark?: (suggestion: Suggestion) => NodeMark | undefined } = {},
) {
  const { keep, current, mark } = options;
  const open = keep ? suggestions.filter((item) => keep.has(item.id)) : suggestions.filter((item) => item.status === "proposed");
  const providers = new Map<string, Suggestion[]>();
  for (const item of open) for (const key of provides(item)) providers.set(key, [...(providers.get(key) ?? []), item]);
  const edges: DiagramEdge[] = [];
  for (const item of open) {
    if (!item.match.startsWith("needs_")) continue;
    for (const key of new Set(requires(item))) {
      for (const provider of providers.get(key) ?? []) if (provider.id !== item.id) edges.push({ from: provider.id, to: item.id });
    }
  }
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const nodes: DiagramNode[] = open
    .filter((item) => keep || linked.has(item.id) || suggestionState(item) === "decide")
    .map((item): DiagramNode => {
      const state = suggestionState(item);
      return {
        id: item.id,
        ...named(item, words),
        status: STATE_LABEL[state],
        tone: state === "decide" ? "decide" : state === "ready" ? "ready" : "plain",
        ...mark?.(item),
        ...(item.id === current ? { tone: "subject" as const } : {}),
      };
    });
  return { nodes, edges };
}
