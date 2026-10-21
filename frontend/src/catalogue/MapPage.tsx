import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { type Column, DataTable, Tabs } from "../design/components";
import { diagramHref } from "../shell/diagramHref";
import { RouterLink } from "../shell/links";
import { LINK_VERB, allConnections, systemName } from "./catalogue";
import type { Href } from "./diagrams/build";
import { linkBasis, type SystemLink } from "./links";
import { CapabilityMapDiagram, ConnectionsFlowDiagram, SystemContextDiagram } from "./diagrams/CatalogueDiagrams";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useCatalogueContext } from "./useCatalogue";

type Lens = "connections" | "capabilities";

const LENSES: { id: Lens; label: string }[] = [
  { id: "connections", label: "How systems connect" },
  { id: "capabilities", label: "What systems do" },
];

/**
 * The catalogue as a map (UX rebuild plan, phase 4): the whole version drawn
 * one way at a time. Each lens is a diagram with its table one press away, and
 * every system on it opens its record.
 */
export function MapPage() {
  const { book, base } = useCatalogueContext();
  const [params, setParams] = useSearchParams();
  const lens: Lens = params.get("lens") === "capabilities" ? "capabilities" : "connections";
  const choose = (next: Lens) =>
    setParams((previous) => {
      const query = new URLSearchParams(previous);
      if (next === "connections") query.delete("lens");
      else query.set("lens", next);
      query.delete("system");
      return query;
    }, { replace: true });
  const href = useMemo<Href>(() => (id) => diagramHref(`${base}/systems/${encodeURIComponent(id)}`), [base]);
  // Opened from a system's record: that system in context, at the page's full width.
  const focus = params.get("system");
  const focused = focus !== null && book.systems.has(focus) ? focus : null;

  return (
    <>
      <CatalogueHeader page="map" />
      <Tabs label="Ways to read this catalogue" tabs={LENSES} selected={lens} onSelect={choose}>
        {lens === "capabilities" ? (
          <CapabilityMapDiagram />
        ) : focused ? (
          <div className="cat-stack">
            <p className="cat-lead">
              <RouterLink href={`${base}/map`}>Show every connection</RouterLink>
            </p>
            <SystemContextDiagram systemId={focused} />
          </div>
        ) : (
          <ConnectionsFlowDiagram landscape={book.release} href={href} table={<ConnectionsTable />} />
        )}
      </Tabs>
    </>
  );
}

/** Every connection read as a sentence, with what it is for: the flow's table. */
function ConnectionsTable() {
  const { book, base } = useCatalogueContext();
  const rows = useMemo(() => allConnections(book), [book]);
  const link = (systemId: string) => (
    <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>
  );
  const columns: Column<SystemLink>[] = [
    { id: "from", header: "From", rowHeader: true, bidi: true, cell: (row) => link(row.source_system_id) },
    { id: "how", header: "How", cell: (row) => LINK_VERB[row.kind] },
    { id: "to", header: "To", bidi: true, cell: (row) => link(row.target_system_id) },
    { id: "what", header: "For what", bidi: true, cell: (row) => row.description },
    { id: "basis", header: "Known from", cell: (row) => linkBasis(row) },
  ];
  return (
    <DataTable
      caption="Every connection between systems in this version"
      columns={columns}
      rows={rows}
      rowId={(row) => `${row.source_system_id}>${row.target_system_id}`}
      emptyText="No system depends on another in this version."
    />
  );
}
