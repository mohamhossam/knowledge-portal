import { Check, Minus, Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { Offering, Release } from "../api/client";
import {
  ActionGroup, Button, type Column, DataTable, EmptyState, Facts, FilterStrip, GapBadge, Lines, ListFind, ListTools, RecordList, type RecordGroup,
  RecordPlaceholder, RecordView, Section, Tabs, Workbench,
} from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { acceptances } from "./accepted";
import { AcceptedFrom } from "./AcceptedFrom";
import { roleLabel, systemName } from "./catalogue";
import { OfferingStructureDiagram } from "./diagrams/CatalogueDiagrams";
import { OfferingEdit, OfferingSectionEdit, WholeRemove, WholeRename } from "./DraftEdits";
import { PortfolioRegister, RecordsRegister } from "./OfferingRegisters";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useFindParam } from "./frame/useFindParam";
import { ArchitectureDecisions, ConflictList, OfferingSourceList, OpenQuestions, SourceMark } from "./GovernanceSections";
import { conflictsFor, questionOf } from "./governance";
import { LifecycleSection } from "./LifecycleNotes";
import { familyGroups } from "./offering/familyGroups";
import { OfferingFootprint } from "./offering/OfferingFootprint";
import { OfferingPlans } from "./offering/OfferingPlans";
import { OfferingRules } from "./offering/OfferingRules";
import { OFFERING_SECTIONS, type OfferingSection } from "./offeringSections";
import { conceptIndex, realisationRecords } from "./ontology";
import { NfrSection, RealisationKey, RealisedAs } from "./Realisation";
import { Retired } from "./Retired";
import { TrackingSection } from "./Tracking";
import { useCatalogueContext } from "./useCatalogue";

type Component = Offering["components"][number];

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

/**
 * The product offerings of a version on the workbench (UX rebuild, phase 3):
 * every offering in a narrow list, grouped by family, beside the record of the
 * one chosen (what it is made of, its order types, journeys, service and what
 * is still to be decided). With none chosen, every offering side by side, in
 * the list's order.
 */
export function OfferingsPage() {
  const { offeringId } = useParams();
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const focusLater = useFocusAfterRender();
  const offerings = book.release.products ?? [];
  const chosen = offeringId !== undefined ? offerings.find((item) => item.id === offeringId) : undefined;
  // An address made before a rename still finds the offering, under its id now.
  const renamed = chosen || offeringId === undefined ? undefined : offerings.find((item) => (item.former_ids ?? []).includes(offeringId));
  const location = useLocation();
  if (renamed) return <Navigate replace to={`${base}/offerings/${encodeURIComponent(renamed.id)}${location.search}`} />;

  const record = adding ? (
    <OfferingEdit
      onDone={(saved) => {
        setAdding(false);
        if (saved) return navigate(`${base}/offerings/${encodeURIComponent(saved)}`);
        focusLater(() => document.getElementById("offering-add"));
      }}
    />
  ) : chosen ? (
    <OfferingRecord key={chosen.id} offering={chosen} />
  ) : offeringId !== undefined ? (
    <EmptyState title={`This version has no offering “${offeringId}”.`} action={<RouterLink href={`${base}/offerings`}>See every offering</RouterLink>} />
  ) : offerings.length ? (
    <RecordPlaceholder title={`${count(offerings.length, "offering")}. Choose one to read what it is made of and who delivers it.`}>
      <AllOfferings release={book.release} />
      <PortfolioRegister />
      <RecordsRegister />
    </RecordPlaceholder>
  ) : (
    <>
      <EmptyState title="This version describes no product offering.">
        <p>Offerings arrive from a solution design read into a draft{editable ? ", or add one by hand" : ""}.</p>
      </EmptyState>
      {/* The registers offerings draw on can be set up before the first offering. */}
      <PortfolioRegister />
      <RecordsRegister />
    </>
  );

  return (
    <>
      <CatalogueHeader page="offerings" chosen={chosen?.name} />
      <Workbench
        listLabel="Offerings"
        chosen={Boolean(chosen) || adding}
        list={<OfferingsList current={chosen?.id} onAdd={editable && !adding ? () => setAdding(true) : undefined} />}
        record={record}
      />
    </>
  );
}

/** What an offering's record is missing, in the words its record uses. */
function offeringGaps(release: Release, offering: Offering): string[] {
  const gaps: string[] = [];
  if (!offering.components.length) gaps.push("components");
  else if (offering.components.some((part) => !part.responsibilities.length)) gaps.push("a system for every component");
  if (!offering.order_types.length) gaps.push("order types");
  if (!(release.journeys ?? []).some((journey) => journey.product_id === offering.id)) gaps.push("a journey");
  return gaps;
}

function OfferingsList({ current, onAdd }: { current?: string; onAdd?: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const [params] = useSearchParams();
  const [find, setFind] = useFindParam();
  const offerings = release.products ?? [];

  const groups = useMemo<RecordGroup[]>(() => {
    const query = params.size ? `?${params}` : "";
    const wanted = fold(find.trim());
    const shown = (release.products ?? []).filter(
      (offering) => !wanted || [offering.name, offering.code, offering.family, offering.proposition].some((text) => text && fold(text).includes(wanted)),
    );
    return familyGroups(shown).map((group) => ({
      id: group.id,
      label: group.label === null ? "No family stated" : group.mixed ? group.label : <bdi>{group.label}</bdi>,
      items: group.offerings.map((offering) => ({
        id: offering.id,
        href: `${base}/offerings/${encodeURIComponent(offering.id)}${query}`,
        name: offering.name,
        bidi: true,
        detail: [group.mixed ? offering.family : null, offering.code, count(offering.components.length, "component"), offering.lifecycle].filter(Boolean).join(" · "),
        meta: <GapBadge gaps={offeringGaps(release, offering)} />,
      })),
    }));
  }, [release, find, base, params]);
  const shownCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <ListTools count={find.trim() ? `${count(shownCount, "offering")} of ${offerings.length}` : count(offerings.length, "offering")}>
        <ListFind label="Find an offering" value={find} onChange={setFind} placeholder="Name, code or family" />
        {onAdd && <Button id="offering-add" variant="tertiary" icon={<Plus size={16} />} onClick={onAdd}>Add an offering</Button>}
      </ListTools>
      <RecordList
        label="Product offerings in this version"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={find.trim() ? `No offering is known by “${find.trim()}”.` : "This version describes no product offering."}
      />
    </>
  );
}

const HOLDS = ["all", "components", "empty"] as const;
type Holds = (typeof HOLDS)[number];

/**
 * With no offering chosen: every offering side by side, by what it holds, in the list's
 * order (`familyGroups`); `?holds=` keeps to the offerings with components, or without.
 */
function AllOfferings({ release }: { release: Release }) {
  const { base } = useCatalogueContext();
  const [params, setParams] = useSearchParams();
  const journeys = release.journeys ?? [];
  const groups = familyGroups(release.products ?? []);
  const rows = groups.flatMap((group) => group.offerings);
  const familyOf = new Map(groups.flatMap((group) => group.offerings.map((offering) => [offering.id, group.label] as const)));
  const holds: Holds = HOLDS.find((item) => item === params.get("holds")) ?? "all";
  const withParts = rows.filter((offering) => offering.components.length > 0);
  const shown = holds === "components" ? withParts : holds === "empty" ? rows.filter((offering) => offering.components.length === 0) : rows;
  const show = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("holds");
    else next.set("holds", id);
    setParams(next, { replace: true });
  };
  const columns: Column<Offering>[] = [
    {
      id: "name",
      header: "Offering",
      rowHeader: true,
      bidi: true,
      cell: (offering) => (
        <>
          <Link to={`${base}/offerings/${encodeURIComponent(offering.id)}`}>{offering.name}</Link>
          {offering.deprecated && <span className="cat-detail">Retired</span>}
          {offering.proposition && <span className="cat-detail cat-clamp">{offering.proposition}</span>}
        </>
      ),
    },
    {
      id: "family",
      header: "Family",
      bidi: true,
      // The family's own name, also for one gathered under "Other families".
      cell: (offering) => (offering.family ? offering.family : familyOf.get(offering.id) === null ? <span className="cat-quiet">Not stated</span> : null),
    },
    { id: "parts", header: "Components", numeric: true, cell: (offering) => offering.components.length },
    { id: "orders", header: "Order types", numeric: true, cell: (offering) => offering.order_types.length },
    { id: "journeys", header: "Journeys", numeric: true, cell: (offering) => journeys.filter((journey) => journey.product_id === offering.id).length },
    {
      id: "source",
      header: "Source",
      cell: (offering) => (offering.confidence ? <SourceMark confidence={offering.confidence} /> : <span className="cat-quiet">Not stated</span>),
    },
  ];
  // The placeholder above already counts them and says what to do; this section only lays them side by side.
  return (
    <Section title="Side by side">
      <FilterStrip
        label="What it holds"
        filters={[
          { id: "all", label: "All", count: rows.length },
          { id: "components", label: "With components", count: withParts.length },
          { id: "empty", label: "No components yet", count: rows.length - withParts.length },
        ]}
        active={holds}
        onChange={show}
      />
      <DataTable
        caption="Product offerings in this version, side by side, by family"
        captionHidden
        columns={columns}
        rows={shown}
        rowId={(offering) => offering.id}
        emptyText={holds === "components" ? "No offering has a component yet." : "Every offering has a component."}
      />
    </Section>
  );
}

const TABS = ["components", "plans", "orders", "journeys", "footprint", "rules", "service", "governance", "audience"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  components: "Components",
  plans: "Plans",
  orders: "Order types",
  journeys: "Journeys",
  footprint: "Footprint",
  rules: "Rules",
  service: "Service",
  governance: "Questions and decisions",
  audience: "Who it is for",
};

/** Where an offering sits in the portfolio, from the top down, as "Business unit › Family". */
function portfolioPath(release: Release, offering: Offering): string[] {
  const nodes = new Map((release.portfolio ?? []).map((node) => [node.id, node]));
  const path: string[] = [];
  let node = offering.portfolio_node_id ? nodes.get(offering.portfolio_node_id) : undefined;
  for (let hops = 0; node && hops < 16; hops++) {
    path.unshift(node.name);
    node = node.parent_id ? nodes.get(node.parent_id) : undefined;
  }
  return path;
}

/**
 * An offering's record (redesign phase 5): what it is made of in the
 * ontology's words (each component's concept, how it is realised and who
 * delivers it), its order types by channel, its journeys, its service promises
 * and what is still to be decided, as tabs kept in the address.
 */
function OfferingRecord({ offering }: { offering: Offering }) {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((item) => item === params.get("tab")) ?? "components") as Tab;
  const choose = (next: Tab) =>
    setParams((previous) => {
      const query = new URLSearchParams(previous);
      if (next === "components") query.delete("tab");
      else query.set("tab", next);
      return query;
    }, { replace: true });
  // One section is edited at a time, in place of where it is read; closing gives focus back to its button.
  const [editing, setEditing] = useState<OfferingSection | "remove" | "rename" | null>(null);
  const focusLater = useFocusAfterRender();
  const setReturnTo = (id: string) => focusLater(() => document.getElementById(id));
  const buttonId = (key: OfferingSection | "remove" | "rename") => `offering-edit-${key}`;
  const offer = (key: OfferingSection): ReactNode =>
    editable && editing === null ? (
      <Button id={buttonId(key)} variant="quiet" onClick={() => setEditing(key)}>Edit {OFFERING_SECTIONS[key].edit}</Button>
    ) : null;
  const panel = (key: OfferingSection) => (
    <OfferingSectionEdit
      offering={offering}
      section={key}
      onDone={() => {
        setReturnTo(buttonId(key));
        setEditing(null);
      }}
    />
  );
  const edited = (key: OfferingSection, read: ReactNode) => (editing === key ? panel(key) : read);

  const journeys = (book.release.journeys ?? []).filter((journey) => journey.product_id === offering.id);
  const orderNames = new Map(offering.order_types.map((item) => [item.code, item.name]));
  const channelNames = new Map((book.release.channels ?? []).map((item) => [item.id, item.name]));
  const orderName = (code: string) => orderNames.get(code) ?? code;
  const channelName = (channelId: string) => channelNames.get(channelId) ?? channelId;
  const conflicts = conflictsFor(book.release.conflicts ?? [], offering.id);
  const system = (systemId: string) => <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>;
  const portfolio = portfolioPath(book.release, offering);
  // ADR-0121, review recommendation 7: a retired offering says what replaced it.
  const replacement = offering.replaced_by ? (book.release.products ?? []).find((item) => item.id === offering.replaced_by) : undefined;

  return (
    <RecordView
      title={offering.name}
      takeFocus={location.key !== "default"}
      lead={offering.proposition || undefined}
      meta={
        <>
          {offering.deprecated && <Retired successor={replacement && { name: replacement.name, href: `${base}/offerings/${encodeURIComponent(replacement.id)}` }} />}
          {offering.confidence && <SourceMark confidence={offering.confidence} />}
          <AcceptedFrom accepted={acceptances(offering)} summary />
          <span>
            {[offering.code, offering.family, offering.version && `version ${offering.version}`, offering.lifecycle].filter(Boolean).join(" · ")}
          </span>
          <span>{count(offering.components.length, "component")} · {count(offering.order_types.length, "order type")} · {count(journeys.length, "journey")}</span>
          {(offering.former_ids ?? []).length > 0 && <span>Formerly <code>{(offering.former_ids ?? []).join(", ")}</code></span>}
        </>
      }
      actions={
        editable ? (
          <ActionGroup label="This offering">
            {editing === null && <Button id={buttonId("facts")} onClick={() => setEditing("facts")}>Edit what it is</Button>}
            <Button
              id={buttonId("remove")}
              variant="tertiary"
              aria-expanded={editing === "remove"}
              onClick={() => {
                if (editing === "remove") setReturnTo(buttonId("remove"));
                setEditing(editing === "remove" ? null : "remove");
              }}
            >
              Remove this offering…
            </Button>
            <Button
              id={buttonId("rename")}
              variant="tertiary"
              aria-expanded={editing === "rename"}
              onClick={() => {
                if (editing === "rename") setReturnTo(buttonId("rename"));
                setEditing(editing === "rename" ? null : "rename");
              }}
            >
              Change the id…
            </Button>
          </ActionGroup>
        ) : undefined
      }
    >
      {editing === "facts" && panel("facts")}
      {editing === "rename" && (
        <WholeRename
          kind="offering"
          item={offering}
          onDone={(newId) => {
            if (newId) return navigate(`${base}/offerings/${encodeURIComponent(newId)}${location.search}`, { replace: true });
            setReturnTo(buttonId("rename"));
            setEditing(null);
          }}
        />
      )}
      {editing === "remove" && (
        <WholeRemove
          kind="offering"
          item={offering}
          onDone={(removed) => {
            if (removed) return navigate(`${base}/offerings`);
            setReturnTo(buttonId("remove"));
            setEditing(null);
          }}
        />
      )}
      {/* Who it is for and what it promises, by name; what each means is on its own tab. */}
      {(offering.audiences.length > 0 || offering.values.length > 0 || portfolio.length > 0) && (
        <Facts
          items={[
            ...(portfolio.length ? [["Portfolio", <bdi key="portfolio">{portfolio.join(" › ")}</bdi>] as [string, ReactNode]] : []),
            ...(offering.audiences.length ? [["For", <bdi key="for">{offering.audiences.map((item) => item.name).join(" · ")}</bdi>] as [string, ReactNode]] : []),
            ...(offering.values.length ? [["Promises", <bdi key="promises">{offering.values.map((item) => item.name).join(" · ")}</bdi>] as [string, ReactNode]] : []),
          ]}
        />
      )}
      <OfferingStructureDiagram offering={offering} />
      <Tabs label="This offering" tabs={TABS.map((id) => ({ id, label: TAB_LABEL[id] }))} selected={tab} onSelect={choose}>
        {tab === "audience" && (
          <div className="cat-stack">
            <Section title="Who it is for" count={offering.audiences.length} headingLevel={3}>
              {offering.audiences.length ? <Points items={offering.audiences} /> : <p className="cat-quiet">No audience is recorded.</p>}
            </Section>
            <Section title="What it promises" count={offering.values.length} headingLevel={3}>
              {offering.values.length ? <Points items={offering.values} /> : <p className="cat-quiet">No promise is recorded.</p>}
            </Section>
          </div>
        )}
        {tab === "components" && edited("parts", <Components offering={offering} action={offer("parts")} orderName={orderName} />)}
        {tab === "plans" && edited("plans", <OfferingPlans offering={offering} action={offer("plans")} />)}
        {tab === "footprint" && <OfferingFootprint release={book.release} offeringId={offering.id} base={base} />}
        {tab === "rules" && (
          <OfferingRules
            offering={offering}
            action={offer("business")}
            editing={editing === "business" ? panel("business") : undefined}
            freeText={edited("rules", (
              <Section title="Other rules" count={offering.rules.length} actions={offer("rules")} headingLevel={3}>
                {offering.rules.length ? (
                  <Lines>{offering.rules.map((rule) => <li key={rule} dir="auto">{rule}</li>)}</Lines>
                ) : (
                  <p className="cat-quiet">No other rule is recorded.</p>
                )}
              </Section>
            ))}
          />
        )}
        {tab === "orders" && edited("orders", <OrderMatrix offering={offering} action={offer("orders")} channelName={channelName} />)}
        {tab === "journeys" && (
          <Section title="Journeys" count={journeys.length} headingLevel={3}>
            {journeys.length ? (
              <Lines>
                {journeys.map((journey) => (
                  <li key={journey.id}>
                    <Link to={`${base}/journeys/${encodeURIComponent(journey.id)}`} dir="auto">{journey.name}</Link>
                    {journey.order_type_code && <span className="cat-detail"><bdi>{orderName(journey.order_type_code)}</bdi> · {count(journey.activities.length, "step")}</span>}
                  </li>
                ))}
              </Lines>
            ) : (
              <p className="cat-quiet">No journey in this version fulfils it.</p>
            )}
          </Section>
        )}
        {tab === "service" && (
          <div className="cat-stack">
            {edited("nfrs", <NfrSection offering={offering} headingId="offering-nfrs" action={offer("nfrs")} level={3} />)}
            {edited("tracking", (
              <TrackingSection offering={offering} headingId="offering-tracking" action={offer("tracking")} system={system} channelName={channelName} orderName={orderName} level={3} />
            ))}
            {edited("notes", <LifecycleSection offering={offering} headingId="offering-lifecycle" orderName={orderName} channelName={channelName} action={offer("notes")} level={3} />)}
          </div>
        )}
        {tab === "governance" && (
          <div className="cat-stack">
            {conflicts.length > 0 && (
              <ConflictList
                conflicts={conflicts}
                sources={book.release.sources ?? []}
                headingId="offering-conflicts"
                title="Decisions needed"
                lead="Its sources contradict each other here; the catalogue never picks one."
                action={<RouterLink href={`${base}/governance`}>See every conflict between sources</RouterLink>}
                raises={(conflict) => questionOf(conflict, offering.id)}
                level={3}
              />
            )}
            {edited("questions", <OpenQuestions offering={offering} conflicts={conflicts} beside={conflicts} headingId="offering-questions" action={offer("questions")} level={3} />)}
            {edited("decisions", <ArchitectureDecisions offering={offering} headingId="offering-decisions" action={offer("decisions")} level={3} />)}
            {edited("sources", <OfferingSourceList offering={offering} sources={book.release.sources ?? []} headingId="offering-sources" action={offer("sources")} level={3} />)}
          </div>
        )}
      </Tabs>
    </RecordView>
  );
}

/** Audiences or promises, each by name with what it means under it. */
function Points({ items }: { items: { name: string; description?: string | null }[] }) {
  return (
    <Lines>
      {items.map((item) => (
        <li key={item.name}>
          <strong dir="auto">{item.name}</strong>
          {item.description && <span className="cat-detail" dir="auto">{item.description}</span>}
        </li>
      ))}
    </Lines>
  );
}

/** What the offering is made of: each component, the concept it means, how it is realised and who delivers it. */
function Components({ offering, action, orderName }: { offering: Offering; action: ReactNode; orderName: (code: string) => string }) {
  const { book, base } = useCatalogueContext();
  const index = useMemo(() => conceptIndex(book.release), [book.release]);
  const records = useMemo(() => realisationRecords(book.release), [book.release]);
  // Which system delivers which part, as a filter (from the lab's Components page).
  const [by, setBy] = useState("all");
  const deliverers = [...new Set(offering.components.flatMap((part) => part.responsibilities.map((item) => item.system_id)))]
    .sort((a, b) => systemName(book, a).localeCompare(systemName(book, b), "en"));
  const delivered = (part: Component, systemId: string) => part.responsibilities.some((item) => item.system_id === systemId);
  const shown = by === "all" ? offering.components : offering.components.filter((part) => delivered(part, by));
  const columns: Column<Component>[] = [
    {
      id: "name",
      header: "Component",
      rowHeader: true,
      bidi: true,
      cell: (part) => (
        <>
          {part.name}
          <span className="cat-detail">
            {[
              part.kind,
              part.mandatory === true ? "Always included" : part.mandatory === false ? "Optional" : null,
              part.customer_visible ? "Seen by the customer" : null,
              part.code,
            ].filter(Boolean).join(" · ")}
          </span>
        </>
      ),
    },
    {
      id: "concept",
      header: "Means (concept)",
      cell: (part) => {
        const concepts = (part.capability_ids ?? []).map((id) => index.byId.get(id)).filter((item) => item !== undefined);
        if (concepts.length) {
          return (
            <ul className="cat-chips">
              {concepts.map((concept) => (
                <li key={concept.id}><Link to={`${base}/concepts/${encodeURIComponent(concept.id)}`} className="cat-chip" dir="auto">{concept.pref_label}</Link></li>
              ))}
            </ul>
          );
        }
        return <span className="cat-quiet">{part.unlinked_reason ? <>None fits: <bdi>{part.unlinked_reason}</bdi></> : "Not linked"}</span>;
      },
    },
    {
      id: "realised",
      header: "Realised as",
      cell: (part) => <RealisedAs part={part} records={records} />,
    },
    {
      id: "delivered",
      header: "Delivered by",
      cell: (part) =>
        part.responsibilities.length ? (
          <ul className="cat-plain">
            {part.responsibilities.map((item) => (
              <li key={`${item.system_id}:${item.role}`}>
                <Link to={`${base}/systems/${encodeURIComponent(item.system_id)}`} dir="auto">{systemName(book, item.system_id)}</Link>
                <span className="cat-detail">
                  <bdi>{roleLabel(item.role)}</bdi>
                  {item.order_types.length > 0 && <> for <bdi>{item.order_types.map(orderName).join(", ")}</bdi></>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="cat-quiet">No system is named</span>
        ),
    },
  ];
  return (
    <Section title="What the offering is made of" count={offering.components.length} actions={action} headingLevel={3}>
      {offering.components.length ? (
        <>
          {deliverers.length > 1 && (
            <FilterStrip
              label="Delivered by"
              filters={[
                { id: "all", label: "Every system", count: offering.components.length },
                ...deliverers.map((id) => ({ id, label: systemName(book, id), count: offering.components.filter((part) => delivered(part, id)).length })),
              ]}
              active={deliverers.includes(by) ? by : "all"}
              onChange={setBy}
            />
          )}
          <DataTable caption={`Components of ${offering.name}`} captionHidden columns={columns} rows={shown} rowId={(part) => part.id} />
          <RealisationKey offering={offering} />
        </>
      ) : (
        <p className="cat-quiet">No component is recorded.</p>
      )}
    </Section>
  );
}

/** Which order types can be placed through which channel, as a matrix. */
function OrderMatrix({ offering, action, channelName }: { offering: Offering; action: ReactNode; channelName: (id: string) => string }) {
  const used = [...new Set(offering.order_types.flatMap((type) => type.channels ?? []))];
  type OrderType = Offering["order_types"][number];
  const columns: Column<OrderType>[] = [
    {
      id: "name",
      header: "Order type",
      rowHeader: true,
      bidi: true,
      cell: (type) => (
        <>
          {type.name}
          <span className="cat-detail">
            <code className="cat-code">{type.code}</code>
            {!type.enabled && " · Not offered"}
          </span>
        </>
      ),
    },
    ...used.map((channelId) => ({
      id: `channel:${channelId}`,
      header: <bdi>{channelName(channelId)}</bdi>,
      cell: (type: OrderType) =>
        (type.channels ?? []).includes(channelId) ? (
          <span className="cat-mark"><Check size={16} aria-hidden="true" /><span className="ds-visually-hidden">Yes</span></span>
        ) : (
          <span className="cat-mark cat-quiet"><Minus size={16} aria-hidden="true" /><span className="ds-visually-hidden">No</span></span>
        ),
    })),
  ];
  return (
    <Section title="Order types by channel" count={offering.order_types.length} actions={action} headingLevel={3}>
      {offering.order_types.length ? (
        <>
          {!used.length && <p className="cat-quiet">No order type names the channels it is placed through.</p>}
          <DataTable caption={`Order types of ${offering.name} by channel`} captionHidden columns={columns} rows={offering.order_types} rowId={(type) => type.code} />
        </>
      ) : (
        <p className="cat-quiet">No order type is recorded.</p>
      )}
    </Section>
  );
}
