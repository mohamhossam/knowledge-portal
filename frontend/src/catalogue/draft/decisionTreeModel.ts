import type { Suggestion } from "../../api/client";
import type { DiagramEdge, DiagramNode } from "../../design/diagram";
import { type Blocker, dependencyEdges, type Lexicon, STATE_LABEL, suggestionState, waitsFor } from "../suggestions";

/** A suggestion on a node, short: what it names, then what kind of change it is. */
function named(suggestion: Suggestion, words: Lexicon): { label: string; detail: string } {
  const { content } = suggestion;
  const system = suggestion.system_name ?? words.system(content.system_id);
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
      return { label: `${system} → ${suggestion.target_system_name ?? words.system(content.target_system_id ?? "")}`, detail: "Connection" };
    case "placement":
      return { label: system, detail: `Placed in ${words.domain(content.landscape_domain_id ?? "")}` };
    case "landscape_domain":
      return { label: content.name, detail: "Landscape domain" };
    case "product":
      return { label: content.name, detail: "Offering" };
    case "journey":
      return { label: content.journey?.name ?? content.name, detail: "Journey" };
    case "channel":
      return { label: content.name, detail: "Channel" };
    case "question":
      return { label: content.text, detail: `Question for ${words.offering(content.system_id)}` };
    case "offering_rule":
      return { label: content.text, detail: `Rule of ${words.offering(content.system_id)}` };
    case "specification_rule":
      return { label: content.text, detail: `Rule of ${words.realisation(content.system_id)}` };
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
 * `keep` draws exactly those of the open suggestions instead;
 * `current` marks the one in hand ("This question") and `mark` overrides a
 * node's status and tone, the person's answer so far, say. `missing` are the
 * dead ends (`blockers`): what suggestions wait for that neither the draft nor
 * any suggestion adds, each drawn at the left of what waits for it. In a first
 * version, which starts empty, most waits are these.
 */
export function decisionTree(
  suggestions: Suggestion[],
  words: Lexicon,
  options: {
    keep?: ReadonlySet<string>;
    current?: string | readonly string[];
    mark?: (suggestion: Suggestion) => NodeMark | undefined;
    missing?: readonly Blocker[];
  } = {},
) {
  const { keep, current, mark, missing = [] } = options;
  // A question may cover several suggestions: each is "This question".
  const inHand = (id: string) => (typeof current === "string" ? id === current : (current?.includes(id) ?? false));
  const open = suggestions.filter((item) => item.status === "proposed" && (!keep || keep.has(item.id)));
  const drawn = new Set(open.map((item) => item.id));
  const gaps = missing
    .map((blocker) => ({ blocker, waiting: blocker.waiting.filter((item) => drawn.has(item.id)) }))
    .filter((gap) => gap.waiting.length > 0);
  const edges: DiagramEdge[] = [
    ...gaps.flatMap(({ blocker, waiting }) => waiting.map((item) => ({ from: missingId(blocker), to: item.id }))),
    ...dependencyEdges(open),
  ];
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const missingNodes = gaps.map(({ blocker }): DiagramNode => ({
    id: missingId(blocker),
    label: blocker.name,
    detail: blocker.kind === "system" ? "System" : blocker.kind === "offering" ? "Offering" : blocker.label,
    status: "Not in the draft, and no suggestion adds it",
    tone: "gap",
  }));
  const nodes: DiagramNode[] = open
    .filter((item) => keep || linked.has(item.id) || suggestionState(item) === "decide")
    .map((item): DiagramNode => {
      const state = suggestionState(item);
      const marked = mark?.(item);
      return {
        id: item.id,
        ...named(item, words),
        // A waiting card says what it waits for, not only that it waits.
        status: state === "waits" ? waitsFor(item, words) : STATE_LABEL[state],
        tone: state === "decide" ? "decide" : state === "ready" ? "ready" : "plain",
        ...marked,
        ...(inHand(item.id) ? { tone: "subject" as const, status: marked?.status ?? "This question" } : {}),
      };
    });
  return { nodes: [...missingNodes, ...nodes], edges };
}

/** A dead end's node: never a suggestion's id. */
export const missingId = (blocker: Blocker) => `missing:${blocker.key}`;

/**
 * The open suggestions a set of them touches: each one, what it waits on and
 * what waits on it, all the way along. A focus screen passes it as `keep`.
 */
export function touching(suggestions: Suggestion[], ids: Iterable<string>): Set<string> {
  const edges = dependencyEdges(suggestions);
  const reach = (up: boolean) => {
    const seen = new Set(ids);
    for (let grew = true; grew; ) {
      grew = false;
      for (const edge of edges) {
        const [from, to] = up ? [edge.to, edge.from] : [edge.from, edge.to];
        if (seen.has(from) && !seen.has(to)) {
          seen.add(to);
          grew = true;
        }
      }
    }
    return seen;
  };
  return new Set([...reach(true), ...reach(false)]);
}
