/**
 * The diagram kit's SVG parts: arrowhead, lane, container, edge and node. Each
 * draws one placed piece of a layout (`layout.ts`) and takes its colours from
 * the diagram's component tokens (`diagram.css`), never a raw value.
 *
 * `Diagram` composes them; a screen that needs its own arrangement can draw
 * these inside its own `<svg>` too.
 */
import type { KeyboardEvent, MouseEvent } from "react";

import { fit, LINE, nodeLines, nodeName } from "./layout";
import type { PlacedContainer, PlacedLane, PlacedNode, RoutedEdge } from "./types";

const DETAIL_PX = 14;

/** The arrowhead every edge ends in, filled like its line. Put it once in the svg's `<defs>`. */
export function DiagramArrowHead({ id }: { id: string }) {
  return (
    <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M 0 0 L 8 4 L 0 8 Z" className="ds-diagram__head" />
    </marker>
  );
}

/** A lane: a column band with its heading at the top. */
export function DiagramLaneBand({ lane }: { lane: PlacedLane }) {
  return (
    <g className="ds-diagram__lane">
      <rect x={lane.x} y={lane.y} width={lane.width} height={lane.height} rx={4} />
      <text x={lane.x + lane.width / 2} y={lane.y + 22} textAnchor="middle" className="ds-diagram__lane-label">
        {fit(lane.label, lane.width - 8, DETAIL_PX)}
      </text>
    </g>
  );
}

/** A container: a soft box around a group of nodes, its heading top left. */
export function DiagramContainerBox({ box }: { box: PlacedContainer }) {
  return (
    <g className="ds-diagram__container">
      <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={4} />
      <text x={box.x + 12} y={box.y + 19} className="ds-diagram__container-label">
        {fit(box.label, box.width - 24, DETAIL_PX)}
      </text>
    </g>
  );
}

/** An edge: its line, its arrowhead and, when it has one, its label on a halo so it reads over other lines. */
export function DiagramEdgeLine({ edge, arrowId }: { edge: RoutedEdge; arrowId: string }) {
  return (
    <g className="ds-diagram__edge" data-dashed={edge.dashed || undefined}>
      <path d={edge.path} className="ds-diagram__line" markerEnd={`url(#${arrowId})`} />
      {edge.label && (
        <text x={edge.labelAt.x} y={edge.labelAt.y - 6} textAnchor={edge.back ? "middle" : "end"} className="ds-diagram__edge-label">
          {edge.label}
        </text>
      )}
    </g>
  );
}

export type NodeAction = {
  /** "link" for a node with an href; "button" when the diagram has `onActivate`. */
  as: "link" | "button";
  tabIndex: 0 | -1;
  onActivate: (event: MouseEvent<Element> | KeyboardEvent<Element>) => void;
  onFocus: () => void;
};

/**
 * A node: a box (or a pill) with its label and, under it, its detail and state.
 * A label and its second line each wrap onto two lines as the layout left
 * room for, and end in "…" past that; the whole label is its tooltip and
 * its accessible name. With an action it is a link or a button in the
 * diagram's roving focus, and shows the focus ring around the box.
 */
export function DiagramNodeShape({ node, action, nodeRef }: {
  node: PlacedNode;
  action?: NodeAction;
  /** With an action: a callback ref, so the diagram can move focus to the node. */
  nodeRef?: (element: Element | null) => void;
}) {
  const radius = node.shape === "pill" ? node.height / 2 : 4;
  // As many lines as the box has room for (the layout made it tall enough), the label's first.
  const room = Math.max(1, Math.round((node.height - 20) / LINE));
  const lines = nodeLines(node, node.width);
  const label = lines.label.slice(0, Math.max(1, room - Math.min(1, lines.second.length)));
  const second = lines.second.slice(0, room - label.length);
  if (label.length < lines.label.length) label[label.length - 1] = fit(`${label[label.length - 1]} ${lines.label.slice(label.length).join(" ")}`, node.width - 16, 15);
  if (second.length && second.length < lines.second.length) second[second.length - 1] = fit(`${second[second.length - 1]} ${lines.second.slice(second.length).join(" ")}`, node.width - 16, DETAIL_PX);
  const first = (node.height - LINE * (label.length + second.length)) / 2 + 13;
  const drawing = (
    <>
      <title>{nodeName(node)}</title>
      {action && <rect className="ds-diagram__ring" x={-4} y={-4} width={node.width + 8} height={node.height + 8} rx={radius + 4} />}
      <rect className="ds-diagram__box" width={node.width} height={node.height} rx={radius} />
      {label.map((line, at) => (
        <text key={`l${at}`} x={node.width / 2} y={first + at * LINE} textAnchor="middle" className="ds-diagram__label">
          {line}
        </text>
      ))}
      {second.map((line, at) => (
        <text key={`d${at}`} x={node.width / 2} y={first + (label.length + at) * LINE} textAnchor="middle" className="ds-diagram__detail">
          {line}
        </text>
      ))}
    </>
  );
  const common = {
    className: "ds-diagram__node",
    "data-tone": node.tone ?? "plain",
    "data-shape": node.shape ?? "box",
    "data-node": node.id,
    transform: `translate(${node.x} ${node.y})`,
  };

  if (!action) return <g {...common}>{drawing}</g>;
  if (action.as === "link") {
    return (
      <a
        {...common}
        href={node.href}
        ref={nodeRef}
        tabIndex={action.tabIndex}
        aria-label={nodeName(node)}
        onFocus={action.onFocus}
        onClick={action.onActivate}
      >
        {drawing}
      </a>
    );
  }
  return (
    <g
      {...common}
      role="button"
      aria-pressed={node.pressed}
      ref={nodeRef}
      tabIndex={action.tabIndex}
      aria-label={nodeName(node)}
      onFocus={action.onFocus}
      onClick={action.onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          action.onActivate(event);
        }
      }}
    >
      {drawing}
    </g>
  );
}
