import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { api, type CatalogueSystem, type Relationship } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, type Column, DataTable, Facts, Lines, RecordView, Section, Skeleton, Status } from "../design/components";
import { RouterLink } from "../shell/links";
import { SystemReview } from "../reviews/SystemReview";
import { seatsLine, seatsOn } from "../squads/organisation";
import { connections, dependsHow, domainPath, sentenceCase, systemName, systemRoles, usedHow } from "./catalogue";
import { SystemContextDiagram } from "./diagrams/CatalogueDiagrams";
import { ConnectionEdit, ConnectionRemove, SystemEdit, SystemRemove } from "./DraftEdits";
import { LinkBasis } from "./LinkBasis";
import type { SystemLink } from "./links";
import { type ConceptIndex, entityNames, INTERFACE_STYLE, type Interface, interfacesOf, SOURCE_TONE, SOURCE_WORD } from "./ontology";
import { useCatalogueContext } from "./useCatalogue";

/** Where a record was reached from, so the way back can be lit and retraced. */
type Trail = { from?: string };

/**
 * One system's record, in the pane beside the systems: what it is called and
 * does, the concepts it realises, the interfaces it exposes and uses, how it
 * connects, who owns it and where it plays a part.
 */
export function SystemRecord({ system, index }: { system: CatalogueSystem; index: ConceptIndex }) {
  const { book, base, editable } = useCatalogueContext();
  const [editing, setEditing] = useState<"system" | "remove" | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as Trail | null)?.from;
  const place = domainPath(book.landscape, system.landscape_domain_id);

  return (
    <RecordView
      title={system.name}
      // Choosing a system moves focus to its record; a fresh page load leaves it be.
      takeFocus={location.key !== "default"}
      meta={system.name_ar ? <span lang="ar" dir="rtl">{system.name_ar}</span> : undefined}
      lead={system.description || undefined}
      actions={
        editable ? (
          <ActionGroup label={`Edit ${system.name}`}>
            <Button aria-expanded={editing === "system"} onClick={() => setEditing(editing === "system" ? null : "system")}>Edit this system</Button>
            <Button variant="tertiary" aria-expanded={editing === "remove"} onClick={() => setEditing(editing === "remove" ? null : "remove")}>Remove this system…</Button>
          </ActionGroup>
        ) : undefined
      }
    >
      <div className="cat-record__head">
        {from && book.systems.has(from) && (
          <Button variant="link" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>
            Back to <bdi>{systemName(book, from)}</bdi>
          </Button>
        )}
        <SystemReview system={system} />
        <Facts
          items={[
            ...(system.aliases.length ? [["Also called", <bdi key="aliases">{system.aliases.join(", ")}</bdi>] as [string, ReactNode]] : []),
            ["Sits in", place.length ? <RouterLink href={`${base}/domains`}><bdi>{place.join(" › ")}</bdi></RouterLink> : <span className="cat-quiet">Not placed in the landscape</span>],
            ["Run by", <RunBy key="run-by" system={system} />],
            // The catalogue's own owner field, kept when its source names one: Ownership decides who runs it.
            ...(system.owner ? [["Owner in the source", <bdi key="owner">{system.owner}</bdi>] as [string, ReactNode]] : []),
            ...(system.roadmap ? [["Roadmap", <bdi key="roadmap">{system.roadmap}</bdi>] as [string, ReactNode]] : []),
            [
              "Source",
              <span key="source" className="cat-inline">
                {system.confidence && <Status tone={SOURCE_TONE[system.confidence]}>{SOURCE_WORD[system.confidence]}</Status>}
                {system.source ? <bdi>{system.source}</bdi> : !system.confidence && <span className="cat-quiet">Not stated</span>}
              </span>,
            ],
          ]}
        />
      </div>

      {editing === "system" && <SystemEdit system={system} onDone={() => setEditing(null)} />}
      {editing === "remove" && <SystemRemove system={system} onDone={() => setEditing(null)} />}
      {editing !== "system" && (
        <>
          <Section
            title="In context"
            headingLevel={3}
            actions={<RouterLink href={`${base}/map?system=${encodeURIComponent(system.id)}`}>Open it full width</RouterLink>}
          >
            <SystemContextDiagram systemId={system.id} />
          </Section>
          <Capabilities system={system} index={index} />
          <Interfaces system={system} />
          <Connections system={system} from={from} />
          <Owners system={system} />
          <Roles system={system} />
          <Data system={system} />
          <Components system={system} />
          <Section title="Constraints" count={system.constraints.length} headingLevel={3}>
            {system.constraints.length ? (
              <Lines>{system.constraints.map((item) => <li key={item} dir="auto">{item}</li>)}</Lines>
            ) : (
              <p className="cat-quiet">No constraint is recorded.</p>
            )}
          </Section>
        </>
      )}
    </RecordView>
  );
}

function Capabilities({ system, index }: { system: CatalogueSystem; index: ConceptIndex }) {
  const { base } = useCatalogueContext();
  const components = new Map(system.components.map((item) => [item.id, item.name]));
  type Capability = CatalogueSystem["capabilities"][number];
  const columns: Column<Capability>[] = [
    {
      id: "name",
      header: "Capability",
      rowHeader: true,
      bidi: true,
      cell: (capability) => (
        <>
          {capability.name}
          {capability.component_id && <span className="cat-detail">in <bdi>{components.get(capability.component_id) ?? capability.component_id}</bdi></span>}
        </>
      ),
    },
    {
      id: "concept",
      header: "Concept",
      bidi: true,
      cell: (capability) => {
        const concept = capability.concept_id ? index.byId.get(capability.concept_id) : undefined;
        if (concept) return <Link to={`${base}/concepts/${encodeURIComponent(concept.id)}`} className="cat-chip">{concept.pref_label}</Link>;
        if (capability.unlinked_reason) return <span className="cat-quiet">None fits: <bdi>{capability.unlinked_reason}</bdi></span>;
        return <span className="cat-quiet">Not linked</span>;
      },
    },
    { id: "phrases", header: "Matched by", bidi: true, cell: (capability) => capability.triggers.map((phrase) => `“${phrase}”`).join(", ") },
  ];
  return (
    <Section title="What it does" count={system.capabilities.length} headingLevel={3}>
      {system.capabilities.length ? (
        <>
          <p className="cat-lead">Requirement work maps a requirement to this system when it names one of these concepts or phrases.</p>
          <DataTable caption={`Capabilities of ${system.name}`} captionHidden columns={columns} rows={system.capabilities} rowId={(item) => item.id} />
        </>
      ) : (
        <p className="cat-quiet">No capability is recorded, so requirement work never maps to it by phrase.</p>
      )}
    </Section>
  );
}

function Interfaces({ system }: { system: CatalogueSystem }) {
  const { book, base } = useCatalogueContext();
  const { exposes, uses } = interfacesOf(book.release, system.id);
  const entities = entityNames(book.release);
  const sys = (systemId: string) => <Link key={systemId} to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>;
  const list = (ids: string[]) => ids.map((systemId, position) => <span key={systemId}>{position > 0 && ", "}{sys(systemId)}</span>);
  const columns = (side: "exposes" | "uses"): Column<Interface>[] => [
    {
      id: "name",
      header: "Interface",
      rowHeader: true,
      bidi: true,
      cell: (item) => (
        <>
          {item.name}
          {item.entity_ids.length > 0 && (
            <span className="cat-detail">Carries <bdi>{item.entity_ids.map((entity) => entities.get(entity) ?? entity).join(", ")}</bdi></span>
          )}
        </>
      ),
    },
    side === "exposes"
      ? { id: "who", header: "Used by", cell: (item) => (item.consumer_ids.length ? list(item.consumer_ids) : <span className="cat-quiet">No consumer recorded</span>) }
      : { id: "who", header: "Exposed by", cell: (item) => sys(item.system_id) },
    { id: "style", header: "Style", cell: (item) => INTERFACE_STYLE[item.style] },
  ];
  if (!exposes.length && !uses.length) {
    return (
      <Section title="Interfaces" headingLevel={3}>
        <p className="cat-quiet">No interface it exposes or uses is recorded.</p>
      </Section>
    );
  }
  return (
    <>
      <Section title="Exposes" count={exposes.length} headingLevel={3}>
        {exposes.length ? (
          <DataTable caption={`Interfaces ${system.name} exposes`} captionHidden columns={columns("exposes")} rows={exposes} rowId={(item) => item.id} />
        ) : (
          <p className="cat-quiet">It exposes no recorded interface.</p>
        )}
      </Section>
      <Section title="Uses" count={uses.length} headingLevel={3}>
        {uses.length ? (
          <DataTable caption={`Interfaces ${system.name} uses`} captionHidden columns={columns("uses")} rows={uses} rowId={(item) => item.id} />
        ) : (
          <p className="cat-quiet">It uses no recorded interface.</p>
        )}
      </Section>
    </>
  );
}

function Connections({ system, from }: { system: CatalogueSystem; from?: string }) {
  const { book, editable } = useCatalogueContext();
  const { dependsOn, usedBy } = connections(book, system.id);
  return (
    <>
      <ConnectionTable
        title="Depends on"
        rows={dependsOn}
        other={(row) => row.target_system_id}
        how={(row) => dependsHow(row.kind, system.name)}
        from={from}
        system={system}
        empty="It depends on no other system in this version."
        editable={editable}
      />
      <ConnectionTable
        title="Used by"
        rows={usedBy}
        other={(row) => row.source_system_id}
        how={(row) => usedHow(row.kind, system.name)}
        from={from}
        system={system}
        empty="No system depends on it in this version."
      />
    </>
  );
}

function ConnectionTable({ title, rows, other, how, from, system, empty, editable }: {
  title: string;
  rows: SystemLink[];
  other: (row: SystemLink) => string;
  how: (row: SystemLink) => string;
  from?: string;
  system: CatalogueSystem;
  empty: string;
  /** A draft edits the dependencies a system has; those on it are edited on the other system's record. */
  editable?: boolean;
}) {
  const { book, base } = useCatalogueContext();
  const [editing, setEditing] = useState<Relationship | "new" | null>(null);
  const [removing, setRemoving] = useState<Relationship | null>(null);
  const columns: Column<SystemLink>[] = [
    {
      id: "system",
      header: "System",
      rowHeader: true,
      bidi: true,
      cell: (row) => {
        const target = other(row);
        return (
          <>
            <Link to={`${base}/systems/${encodeURIComponent(target)}`} state={{ from: system.id } satisfies Trail}>{systemName(book, target)}</Link>
            {target === from && <span className="cat-detail">Where you came from</span>}
            <span className="cat-detail">{how(row)}</span>
          </>
        );
      },
    },
    { id: "what", header: "For what", bidi: true, cell: (row) => row.description },
    { id: "basis", header: "Known from", cell: (row) => <LinkBasis link={row} base={base} /> },
    ...(editable
      ? [{
          id: "edit",
          header: <span className="ds-visually-hidden">Edit</span>,
          // Only a stated connection is edited here; the rest change with their interfaces and journeys.
          cell: (row: SystemLink) => {
            const stated = row.stated;
            // A derived link changes with the interfaces and journeys it is known from.
            if (!stated) return <span className="cat-quiet">Changes with its sources</span>;
            return (
              <ActionGroup label={`The dependency on ${systemName(book, other(row))}`}>
                <Button variant="quiet" onClick={() => { setRemoving(null); setEditing(stated); }}>Change</Button>
                <Button variant="quiet" onClick={() => { setEditing(null); setRemoving(stated); }}>Remove</Button>
              </ActionGroup>
            );
          },
        }]
      : []),
  ];
  return (
    <Section
      title={title}
      count={rows.length}
      headingLevel={3}
      actions={editable && !editing && !removing ? <Button variant="quiet" onClick={() => setEditing("new")}>Add a dependency</Button> : undefined}
    >
      {rows.length ? (
        <DataTable caption={`${title}: ${system.name}`} captionHidden columns={columns} rows={rows} rowId={(row) => `${row.source_system_id}>${row.target_system_id}`} />
      ) : (
        <p className="cat-quiet">{empty}</p>
      )}
      {editing && (
        <ConnectionEdit
          key={editing === "new" ? "new" : `${editing.source_system_id}>${editing.target_system_id}`}
          system={system}
          connection={editing === "new" ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {removing && <ConnectionRemove connection={removing} onDone={() => setRemoving(null)} />}
    </Section>
  );
}

/** Who runs a system: the squad catalogue as it is today, whichever version is being read. */
function useOwnership(systemId: string) {
  return useQuery({
    queryKey: ["organisation", "systems", systemId, "ownership"],
    queryFn: () => api.systemOwnership(systemId),
  });
}

/** The record's head says who runs the system in Ownership's words, as "Owned by" below does. */
function RunBy({ system }: { system: CatalogueSystem }) {
  const ownership = useOwnership(system.id);
  if (ownership.isPending) return <span className="cat-quiet">Reading the squad catalogue…</span>;
  if (ownership.isError) return <span className="cat-quiet">Not known: the squad catalogue didn't answer</span>;
  const squads = ownership.data.squads;
  if (!squads.length) return <span className="cat-quiet">No squad</span>;
  return <bdi>{squads.map((squad) => squad.name).join(", ")}</bdi>;
}

/** Owners come from the squad catalogue as it is today, whichever version is being read. */
function Owners({ system }: { system: CatalogueSystem }) {
  const { book, inService } = useCatalogueContext();
  const ownership = useOwnership(system.id);
  const organisation = useQuery({ queryKey: ["organisation"], queryFn: api.organisation });
  const org = organisation.data ?? { people: [], value_streams: [], products: [], squads: [] };
  const streams = new Map((ownership.data?.value_streams ?? []).map((stream) => [stream.id, stream.name]));
  const squads = ownership.data?.squads ?? [];
  const products = ownership.data?.products ?? [];
  type Squad = (typeof squads)[number];
  const columns: Column<Squad>[] = [
    {
      id: "squad",
      header: "Squad",
      rowHeader: true,
      bidi: true,
      cell: (squad) => (
        <>
          {squad.name}
          <span className="cat-detail"><bdi>{streams.get(squad.value_stream_id) ?? squad.value_stream_id}</bdi></span>
        </>
      ),
    },
    { id: "people", header: "People on it", bidi: true, cell: (squad) => seatsLine(seatsOn(org, squad, system.id, book.release)) },
  ];
  return (
    <Section title="Owned by" headingLevel={3}>
      {!inService && <p className="cat-lead">Owners as the squad catalogue records them today.</p>}
      {ownership.isPending ? (
        <Skeleton label="Reading the squad catalogue" rows={2} />
      ) : ownership.isError ? (
        <p role="alert"><Status tone="attention">{errorMessage(ownership.error)}</Status></p>
      ) : squads.length ? (
        <DataTable caption={`Squads that own ${system.name}`} captionHidden columns={columns} rows={squads} rowId={(squad) => squad.id} />
      ) : (
        <p className="cat-quiet">
          No squad owns it. <RouterLink href={`/squads/systems/${encodeURIComponent(system.id)}`}>Give it to a squad in Ownership</RouterLink>
        </p>
      )}
      {products.length > 0 && (
        <p className="cat-lead">
          Part of {products.length === 1 ? "the product" : "the products"}{" "}
          {products.map((product, position) => (
            <span key={product.id}>{position > 0 && ", "}<strong><bdi>{product.name}</bdi></strong></span>
          ))}
          .
        </p>
      )}
    </Section>
  );
}

function Roles({ system }: { system: CatalogueSystem }) {
  const { book, base } = useCatalogueContext();
  const { offerings, journeys } = systemRoles(book, system.id);
  type Role = { key: string; where: ReactNode; detail: string; part: ReactNode };
  const rows: Role[] = [
    ...offerings.map((role) => ({
      key: `o:${role.offering.id}:${role.component}:${role.role}`,
      where: <Link to={`${base}/offerings/${encodeURIComponent(role.offering.id)}`}>{role.offering.name}</Link>,
      detail: `Offering · ${role.component}`,
      part: (
        <>
          {sentenceCase(role.role)}
          {role.orderTypes.length > 0 && <> for {role.orderTypes.join(", ")}</>}
          {role.description && <span className="cat-detail">{role.description}</span>}
        </>
      ),
    })),
    ...journeys.map((role) => ({
      key: `j:${role.journey.id}:${role.activity.number}`,
      where: <Link to={`${base}/journeys/${encodeURIComponent(role.journey.id)}`}>{role.journey.name}</Link>,
      detail: `Journey · step ${role.activity.number}`,
      part: <>{role.performs ? "Performs" : "Supports"} “<bdi>{role.activity.name}</bdi>”</>,
    })),
  ];
  const columns: Column<Role>[] = [
    { id: "where", header: "Where", rowHeader: true, bidi: true, cell: (row) => <>{row.where}<span className="cat-detail">{row.detail}</span></> },
    { id: "part", header: "Its part", bidi: true, cell: (row) => row.part },
  ];
  return (
    <Section title="Offerings and journeys" count={rows.length} headingLevel={3}>
      {rows.length ? (
        <DataTable caption={`Where ${system.name} plays a part`} captionHidden columns={columns} rows={rows} rowId={(row) => row.key} />
      ) : (
        <p className="cat-quiet">No offering or journey in this version names it.</p>
      )}
    </Section>
  );
}

/** The information entities it masters and reads. */
function Data({ system }: { system: CatalogueSystem }) {
  const { book } = useCatalogueContext();
  const masters = system.masters ?? [];
  const reads = system.reads ?? [];
  if (!masters.length && !reads.length) return null;
  const entities = entityNames(book.release);
  const names = (ids: string[]) => ids.map((entity) => entities.get(entity) ?? entity).join(", ");
  return (
    <Section title="Information" headingLevel={3}>
      <Facts
        items={[
          ["Masters", masters.length ? <bdi>{names(masters)}</bdi> : <span className="cat-quiet">Nothing recorded</span>],
          ["Reads", reads.length ? <bdi>{names(reads)}</bdi> : <span className="cat-quiet">Nothing recorded</span>],
        ]}
      />
    </Section>
  );
}

function Components({ system }: { system: CatalogueSystem }) {
  type Component = CatalogueSystem["components"][number];
  const columns: Column<Component>[] = [
    {
      id: "name",
      header: "Component",
      rowHeader: true,
      bidi: true,
      cell: (component) => (
        <>
          {component.name}
          {component.name_ar && <span className="cat-detail" lang="ar" dir="rtl">{component.name_ar}</span>}
          {component.aliases.length > 0 && <span className="cat-detail">Also called <bdi>{component.aliases.join(", ")}</bdi></span>}
        </>
      ),
    },
    {
      id: "what",
      header: "What it is",
      bidi: true,
      cell: (component) => (
        <>
          {component.description ?? <span className="cat-quiet">No description</span>}
          {component.technology && <span className="cat-detail">Built with <bdi>{component.technology}</bdi></span>}
        </>
      ),
    },
  ];
  return (
    <Section title="Components" count={system.components.length} headingLevel={3}>
      {system.components.length ? (
        <DataTable caption={`Components of ${system.name}`} captionHidden columns={columns} rows={system.components} rowId={(item) => item.id} />
      ) : (
        <p className="cat-quiet">No component is recorded.</p>
      )}
    </Section>
  );
}
