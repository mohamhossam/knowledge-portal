import { Plus } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { Journey, Release } from "../api/client";
import {
  ActionGroup, Button, type Column, DataTable, EmptyState, GapBadge, ListFilter, ListFind, ListTools, RecordList, type RecordGroup,
  RecordPlaceholder, RecordView, Section, Skeleton, Status, Workbench,
} from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { acceptances } from "./accepted";
import { AcceptedFrom } from "./AcceptedFrom";
import { systemName } from "./catalogue";
import { JourneyEdit, WholeRemove, WholeRename } from "./DraftEdits";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useFindParam } from "./frame/useFindParam";
import type { JourneyView } from "./journey/JourneyViews";
import { SOURCE_TONE, SOURCE_WORD } from "./ontology";
import { useCatalogueContext } from "./useCatalogue";

/** The diagrams load as their own chunk, on the first journey opened (the main chunk stays under budget). */
const JourneyViews = lazy(() => import("./journey/JourneyViews"));
// The lab's process flow, call register and exports (catalogue merge, step 4), in their own chunk.
const JourneyFlowViews = lazy(() => import("./journey/flow/JourneyFlowViews"));
const JourneyExport = lazy(() => import("./journey/flow/JourneyFlowViews").then((module) => ({ default: module.JourneyExport })));
const VIEWS: JourneyView[] = ["swimlane", "flowchart", "timeline", "flow", "integrations"];

const ALL = "all";

const systemsOf = (journey: Journey) =>
  new Set(journey.activities.flatMap((step) => [step.performing_system_id, ...step.supporting_system_ids].filter((id): id is string => Boolean(id))));

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

/** The order type a journey fulfils, by name when its offering names it. */
function orderTypeName(release: Release, journey: Journey): string | null {
  if (!journey.order_type_code) return null;
  const offering = (release.products ?? []).find((item) => item.id === journey.product_id);
  return offering?.order_types.find((item) => item.code === journey.order_type_code)?.name ?? journey.order_type_code;
}

/**
 * The journeys of a version on the workbench (UX rebuild, phase 3): how an
 * order travels from system to system. Every journey sits in a narrow list,
 * grouped by the offering it fulfils, beside the chosen journey drawn as a
 * swimlane, a flowchart or a stage timeline. With none chosen, every journey
 * side by side.
 */
export function JourneysPage() {
  const { journeyId } = useParams();
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const focusLater = useFocusAfterRender();
  const journeys = book.release.journeys ?? [];
  const chosen = journeyId !== undefined ? journeys.find((item) => item.id === journeyId) : undefined;
  // An address made before a rename still finds the journey, under its id now.
  const renamed = chosen || journeyId === undefined ? undefined : journeys.find((item) => (item.former_ids ?? []).includes(journeyId));
  const location = useLocation();
  if (renamed) return <Navigate replace to={`${base}/journeys/${encodeURIComponent(renamed.id)}${location.search}`} />;

  const record = adding ? (
    <JourneyEdit
      onDone={(saved) => {
        setAdding(false);
        if (saved) return navigate(`${base}/journeys/${encodeURIComponent(saved)}`);
        focusLater(() => document.getElementById("journey-add"));
      }}
    />
  ) : chosen ? (
    <JourneyRecord key={chosen.id} journey={chosen} />
  ) : journeyId !== undefined ? (
    <EmptyState title={`This version has no journey “${journeyId}”.`} action={<RouterLink href={`${base}/journeys`}>See every journey</RouterLink>} />
  ) : journeys.length ? (
    <RecordPlaceholder title={`${count(journeys.length, "journey")}. Choose one to see how its order travels from system to system.`}>
      <AllJourneys release={book.release} />
    </RecordPlaceholder>
  ) : (
    <EmptyState title="This version describes no journey.">
      <p>Journeys arrive from a solution design read into a draft{editable ? ", or add one by hand" : ""}.</p>
    </EmptyState>
  );

  return (
    <>
      <CatalogueHeader page="journeys" chosen={chosen?.name} />
      <Workbench
        listLabel="Journeys"
        chosen={Boolean(chosen) || adding}
        list={<JourneysList current={chosen?.id} onAdd={editable && !adding ? () => setAdding(true) : undefined} />}
        record={record}
      />
    </>
  );
}

/** What a journey's record is missing. A step with no system is the channel's entry system's: not a gap. */
const journeyGaps = (journey: Journey): string[] => (journey.activities.length ? [] : ["steps"]);

function JourneysList({ current, onAdd }: { current?: string; onAdd?: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const journeys = useMemo(() => release.journeys ?? [], [release.journeys]);
  const [params, setParams] = useSearchParams();
  const through = params.get("system") ?? ALL;
  const [find, setFind] = useFindParam();

  const groups = useMemo<RecordGroup[]>(() => {
    const query = params.size ? `?${params}` : "";
    const wanted = fold(find.trim());
    const offerings = new Map((release.products ?? []).map((item) => [item.id, item.name]));
    const shown = journeys
      .filter((journey) => through === ALL || systemsOf(journey).has(through))
      .filter((journey) => !wanted || [journey.name, orderTypeName(release, journey)].some((text) => text && fold(text).includes(wanted)));
    // Grouped by the offering each fulfils, in the offerings' order; journeys of none last.
    const order = [...offerings.keys(), ""];
    return order.map((offeringId) => ({
      id: offeringId || "none",
      label: offeringId ? <bdi>{offerings.get(offeringId)}</bdi> : "Not tied to an offering",
      items: shown
        .filter((journey) => (journey.product_id && offerings.has(journey.product_id) ? journey.product_id : "") === offeringId)
        .map((journey) => ({
          id: journey.id,
          href: `${base}/journeys/${encodeURIComponent(journey.id)}${query}`,
          name: journey.name,
          bidi: true,
          // The order type, unless the journey is named after it; then its size.
          detail: [
            orderTypeName(release, journey) !== journey.name && orderTypeName(release, journey),
            count(journey.activities.length, "step"),
            count(systemsOf(journey).size, "system"),
          ].filter(Boolean).join(" · "),
          meta: <GapBadge gaps={journeyGaps(journey)} />,
        })),
    }));
  }, [release, journeys, through, find, base, params]);
  const shownCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  // Only systems some journey passes through are offered.
  const passing = [...new Set(journeys.flatMap((journey) => [...systemsOf(journey)]))]
    .map((id) => ({ id, label: systemName(book, id), count: journeys.filter((journey) => systemsOf(journey).has(id)).length }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

  return (
    <>
      <ListTools count={through === ALL && !find.trim() ? count(journeys.length, "journey") : `${count(shownCount, "journey")} of ${journeys.length}`}>
        <ListFind label="Find a journey" value={find} onChange={setFind} placeholder="Name or order type" />
        {passing.length > 1 && (
          <ListFilter
            label="Passes through"
            value={through}
            options={[{ id: ALL, label: "Any system", count: journeys.length }, ...passing]}
            onChange={(value) =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                if (value === ALL) next.delete("system");
                else next.set("system", value);
                return next;
              }, { replace: true })
            }
          />
        )}
        {onAdd && <Button id="journey-add" variant="tertiary" icon={<Plus size={16} />} onClick={onAdd}>Add a journey</Button>}
      </ListTools>
      <RecordList
        label="Journeys in this version"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={find.trim() ? `No journey is known by “${find.trim()}”.` : "No journey passes through this system."}
      />
    </>
  );
}

/** With no journey chosen: every journey side by side, by its steps and stages. */
function AllJourneys({ release }: { release: Release }) {
  const { base } = useCatalogueContext();
  const offerings = new Map((release.products ?? []).map((item) => [item.id, item.name]));
  const columns: Column<Journey>[] = [
    {
      id: "name",
      header: "Journey",
      rowHeader: true,
      bidi: true,
      cell: (journey) => {
        const fulfils = journey.product_id ? offerings.get(journey.product_id) : undefined;
        const orderType = orderTypeName(release, journey);
        return (
          <>
            <Link to={`${base}/journeys/${encodeURIComponent(journey.id)}`}>{journey.name}</Link>
            {fulfils && <span className="cat-detail"><bdi>{fulfils}</bdi>{orderType && <> · <bdi>{orderType}</bdi></>}</span>}
          </>
        );
      },
    },
    { id: "steps", header: "Steps", numeric: true, cell: (journey) => journey.activities.length },
    { id: "systems", header: "Systems", numeric: true, cell: (journey) => systemsOf(journey).size },
    // Stages only when some journey is staged: a column of "Not staged" says nothing.
    ...((release.journeys ?? []).some((journey) => journey.activities.some((step) => step.phase))
      ? [{
          id: "phases",
          header: "Stages",
          bidi: true,
          cell: (journey: Journey) => {
            const phases = [...new Set(journey.activities.map((step) => step.phase).filter(Boolean))];
            return phases.length ? <span className="cat-clamp">{phases.join(" › ")}</span> : <span className="cat-quiet">Not staged</span>;
          },
        }]
      : []),
    {
      id: "source",
      header: "Source",
      cell: (journey) => (journey.confidence ? <Status tone={SOURCE_TONE[journey.confidence]}>{SOURCE_WORD[journey.confidence]}</Status> : <span className="cat-quiet">Not stated</span>),
    },
  ];
  return (
    <Section title="Every journey" count={(release.journeys ?? []).length}>
      <p className="cat-lead">How an order travels: each step in order, the system that performs it and how it hands over to the next.</p>
      <DataTable caption="Journeys in this version, side by side" captionHidden columns={columns} rows={release.journeys ?? []} rowId={(journey) => journey.id} />
    </Section>
  );
}

/**
 * A journey's record (redesign phase 5) as a diagram: swimlanes by system (the
 * default), a flowchart of its branches, or a timeline of its stages, with
 * every step also as a table. A drawing wider than the record scrolls
 * sideways in place. The view is kept in the address.
 */
function JourneyRecord({ journey }: { journey: Journey }) {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  // One panel at a time; closing one gives focus back to the button that opened it.
  const [editing, setEditing] = useState<"edit" | "remove" | "rename" | null>(null);
  const focusLater = useFocusAfterRender();
  const buttonId = (key: "edit" | "remove" | "rename") => `journey-edit-${key}`;
  const close = (key: "edit" | "remove" | "rename") => {
    setEditing(null);
    focusLater(() => document.getElementById(buttonId(key)));
  };
  const toggle = (key: "edit" | "remove" | "rename") => (editing === key ? close(key) : setEditing(key));
  const view = VIEWS.find((item) => item === params.get("view")) ?? "swimlane";
  const offering = (book.release.products ?? []).find((item) => item.id === journey.product_id);
  const orderType = orderTypeName(book.release, journey);
  const channels = new Map((book.release.channels ?? []).map((item) => [item.id, item.name]));
  const system = (systemId: string) => <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>;

  return (
    <RecordView
      title={journey.name}
      takeFocus={location.key !== "default"}
      lead={journey.description || undefined}
      meta={
        <>
          {journey.confidence && <Status tone={SOURCE_TONE[journey.confidence]}>{SOURCE_WORD[journey.confidence]}</Status>}
          <AcceptedFrom accepted={acceptances(journey)} summary />
          <span>
            {offering ? (
              <>
                Fulfils <RouterLink href={`${base}/offerings/${encodeURIComponent(offering.id)}`}><bdi>{offering.name}</bdi></RouterLink>
                {orderType && <>, <bdi>{orderType}</bdi></>}
              </>
            ) : (
              "Not tied to an offering"
            )}
          </span>
          <span>{count(journey.activities.length, "step")} · {count(systemsOf(journey).size, "system")}</span>
          {(journey.former_ids ?? []).length > 0 && <span>Formerly <code>{(journey.former_ids ?? []).join(", ")}</code></span>}
        </>
      }
      actions={
        <ActionGroup label="This journey">
          <Suspense fallback={null}>
            <JourneyExport release={book.release} journeyId={journey.id} />
          </Suspense>
          {editable && (
            <>
            <Button id={buttonId("edit")} aria-expanded={editing === "edit"} onClick={() => toggle("edit")}>Edit this journey</Button>
            <Button id={buttonId("remove")} variant="tertiary" aria-expanded={editing === "remove"} onClick={() => toggle("remove")}>Remove this journey…</Button>
            <Button id={buttonId("rename")} variant="tertiary" aria-expanded={editing === "rename"} onClick={() => toggle("rename")}>Change the id…</Button>
            </>
          )}
        </ActionGroup>
      }
    >
      {editing === "edit" && <JourneyEdit journey={journey} onDone={() => close("edit")} />}
      {editing === "rename" && (
        <WholeRename
          kind="journey"
          item={journey}
          onDone={(newId) => {
            if (newId) return navigate(`${base}/journeys/${encodeURIComponent(newId)}${location.search}`, { replace: true });
            close("rename");
          }}
        />
      )}
      {editing === "remove" && (
        <WholeRemove kind="journey" item={journey} onDone={(removed) => (removed ? navigate(`${base}/journeys`) : close("remove"))} />
      )}
      {editing !== "edit" && (
        <Suspense fallback={<Skeleton label="Drawing the journey" rows={6} />}>
          <JourneyViews
            journey={journey}
            systemName={(systemId) => systemName(book, systemId)}
            system={system}
            channelName={(channelId) => channels.get(channelId) ?? channelId}
            view={view}
            more={[
              { id: "flow", label: "Process flow", content: <JourneyFlowViews release={book.release} journeyId={journey.id} title={journey.name} show="flow" /> },
              { id: "integrations", label: "Integrations", content: <JourneyFlowViews release={book.release} journeyId={journey.id} title={journey.name} show="integrations" /> },
            ]}
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
    </RecordView>
  );
}
