import type { Organisation, Release } from "../api/client";
import type { DiagramEdge, DiagramNode } from "../design/diagram";
import { plural } from "../library/where";
import { diagramHref } from "../shell/diagramHref";
import { runBy } from "./organisation";

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/**
 * Who runs what as a tree: value stream, its products, each product's systems
 * and the squad that runs each. A system no squad runs is a gap; the systems no
 * product names are one node at the end, opening the grid on them.
 */
export function ownershipTree(org: Organisation, release: Release | null) {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const systems = new Map((release?.systems ?? []).map((system) => [system.id, system]));
  const systemHref = (id: string) => diagramHref(`/architecture/systems/${encodeURIComponent(id)}`);
  for (const stream of [...org.value_streams].sort(byName)) {
    const streamId = `stream:${stream.id}`;
    nodes.push({ id: streamId, label: stream.name, detail: "Value stream" });
    for (const product of org.products.filter((item) => item.value_stream_id === stream.id).sort(byName)) {
      const productId = `product:${product.id}`;
      nodes.push({ id: productId, label: product.name, detail: "Product" });
      edges.push({ from: streamId, to: productId });
      for (const systemId of product.system_ids) {
        const id = `${productId}/system:${systemId}`;
        const system = systems.get(systemId);
        const squads = runBy(org, systemId, release);
        nodes.push(
          release && !system
            ? { id, label: systemId, detail: "System", status: "Not in service", tone: "muted" }
            : squads.length
              ? { id, label: system?.name ?? systemId, detail: "System", href: systemHref(systemId) }
              : { id, label: system?.name ?? systemId, detail: "System", status: "No squad", tone: "gap", href: systemHref(systemId) },
        );
        edges.push({ from: productId, to: id });
        for (const { squad } of squads) {
          const squadId = `${id}/squad:${squad.id}`;
          nodes.push({ id: squadId, label: squad.name, detail: "Squad", shape: "pill", href: diagramHref(`/squads?squad=${encodeURIComponent(squad.id)}`) });
          edges.push({ from: id, to: squadId });
        }
      }
    }
  }
  const named = new Set(org.products.flatMap((product) => product.system_ids));
  const unnamed = (release?.systems ?? []).filter((system) => !named.has(system.id));
  const unowned = unnamed.filter((system) => !runBy(org, system.id, release).length).length;
  if (unnamed.length) {
    nodes.push({
      id: "unnamed",
      label: `${plural(unnamed.length, "system")} in no product`,
      status: unowned ? `${unowned.toLocaleString("en")} with no squad` : undefined,
      tone: unowned ? "gap" : undefined,
      href: diagramHref("/squads?product=none"),
    });
  }
  return { nodes, edges };
}
