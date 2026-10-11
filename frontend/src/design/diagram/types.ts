/** The diagram kit's data: what a screen hands in, and what a layout hands back. */

/**
 * How a node reads. Each tone also differs by more than colour: `subject` has a
 * heavier frame, `gap` a dashed one, `muted` a dotted one, and every tone other
 * than `plain` and `subject` should carry its words in `status`.
 *
 *   plain    any other node
 *   subject  the thing the page is about (maroon, the selection colour)
 *   ready    ready, or in service (success)
 *   decide   needs someone's decision (warning)
 *   gap      something missing: an owner, a journey, a link (warning, dashed)
 *   muted    out of scope or replaced (dotted, quiet)
 */
export type DiagramTone = "plain" | "subject" | "ready" | "decide" | "gap" | "muted";

export type DiagramNode = {
  id: string;
  label: string;
  /** A second line under the label: what kind of thing it is, or where it sits. */
  detail?: string;
  /** Its state in words ("No squad", "In service"): read out, shown in the table and as a tooltip. */
  status?: string;
  tone?: DiagramTone;
  /** A pill for tags that hang off a node, such as the squad that runs a system. */
  shape?: "box" | "pill";
  /** Where the node opens. A node with an href is a link; see `Diagram`'s `onActivate` for buttons. */
  href?: string;
  /** The layered layout's lane (column) this node sits in. */
  lane?: string;
  /** The layered layout's container (boxed row) this node sits in. */
  group?: string;
};

export type DiagramEdge = {
  from: string;
  to: string;
  /** What the link means ("orchestrates", "sends data"), drawn on the line and listed in the table. */
  label?: string;
  /** Dashed for a weaker or inferred link. Never the only way a meaning is told apart: say it in `label` too. */
  dashed?: boolean;
};

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type PlacedNode = DiagramNode & Rect & { /** Its column, from 0 on the left. */ level: number };
export type RoutedEdge = DiagramEdge & {
  path: string;
  /** Where its label ends (forwards: just before the target) or is centred (backwards). */
  labelAt: Point;
  /** Runs right to left, or within one column. */
  back: boolean;
};
export type PlacedLane = Rect & { id: string; label: string };
export type PlacedContainer = Rect & { id: string; label: string };

export type DiagramLayout = {
  kind: "layered" | "tree";
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: RoutedEdge[];
  lanes: PlacedLane[];
  containers: PlacedContainer[];
};
