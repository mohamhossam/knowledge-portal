import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { CatalogueSystem } from "../api/client";
import { Button, type Column, DataTable, Section } from "../design/components";
import { type DomainRow, domainTree } from "./catalogue";
import { DomainsEdit } from "./DraftEdits";
import { useCatalogueContext } from "./useCatalogue";

type Domain = { id: string; name: string; description?: string | null; parent_id?: string | null };

/** A domain's name, set in by its depth, with what it covers under it. */
function DomainName({ row }: { row: DomainRow<Domain> }) {
  const { domain, depth } = row;
  return (
    <span className={`cat-depth cat-depth--${Math.min(depth, 2)}`}>
      <span className={depth === 0 ? "cat-name" : undefined}>{domain.name}</span>
      {domain.description && <span className="cat-detail" dir="auto">{domain.description}</span>}
    </span>
  );
}

/** The two domain trees: where systems sit, and what they do by business area. */
export function DomainsPage() {
  const { book, base, editable } = useCatalogueContext();
  const [editing, setEditing] = useState<"landscape" | "areas" | null>(null);
  const editButton = (tree: "landscape" | "areas", label: string) =>
    editable && editing !== tree ? <Button onClick={() => setEditing(tree)}>{label}</Button> : undefined;
  const landscape = useMemo(() => domainTree<Domain>(book.release.landscape_domains ?? []), [book]);
  const areas = useMemo(() => domainTree<Domain>(book.release.capability_domains ?? []), [book]);
  const unplaced = book.release.systems.filter(
    (system) => !system.landscape_domain_id || !book.landscape.has(system.landscape_domain_id),
  );
  const systemLink = (system: CatalogueSystem) => (
    <Link to={`${base}/systems/${encodeURIComponent(system.id)}`} dir="auto">{system.name}</Link>
  );
  const list = (systems: CatalogueSystem[], none: string): ReactNode =>
    systems.length ? (
      systems.map((system, index) => (
        <Fragment key={system.id}>
          {index > 0 && ", "}
          {systemLink(system)}
        </Fragment>
      ))
    ) : (
      <span className="cat-quiet">{none}</span>
    );

  // The landscape's rows, then the systems placed nowhere as a last row.
  type Place = { row: DomainRow<Domain> | null; systems: CatalogueSystem[] };
  const places: Place[] = [
    ...landscape.map((row) => ({ row, systems: book.release.systems.filter((system) => system.landscape_domain_id === row.domain.id) })),
    ...(unplaced.length && landscape.length ? [{ row: null, systems: unplaced }] : []),
  ];
  const placeColumns: Column<Place>[] = [
    { id: "domain", header: "Domain", rowHeader: true, bidi: true, cell: (place) => (place.row ? <DomainName row={place.row} /> : <span className="cat-quiet">Not placed</span>) },
    { id: "systems", header: "Systems", cell: (place) => list(place.systems, "None directly") },
  ];
  const areaColumns: Column<DomainRow<Domain>>[] = [
    { id: "area", header: "Business area", rowHeader: true, bidi: true, cell: (row) => <DomainName row={row} /> },
    {
      id: "capabilities",
      header: "Capabilities",
      cell: ({ domain }) => {
        const filed = book.release.systems.flatMap((system) =>
          system.capabilities.filter((item) => item.domain_id === domain.id).map((capability) => ({ system, capability })),
        );
        return filed.length ? (
          <ul className="cat-plain cat-plain--tight">
            {filed.map(({ system, capability }) => (
              <li key={`${system.id}:${capability.id}`}>
                <bdi>{capability.name}</bdi>
                <span className="cat-quiet"> · {systemLink(system)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="cat-quiet">None filed</span>
        );
      },
    },
  ];

  return (
    <div className="cat-stack">
      <Section title="Where systems sit" actions={editButton("landscape", "Edit where systems sit")}>
        <p className="cat-lead">The landscape: each domain with the systems placed directly in it.</p>
        {editing === "landscape" ? (
          <DomainsEdit tree="landscape" onDone={() => setEditing(null)} />
        ) : (
          <DataTable
            caption="Landscape domains and their systems"
            captionHidden
            columns={placeColumns}
            rows={places}
            rowId={(place) => place.row?.domain.id ?? "not-placed"}
            emptyText="This version places no system in a landscape."
          />
        )}
      </Section>

      <Section title="What systems do, by business area" actions={editButton("areas", "Edit the business areas")}>
        <p className="cat-lead">Each business area with the capabilities filed under it, and the system that has each.</p>
        {editing === "areas" ? (
          <DomainsEdit tree="areas" onDone={() => setEditing(null)} />
        ) : (
          <DataTable
            caption="Business areas and their capabilities"
            captionHidden
            columns={areaColumns}
            rows={areas}
            rowId={(row) => row.domain.id}
            emptyText="This version files no capability under a business area."
          />
        )}
      </Section>
    </div>
  );
}
