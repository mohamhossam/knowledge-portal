import { Check, Minus, Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { Offering } from "../api/client";
import {
  ActionGroup, Button, type Column, DataTable, EmptyState, Facts, Lines, Section, Status, Tabs,
} from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { roleLabel, systemName } from "./catalogue";
import { OfferingEdit, OfferingSectionEdit, WholeRemove } from "./DraftEdits";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { ArchitectureDecisions, ConflictList, OfferingSourceList, OpenQuestions } from "./GovernanceSections";
import { conflictsFor, questionOf } from "./governance";
import { LifecycleSection } from "./LifecycleNotes";
import { OFFERING_SECTIONS, type OfferingSection } from "./offeringSections";
import { conceptIndex, SOURCE_TONE, SOURCE_WORD } from "./ontology";
import { NfrSection, RealisationKey, RealisedAs } from "./Realisation";
import { TrackingSection } from "./Tracking";
import { useCatalogueContext } from "./useCatalogue";

type Component = Offering["components"][number];

/** The product offerings in a version. */
export function OfferingsPage() {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const focusLater = useFocusAfterRender();
  const offerings = book.release.products ?? [];
  const journeys = book.release.journeys ?? [];
  const columns: Column<Offering>[] = [
    {
      id: "name",
      header: "Offering",
      rowHeader: true,
      bidi: true,
      cell: (offering) => (
        <>
          <Link to={`${base}/offerings/${encodeURIComponent(offering.id)}`} className="cat-name">{offering.name}</Link>
          {offering.proposition && <span className="cat-detail cat-clamp">{offering.proposition}</span>}
        </>
      ),
    },
    { id: "family", header: "Family", bidi: true, cell: (offering) => [offering.family, offering.code].filter(Boolean).join(" · ") || <span className="cat-quiet">Not stated</span> },
    { id: "parts", header: "Components", numeric: true, cell: (offering) => offering.components.length },
    { id: "orders", header: "Order types", numeric: true, cell: (offering) => offering.order_types.length },
    { id: "journeys", header: "Journeys", numeric: true, cell: (offering) => journeys.filter((journey) => journey.product_id === offering.id).length },
    {
      id: "source",
      header: "Source",
      cell: (offering) => (offering.confidence ? <Status tone={SOURCE_TONE[offering.confidence]}>{SOURCE_WORD[offering.confidence]}</Status> : <span className="cat-quiet">Not stated</span>),
    },
  ];
  return (
    <>
      <CatalogueHeader page="offerings" />
      <Section
        title="Product offerings"
        count={offerings.length}
        actions={editable && !adding ? <Button id="offering-add" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add an offering</Button> : undefined}
      >
        <p className="cat-lead">What is sold, what it is made of, and which systems deliver each part.</p>
        {adding && (
          <div className="ds-legacy cat-legacy">
            <OfferingEdit
              onDone={(saved) => {
                if (saved) return navigate(`${base}/offerings/${encodeURIComponent(saved)}`);
                setAdding(false);
                focusLater(() => document.getElementById("offering-add"));
              }}
            />
          </div>
        )}
        {offerings.length ? (
          <DataTable caption="Product offerings in this version" captionHidden columns={columns} rows={offerings} rowId={(offering) => offering.id} />
        ) : (
          <EmptyState title="This version describes no product offering.">
            <p>Offerings arrive from a solution design read into a draft.</p>
          </EmptyState>
        )}
      </Section>
    </>
  );
}

export function OfferingPage() {
  const { offeringId } = useParams();
  const { book, base } = useCatalogueContext();
  const offering = (book.release.products ?? []).find((item) => item.id === offeringId);
  if (!offering) {
    return (
      <>
        <CatalogueHeader page="offerings" record={{ name: "No such offering" }} />
        <EmptyState title={`This version has no offering “${offeringId}”.`} action={<RouterLink href={`${base}/offerings`}>See every offering</RouterLink>} />
      </>
    );
  }
  return <OfferingRecord key={offering.id} offering={offering} />;
}

const TABS = ["components", "orders", "journeys", "service", "governance"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  components: "Components",
  orders: "Order types and channels",
  journeys: "Journeys",
  service: "Service and tracking",
  governance: "Questions and decisions",
};

/**
 * An offering (redesign phase 5): what it is made of in the ontology's words
 * (each component's concept, how it is realised and who delivers it), its
 * order types by channel, its journeys, its service promises and what is
 * still to be decided, as tabs kept in the address.
 */
function OfferingRecord({ offering }: { offering: Offering }) {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
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
  const [editing, setEditing] = useState<OfferingSection | "remove" | null>(null);
  const focusLater = useFocusAfterRender();
  const setReturnTo = (id: string) => focusLater(() => document.getElementById(id));
  const buttonId = (key: OfferingSection | "remove") => `offering-edit-${key}`;
  const offer = (key: OfferingSection): ReactNode =>
    editable && editing === null ? (
      <Button id={buttonId(key)} variant="quiet" onClick={() => setEditing(key)}>Edit {OFFERING_SECTIONS[key].edit}</Button>
    ) : null;
  const panel = (key: OfferingSection) => (
    <div className="ds-legacy cat-legacy">
      <OfferingSectionEdit
        offering={offering}
        section={key}
        onDone={() => {
          setReturnTo(buttonId(key));
          setEditing(null);
        }}
      />
    </div>
  );
  const edited = (key: OfferingSection, read: ReactNode) => (editing === key ? panel(key) : read);

  const journeys = (book.release.journeys ?? []).filter((journey) => journey.product_id === offering.id);
  const orderNames = new Map(offering.order_types.map((item) => [item.code, item.name]));
  const channelNames = new Map((book.release.channels ?? []).map((item) => [item.id, item.name]));
  const orderName = (code: string) => orderNames.get(code) ?? code;
  const channelName = (channelId: string) => channelNames.get(channelId) ?? channelId;
  const conflicts = conflictsFor(book.release.conflicts ?? [], offering.id);
  const system = (systemId: string) => <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>;

  return (
    <>
      <CatalogueHeader
        page="offerings"
        record={{
          name: offering.name,
          lead: offering.proposition ?? undefined,
          meta: (
            <>
              {offering.confidence && <Status tone={SOURCE_TONE[offering.confidence]}>{SOURCE_WORD[offering.confidence]}</Status>}
              <span>
                {[offering.code, offering.family, offering.version && `version ${offering.version}`, offering.lifecycle].filter(Boolean).join(" · ")}
              </span>
              <span>{count(offering.components.length, "component")} · {count(offering.order_types.length, "order type")} · {count(journeys.length, "journey")}</span>
            </>
          ),
          actions: editable ? (
            <ActionGroup label="This offering">
              {editing === null && <Button id={buttonId("facts")} onClick={() => setEditing("facts")}>Edit what it is</Button>}
              <Button
                id={buttonId("remove")}
                aria-expanded={editing === "remove"}
                onClick={() => {
                  if (editing === "remove") setReturnTo(buttonId("remove"));
                  setEditing(editing === "remove" ? null : "remove");
                }}
              >
                Remove this offering…
              </Button>
            </ActionGroup>
          ) : undefined,
        }}
      />
      {editing === "facts" && panel("facts")}
      {editing === "remove" && (
        <div className="ds-legacy cat-legacy">
          <WholeRemove
            kind="offering"
            item={offering}
            onDone={(removed) => {
              if (removed) return navigate(`${base}/offerings`);
              setReturnTo(buttonId("remove"));
              setEditing(null);
            }}
          />
        </div>
      )}
      {(offering.audiences.length > 0 || offering.values.length > 0) && (
        <Facts
          items={[
            ...(offering.audiences.length ? [["For", <Points key="for" items={offering.audiences} />] as [string, ReactNode]] : []),
            ...(offering.values.length ? [["Promises", <Points key="promises" items={offering.values} />] as [string, ReactNode]] : []),
          ]}
        />
      )}
      <Tabs label="This offering" tabs={TABS.map((id) => ({ id, label: TAB_LABEL[id] }))} selected={tab} onSelect={choose}>
        {tab === "components" && edited("parts", <Components offering={offering} action={offer("parts")} orderName={orderName} />)}
        {tab === "orders" && edited("orders", <OrderMatrix offering={offering} action={offer("orders")} channelName={channelName} />)}
        {tab === "journeys" && (
          <Section title="Journeys" count={journeys.length}>
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
            {edited("nfrs", <NfrSection offering={offering} headingId="offering-nfrs" action={offer("nfrs")} level={2} />)}
            {edited("tracking", (
              <TrackingSection offering={offering} headingId="offering-tracking" action={offer("tracking")} system={system} channelName={channelName} orderName={orderName} level={2} />
            ))}
            {edited("notes", <LifecycleSection offering={offering} headingId="offering-lifecycle" orderName={orderName} channelName={channelName} action={offer("notes")} level={2} />)}
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
                level={2}
              />
            )}
            {edited("questions", <OpenQuestions offering={offering} conflicts={conflicts} beside={conflicts} headingId="offering-questions" action={offer("questions")} level={2} />)}
            {edited("decisions", <ArchitectureDecisions offering={offering} headingId="offering-decisions" action={offer("decisions")} level={2} />)}
            {edited("sources", <OfferingSourceList offering={offering} sources={book.release.sources ?? []} headingId="offering-sources" action={offer("sources")} level={2} />)}
            {edited("rules", (
              <Section title="Rules" count={offering.rules.length} actions={offer("rules")}>
                {offering.rules.length ? (
                  <Lines>{offering.rules.map((rule) => <li key={rule} dir="auto">{rule}</li>)}</Lines>
                ) : (
                  <p className="cat-quiet">No rule is recorded.</p>
                )}
              </Section>
            ))}
          </div>
        )}
      </Tabs>
    </>
  );
}

function Points({ items }: { items: { name: string; description?: string | null }[] }) {
  return (
    <>
      {items.map((item, position) => (
        <span key={item.name}>
          {position > 0 && "; "}
          <bdi>{item.name}</bdi>
          {item.description && <span className="cat-quiet"> (<bdi>{item.description}</bdi>)</span>}
        </span>
      ))}
    </>
  );
}

/** What the offering is made of: each component, the concept it means, how it is realised and who delivers it. */
function Components({ offering, action, orderName }: { offering: Offering; action: ReactNode; orderName: (code: string) => string }) {
  const { book, base } = useCatalogueContext();
  const index = useMemo(() => conceptIndex(book.release), [book.release]);
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
      cell: (part) => <RealisedAs part={part} />,
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
    <Section title="What the offering is made of" count={offering.components.length} actions={action}>
      {offering.components.length ? (
        <>
          <DataTable caption={`Components of ${offering.name}`} captionHidden columns={columns} rows={offering.components} rowId={(part) => part.id} />
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
    <Section title="Order types by channel" count={offering.order_types.length} actions={action}>
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
