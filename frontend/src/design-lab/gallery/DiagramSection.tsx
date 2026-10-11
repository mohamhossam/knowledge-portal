/**
 * The gallery's diagram kit section: the node tones in a container, then the
 * two seed-shaped examples. CWOM in context opens its nodes (a live message
 * says which); the ownership tree has nothing to open, so it is one image.
 */
import { useMemo, useState } from "react";

import { LiveMessage, Section } from "../../design/components";
import { Diagram, type DiagramNode, layered, tree } from "../../design/diagram";
import { CWOM_EDGES, CWOM_LANES, CWOM_NODES, OWNERSHIP_EDGES, OWNERSHIP_NODES } from "./diagramExamples";

const TONES: DiagramNode[] = [
  { id: "plain", label: "Plain", detail: "Any other node", group: "tones" },
  { id: "subject", label: "Subject", detail: "What you're on", tone: "subject", group: "tones" },
  { id: "ready", label: "Ready", status: "In service", tone: "ready", group: "tones" },
  { id: "decide", label: "Decide", status: "Needs you", tone: "decide", group: "tones" },
  { id: "gap", label: "Gap", status: "No squad", tone: "gap", group: "states" },
  { id: "muted", label: "Muted", status: "Replaced", tone: "muted", group: "states" },
  { id: "pill", label: "Sales squad", detail: "A pill", shape: "pill", group: "states" },
];

export function DiagramSection() {
  const tones = useMemo(
    () =>
      layered(TONES, [{ from: "plain", to: "subject", label: "an edge" }, { from: "subject", to: "ready" }, { from: "ready", to: "decide", label: "dashed", dashed: true }, { from: "gap", to: "muted" }, { from: "muted", to: "pill" }], {
        containers: [{ id: "tones", label: "Tones" }, { id: "states", label: "Gaps, history and tags" }],
        columnGap: 72,
      }),
    [],
  );
  const context = useMemo(() => layered(CWOM_NODES, CWOM_EDGES, { lanes: CWOM_LANES, nodeWidth: 192, columnGap: 152 }), []);
  const ownership = useMemo(() => tree(OWNERSHIP_NODES, OWNERSHIP_EDGES, { nodeWidth: 184, columnGap: 64 }), []);
  const [opened, setOpened] = useState("");

  return (
    <Section title="Diagrams">
      <div id="diagrams" className="gallery-stack">
        <Diagram label="Node tones and containers" caption="Every tone also differs by its frame and says its state in words. Red is never drawn." layout={tones} />
        <Diagram
          label="CWOM in context"
          caption="One system in context (layered layout, sample data). Tab onto a node, move with the arrow keys, Enter opens it."
          layout={context}
          onActivate={(node) => setOpened(`Would open ${node.label}.`)}
          legend="Solid line: orchestrates or sends data. Dashed line: publishes events. Dashed amber frame: no squad."
        />
        <LiveMessage message={opened} />
        {opened && <p>{opened}</p>}
        <Diagram
          label="Who runs what"
          caption="Ownership tree (tree layout, sample data): value stream, product, system, and the squad that runs it."
          layout={ownership}
          headers={{ to: "Has", from: "Part of" }}
          legend="Dashed amber frame: no squad. Pills: the squad that runs the system."
        />
      </div>
    </Section>
  );
}
