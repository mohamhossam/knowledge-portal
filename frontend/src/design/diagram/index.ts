/**
 * The diagram kit (UX rebuild plan, phase 1): SVG parts, a left-to-right
 * layered layout and a tree layout, and `Diagram`, which draws a layout with
 * keyboard focus on its nodes and a "Show as table" switch.
 */
export { Diagram, DiagramLegend, DiagramTable, type DiagramHeaders, type DiagramProps, type LegendMark } from "./Diagram";
export { DIAGRAM, diagramRows, fit, layered, longestPathLevels, nearest, nodeName, readingOrder, route, tree, type DiagramRow, type Direction, type LayeredOptions, type TreeOptions } from "./layout";
export { DiagramArrowHead, DiagramContainerBox, DiagramEdgeLine, DiagramLaneBand, DiagramNodeShape, type NodeAction } from "./parts";
export type * from "./types";
