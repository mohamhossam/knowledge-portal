import "../catalogue/frame/catalogue.css";
import "./explorer.css";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { lazy, type ReactNode, Suspense, useId } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, type ExplorerRelease } from "../api/client";
import { errorMessage } from "../api/errors";
import { roleLabel, sentenceCase } from "../catalogue/catalogue";
import type { JourneyView } from "../catalogue/journey/JourneyViews";
import { NfrSection, RealisationKey, RealisedAs } from "../catalogue/Realisation";
import { ArchitectureDecisions, ConflictList, OfferingSourceList, OpenQuestions } from "../catalogue/GovernanceSections";
import { conflictsFor, questionOf, SourcesContext } from "../catalogue/governance";
import { LifecycleSection } from "../catalogue/LifecycleNotes";
import { SOURCE_TONE, SOURCE_WORD } from "../catalogue/ontology";
import { TrackingSection } from "../catalogue/Tracking";
import {
  ActionGroup, Banner, Button, type Column, DataTable, EmptyState, Lines, PageHeader, Section, Select, Skeleton, Status,
} from "../design/components";
import { formatDay } from "../home/format";
import { RouterLink } from "../shell/links";
import { DocumentDownload } from "./DocumentDownload";
import { PlansAndPrices } from "./PlansAndPrices";
import { gaps, type Involvement, involvement, journeyFor, listed, partsFor, pickScenario, type Scenario, trackingFor } from "./scenario";

/** What the catalogue cannot hold yet; each arrives with a later slice (requirement-portal ADR-0101). */
export const NOT_YET =
  "Information objects are not in the catalogue yet, so the explorer does not show them.";

/** The journey diagrams load as their own chunk, shared with the catalogue's journey pages. */
const JourneyViews = lazy(() => import("../catalogue/journey/JourneyViews"));
const VIEWS: JourneyView[] = ["swimlane", "flowchart", "timeline"];

function useExplorerRelease() {
  return useQuery({ queryKey: ["explorer", "release"], queryFn: api.explorerRelease });
}

const TITLE = "Product architecture explorer";

/**
 * The product architecture explorer (redesign phase 5): one offering and one
 * of its order types, read from the catalogue in service. Admins and every
 * other signed-in reader see the same page; only admins can follow a system
 * to its record.
 */
export function ExplorerPage({ linkSystems }: { linkSystems: boolean }) {
  const query = useExplorerRelease();
  const [params, setParams] = useSearchParams();

  if (query.isPending) {
    return (
      <div className="explorer">
        <PageHeader title={TITLE} />
        <Skeleton label="Opening the catalogue in service" rows={8} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="explorer">
        <PageHeader title={TITLE} />
        <EmptyState title="Couldn't read the catalogue in service" action={<Button onClick={() => void query.refetch()}>Try again</Button>}>
          <p role="alert">The knowledge service didn't answer: {errorMessage(query.error)}</p>
        </EmptyState>
      </div>
    );
  }

  const release = query.data;
  const scenario = pickScenario(release, params.get("product"), params.get("order"), params.get("channel"));
  const view = VIEWS.find((item) => item === params.get("view")) ?? "swimlane";
  const choose = (product: string, order: string | null, channel: string | null = null) =>
    setParams({ product, ...(order ? { order } : {}), ...(channel ? { channel } : {}), ...(view !== "swimlane" ? { view } : {}) }, { replace: true });
  const setView = (next: JourneyView) =>
    setParams((previous) => {
      const query = new URLSearchParams(previous);
      if (next === "swimlane") query.delete("view");
      else query.set("view", next);
      return query;
    }, { replace: true });

  return (
    <div className="explorer">
      <PageHeader
        title={TITLE}
        lead="Choose an offering and an order type to see the journey that fulfils it through each channel, the systems that take part, its plans and prices, and what the catalogue does not say yet."
        meta={
          <>
            <Status tone="done">In service</Status>
            <span><bdi>‘{release.name ?? release.id}’</bdi>, published {formatDay(release.published_at)}</span>
          </>
        }
      />
      {scenario ? (
        <>
          <Choose release={release} scenario={scenario} onChoose={choose} />
          <SourcesContext.Provider value={release.sources ?? []}>
            <ScenarioSheet
              key={`${scenario.offering.id}:${scenario.orderType.code}:${scenario.channel?.id ?? ""}`}
              release={release}
              scenario={scenario}
              linkSystems={linkSystems}
              view={view}
              onView={setView}
            />
          </SourcesContext.Provider>
        </>
      ) : (
        <EmptyState title="The catalogue in service describes no offering with an order type yet." />
      )}
    </div>
  );
}

function Choose({ release, scenario, onChoose }: {
  release: ExplorerRelease;
  scenario: Scenario;
  onChoose: (product: string, order: string | null, channel?: string | null) => void;
}) {
  const offerings = (release.products ?? []).filter((item) => item.order_types.length > 0);
  return (
    <form className="explorer-choose" aria-label="Choose what to explore" onSubmit={(event) => event.preventDefault()}>
      <Select label="Offering" value={scenario.offering.id} onChange={(event) => onChoose(event.target.value, null)}>
        {offerings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
      <Select label="Order type" value={scenario.orderType.code} onChange={(event) => onChoose(scenario.offering.id, event.target.value)}>
        {scenario.offering.order_types.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
            {!item.enabled ? " (not offered)" : journeyFor(release, scenario.offering.id, item.code) ? "" : " (no journey yet)"}
          </option>
        ))}
      </Select>
      {scenario.channels.length > 0 && (
        <Select
          label="Channel"
          value={scenario.channel?.id ?? ""}
          onChange={(event) => onChoose(scenario.offering.id, scenario.orderType.code, event.target.value)}
        >
          {scenario.channels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.entry_system_id ? "" : " (no entry system)"}
            </option>
          ))}
        </Select>
      )}
    </form>
  );
}

function steps(numbers: string[]): string {
  return numbers.length === 1 ? `step ${numbers[0]}` : `steps ${listed(numbers)}`;
}

/** One scenario: the systems first, then the journey, tracking, the parts, plans and what is still open. */
function ScenarioSheet({ release, scenario, linkSystems, view, onView }: {
  release: ExplorerRelease;
  scenario: Scenario;
  linkSystems: boolean;
  view: JourneyView;
  onView: (view: JourneyView) => void;
}) {
  const id = useId();
  const { offering, orderType, journey, channel } = scenario;
  const channelNames = new Map((release.channels ?? []).map((item) => [item.id, item.name]));
  const channelName = (channelId: string) => channelNames.get(channelId) ?? channelId;
  const orderName = (code: string) => offering.order_types.find((item) => item.code === code)?.name ?? code;
  const names = new Map(release.systems.map((item) => [item.id, item.name]));
  const nameOf = (systemId: string) => names.get(systemId) ?? systemId;
  const system = (systemId: string): ReactNode =>
    linkSystems ? (
      <Link to={`/architecture/systems/${encodeURIComponent(systemId)}`} dir="auto">{nameOf(systemId)}</Link>
    ) : (
      <bdi>{nameOf(systemId)}</bdi>
    );
  const taking = involvement(scenario);
  const parts = partsFor(scenario);
  const missing = gaps(scenario);
  const tracked = trackingFor(scenario);
  const decisions = scenario.conflicts ?? [];
  const readFrom = [...(offering.sources ?? [])]
    .sort((a, b) => Number(b === offering.primary_source) - Number(a === offering.primary_source))
    .map((sourceId) => (release.sources ?? []).find((item) => item.id === sourceId))
    .filter((item): item is NonNullable<typeof item> => !!item);

  const systemColumns: Column<Involvement>[] = [
    { id: "system", header: "System", rowHeader: true, bidi: true, cell: (item) => system(item.systemId) },
    {
      id: "part",
      header: "Its part in this order",
      cell: (item) => (
        <>
          {item.performs.length
            ? `Performs ${steps(item.performs)}`
            : item.supports.length
              ? `Supports ${steps(item.supports)}`
              : item.parts.length
                ? "Responsible for a part; no step names it"
                : "Takes part in order tracking"}
          {item.performs.length > 0 && item.supports.length > 0 && <span className="cat-detail">Supports {steps(item.supports)}</span>}
          {item.parts.map(({ part, responsibility }) => (
            <span key={`${part.id}:${responsibility.role}`} className="cat-detail"><bdi>{roleLabel(responsibility.role)}</bdi> for <bdi>{part.name}</bdi></span>
          ))}
          {item.tracks && (item.performs.length > 0 || item.supports.length > 0 || item.parts.length > 0) && (
            <span className="cat-detail">Takes part in order tracking</span>
          )}
        </>
      ),
    },
    { id: "steps", header: "Steps", numeric: true, cell: (item) => new Set([...item.performs, ...item.supports]).size || "—" },
  ];

  type PartRow = (typeof parts)[number];
  const partColumns: Column<PartRow>[] = [
    {
      id: "part",
      header: "Part",
      rowHeader: true,
      bidi: true,
      cell: ({ part }) => (
        <>
          {part.name}
          <span className="cat-detail">
            {[
              part.kind ? sentenceCase(part.kind) : null,
              part.mandatory === true ? "Always included" : part.mandatory === false ? "Optional" : null,
              part.customer_visible ? "Seen by the customer" : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </>
      ),
    },
    {
      id: "systems",
      header: "Responsible systems",
      cell: ({ responsibilities }) =>
        responsibilities.length ? (
          <ul className="cat-plain">
            {responsibilities.map((item) => (
              <li key={`${item.system_id}:${item.role}`}>
                <bdi>{roleLabel(item.role)}</bdi>: {system(item.system_id)}
                {item.description && <span className="cat-detail" dir="auto">{item.description}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <span className="cat-quiet">No system is named for this order</span>
        ),
    },
    { id: "realised", header: "Realised as", cell: ({ part }) => <RealisedAs part={part} /> },
  ];

  const title = `${offering.name}: ${orderType.name}${channel ? `, through ${channel.name}` : ""}`;
  return (
    <article className="explorer-sheet" aria-labelledby={`${id}-name`}>
      <header className="explorer-sheet__head">
        <h2 id={`${id}-name`} className="explorer-sheet__title" dir="auto">{title}</h2>
        <p className="explorer-sheet__meta">
          {journey ? (
            <>
              Fulfilled by <bdi>{journey.name}</bdi>
              {journey.confidence && <> · <Status tone={SOURCE_TONE[journey.confidence]}>{SOURCE_WORD[journey.confidence]}</Status></>}
            </>
          ) : (
            "No journey fulfils it yet"
          )}
          {!orderType.enabled && <> · <Status tone="stopped">Not offered</Status></>}
        </p>
        {offering.proposition && <p className="explorer-sheet__lead" dir="auto">{offering.proposition}</p>}
        {readFrom.length > 0 && (
          <p className="explorer-sheet__meta" dir="auto">
            Read from{" "}
            {readFrom
              .map((source) => `${source.short ?? source.title} (${source.level}${source.id === offering.primary_source ? ", primary" : ""}${source.supplied === false ? ", not supplied" : ""})`)
              .join(", ")}
          </p>
        )}
        <DocumentDownload release={release} scenario={scenario} />
        {linkSystems && (
          <ActionGroup label="In the catalogue">
            <RouterLink href={`/architecture/offerings/${encodeURIComponent(offering.id)}`}>The offering in the catalogue</RouterLink>
            {journey && <RouterLink href={`/architecture/journeys/${encodeURIComponent(journey.id)}`}>The journey in the catalogue</RouterLink>}
          </ActionGroup>
        )}
      </header>

      {decisions.length > 0 && (
        <Banner label="Decisions open" icon={<CircleAlert size={16} />}>
          <strong>{decisions.length === 1 ? "1 decision is" : `${decisions.length} decisions are`} open for <bdi>{orderType.name}</bdi>:</strong>{" "}
          {decisions.map((conflict, index) => (
            <span key={conflict.id}>
              {index > 0 && " · "}
              <a href={`#conflict-${conflict.id}`} dir="auto">{conflict.title}</a>
            </span>
          ))}
          . Its sources contradict each other there, and the catalogue never picks one.
        </Banner>
      )}

      <Section title="Systems in this order" count={taking.length} headingLevel={3}>
        {taking.length ? (
          <DataTable
            caption={`Systems that take part in ${orderType.name} of ${offering.name}`}
            captionHidden
            columns={systemColumns}
            rows={taking}
            rowId={(item) => item.systemId}
          />
        ) : (
          <p className="cat-quiet">No system is named for this order yet.</p>
        )}
      </Section>

      {journey && (
        <Section title="The journey" headingLevel={3}>
          <Suspense fallback={<Skeleton label="Drawing the journey" rows={6} />}>
            <JourneyViews
              journey={journey}
              systemName={nameOf}
              system={system}
              channelName={channelName}
              entry={channel ? { channel: channel.name, systemId: channel.entry_system_id ?? null } : undefined}
              view={view}
              onViewChange={onView}
            />
          </Suspense>
        </Section>
      )}

      <TrackingSection
        offering={offering}
        headingId={`${id}-tracking`}
        system={system}
        channelName={channelName}
        orderName={orderName}
        focus={tracked ? {
          orderName: orderType.name,
          applies: tracked.applies,
          channel: channel ? { id: channel.id, name: channel.name } : null,
          entry: tracked.entry,
          flows: tracked.flows,
        } : undefined}
      />

      <LifecycleSection
        offering={offering}
        headingId={`${id}-lifecycle`}
        orderName={orderName}
        channelName={channelName}
        focus={{ orderCode: orderType.code, orderName: orderType.name, channelId: channel?.id ?? null }}
      />

      <Section title="Parts, and who is responsible in this order" count={parts.length} headingLevel={3}>
        {parts.length ? (
          <DataTable
            caption={`Parts of ${offering.name} and the systems responsible for them in ${orderType.name}`}
            captionHidden
            columns={partColumns}
            rows={parts}
            rowId={({ part }) => part.id}
          />
        ) : (
          <p className="cat-quiet">No part is recorded.</p>
        )}
        <RealisationKey offering={offering} />
      </Section>

      <NfrSection offering={offering} headingId={`${id}-nfrs`} />

      <PlansAndPrices offering={offering} headingId={`${id}-plans`} />

      {decisions.length > 0 && (
        <ConflictList
          conflicts={decisions}
          sources={release.sources ?? []}
          headingId={`${id}-conflicts`}
          title={`Decisions needed for ${orderType.name}`}
          lead="Its sources contradict each other here; the catalogue never picks one."
          raises={(conflict) => questionOf(conflict, offering.id)}
          level={3}
        />
      )}

      <OpenQuestions
        offering={offering}
        conflicts={conflictsFor(release.conflicts ?? [], offering.id)}
        beside={decisions}
        headingId={`${id}-questions`}
      />

      <ArchitectureDecisions offering={offering} headingId={`${id}-decisions`} />

      <OfferingSourceList offering={offering} sources={release.sources ?? []} headingId={`${id}-sources`} />

      <Section title="What the catalogue does not say yet" count={missing.length} headingLevel={3}>
        <p className="cat-lead">{NOT_YET}</p>
        {missing.length ? (
          <Lines>{missing.map((line) => <li key={line} className="explorer-gap">{line}</li>)}</Lines>
        ) : (
          <p className="cat-quiet">Nothing else is missing for this order.</p>
        )}
      </Section>
    </article>
  );
}
