import { Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import {
  ActionGroup, Button, DataTable, EmptyState, Facts, GapBadge, ListFilter, ListFind, ListTools, RecordList, type RecordGroup, RecordPlaceholder,
  RecordView, Section, Status, Workbench,
} from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { Retired } from "./Retired";
import { acceptances } from "./accepted";
import { AcceptedFrom } from "./AcceptedFrom";
import { ConceptEdit, ConceptRemove } from "./DraftEdits";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useFindParam } from "./frame/useFindParam";
import {
  type Concept, type ConceptIndex, conceptIndex, conceptPath, coverage, domainOf, findConcepts, realisationRecords, SOURCE_TONE, SOURCE_WORD,
} from "./ontology";
import { SourceName } from "./provenance/Provenance";
import { useCatalogueContext } from "./useCatalogue";

const ALL = "all";
const UNREALISED = "no-system";

/**
 * Capability concepts on the workbench (UX rebuild, phase 3): what the
 * business needs done, in the ontology's words. Requirements map to a concept
 * first, then to the systems and offering components that realise it. Every
 * concept sits in a narrow list, grouped by capability domain, beside the
 * record of the one chosen; with none chosen, how much is mapped.
 */
export function ConceptsPage() {
  const { conceptId } = useParams();
  const { book, base, editable } = useCatalogueContext();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [adding, setAdding] = useState(false);
  const focusLater = useFocusAfterRender();
  // Closing an add that was not saved gives focus back to "Add a concept"; a saved one opens its sheet.
  const stopAdding = (saved?: string) => {
    if (!saved) focusLater(() => document.getElementById("concept-add"));
    setAdding(false);
  };
  const index = useMemo(() => conceptIndex(book.release), [book.release]);
  const chosen = conceptId !== undefined ? index.byId.get(conceptId) : undefined;

  if (index.concepts.length === 0) {
    return (
      <>
        <CatalogueHeader page="concepts" />
        {adding ? (
          <ConceptEdit onDone={stopAdding} />
        ) : (
          <EmptyState
            title="This version names no capability concept yet."
            action={editable ? <Button id="concept-add" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add a concept</Button> : undefined}
          >
            <p>Concepts arrive with a version built from the ontology, or are added here. Requirement work maps by system capabilities and phrases until then.</p>
          </EmptyState>
        )}
      </>
    );
  }

  const record = adding ? (
    <ConceptEdit onDone={stopAdding} />
  ) : chosen ? (
    <ConceptRecord key={chosen.id} concept={chosen} index={index} />
  ) : conceptId !== undefined ? (
    <EmptyState title={`This version has no concept “${conceptId}”.`} action={<RouterLink href={`${base}/concepts`}>See every concept</RouterLink>} />
  ) : (
    <RecordPlaceholder title={`${count(index.concepts.length, "concept")}. Choose one to read what realises it.`}>
      {notice && <p role="status" className="cat-notice"><Status tone="done">{notice}</Status></p>}
      <CoverageLine index={index} />
    </RecordPlaceholder>
  );

  return (
    <>
      <CatalogueHeader page="concepts" chosen={chosen?.pref_label} />
      <Workbench
        listLabel="Concepts"
        chosen={Boolean(chosen) || adding}
        list={<ConceptsList index={index} current={chosen?.id} onAdd={editable && !adding ? () => setAdding(true) : undefined} />}
        record={record}
      />
    </>
  );
}

/** How much of the catalogue is mapped to concepts, as four counts. */
function CoverageLine({ index }: { index: ConceptIndex }) {
  const { book } = useCatalogueContext();
  const tally = coverage(book.release, index);
  const areas = [...index.domains.values()]
    .map((domain) => ({ name: domain.name, n: index.concepts.filter((concept) => domainOf(index, concept).id === domain.id).length }))
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
          <dt>Capability domains with concepts</dt>
          <dd><strong>{areas.length} of {index.domains.size}</strong><span>{areas.map((area) => `${area.name} ${area.n}`).join(" · ")}</span></dd>
        </div>
      </dl>
    </section>
  );
}

const realised = (index: ConceptIndex, concept: Concept) => (index.systems.get(concept.id)?.length ?? 0) > 0;

/** The concepts as a scheme: each top concept followed by those under it, depth first, by label at each level. */
function inSchemeOrder(index: ConceptIndex): Concept[] {
  const ordered: Concept[] = [];
  const placed = new Set<string>();
  const visit = (concept: Concept) => {
    if (placed.has(concept.id)) return;
    placed.add(concept.id);
    ordered.push(concept);
    for (const narrower of index.narrower.get(concept.id) ?? []) visit(narrower);
  };
  for (const concept of index.concepts) if (!concept.broader_id || !index.byId.has(concept.broader_id)) visit(concept);
  // A concept caught in a loop of broader ones still shows, after the rest.
  for (const concept of index.concepts) visit(concept);
  return ordered;
}

function ConceptsList({ index, current, onAdd }: { index: ConceptIndex; current?: string; onAdd?: () => void }) {
  const { base } = useCatalogueContext();
  const [params, setParams] = useSearchParams();
  const show = params.get("show") === UNREALISED ? UNREALISED : ALL;
  const [find, setFind] = useFindParam();
  const found = useMemo(() => findConcepts(index.concepts, find), [index.concepts, find]);
  const unrealised = index.concepts.filter((concept) => !realised(index, concept)).length;

  // Grouped by capability domain (a narrower concept's is its top concept's), in the domains' order; concepts without one last.
  const groups = useMemo<RecordGroup[]>(() => {
    const query = params.size ? `?${params}` : "";
    const shown = inSchemeOrder(index)
      .filter((concept) => show === ALL || !realised(index, concept))
      .filter((concept) => !find.trim() || found.has(concept.id));
    const order = [...index.domains.keys(), ""];
    return order.map((domainId) => ({
      id: domainId || "none",
      label: domainId ? <bdi>{index.domains.get(domainId)?.name}</bdi> : "No capability domain",
      items: shown
        .filter((concept) => (domainOf(index, concept).id ?? "") === domainId)
        .map((concept) => {
          const why = found.get(concept.id);
          const broader = concept.broader_id ? index.byId.get(concept.broader_id) : undefined;
          return {
            id: concept.id,
            href: `${base}/concepts/${encodeURIComponent(concept.id)}${query}`,
            name: concept.deprecated ? <span className="cat-retired">{concept.pref_label}</span> : concept.pref_label,
            bidi: true,
            detail:
              broader || why || concept.alt_labels.length ? (
                <>
                  {broader && <>Under <bdi>{broader.pref_label}</bdi>{(why || concept.alt_labels.length > 0) && " · "}</>}
                  {why ? <>Also called “<bdi>{why}</bdi>”</> : concept.alt_labels.join(" · ")}
                </>
              ) : undefined,
            meta: concept.deprecated ? <span className="cat-quiet">Retired</span> : <GapBadge gaps={realised(index, concept) ? [] : ["a system that realises it"]} />,
          };
        }),
    }));
  }, [index, show, find, found, params, base]);
  const shownCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <ListTools count={show === ALL && !find.trim() ? count(index.concepts.length, "concept") : `${count(shownCount, "concept")} of ${index.concepts.length}`}>
        <ListFind label="Find a concept by any label" value={find} onChange={setFind} placeholder="Any label, e.g. GPON" />
        <ListFilter
          label="Realised by"
          value={show}
          options={[
            { id: ALL, label: "Any concept", count: index.concepts.length },
            { id: UNREALISED, label: "No system yet", count: unrealised },
          ]}
          onChange={(value) =>
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              if (value === ALL) next.delete("show");
              else next.set("show", value);
              return next;
            }, { replace: true })
          }
        />
        {onAdd && <Button id="concept-add" variant="tertiary" icon={<Plus size={16} />} onClick={onAdd}>Add a concept</Button>}
      </ListTools>
      <RecordList
        label="Capability concepts in this version"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={find.trim() ? `No concept is labelled “${find.trim()}”.` : "Every concept is realised by a system."}
      />
    </>
  );
}

function ConceptRecord({ concept, index }: { concept: Concept; index: ConceptIndex }) {
  const { book, base, editable } = useCatalogueContext();
  const location = useLocation();
  // "retire" is the edit opened from a blocked removal, already retired.
  const [editing, setEditing] = useState<"concept" | "retire" | "remove" | null>(null);
  // Closing an edit gives focus back to the button that opened it.
  const focusLater = useFocusAfterRender();
  const close = (key: "concept" | "remove") => () => {
    focusLater(() => document.getElementById(`concept-edit-${key}`));
    setEditing(null);
  };
  const changing = editing === "concept" || editing === "retire";
  const records = realisationRecords(book.release);
  const path = conceptPath(index, concept);
  const systems = index.systems.get(concept.id) ?? [];
  const components = index.components.get(concept.id) ?? [];
  const narrower = index.narrower.get(concept.id) ?? [];
  const broader = concept.broader_id ? index.byId.get(concept.broader_id) : undefined;
  const replacement = concept.replaced_by ? index.byId.get(concept.replaced_by) : undefined;
  const conceptLink = (other: Concept) => <Link key={other.id} to={`${base}/concepts/${encodeURIComponent(other.id)}`} dir="auto">{other.pref_label}</Link>;
  // Where it sits: its own capability domain, or its top concept's, said as inherited.
  const domain = domainOf(index, concept);
  const domainName = domain.id ? index.domains.get(domain.id)?.name : undefined;
  const domainFact: ReactNode = domainName ? (
    <span>
      <bdi>{domainName}</bdi>
      {domain.from && <span className="cat-detail">From its top concept, {conceptLink(domain.from)}</span>}
    </span>
  ) : (
    <span className="cat-quiet">{domain.from ? <>Not placed: its top concept, {conceptLink(domain.from)}, has none</> : "Not placed yet"}</span>
  );

  type Use = (typeof systems)[number];
  type Part = (typeof components)[number];
  return (
    <RecordView
      title={concept.pref_label}
      takeFocus={location.key !== "default"}
      meta={
        <>
          {concept.deprecated && <Retired successor={replacement && { name: replacement.pref_label, href: `${base}/concepts/${encodeURIComponent(replacement.id)}` }} />}
          {concept.confidence && <Status tone={SOURCE_TONE[concept.confidence]}>{SOURCE_WORD[concept.confidence]}</Status>}
          {path.length > 0 && <bdi>{path.join(" › ")}</bdi>}
        </>
      }
      lead={concept.definition || undefined}
      actions={
        // One edit at a time: while one is open its own Cancel closes it, so switching never drops changes unasked.
        editable && editing === null ? (
          <ActionGroup label={`Edit ${concept.pref_label}`}>
            <Button id="concept-edit-concept" aria-expanded={editing === "concept"} onClick={() => setEditing(editing === "concept" ? null : "concept")}>Edit this concept</Button>
            <Button id="concept-edit-remove" variant="tertiary" aria-expanded={editing === "remove"} onClick={() => setEditing(editing === "remove" ? null : "remove")}>Remove this concept…</Button>
          </ActionGroup>
        ) : undefined
      }
    >
      {changing && <ConceptEdit key={editing} concept={concept} retire={editing === "retire"} onDone={close("concept")} />}
      {editing === "remove" && <ConceptRemove concept={concept} onDone={close("remove")} onRetire={() => setEditing("retire")} />}
      {/* While the concept is edited, what its form holds gives way to it; what realises it stays. */}
      {!changing && (
        <Section title="Labels" count={1 + concept.alt_labels.length} headingLevel={3}>
          <ul className="cat-chips" aria-label={`Labels of ${concept.pref_label}`}>
            <li><span className="cat-chip cat-chip--preferred" dir="auto">{concept.pref_label}<span className="ds-visually-hidden"> (preferred)</span></span></li>
            {concept.alt_labels.map((label) => <li key={label}><span className="cat-chip cat-chip--plain" dir="auto">{label}</span></li>)}
          </ul>
          <p className="cat-quiet">Each label names one concept. “Wi-Fi” and “WiFi” count as the same label.</p>
        </Section>
      )}
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
      {!changing && (
        <Section title="About" headingLevel={3}>
          <Facts
            items={[
              ["Capability domain", domainFact],
              ["Broader concept", broader ? conceptLink(broader) : <span className="cat-quiet">None (a top concept)</span>],
              ...(narrower.length ? [["Narrower", <span key="narrower">{narrower.map((item, position) => <span key={item.id}>{position > 0 && ", "}{conceptLink(item)}</span>)}</span>] as [string, ReactNode]] : []),
              ["Outside match", concept.exact_match ? <bdi>{concept.exact_match}</bdi> : <span className="cat-quiet">None recorded</span>],
              ...((concept.close_match ?? []).length ? [["Near matches", <bdi key="near">{concept.close_match.join(", ")}</bdi>] as [string, ReactNode]] : []),
              ["Source", concept.source ? <SourceName text={concept.source} /> : <span className="cat-quiet">Not stated</span>],
              ...(acceptances(concept).length ? [["Accepted from", <AcceptedFrom key="accepted" accepted={acceptances(concept)} />] as [string, ReactNode]] : []),
            ]}
          />
        </Section>
      )}
    </RecordView>
  );
}
