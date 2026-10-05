import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { type ReactNode, useEffect, useId } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, type ExplorerRelease } from "../api/client";
import { errorMessage } from "../api/errors";
import { CONFIDENCE, roleLabel, sentenceCase } from "../catalogue/catalogue";
import { JourneyHandovers, JourneySteps } from "../catalogue/JourneyTimetable";
import { formatDay } from "../home/format";
import { gaps, involvement, journeyFor, listed, partsFor, pickScenario, type Scenario } from "./scenario";

/** What the catalogue cannot hold yet; each arrives with a later slice (requirement-portal ADR-0101). */
export const NOT_YET =
  "Channels, plans and prices, order tracking and NFRs are not in the catalogue yet, so the explorer does not show them.";

function useExplorerRelease() {
  return useQuery({ queryKey: ["explorer", "release"], queryFn: api.explorerRelease });
}

/**
 * The product architecture explorer: one offering and one of its order types,
 * read from the catalogue in service. Admins and every other signed-in reader
 * see the same page; only admins can follow a system to its sheet.
 */
export function ExplorerPage({ linkSystems }: { linkSystems: boolean }) {
  const query = useExplorerRelease();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    document.title = "Product architecture explorer · Knowledge portal";
  }, []);

  const head = (edition: ReactNode) => (
    <header className="docpage__head">
      <p className="docpage__number" aria-hidden="true">2</p>
      <div className="docpage__heading">
        <h1 id="explorer-title" className="docpage__title">
          <span className="visually-hidden">Table 2:</span> Product architecture explorer
        </h1>
        {edition}
      </div>
    </header>
  );

  if (query.isPending) {
    return (
      <section className="docpage" aria-labelledby="explorer-title" aria-busy="true">
        {head(<p className="docpage__edition">Opening the catalogue in service…</p>)}
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="docpage" aria-labelledby="explorer-title">
        {head(null)}
        <p className="docpage__failure" role="alert">
          {errorMessage(query.error)}
          <button type="button" className="text-button" onClick={() => void query.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      </section>
    );
  }

  const release = query.data;
  const scenario = pickScenario(release, params.get("product"), params.get("order"));
  const choose = (product: string, order: string | null) =>
    setParams(order ? { product, order } : { product }, { replace: true });

  return (
    <section className="docpage catalogue explorer" aria-labelledby="explorer-title">
      {head(
        <p className="docpage__edition">
          In service: <strong dir="auto">‘{release.name ?? release.id}’</strong>, published{" "}
          {formatDay(release.published_at)}. Choose an offering and an order type to see the journey
          that fulfils it, the systems that take part, and what the catalogue does not say yet.
        </p>,
      )}
      {scenario ? (
        <>
          <Choose release={release} scenario={scenario} onChoose={choose} />
          <ScenarioSheet key={`${scenario.offering.id}:${scenario.orderType.code}`} release={release} scenario={scenario} linkSystems={linkSystems} />
        </>
      ) : (
        <p className="docpage__quiet">The catalogue in service describes no offering with an order type yet.</p>
      )}
    </section>
  );
}

function Choose({ release, scenario, onChoose }: {
  release: ExplorerRelease;
  scenario: Scenario;
  onChoose: (product: string, order: string | null) => void;
}) {
  const id = useId();
  const offerings = (release.products ?? []).filter((item) => item.order_types.length > 0);
  return (
    <form className="explorer__choose" aria-label="Choose what to explore" onSubmit={(event) => event.preventDefault()}>
      <label className="field" htmlFor={`${id}-offering`}>
        <span className="field__label">Offering</span>
        <select
          id={`${id}-offering`}
          className="field__input form__select"
          value={scenario.offering.id}
          onChange={(event) => onChoose(event.target.value, null)}
        >
          {offerings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="field" htmlFor={`${id}-order`}>
        <span className="field__label">Order type</span>
        <select
          id={`${id}-order`}
          className="field__input form__select"
          value={scenario.orderType.code}
          onChange={(event) => onChoose(scenario.offering.id, event.target.value)}
        >
          {scenario.offering.order_types.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
              {!item.enabled ? " (not offered)" : journeyFor(release, scenario.offering.id, item.code) ? "" : " (no journey yet)"}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

function steps(numbers: string[]): string {
  return numbers.length === 1 ? `step ${numbers[0]}` : `steps ${listed(numbers)}`;
}

/** One scenario as a sheet: the systems first, then the timetable, the parts and the gaps. */
function ScenarioSheet({ release, scenario, linkSystems }: {
  release: ExplorerRelease;
  scenario: Scenario;
  linkSystems: boolean;
}) {
  const id = useId();
  const { offering, orderType, journey } = scenario;
  const names = new Map(release.systems.map((item) => [item.id, item.name]));
  const system = (systemId: string) =>
    linkSystems ? (
      <Link to={`/architecture/systems/${encodeURIComponent(systemId)}`} dir="auto">{names.get(systemId) ?? systemId}</Link>
    ) : (
      <span dir="auto">{names.get(systemId) ?? systemId}</span>
    );
  const taking = involvement(scenario);
  const parts = partsFor(scenario);
  const missing = gaps(scenario);

  return (
    <article className="sheet" aria-labelledby={`${id}-name`}>
      <header className="sheet__head">
        <h2 id={`${id}-name`} className="sheet__title" dir="auto">{offering.name}: {orderType.name}</h2>
        <p className="sheet__meta">
          {journey ? (
            <>
              Fulfilled by <span dir="auto">{journey.name}</span>
              {journey.confidence && <> · {CONFIDENCE[journey.confidence]}</>}
            </>
          ) : (
            "No journey fulfils it yet"
          )}
          {!orderType.enabled && " · Not offered"}
        </p>
        {offering.proposition && <p className="sheet__description" dir="auto">{offering.proposition}</p>}
        {linkSystems && (
          <p className="sheet__trail">
            <Link to={`/architecture/offerings/${encodeURIComponent(offering.id)}`}>The offering in the catalogue</Link>
            {journey && (
              <>
                <span aria-hidden="true"> · </span>
                <Link to={`/architecture/journeys/${encodeURIComponent(journey.id)}`}>The journey in the catalogue</Link>
              </>
            )}
          </p>
        )}
      </header>

      <section className="govsection" aria-labelledby={`${id}-systems`}>
        <h3 id={`${id}-systems`} className="govsection__title">
          Systems in this order <span className="govsection__count">{taking.length}</span>
        </h3>
        {taking.length ? (
          <table className="govtable">
            <caption className="visually-hidden">Systems that take part in {orderType.name} of {offering.name}</caption>
            <thead>
              <tr>
                <th scope="col">System</th>
                <th scope="col">Its part in this order</th>
                <th scope="col" className="cell--end">Steps</th>
              </tr>
            </thead>
            <tbody>
              {taking.map((item) => (
                <tr key={item.systemId} className="row">
                  <th scope="row">{system(item.systemId)}</th>
                  <td>
                    {item.performs.length
                      ? `Performs ${steps(item.performs)}`
                      : item.supports.length
                        ? `Supports ${steps(item.supports)}`
                        : "Responsible for a part; no step names it"}
                    {item.performs.length > 0 && item.supports.length > 0 && (
                      <span className="secondary govtable__by">Supports {steps(item.supports)}</span>
                    )}
                    {item.parts.map(({ part, responsibility }) => (
                      <span key={`${part.id}:${responsibility.role}`} className="secondary govtable__by" dir="auto">
                        {roleLabel(responsibility.role)} for {part.name}
                      </span>
                    ))}
                  </td>
                  <td className="cell--end">{new Set([...item.performs, ...item.supports]).size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="timetable__quiet">No system is named for this order yet.</p>
        )}
      </section>

      {journey && (
        <>
          <JourneySteps journey={journey} headingId={`${id}-steps`} system={system} />
          <JourneyHandovers journey={journey} headingId={`${id}-handovers`} />
        </>
      )}

      <section className="govsection" aria-labelledby={`${id}-parts`}>
        <h3 id={`${id}-parts`} className="govsection__title">Parts, and who is responsible in this order</h3>
        {parts.length ? (
          <table className="govtable">
            <caption className="visually-hidden">Parts of {offering.name} and the systems responsible for them in {orderType.name}</caption>
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Responsible systems</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(({ part, responsibilities }) => (
                <tr key={part.id} className="row">
                  <th scope="row" dir="auto">
                    {part.name}
                    <span className="secondary govtable__by">
                      {[
                        part.kind ? sentenceCase(part.kind) : null,
                        part.mandatory === true ? "Always included" : part.mandatory === false ? "Optional" : null,
                        part.customer_visible ? "Seen by the customer" : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </th>
                  <td>
                    {responsibilities.length ? (
                      <ul className="sheet__roles">
                        {responsibilities.map((item) => (
                          <li key={`${item.system_id}:${item.role}`}>
                            <span dir="auto">{roleLabel(item.role)}</span>: {system(item.system_id)}
                            {item.description && <span className="secondary govtable__by" dir="auto">{item.description}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="secondary">No system is named for this order</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="timetable__quiet">No part is recorded.</p>
        )}
      </section>

      <section className="govsection" aria-labelledby={`${id}-gaps`}>
        <h3 id={`${id}-gaps`} className="govsection__title">What the catalogue does not say yet</h3>
        <p className="govsection__lead">{NOT_YET}</p>
        {missing.length ? (
          <ul className="sheet__list">
            {missing.map((line) => <li key={line} className="explorer__gap">{line}</li>)}
          </ul>
        ) : (
          <p className="timetable__quiet">Nothing else is missing for this order.</p>
        )}
      </section>
    </article>
  );
}
