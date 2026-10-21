/**
 * The catalogue's diagrams on the diagram kit (UX rebuild plan, phases 3 and 4).
 * Each takes data its page has already read, draws it left to right, and keeps
 * its table one press away ("Show as table").
 */
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo } from "react";

import { api, type Offering, type Release } from "../../api/client";
import { DiagramLegend as Legend, layered, type LegendMark } from "../../design/diagram";
import { count } from "../../home/format";
import { diagramHref } from "../../shell/diagramHref";
import { RoutedDiagram } from "../../shell/RoutedDiagram";
import { systemName } from "../catalogue";
import { useCatalogueContext, useReleases } from "../useCatalogue";
import { capabilityMap, CONTEXT_LANES, connectionsFlow, type Href, type Landscape, OFFERING_LANES, offeringStructure, systemContext, versionTimeline } from "./build";

/** Every connection between systems, left to right; `highlight` marks an order's systems (explorer). */
export function ConnectionsFlowDiagram({ landscape, href, highlight, table, caption }: {
  landscape: Landscape;
  href?: Href;
  highlight?: Set<string>;
  table?: ReactNode;
  caption?: ReactNode;
}) {
  const flow = useMemo(() => connectionsFlow(landscape, { href, highlight }), [landscape, href, highlight]);
  const layout = useCallback((fitWidth?: number) => layered(flow.nodes, flow.edges, { nodeWidth: 168, columnGap: 112, fitWidth }), [flow]);
  const keys: [LegendMark, string][] = [
    ...(highlight ? [["subject", "In this order"] as [LegendMark, string]] : []),
    ...(flow.edges.some((edge) => edge.dashed) ? [["dashed", "Dashed line: the kind of dependency isn’t known"] as [LegendMark, string]] : []),
  ];
  if (!flow.nodes.length) return <p className="cat-quiet">No system depends on another in this version.</p>;
  return (
    <RoutedDiagram
      label="How systems connect"
      caption={
        caption ?? (
          <>
            {count(flow.edges.length, "connection")} between {count(flow.nodes.length, "system")}, read from the system that depends to the one it
            depends on.{flow.unconnected > 0 && <> {count(flow.unconnected, "other system")} {flow.unconnected === 1 ? "connects" : "connect"} to nothing yet.</>}
          </>
        )
      }
      layout={layout}
      table={table}
      legend={keys.length ? <Legend items={keys} /> : undefined}
    />
  );
}

/** One system's record, first: what depends on it, the system, what it depends on. */
export function SystemContextDiagram({ systemId }: { systemId: string }) {
  const { book, base, inService } = useCatalogueContext();
  // Squads are today's, whichever version is read: only the version in service marks gaps by them.
  const organisation = useQuery({ queryKey: ["organisation"], queryFn: api.organisation, enabled: inService });
  const owned = useMemo(
    () => (inService && organisation.data ? new Set(organisation.data.squads.flatMap((squad) => squad.resources.map((item) => item.system_id))) : undefined),
    [inService, organisation.data],
  );
  const href = useMemo<Href>(() => (id) => diagramHref(`${base}/systems/${encodeURIComponent(id)}`), [base]);
  const graph = useMemo(() => systemContext(book.release, systemId, { href, owned }), [book.release, systemId, href, owned]);
  const layout = useCallback((fitWidth?: number) => layered(graph.nodes, graph.edges, { lanes: CONTEXT_LANES, nodeWidth: 148, columnGap: 104, fitWidth }), [graph]);
  const name = systemName(book, systemId);
  if (graph.edges.length === 0) return <p className="cat-quiet">{name} connects to no other system in this version.</p>;
  return (
    <RoutedDiagram
      label={`${name} in context`}
      caption={`What depends on ${name}, and what it depends on.`}
      layout={layout}
      headers={{ lane: "Side" }}
      legend={owned ? <Legend items={[["subject", "This system"], ["gap", "Dashed frame: no squad runs it"]]} /> : undefined}
    />
  );
}

/** The capability map: one column per business area, each capability with the system that has it. */
export function CapabilityMapDiagram() {
  const { book, base } = useCatalogueContext();
  const href = useMemo<Href>(() => (id) => diagramHref(`${base}/systems/${encodeURIComponent(id)}`), [base]);
  const map = useMemo(() => capabilityMap(book.release, { href }), [book.release, href]);
  const layout = useCallback((fitWidth?: number) => layered(map.nodes, map.edges, { lanes: map.lanes, nodeWidth: 184, columnGap: 20, align: "start", fitWidth }), [map]);
  if (!map.nodes.length) return <p className="cat-quiet">This version records no capability.</p>;
  return (
    <RoutedDiagram
      label="What systems do, by business area"
      caption={`${count(map.nodes.length, "capability", "capabilities")} in ${count(map.lanes.length, "business area")}; under each, the system that has it.`}
      layout={layout}
      headers={{ lane: "Business area", detail: "Had by" }}
    />
  );
}

/** An offering's record, first: its order types, its parts and who delivers each. */
export function OfferingStructureDiagram({ offering }: { offering: Offering }) {
  const { book, base } = useCatalogueContext();
  const graph = useMemo(
    () =>
      offeringStructure(offering, book.release.journeys ?? [], (id) => systemName(book, id), {
        system: (id) => diagramHref(`${base}/systems/${encodeURIComponent(id)}`),
        journey: (id) => diagramHref(`${base}/journeys/${encodeURIComponent(id)}`),
      }),
    [offering, book, base],
  );
  const layout = useCallback((fitWidth?: number) => layered(graph.nodes, graph.edges, { lanes: OFFERING_LANES, columnGap: 104, fitWidth }), [graph]);
  return (
    <RoutedDiagram
      label={`How ${offering.name} is made`}
      caption="Its order types, the parts it is made of, and the systems responsible for each part."
      layout={layout}
      headers={{ lane: "Column" }}
      legend={<Legend items={[["subject", "This offering"], ["gap", "Dashed frame: something is missing"], ["muted", "Dotted frame: not offered"]]} />}
    />
  );
}

/** Every catalogue version on one line, oldest first. */
export function VersionTimelineDiagram({ releases, activeId }: { releases: Release[]; activeId: string | undefined }) {
  const href = useMemo<Href>(
    () => (id) => diagramHref(id === activeId ? "/architecture" : `/architecture/versions/${encodeURIComponent(id)}`),
    [activeId],
  );
  const graph = useMemo(() => versionTimeline(releases, activeId, href), [releases, activeId, href]);
  const layout = useCallback((fitWidth?: number) => layered(graph.nodes, graph.edges, { nodeWidth: 200, columnGap: 48, fitWidth }), [graph]);
  if (!graph.nodes.length) return null;
  return (
    <RoutedDiagram
      label="Catalogue versions, oldest first"
      caption="Every version, oldest first. Open one to read it."
      layout={layout}
      headers={{ to: "Next", from: "Before" }}
      legend={<Legend items={[["ready", "In service"], ["decide", "In preparation"], ["muted", "Dotted frame: replaced"]]} />}
    />
  );
}

/** The Versions page, first: the timeline of every version, once there is more than one. */
export function VersionsTimeline() {
  const { book, inService } = useCatalogueContext();
  const releases = useReleases();
  if (!inService || (releases.data?.length ?? 0) < 2) return null;
  return (
    <section aria-label="Versions on a timeline">
      <VersionTimelineDiagram releases={releases.data!} activeId={book.release.id} />
    </section>
  );
}
