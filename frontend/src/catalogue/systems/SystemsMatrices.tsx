/**
 * The Systems tab read across (catalogue merge, step 5, in place of the
 * whole-estate Map): who calls whom, as the lab's interface matrix, with the
 * connections recorded between systems under it; or what each system delivers,
 * as the lab's capability matrix. Picking a system shows its summary beside the
 * matrix, as on the Landscape, with the way to its record (`?system=`).
 *
 * Who calls whom reads from the modelled journeys or from the systems' own
 * records (`?from=records`): the journeys hold only what a modelled journey
 * uses, so the two can differ, and the page says which it shows.
 */
import "../landscape/landscape.css";
import "./matrices.css";

import { type ReactNode, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { Relationship } from "../../api/client";
import { type Column, DataTable, Facts, FilterStrip, Section } from "../../design/components";
import { count } from "../../home/format";
import { LINK_VERB, allConnections, systemName } from "../catalogue";
import { SystemSummary } from "../landscape/LandscapePoster";
import { useLinkCounts, useSystemParam } from "../landscape/systemHooks";
import { fromRelease } from "../model/adapter";
import type { Integration } from "../model/model";
import { useCatalogueContext } from "../useCatalogue";
import { DeliveryMatrix } from "./DeliveryMatrix";
import { InterfaceMatrix } from "./InterfaceMatrix";
import { PART_KINDS, systemParts } from "./partKinds";

export type MatrixView = "interfaces" | "delivery";

type ReadFrom = "journeys" | "records";

/** The connections the systems' records hold, as calls from source to target, so the matrix can cross them. */
function recordedCalls(relationships: Relationship[]): Integration[] {
  return relationships.map((relationship, index) => ({
    id: `record-${index}`,
    step: "",
    from: { kind: "system", systemId: relationship.source_system_id },
    to: { kind: "system", systemId: relationship.target_system_id },
    operation: LINK_VERB[relationship.kind],
    purpose: relationship.description ?? "",
    mode: "not-stated",
    evidence: { status: "confirmed" },
  }));
}

export function SystemsMatrices({ view }: { view: MatrixView }) {
  const { book, base } = useCatalogueContext();
  const data = useMemo(() => fromRelease(book.release), [book.release]);
  const [selected, select] = useSystemParam();
  const { interfaces, linkCounts } = useLinkCounts(data);
  const picked = selected ? data.systems.find((system) => system.id === selected) ?? null : null;
  const [params, setParams] = useSearchParams();
  const from: ReadFrom = params.get("from") === "records" ? "records" : "journeys";
  const relationships = book.release.relationships;
  const recorded = useMemo(() => recordedCalls(relationships), [relationships]);
  const readFrom = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "records") next.set("from", "records");
    else next.delete("from");
    setParams(next, { replace: true });
  };

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
    const linkedOf = (pairs: { a: string; b: string }[]) => {
      const partners = new Map<string, Set<string>>();
      for (const { a, b } of pairs) {
        partners.set(a, (partners.get(a) ?? new Set<string>()).add(b));
        partners.set(b, (partners.get(b) ?? new Set<string>()).add(a));
      }
      return partners;
    };
    const of = `of ${data.systems.length.toLocaleString("en")}`;
    if (from === "records") {
      const partners = linkedOf(relationships.map((relationship) => ({ a: relationship.source_system_id, b: relationship.target_system_id })));
      // Named only from the whole record: the journeys hold a part of it, so their busiest system may not be.
      const most = [...partners.entries()].sort((a, b) => b[1].size - a[1].size)[0];
      const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
      return [
        ["Systems linked", `${partners.size.toLocaleString("en")} ${of}`],
        ["Connections recorded", relationships.length.toLocaleString("en")],
        ...(most ? [["Most connected", <span key="most" translate="no">{name(most[0])}, with {count(most[1].size, "system")}</span>] as [string, ReactNode]] : []),
      ];
    }
    const partners = linkedOf([...linkCounts.values()]);
    return [
      ["Systems linked", `${partners.size.toLocaleString("en")} ${of}`],
      ["Distinct interfaces", interfaces.length.toLocaleString("en")],
      ["Linked pairs", linkCounts.size.toLocaleString("en")],
      ["Through the integration layer", interfaces.filter((call) => call.via).length.toLocaleString("en")],
    ];
  }, [view, from, data, interfaces, linkCounts, relationships]);

  return (
    <div className="cat-stack">
      <Section title={view === "delivery" ? "What systems deliver" : "Who calls whom"} headingLevel={2}>
        <p className="cat-lead">
          {view === "delivery"
            ? "Read from the offerings' components, grouped by what each does for the customer: this catalogue's reading, by keyword."
            : from === "records"
              ? "Read from the systems' own records: every connection they name, whether a modelled journey uses it or not. Pick a system to see its summary."
              : "Read from the modelled journeys, each interface once, whatever uses it: only what a journey uses, so a connection the records name may be missing. Pick a system to see its summary."}
        </p>
        {view === "interfaces" && (
          <FilterStrip
            label="Read from"
            filters={[
              { id: "journeys", label: "Journey calls", count: interfaces.length },
              { id: "records", label: "System records", count: relationships.length },
            ]}
            active={from}
            onChange={readFrom}
          />
        )}
        <Facts items={figures} />
        <div className={`lsc-board${picked ? " lsc-board--picked" : ""}`}>
          <div className="lsc-map">
            {view === "delivery"
              ? <DeliveryMatrix data={data} selected={selected} onSelect={select} />
              : from === "records"
                ? <InterfaceMatrix data={data} interfaces={recorded} selected={selected} onSelect={select} unit="connection" />
                : <InterfaceMatrix data={data} interfaces={interfaces} selected={selected} onSelect={select} />}
          </div>
          {picked && <SystemSummary data={data} system={picked} linkCounts={linkCounts} base={base} onSelect={select} />}
        </div>
      </Section>
      {view === "interfaces" && (
        <Section title="Connections recorded between systems" count={relationships.length} headingLevel={2}>
          <p className="cat-lead">The systems' own records, each connection read as a sentence with what it is for.</p>
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
