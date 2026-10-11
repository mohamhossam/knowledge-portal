import { Plus } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { Journey } from "../api/client";
import { ActionGroup, Button, type Column, DataTable, EmptyState, FilterStrip, Section, Skeleton, Status } from "../design/components";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { systemName } from "./catalogue";
import { JourneyEdit, WholeRemove } from "./DraftEdits";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import type { JourneyView } from "./journey/JourneyViews";
import { SOURCE_TONE, SOURCE_WORD } from "./ontology";
import { useCatalogueContext } from "./useCatalogue";

/** The diagrams load as their own chunk, on the first journey opened (the main chunk stays under budget). */
const JourneyViews = lazy(() => import("./journey/JourneyViews"));
const VIEWS: JourneyView[] = ["swimlane", "flowchart", "timeline"];

const ALL = "all";

const systemsOf = (journey: Journey) =>
  new Set(journey.activities.flatMap((step) => [step.performing_system_id, ...step.supporting_system_ids].filter(Boolean)));

/** The journeys in a version: how an order travels from system to system. */
export function JourneysPage() {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const journeys = useMemo(() => book.release.journeys ?? [], [book.release.journeys]);
  const offerings = new Map((book.release.products ?? []).map((item) => [item.id, item]));
  const offering = params.get("offering") ?? ALL;
  const shown = offering === ALL ? journeys : journeys.filter((journey) => (journey.product_id ?? "") === offering);
  const filters = [
    { id: ALL, label: "All", count: journeys.length },
    ...[...offerings.values()]
      .map((item) => ({ id: item.id, label: item.name, count: journeys.filter((journey) => journey.product_id === item.id).length }))
      .filter((item) => item.count > 0),
  ];
  const columns: Column<Journey>[] = [
    {
      id: "name",
      header: "Journey",
      rowHeader: true,
      bidi: true,
      cell: (journey) => {
        const fulfils = journey.product_id ? offerings.get(journey.product_id) : undefined;
        const orderType = fulfils?.order_types.find((item) => item.code === journey.order_type_code);
        return (
          <>
            <Link to={`${base}/journeys/${encodeURIComponent(journey.id)}`} className="cat-name">{journey.name}</Link>
            {fulfils && <span className="cat-detail"><bdi>{fulfils.name}</bdi>{(orderType || journey.order_type_code) && <> · <bdi>{orderType?.name ?? journey.order_type_code}</bdi></>}</span>}
          </>
        );
      },
    },
    { id: "steps", header: "Steps", numeric: true, cell: (journey) => journey.activities.length },
    { id: "systems", header: "Systems", numeric: true, cell: (journey) => systemsOf(journey).size },
    {
      id: "phases",
      header: "Stages",
      bidi: true,
      cell: (journey) => {
        const phases = [...new Set(journey.activities.map((step) => step.phase).filter(Boolean))];
        return phases.length ? <span className="cat-clamp">{phases.join(" › ")}</span> : <span className="cat-quiet">Not staged</span>;
      },
    },
    {
      id: "source",
      header: "Source",
      cell: (journey) => (journey.confidence ? <Status tone={SOURCE_TONE[journey.confidence]}>{SOURCE_WORD[journey.confidence]}</Status> : <span className="cat-quiet">Not stated</span>),
    },
  ];
  return (
    <>
      <CatalogueHeader page="journeys" />
      <Section
        title="Journeys"
        count={journeys.length}
        actions={editable && !adding ? <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add a journey</Button> : undefined}
      >
        <p className="cat-lead">How an order travels: each step in order, the system that performs it and how it hands over to the next.</p>
        {adding && (
          <div className="ds-legacy cat-legacy">
            <JourneyEdit
              onDone={(saved) => {
                setAdding(false);
                if (saved) navigate(`${base}/journeys/${encodeURIComponent(saved)}`);
              }}
            />
          </div>
        )}
        {journeys.length ? (
          <div className="cat-list">
            {filters.length > 2 && (
              <FilterStrip
                label="Journeys by offering"
                filters={filters}
                active={offering}
                onChange={(id) => setParams(id === ALL ? {} : { offering: id }, { replace: true })}
              />
            )}
            <DataTable caption="Journeys in this version" captionHidden columns={columns} rows={shown} rowId={(journey) => journey.id} />
          </div>
        ) : (
          <EmptyState title="This version describes no journey.">
            <p>Journeys arrive from a solution design read into a draft.</p>
          </EmptyState>
        )}
      </Section>
    </>
  );
}

export function JourneyPage() {
  const { journeyId } = useParams();
  const { book, base } = useCatalogueContext();
  const journey = (book.release.journeys ?? []).find((item) => item.id === journeyId);
  if (!journey) {
    return (
      <>
        <CatalogueHeader page="journeys" record={{ name: "No such journey" }} />
        <EmptyState title={`This version has no journey “${journeyId}”.`} action={<RouterLink href={`${base}/journeys`}>See every journey</RouterLink>} />
      </>
    );
  }
  return <JourneyRecord key={journey.id} journey={journey} />;
}

/**
 * A journey (redesign phase 5) as a diagram: swimlanes by system (the
 * default), a flowchart of its branches, or a timeline of its stages, with
 * every step also as a table. The view is kept in the address.
 */
function JourneyRecord({ journey }: { journey: Journey }) {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<"edit" | "remove" | null>(null);
  const view = VIEWS.find((item) => item === params.get("view")) ?? "swimlane";
  const offering = (book.release.products ?? []).find((item) => item.id === journey.product_id);
  const orderType = offering?.order_types.find((item) => item.code === journey.order_type_code);
  const channels = new Map((book.release.channels ?? []).map((item) => [item.id, item.name]));
  const system = (systemId: string) => <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>;

  return (
    <>
      <CatalogueHeader
        page="journeys"
        record={{
          name: journey.name,
          lead: journey.description ?? undefined,
          meta: (
            <>
              {journey.confidence && <Status tone={SOURCE_TONE[journey.confidence]}>{SOURCE_WORD[journey.confidence]}</Status>}
              <span>
                {offering ? (
                  <>
                    Fulfils <RouterLink href={`${base}/offerings/${encodeURIComponent(offering.id)}`}><bdi>{offering.name}</bdi></RouterLink>
                    {(orderType || journey.order_type_code) && <>, <bdi>{orderType?.name ?? journey.order_type_code}</bdi></>}
                  </>
                ) : (
                  "Not tied to an offering"
                )}
              </span>
              <span>{count(journey.activities.length, "step")} · {count(systemsOf(journey).size, "system")}</span>
            </>
          ),
          actions: editable ? (
            <ActionGroup label="This journey">
              <Button aria-expanded={editing === "edit"} onClick={() => setEditing(editing === "edit" ? null : "edit")}>Edit this journey</Button>
              <Button aria-expanded={editing === "remove"} onClick={() => setEditing(editing === "remove" ? null : "remove")}>Remove this journey…</Button>
            </ActionGroup>
          ) : undefined,
        }}
      />
      {editing === "edit" && <div className="ds-legacy cat-legacy"><JourneyEdit journey={journey} onDone={() => setEditing(null)} /></div>}
      {editing === "remove" && (
        <div className="ds-legacy cat-legacy">
          <WholeRemove kind="journey" item={journey} onDone={(removed) => (removed ? navigate(`${base}/journeys`) : setEditing(null))} />
        </div>
      )}
      {editing !== "edit" && (
        <Suspense fallback={<Skeleton label="Drawing the journey" rows={6} />}>
          <JourneyViews
            journey={journey}
            systemName={(systemId) => systemName(book, systemId)}
            system={system}
            channelName={(channelId) => channels.get(channelId) ?? channelId}
            view={view}
            onViewChange={(next) =>
              setParams((previous) => {
                const query = new URLSearchParams(previous);
                if (next === "swimlane") query.delete("view");
                else query.set("view", next);
                return query;
              }, { replace: true })
            }
          />
        </Suspense>
      )}
    </>
  );
}
