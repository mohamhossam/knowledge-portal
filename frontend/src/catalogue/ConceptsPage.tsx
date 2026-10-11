import { type ReactNode, useEffect, useId, useMemo, useRef } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import { type Column, DataTable, EmptyState, Facts, FilterStrip, Section, SplitPane, Status } from "../design/components";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import {
  type Concept, type ConceptIndex, conceptIndex, conceptPath, coverage, findConcepts, realisationRecords, SOURCE_TONE, SOURCE_WORD,
} from "./ontology";
import { useCatalogueContext } from "./useCatalogue";

const ALL = "all";

/**
 * Capability concepts (redesign phase 5): what the business needs done, in
 * the ontology's words. Requirements map to a concept first, then to the
 * systems and offering components that realise it. How much is mapped comes
 * first, then every concept beside the record of the one chosen.
 */
export function ConceptsPage() {
  const { conceptId } = useParams();
  const { book, base } = useCatalogueContext();
  const index = useMemo(() => conceptIndex(book.release), [book.release]);
  const chosen = conceptId !== undefined ? index.byId.get(conceptId) : undefined;

  const list = <ConceptsTable index={index} current={chosen?.id} />;
  return (
    <>
      <CatalogueHeader page="concepts" />
      {index.concepts.length === 0 ? (
        <EmptyState title="This version names no capability concept yet.">
          <p>Concepts arrive with a version built from the ontology. Requirement work maps by system capabilities and phrases until then.</p>
        </EmptyState>
      ) : (
        <>
          <CoverageLine index={index} />
          {conceptId !== undefined && !chosen && (
            <EmptyState title={`This version has no concept “${conceptId}”.`} action={<RouterLink href={`${base}/concepts`}>See every concept</RouterLink>} />
          )}
          {chosen ? (
            <SplitPane list={list} pane={<ConceptRecord key={chosen.id} concept={chosen} index={index} />} paneLabel={`Concept: ${chosen.pref_label}`} />
          ) : (
            list
          )}
        </>
      )}
    </>
  );
}

/** How much of the catalogue is mapped to concepts, as four counts. */
function CoverageLine({ index }: { index: ConceptIndex }) {
  const { book } = useCatalogueContext();
  const tally = coverage(book.release, index);
  const areas = [...index.domains.values()]
    .map((domain) => ({ name: domain.name, n: index.concepts.filter((concept) => concept.domain_id === domain.id).length }))
    .filter((area) => area.n > 0);
  return (
    <section className="cat-tally" aria-label="How much is mapped to concepts">
      <dl className="cat-tally__list">
        <div>
          <dt>System capabilities linked</dt>
          <dd><strong>{tally.linkedCapabilities} of {tally.capabilities}</strong><span>{count(tally.noneFits, "marked “none fits”", "marked “none fits”")}</span></dd>
        </div>
        <div>
          <dt>Offering components linked</dt>
          <dd><strong>{tally.linkedComponents} of {tally.components}</strong></dd>
        </div>
        <div>
          <dt>Concepts no system realises</dt>
          <dd><strong>{tally.withoutSystem}</strong><span>linked to components only, or to nothing</span></dd>
        </div>
        <div>
          <dt>Capability domains</dt>
          <dd><strong>{areas.length}</strong><span>{areas.map((area) => `${area.name} ${area.n}`).join(" · ")}</span></dd>
        </div>
      </dl>
    </section>
  );
}

type Row = { concept: Concept; why: string | null };

function ConceptsTable({ index, current }: { index: ConceptIndex; current?: string }) {
  const { base } = useCatalogueContext();
  const [params, setParams] = useSearchParams();
  const area = params.get("area") ?? ALL;
  const find = params.get("find") ?? "";
  const set = (key: string, value: string, empty: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === empty) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  const found = useMemo(() => findConcepts(index.concepts, find), [index.concepts, find]);
  const rows: Row[] = index.concepts
    .filter((concept) => area === ALL || concept.domain_id === area)
    .filter((concept) => !find.trim() || found.has(concept.id))
    .map((concept) => ({ concept, why: found.get(concept.id) ?? null }));
  const filters = [
    { id: ALL, label: "All", count: index.concepts.length },
    ...[...index.domains.values()].map((domain) => ({
      id: domain.id,
      label: domain.name,
      count: index.concepts.filter((concept) => concept.domain_id === domain.id).length,
    })),
  ];
  const query = params.size ? `?${params}` : "";
  const columns: Column<Row>[] = [
    {
      id: "concept",
      header: "Concept",
      rowHeader: true,
      bidi: true,
      cell: ({ concept, why }) => (
        <>
          <Link
            to={`${base}/concepts/${encodeURIComponent(concept.id)}${query}`}
            className="cat-name"
            aria-current={concept.id === current ? "page" : undefined}
          >
            {concept.pref_label}
          </Link>
          {why ? (
            <span className="cat-detail">Also called “<bdi>{why}</bdi>”</span>
          ) : (
            concept.alt_labels.length > 0 && <span className="cat-detail"><bdi>{concept.alt_labels.join(" · ")}</bdi></span>
          )}
        </>
      ),
    },
    {
      id: "systems",
      header: "Systems",
      bidi: true,
      cell: ({ concept }) => {
        const uses = index.systems.get(concept.id) ?? [];
        return uses.length ? <bdi>{uses.map((use) => use.system.name).join(", ")}</bdi> : <span className="cat-quiet">None</span>;
      },
    },
    { id: "components", header: "Components", numeric: true, cell: ({ concept }) => index.components.get(concept.id)?.length ?? 0 },
    {
      id: "source",
      header: "Source",
      cell: ({ concept }) => (concept.confidence ? <Status tone={SOURCE_TONE[concept.confidence]}>{SOURCE_WORD[concept.confidence]}</Status> : <span className="cat-quiet">Not stated</span>),
    },
  ];
  return (
    <div className="cat-list">
      <FilterStrip
        label="Concepts by capability domain"
        filters={filters}
        active={area}
        onChange={(id) => set("area", id, ALL)}
        find={{ label: "Find a concept by any label", value: find, onChange: (value) => set("find", value, ""), placeholder: "Any label, e.g. GPON" }}
        onClear={area !== ALL || find ? () => setParams({}, { replace: true }) : undefined}
      />
      <p className="cat-count" aria-live="polite">
        {area === ALL && !find.trim() ? count(index.concepts.length, "concept") : `${count(rows.length, "concept")} of ${index.concepts.length}`}
      </p>
      <DataTable
        caption="Capability concepts in this version"
        captionHidden
        columns={columns}
        rows={rows}
        rowId={(row) => row.concept.id}
        emptyText={find.trim() ? `No concept is labelled “${find.trim()}”.` : "No concept sits in this capability domain."}
      />
    </div>
  );
}

function ConceptRecord({ concept, index }: { concept: Concept; index: ConceptIndex }) {
  const { book, base } = useCatalogueContext();
  const location = useLocation();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const records = realisationRecords(book.release);
  const path = conceptPath(index, concept);
  const systems = index.systems.get(concept.id) ?? [];
  const components = index.components.get(concept.id) ?? [];
  const narrower = index.narrower.get(concept.id) ?? [];
  const broader = concept.broader_id ? index.byId.get(concept.broader_id) : undefined;
  const conceptLink = (other: Concept) => <Link key={other.id} to={`${base}/concepts/${encodeURIComponent(other.id)}`} dir="auto">{other.pref_label}</Link>;

  useEffect(() => {
    if (location.key === "default") return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [location.key]);

  type Use = (typeof systems)[number];
  type Part = (typeof components)[number];
  return (
    <article className="cat-record" data-takes-focus aria-labelledby={`${id}-name`}>
      <header className="cat-record__head">
        {path.length > 0 && <p className="cat-record__path"><bdi>{path.join(" › ")}</bdi></p>}
        <h2 id={`${id}-name`} ref={heading} tabIndex={-1} className="cat-record__title" dir="auto">{concept.pref_label}</h2>
        {concept.definition && <p className="cat-record__lead" dir="auto">{concept.definition}</p>}
      </header>
      <Section title="Labels" count={1 + concept.alt_labels.length} headingLevel={3}>
        <ul className="cat-chips" aria-label={`Labels of ${concept.pref_label}`}>
          <li><span className="cat-chip cat-chip--preferred" dir="auto">{concept.pref_label}<span className="ds-visually-hidden"> (preferred)</span></span></li>
          {concept.alt_labels.map((label) => <li key={label}><span className="cat-chip cat-chip--plain" dir="auto">{label}</span></li>)}
        </ul>
        <p className="cat-quiet">Each label names one concept. “Wi-Fi” and “WiFi” count as the same label.</p>
      </Section>
      <Section title="Systems that do this" count={systems.length} headingLevel={3}>
        {systems.length ? (
          <DataTable<Use>
            caption={`Systems that realise ${concept.pref_label}`}
            captionHidden
            rows={systems}
            rowId={(use) => use.system.id}
            columns={[
              { id: "system", header: "System", rowHeader: true, bidi: true, cell: (use) => <Link to={`${base}/systems/${encodeURIComponent(use.system.id)}`}>{use.system.name}</Link> },
              { id: "capability", header: "Its capability", bidi: true, cell: (use) => use.capability },
            ]}
          />
        ) : (
          <p className="cat-quiet">No system's capability names this concept.</p>
        )}
      </Section>
      <Section title="Offering components" count={components.length} headingLevel={3}>
        {components.length ? (
          <DataTable<Part>
            caption={`Offering components that mean ${concept.pref_label}`}
            captionHidden
            rows={components}
            rowId={(part) => `${part.offering.id}:${part.component.id}`}
            columns={[
              {
                id: "component",
                header: "Component",
                rowHeader: true,
                bidi: true,
                cell: (part) => (
                  <>
                    <Link to={`${base}/offerings/${encodeURIComponent(part.offering.id)}`}>{part.offering.name}</Link> › <bdi>{part.component.name}</bdi>
                  </>
                ),
              },
              {
                id: "realised",
                header: "Realised as",
                bidi: true,
                cell: (part) =>
                  (part.component.realisation ?? []).length ? (
                    part.component.realisation
                      .map((item) => `${item.record_id ? records.get(item.record_id)?.name ?? item.name : item.name} (${item.layer === "resource" ? "resource" : item.layer.toUpperCase()})`)
                      .join(", ")
                  ) : (
                    <span className="cat-quiet">Not recorded</span>
                  ),
              },
            ]}
          />
        ) : (
          <p className="cat-quiet">No offering component means this concept.</p>
        )}
      </Section>
      <Section title="About" headingLevel={3}>
        <Facts
          items={[
            ["Broader concept", broader ? conceptLink(broader) : <span className="cat-quiet">None (a top concept)</span>],
            ...(narrower.length ? [["Narrower", <span key="narrower">{narrower.map((item, position) => <span key={item.id}>{position > 0 && ", "}{conceptLink(item)}</span>)}</span>] as [string, ReactNode]] : []),
            ["Outside match", concept.exact_match ? <bdi>{concept.exact_match}</bdi> : <span className="cat-quiet">None recorded</span>],
            [
              "Source",
              <span key="source" className="cat-inline">
                {concept.confidence && <Status tone={SOURCE_TONE[concept.confidence]}>{SOURCE_WORD[concept.confidence]}</Status>}
                {concept.source && <bdi>{concept.source}</bdi>}
              </span>,
            ],
          ]}
        />
      </Section>
    </article>
  );
}
