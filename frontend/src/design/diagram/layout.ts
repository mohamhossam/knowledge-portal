/**
 * The diagram kit's layouts: pure functions from nodes and edges to geometry.
 * The parts (`parts.tsx`) only draw what these return, so every position is
 * testable without a browser.
 *
 *   layered()  left to right in columns: each node one column after whatever
 *              points at it, or in the column (lane) it names. Groups become
 *              boxed rows (containers) across the columns.
 *   tree()     left to right from each root: a parent sits level with the
 *              middle of its children, one column per depth.
 *
 * Geometry is in CSS pixels; the SVG is drawn at its natural size and scrolls
 * in place, so no text is ever scaled below the 14px floor. Given the width it
 * has on screen (`fitWidth`), a layout closes its gaps or narrows its nodes to
 * fit it, or widens them to use it; a label that no longer fits on one line
 * wraps onto a second, and the nodes grow to hold it.
 */
import type { DiagramEdge, DiagramLayout, DiagramNode, PlacedContainer, PlacedLane, PlacedNode, Point, RoutedEdge } from "./types";

/** The kit's spacing, in CSS pixels. A layout's options override the widths and gaps. */
export const DIAGRAM = {
  pad: 16,
  nodeWidth: 176,
  nodeHeight: 40,
  /** A node with a second line (`detail` or `status`). Every node of a layout takes one height. */
  nodeHeightDetail: 56,
  /** Fitting to the screen narrows a node no further than this (its text wraps), and widens it no further than `nodeMax`. */
  nodeMin: 128,
  nodeMax: 264,
  /** Fitting never closes a gap below this, nor below its widest edge label. */
  columnGapMin: 40,
  columnGap: 120,
  rowGap: 16,
  /** Room above the nodes for the lanes' headings. */
  laneHead: 36,
  lanePad: 10,
  /** A container's inner padding, and the room for its heading. */
  containerPad: 12,
  containerHead: 28,
  containerGap: 20,
  /** How far a backward edge rises above the nodes it joins. */
  backRise: 28,
} as const;

export type LayeredOptions = {
  nodeWidth?: number;
  columnGap?: number;
  rowGap?: number;
  /**
   * Fixed columns, left to right. A node whose `lane` names one sits in it; any
   * other node takes the column its edges give it. Each lane is drawn as a band
   * with its heading.
   */
  lanes?: { id: string; label: string }[];
  /** Boxed rows, top to bottom. A node whose `group` names one sits inside it. */
  containers?: { id: string; label: string }[];
  /**
   * Where a column shorter than its row sits: "centre" (the default) keeps a
   * flow's ends level with what they join; "start" tops every column, as a map
   * of columns without edges reads best.
   */
  align?: "centre" | "start";
  /** The width the drawing has on screen; see `fitted`. */
  fitWidth?: number;
};

export type TreeOptions = {
  nodeWidth?: number;
  columnGap?: number;
  rowGap?: number;
  /** The width the drawing has on screen; see `fitted`. */
  fitWidth?: number;
};

type Geometry = {
  nodeWidth: number;
  nodeHeight: number;
  /** The gap after each column but the last. */
  gaps: number[];
  rowGap: number;
};
type SizeOptions = { nodeWidth?: number; columnGap?: number; rowGap?: number; fitWidth?: number };

/** The font sizes the parts draw at: a node's label, its second line, an edge's label. */
export const TEXT_PX = { label: 15, detail: 14, edge: 14 } as const;
/** A node's text keeps this far from its sides. */
export const NODE_INSET = 16;
/** A node's lines of text: each this far apart, the box this much taller than they are. */
export const LINE = 18;
const NODE_FRAME = 20;

/** A node's second line: its detail and its state. */
export const secondLine = (node: DiagramNode) => [node.detail, node.status].filter(Boolean).join(" · ");

/** How tall a node is that shows this many lines of text. */
export const nodeHeightFor = (lines: number) => Math.max(DIAGRAM.nodeHeight, NODE_FRAME + LINE * lines);

/**
 * A node's lines at a width: its label on as many as it needs, never cut, and its second line on
 * at most two. The label is the start of the node's accessible name, so a label shown whole keeps
 * every word on screen in that name, in order (WCAG 2.5.3).
 */
export function nodeLines(node: DiagramNode, width: number): { label: string[]; second: string[] } {
  const inner = width - NODE_INSET;
  const second = secondLine(node);
  return { label: wrap(node.label, inner, TEXT_PX.label, Infinity), second: second ? wrap(second, inner, TEXT_PX.detail) : [] };
}

/**
 * The widths a layout takes, fitted to `fitWidth` when given. Too wide: the
 * gaps close first, each no further than its widest edge label, then the
 * nodes narrow (to `nodeMin`; their text wraps). Room to spare: the nodes
 * widen until their text fits on one line each. Whatever still doesn't fit
 * scrolls. Without `fitWidth`, every gap is `columnGap`.
 */
function fitted(nodes: DiagramNode[], columns: number, gapLabels: number[], options: SizeOptions, chrome: number): { nodeWidth: number; gaps: number[] } {
  let nodeWidth = options.nodeWidth ?? DIAGRAM.nodeWidth;
  const columnGap = options.columnGap ?? DIAGRAM.columnGap;
  let gaps = Array.from({ length: Math.max(0, columns - 1) }, () => columnGap);
  const room = options.fitWidth;
  if (room === undefined || columns < 1) return { nodeWidth, gaps };
  const total = () => chrome + columns * nodeWidth + gaps.reduce((sum, gap) => sum + gap, 0);
  if (total() > room) {
    const least = gaps.map((_, at) => Math.min(columnGap, Math.max(DIAGRAM.columnGapMin, Math.ceil(gapLabels[at] ?? 0))));
    for (let close = 1; close <= columnGap && total() > room; close++) gaps = least.map((floor) => Math.max(floor, columnGap - close));
    // Narrower nodes only when that makes it fit: a drawing that scrolls anyway keeps its words.
    const narrowed = nodeWidth - Math.ceil((total() - room) / columns);
    if (total() > room && narrowed >= Math.min(nodeWidth, DIAGRAM.nodeMin)) nodeWidth = narrowed;
  } else {
    const need = Math.min(
      DIAGRAM.nodeMax,
      Math.ceil(Math.max(0, ...nodes.map((node) => Math.max(textWidth(node.label, TEXT_PX.label), textWidth(secondLine(node), TEXT_PX.detail)))) + NODE_INSET),
    );
    if (need > nodeWidth) nodeWidth = Math.min(need, nodeWidth + Math.floor((room - total()) / columns));
  }
  return { nodeWidth, gaps };
}

function geometry(nodes: DiagramNode[], columns: number, gapLabels: number[], options: SizeOptions, chrome: number): Geometry {
  const { nodeWidth, gaps } = fitted(nodes, columns, gapLabels, options, chrome);
  // Every node of a layout takes one height: room for the most lines any of them needs.
  const lines = Math.max(1, ...nodes.map((node) => {
    const { label, second } = nodeLines(node, nodeWidth);
    return label.length + second.length;
  }));
  return { nodeWidth, nodeHeight: nodeHeightFor(lines), gaps, rowGap: options.rowGap ?? DIAGRAM.rowGap };
}

/** Edges whose ends both exist, each pair once, no node to itself. */
function knownEdges(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] {
  const ids = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}>${edge.to}`;
    if (edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Each node's column: the longest path to it from a node nothing points at.
 * Edges that close a cycle are ignored (found depth first, in input order), so
 * a loop never pushes its nodes rightwards for ever.
 */
export function longestPathLevels(nodes: DiagramNode[], edges: DiagramEdge[]): Map<string, number> {
  const out = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) out.get(edge.from)?.push(edge.to);

  const state = new Map<string, "open" | "done">();
  const forward: DiagramEdge[] = [];
  const visit = (id: string) => {
    state.set(id, "open");
    for (const to of out.get(id) ?? []) {
      const seen = state.get(to);
      if (seen === "open") continue; // closes a cycle
      forward.push({ from: id, to });
      if (!seen) visit(to);
    }
    state.set(id, "done");
  };
  const incoming = new Set(edges.map((edge) => edge.to));
  for (const node of nodes) if (!incoming.has(node.id) && !state.has(node.id)) visit(node.id);
  for (const node of nodes) if (!state.has(node.id)) visit(node.id);

  const preds = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of forward) preds.get(edge.to)?.push(edge.from);
  const level = new Map<string, number>();
  const levelOf = (id: string, trail: Set<string>): number => {
    const known = level.get(id);
    if (known !== undefined) return known;
    if (trail.has(id)) return 0;
    trail.add(id);
    const value = Math.max(-1, ...(preds.get(id) ?? []).map((from) => levelOf(from, trail))) + 1;
    trail.delete(id);
    level.set(id, value);
    return value;
  };
  for (const node of nodes) levelOf(node.id, new Set());
  return level;
}

/** The point halfway along a cubic Bézier: where an edge's label sits. */
function cubicMiddle(p0: Point, c1: Point, c2: Point, p3: Point): Point {
  return {
    x: 0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p3.x,
    y: 0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p3.y,
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * An edge between two placed nodes. Forwards: from the source's right side to
 * the target's left side, as an S-curve. Backwards or within one column: up
 * over both nodes and down onto the target's top, so it never cuts through a
 * node in between.
 */
export function route(edge: DiagramEdge, from: PlacedNode, to: PlacedNode): RoutedEdge {
  if (to.x > from.x + from.width / 2) {
    const start = { x: from.x + from.width, y: from.y + from.height / 2 };
    const end = { x: to.x, y: to.y + to.height / 2 };
    const mid = (start.x + end.x) / 2;
    const c1 = { x: mid, y: start.y };
    const c2 = { x: mid, y: end.y };
    return {
      ...edge,
      back: false,
      path: `M ${round(start.x)} ${round(start.y)} C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`,
      // Near the target, where the line runs level: labels of a fan sit one per row instead of meeting.
      labelAt: { x: end.x - 10, y: end.y },
    };
  }
  const start = { x: from.x + from.width / 2, y: from.y };
  const end = { x: to.x + to.width / 2, y: to.y };
  const top = Math.min(start.y, end.y) - DIAGRAM.backRise;
  const c1 = { x: start.x, y: top };
  const c2 = { x: end.x, y: top };
  return {
    ...edge,
    back: true,
    path: `M ${round(start.x)} ${round(start.y)} C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`,
    labelAt: cubicMiddle(start, c1, c2, end),
  };
}

/**
 * Orders each column so edges cross less: a few sweeps of the barycentre
 * heuristic, each node moved towards the mean row of its neighbours in the
 * column before (then after). Ties keep their order, so input order wins when
 * nothing else decides.
 */
function orderColumns(columns: string[][], edges: DiagramEdge[], rank: (id: string) => number): string[][] {
  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    neighbours.set(edge.from, [...(neighbours.get(edge.from) ?? []), edge.to]);
    neighbours.set(edge.to, [...(neighbours.get(edge.to) ?? []), edge.from]);
  }
  const ordered = columns.map((column) => [...column]);
  const sweep = (index: number, reference: string[] = []) => {
    const position = new Map(reference.map((id, at) => [id, at]));
    const current = ordered[index] ?? [];
    const centre = new Map(
      current.map((id, at) => {
        const near = (neighbours.get(id) ?? []).filter((other) => position.has(other)).map((other) => position.get(other)!);
        return [id, near.length ? near.reduce((sum, value) => sum + value, 0) / near.length : at];
      }),
    );
    ordered[index] = [...current].sort((a, b) => rank(a) - rank(b) || centre.get(a)! - centre.get(b)!);
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let index = 1; index < ordered.length; index++) sweep(index, ordered[index - 1]);
    for (let index = ordered.length - 2; index >= 0; index--) sweep(index, ordered[index + 1]);
  }
  return ordered;
}

/** A left-to-right layered layout: columns along the edges, or the lanes the nodes name. */
export function layered(nodes: DiagramNode[], edges: DiagramEdge[], options: LayeredOptions = {}): DiagramLayout {
  const kept = knownEdges(nodes, edges);
  const laneIndex = new Map((options.lanes ?? []).map((lane, at) => [lane.id, at]));
  const computed = longestPathLevels(nodes, kept);
  const levelOf = new Map(nodes.map((node) => [node.id, node.lane !== undefined && laneIndex.has(node.lane) ? laneIndex.get(node.lane)! : computed.get(node.id)!]));
  const levels = Math.max(options.lanes?.length ?? 0, ...nodes.map((node) => levelOf.get(node.id)! + 1), 0);
  // A forward edge's label sits in the gap before its target: that gap keeps room for it.
  const gapLabels: number[] = [];
  for (const edge of kept) {
    const at = levelOf.get(edge.to)! - 1;
    if (edge.label && at >= levelOf.get(edge.from)!) gapLabels[at] = Math.max(gapLabels[at] ?? 0, textWidth(edge.label, TEXT_PX.edge) + 24);
  }
  const size = geometry(nodes, levels, gapLabels, options, 2 * (DIAGRAM.pad + DIAGRAM.lanePad));

  // Containers are boxed rows; nodes outside every container share a last, unboxed row.
  const groups = (options.containers ?? []).filter((group) => nodes.some((node) => node.group === group.id));
  const groupRank = new Map(groups.map((group, at) => [group.id, at]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rowOf = (id: string) => {
    const group = byId.get(id)!.group;
    return group !== undefined && groupRank.has(group) ? groupRank.get(group)! : groups.length;
  };

  const columns: string[][] = Array.from({ length: levels }, () => []);
  for (const node of nodes) columns[levelOf.get(node.id)!]?.push(node.id);
  const ordered = orderColumns(columns, kept, rowOf);

  const top = DIAGRAM.pad + (options.lanes?.length ? DIAGRAM.laneHead : 0);
  const columnX = (level: number) => DIAGRAM.pad + DIAGRAM.lanePad + level * size.nodeWidth + size.gaps.slice(0, level).reduce((sum, gap) => sum + gap, 0);
  const step = size.nodeHeight + size.rowGap;

  // Each row is as tall as its fullest column; a container adds its heading and padding.
  const rows = [...groups.map((group) => group.id), null];
  const placed = new Map<string, PlacedNode>();
  const containers: PlacedContainer[] = [];
  let y = top;
  rows.forEach((group, row) => {
    const inRow = ordered.map((column) => column.filter((id) => rowOf(id) === row));
    const most = Math.max(0, ...inRow.map((column) => column.length));
    if (!most) return;
    const boxed = group !== null;
    const inner = most * step - size.rowGap;
    const startY = y + (boxed ? DIAGRAM.containerHead : 0);
    inRow.forEach((column, level) => {
      const offset = options.align === "start" ? 0 : ((most - column.length) * step) / 2;
      column.forEach((id, at) => {
        placed.set(id, { ...byId.get(id)!, level, x: columnX(level), y: startY + offset + at * step, width: size.nodeWidth, height: size.nodeHeight });
      });
    });
    if (boxed) {
      const members = inRow.flatMap((column, level) => (column.length ? [level] : []));
      const first = Math.min(...members);
      const last = Math.max(...members);
      containers.push({
        id: group,
        label: groups[row]!.label,
        x: columnX(first) - DIAGRAM.containerPad,
        y,
        width: columnX(last) - columnX(first) + size.nodeWidth + 2 * DIAGRAM.containerPad,
        height: DIAGRAM.containerHead + inner + DIAGRAM.containerPad,
      });
    }
    y = startY + inner + (boxed ? DIAGRAM.containerPad : 0) + DIAGRAM.containerGap;
  });
  const bottom = Math.max(top, y - DIAGRAM.containerGap);
  const height = bottom + DIAGRAM.pad;
  const width = columnX(Math.max(levels, 1) - 1) + size.nodeWidth + DIAGRAM.lanePad + DIAGRAM.pad;

  const lanes: PlacedLane[] = (options.lanes ?? []).map((lane, level) => ({
    id: lane.id,
    label: lane.label,
    x: columnX(level) - DIAGRAM.lanePad,
    y: DIAGRAM.pad / 2,
    width: size.nodeWidth + 2 * DIAGRAM.lanePad,
    height: height - DIAGRAM.pad,
  }));

  return {
    kind: "layered",
    width,
    height,
    nodes: nodes.map((node) => placed.get(node.id)!),
    edges: kept.map((edge) => route(edge, placed.get(edge.from)!, placed.get(edge.to)!)),
    lanes,
    containers,
  };
}

/**
 * Elbow edge for a tree: out of the parent's right side, along a trunk halfway
 * across the gap, into the child's left side. Siblings share the trunk.
 */
function elbow(edge: DiagramEdge, from: PlacedNode, to: PlacedNode): RoutedEdge {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const trunk = (startX + endX) / 2;
  return {
    ...edge,
    back: false,
    path: `M ${round(startX)} ${round(startY)} H ${round(trunk)} V ${round(endY)} H ${round(endX)}`,
    labelAt: { x: endX - 10, y: endY },
  };
}

/**
 * A left-to-right tidy tree. Edges run parent to child; a node nothing points
 * at is a root, in input order. Leaves take one row each, and a parent sits
 * level with the middle of its first and last child. A node with a second
 * parent is placed under its first; the other edge is still drawn, as a curve.
 */
export function tree(nodes: DiagramNode[], edges: DiagramEdge[], options: TreeOptions = {}): DiagramLayout {
  const kept = knownEdges(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const parent = new Map<string, string>();
  for (const edge of kept) {
    if (parent.has(edge.to)) continue;
    parent.set(edge.to, edge.from);
    children.get(edge.from)!.push(edge.to);
  }
  // How many columns the tree takes, for fitting: the deepest node under its first parent.
  const depthOf = new Map<string, number>();
  const measure = (id: string, depth: number) => {
    if (depthOf.has(id)) return;
    depthOf.set(id, depth);
    for (const child of children.get(id)!) measure(child, depth + 1);
  };
  for (const node of nodes) if (!parent.has(node.id)) measure(node.id, 0);
  for (const node of nodes) measure(node.id, 0);
  const fit = geometry(nodes, Math.max(0, ...depthOf.values()) + 1, [], options, 2 * DIAGRAM.pad);
  // A tree's gaps stay even: siblings share a trunk halfway across.
  const size = { ...fit, columnGap: fit.gaps[0] ?? options.columnGap ?? DIAGRAM.columnGap };

  const placed = new Map<string, PlacedNode>();
  const step = size.nodeHeight + size.rowGap;
  let row = 0;
  // Returns the node's centre row; a node already placed (a cycle) is not placed again.
  const place = (id: string, depth: number): number => {
    // Reserve the node first, so a cycle back to it stops here.
    placed.set(id, { ...byId.get(id)!, level: depth, x: 0, y: 0, width: size.nodeWidth, height: size.nodeHeight });
    const rows: number[] = [];
    for (const child of children.get(id)!) if (!placed.has(child)) rows.push(place(child, depth + 1));
    const centre = rows.length ? (rows[0]! + rows[rows.length - 1]!) / 2 : row++;
    placed.set(id, {
      ...byId.get(id)!,
      level: depth,
      x: DIAGRAM.pad + depth * (size.nodeWidth + size.columnGap),
      y: DIAGRAM.pad + centre * step,
      width: size.nodeWidth,
      height: size.nodeHeight,
    });
    return centre;
  };
  for (const node of nodes) if (!parent.has(node.id) && !placed.has(node.id)) place(node.id, 0);
  // Whatever is left sits on a cycle with no way in: start from its first node.
  for (const node of nodes) if (!placed.has(node.id)) place(node.id, 0);

  const all = nodes.map((node) => placed.get(node.id)!);
  const depth = Math.max(0, ...all.map((node) => node.level));
  const width = DIAGRAM.pad * 2 + (depth + 1) * size.nodeWidth + depth * size.columnGap;
  const height = DIAGRAM.pad * 2 + Math.max(1, row) * step - size.rowGap;

  return {
    kind: "tree",
    width,
    height,
    nodes: all,
    edges: kept.map((edge) => {
      const from = placed.get(edge.from)!;
      const to = placed.get(edge.to)!;
      return parent.get(edge.to) === edge.from && to.level === from.level + 1 ? elbow(edge, from, to) : route(edge, from, to);
    }),
    lanes: [],
    containers: [],
  };
}

/* ── Reading a layout: keyboard moves and the table ───────────────────── */

export type Direction = "left" | "right" | "up" | "down";

/**
 * The node an arrow key moves to: the nearest one whose centre lies that way,
 * counting sideways distance double so a move stays in its row or column.
 * Returns the same id when nothing lies that way.
 */
export function nearest(nodes: PlacedNode[], fromId: string, direction: Direction): string {
  const from = nodes.find((node) => node.id === fromId);
  if (!from) return fromId;
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  let best: { id: string; score: number } | null = null;
  for (const node of nodes) {
    if (node.id === fromId) continue;
    const dx = node.x + node.width / 2 - cx;
    const dy = node.y + node.height / 2 - cy;
    const ahead = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    const aside = direction === "right" || direction === "left" ? Math.abs(dy) : Math.abs(dx);
    if (ahead <= 1) continue;
    const score = ahead + 2 * aside;
    if (!best || score < best.score) best = { id: node.id, score };
  }
  return best?.id ?? fromId;
}

/** Reading order, for Home and End and the table: column by column, top to bottom. */
export function readingOrder(nodes: PlacedNode[]): PlacedNode[] {
  return [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
}

export type DiagramRow = {
  node: PlacedNode;
  /** The lane (column) and container (row) it sits in, by their headings. */
  lane?: string;
  container?: string;
  to: { node: PlacedNode; label?: string }[];
  from: { node: PlacedNode; label?: string }[];
};

/** The diagram as rows for its table: every node, in reading order, with what it links to and from. */
export function diagramRows(layout: DiagramLayout): DiagramRow[] {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const lanes = new Map(layout.lanes.map((lane) => [lane.id, lane.label]));
  const containers = new Map(layout.containers.map((box) => [box.id, box.label]));
  return readingOrder(layout.nodes).map((node) => ({
    node,
    lane: node.lane !== undefined ? lanes.get(node.lane) : undefined,
    container: node.group !== undefined ? containers.get(node.group) : undefined,
    to: layout.edges.filter((edge) => edge.from === node.id).map((edge) => ({ node: byId.get(edge.to)!, label: edge.label })),
    from: layout.edges.filter((edge) => edge.to === node.id).map((edge) => ({ node: byId.get(edge.from)!, label: edge.label })),
  }));
}

/** A node's name for assistive tech: its label, then its second line and its state, in words. */
export function nodeName(node: DiagramNode): string {
  return [node.label, node.detail, node.status].filter(Boolean).join(", ");
}

/** Rough advance widths, in em, for Archivo at 100% width: capitals and digits wide, spaces and i/l/t narrow. */
function advance(char: string): number {
  if (char === " ") return 0.28;
  if (/[iljtfr.,'|!:;]/.test(char)) return 0.32;
  if (/[MWmw@]/.test(char)) return 0.86;
  if (/[A-Z0-9&/]/.test(char)) return 0.66;
  return 0.54;
}

/** A text's estimated width in pixels at the given font size. */
export function textWidth(text: string, fontPx: number): number {
  return [...text].reduce((sum, char) => sum + advance(char), 0) * fontPx;
}

/**
 * A text cut to fit a width at the given font size, ending in "…", between
 * words unless one word alone is too wide. Widths are estimated per character
 * (generously, so a cut text never spills out of its box); the full text is
 * always the accessible name and the tooltip of what shows it.
 */
export function fit(text: string, width: number, fontPx: number): string {
  if (textWidth(text, fontPx) <= width) return text;
  const chars = [...text];
  const room = width - textWidth("…", fontPx);
  let used = 0;
  let end = 0;
  while (end < chars.length && used + advance(chars[end]!) * fontPx <= room) used += advance(chars[end++]!) * fontPx;
  let kept = chars.slice(0, end).join("");
  // Between words where there is a space to cut at: half a word reads as another word, and the
  // accessible name, which is the whole text, must hold every word shown (WCAG 2.5.3).
  const space = chars[end] === " " ? end : kept.lastIndexOf(" ");
  if (space > 0) kept = kept.slice(0, space).replace(/[\s·,;:/(›–-]+$/u, "");
  return `${kept.trimEnd()}…`;
}

/**
 * A text broken into at most `lines` lines that fit `width`, between words; the
 * last line ends in "…" when the text runs on past it.
 */
export function wrap(text: string, width: number, fontPx: number, lines = 2): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && out.length < lines - 1 && textWidth(rest, fontPx) > width) {
    const words = rest.split(" ");
    let take = 0;
    while (take < words.length && textWidth(words.slice(0, take + 1).join(" "), fontPx) <= width) take++;
    if (!take) break; // one word wider than the line: cut it below
    out.push(words.slice(0, take).join(" "));
    rest = words.slice(take).join(" ");
  }
  if (rest) out.push(fit(rest, width, fontPx));
  return out;
}
