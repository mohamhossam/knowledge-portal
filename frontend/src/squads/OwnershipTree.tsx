import { useMemo } from "react";

import { DiagramLegend, tree } from "../design/diagram";
import { RoutedDiagram } from "../shell/RoutedDiagram";
import { ownershipTree } from "./ownershipTree";
import { useOrgContext } from "./useOrganisation";

/** The ownership area as a tree: one glance at which systems have no squad. */
export function OwnershipTree() {
  const { org, release } = useOrgContext();
  const graph = useMemo(() => ownershipTree(org, release), [org, release]);
  const layout = useMemo(() => tree(graph.nodes, graph.edges, { columnGap: 72 }), [graph]);
  return (
    <section className="own-stack" aria-labelledby="own-tree-title">
      <h2 id="own-tree-title" className="ds-visually-hidden">Who runs what</h2>
      {graph.nodes.length ? (
        <RoutedDiagram
          label="Who runs what: value streams, products, systems and squads"
          caption="Each value stream with its products, each product's systems, and the squad that runs each system."
          layout={layout}
          headers={{ to: "Has", from: "Part of" }}
          legend={<DiagramLegend items={[["gap", "Dashed frame: no squad runs it"], ["muted", "Dotted frame: not in the version in service"]]} />}
        />
      ) : (
        <p className="own-quiet">No value stream is recorded yet, so there is no tree to draw.</p>
      )}
    </section>
  );
}
