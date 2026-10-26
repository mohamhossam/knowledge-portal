/**
 * The Systems tab read across (catalogue merge, step 5, in place of the
 * whole-estate Map): who calls whom, as the lab's interface matrix, with the
 * connections recorded between systems under it; or what each system delivers,
 * as the lab's capability matrix. Picking a system shows its summary beside the
 * matrix, as on the Landscape, with the way to its record (`?system=`).
 */
import "../landscape/landscape.css";
import "./matrices.css";

import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";

import type { Relationship } from "../../api/client";
import { type Column, DataTable, Facts, Section } from "../../design/components";
import { count } from "../../home/format";
import { LINK_VERB, allConnections, systemName } from "../catalogue";
import { SystemSummary } from "../landscape/LandscapePoster";
import { useLinkCounts, useSystemParam } from "../landscape/systemHooks";
import { fromRelease } from "../model/adapter";
import { useCatalogueContext } from "../useCatalogue";
import { DeliveryMatrix } from "./DeliveryMatrix";
import { InterfaceMatrix } from "./InterfaceMatrix";
import { PART_KINDS, systemParts } from "./partKinds";

export type MatrixView = "interfaces" | "delivery";

export function SystemsMatrices({ view }: { view: MatrixView }) {
  const { book, base } = useCatalogueContext();
  const data = useMemo(() => fromRelease(book.release), [book.release]);
  const [selected, select] = useSystemParam();
  const { interfaces, linkCounts } = useLinkCounts(data);
  const picked = selected ? data.systems.find((system) => system.id === selected) ?? null : null;

  const figures = useMemo<[string, ReactNode][]>(() => {
    if (view === "delivery") {
      const parts = systemParts(data);
      const kinds = new Set([...parts.values()].flatMap((byKind) => [...byKind.keys()]));
      return [
        ["Systems delivering parts", parts.size.toLocaleString("en")],
        ["Kinds of part", PART_KINDS.filter((kind) => kinds.has(kind.id)).length.toLocaleString("en")],
        ["Components", `${data.offerings.reduce((sum, offering) => sum + offering.components.length, 0).toLocaleString("en")} in ${count(data.offerings.length, "offering")}`],
      ];
    }
    const partners = new Map<string, number>();
    for (const { a, b } of linkCounts.values()) for (const id of [a, b]) partners.set(id, (partners.get(id) ?? 0) + 1);
    const most = [...partners.entries()].sort((a, b) => b[1] - a[1])[0];
    const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
    return [
      ["Systems linked", `${partners.size.toLocaleString("en")} of ${data.systems.length.toLocaleString("en")}`],
      ["Distinct interfaces", interfaces.length.toLocaleString("en")],
      ["Linked pairs", linkCounts.size.toLocaleString("en")],
      ["Through the integration layer", interfaces.filter((call) => call.via).length.toLocaleString("en")],
      ...(most ? [["Most connected", <span key="most" translate="no">{name(most[0])}, with {count(most[1], "system")}</span>] as [string, ReactNode]] : []),
    ];
  }, [view, data, interfaces, linkCounts]);

  return (
    <div className="cat-stack">
      <Section title={view === "delivery" ? "What systems deliver" : "Who calls whom"} headingLevel={2}>
        <p className="cat-lead">
          {view === "delivery"
            ? "Read from the offerings' components, grouped by what each does for the customer: this catalogue's reading, by keyword."
            : "Read from the modelled journeys, each interface once, whatever uses it. Pick a system to see its summary."}
        </p>
        <Facts items={figures} />
        <div className={`lsc-board${picked ? " lsc-board--picked" : ""}`}>
          <div className="lsc-map">
            {view === "delivery"
              ? <DeliveryMatrix data={data} selected={selected} onSelect={select} />
              : <InterfaceMatrix data={data} interfaces={interfaces} selected={selected} onSelect={select} />}
          </div>
          {picked && <SystemSummary data={data} system={picked} linkCounts={linkCounts} base={base} onSelect={select} />}
        </div>
      </Section>
      {view === "interfaces" && (
        <Section title="Connections recorded between systems" count={book.release.relationships.length} headingLevel={2}>
          <p className="cat-lead">What the systems' own records say depends on what, which the matrix above doesn't read.</p>
          <ConnectionsTable />
        </Section>
      )}
    </div>
  );
}

/** Every connection recorded between systems, read as a sentence, with what it is for (the Map's table). */
function ConnectionsTable() {
  const { book, base } = useCatalogueContext();
  const rows = useMemo(() => allConnections(book), [book]);
  const link = (systemId: string) => (
    <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>
  );
  const columns: Column<Relationship>[] = [
    { id: "from", header: "From", rowHeader: true, bidi: true, cell: (row) => link(row.source_system_id) },
    { id: "how", header: "How", cell: (row) => LINK_VERB[row.kind] },
    { id: "to", header: "To", bidi: true, cell: (row) => link(row.target_system_id) },
    { id: "what", header: "For what", bidi: true, cell: (row) => row.description },
  ];
  return (
    <DataTable
      caption="Every connection recorded between systems in this version"
      captionHidden
      columns={columns}
      rows={rows}
      rowId={(row) => `${row.source_system_id}>${row.target_system_id}`}
      emptyText="No system depends on another in this version."
    />
  );
}
