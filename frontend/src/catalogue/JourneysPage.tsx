import { useEffect, useId, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import type { Journey } from "../api/client";
import { CONFIDENCE, nextSteps, orderedSteps, phaseRuns, systemName } from "./catalogue";
import { useCatalogueContext } from "./useCatalogue";

/** The journeys in a version: how an order travels from system to system. */
export function JourneysPage() {
  const { book, base } = useCatalogueContext();
  const journeys = book.release.journeys ?? [];
  const offerings = new Map((book.release.products ?? []).map((item) => [item.id, item]));
  return (
    <section className="govsection catalogue__first" aria-labelledby="journeys-title">
      <h2 id="journeys-title" className="govsection__title">Journeys</h2>
      <p className="govsection__lead">Each journey is read like a timetable: its steps in order, and the system that performs each.</p>
      {journeys.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Journeys in this version</caption>
          <thead>
            <tr>
              <th scope="col">Journey</th>
              <th scope="col" className="cell--end">Steps</th>
              <th scope="col" className="cell--end">Systems</th>
            </tr>
          </thead>
          <tbody>
            {journeys.map((journey) => {
              const offering = journey.product_id ? offerings.get(journey.product_id) : undefined;
              const orderType = offering?.order_types.find((item) => item.code === journey.order_type_code);
              const systems = new Set(
                journey.activities.flatMap((step) => [step.performing_system_id, ...step.supporting_system_ids].filter(Boolean)),
              );
              return (
                <tr key={journey.id} className="row">
                  <th scope="row">
                    <Link to={`${base}/journeys/${encodeURIComponent(journey.id)}`} dir="auto">{journey.name}</Link>
                    {offering && (
                      <span className="secondary govtable__by" dir="auto">
                        {offering.name}
                        {orderType ? ` · ${orderType.name}` : journey.order_type_code ? ` · ${journey.order_type_code}` : ""}
                      </span>
                    )}
                  </th>
                  <td className="cell--end">{journey.activities.length}</td>
                  <td className="cell--end">{systems.size}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">This version describes no journey.</p>
      )}
    </section>
  );
}

export function JourneyPage() {
  const { journeyId } = useParams();
  const { book, base } = useCatalogueContext();
  const journey = (book.release.journeys ?? []).find((item) => item.id === journeyId);
  if (!journey) {
    return (
      <p className="docpage__failure catalogue__first" role="alert">
        This version has no journey “{journeyId}”. <Link to={`${base}/journeys`}>See every journey</Link>
      </p>
    );
  }
  return <JourneySheet key={journey.id} journey={journey} />;
}

/** A journey as a timetable: steps grouped by phase, each with its system and where it goes next. */
function JourneySheet({ journey }: { journey: Journey }) {
  const { book, base } = useCatalogueContext();
  const location = useLocation();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const offering = (book.release.products ?? []).find((item) => item.id === journey.product_id);
  const orderType = offering?.order_types.find((item) => item.code === journey.order_type_code);
  const steps = orderedSteps(journey);
  const names = new Map(steps.map((step) => [step.number, step.name]));
  useEffect(() => {
    if (location.key !== "default") heading.current?.focus();
  }, [location.key]);
  const system = (systemId: string) => (
    <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>
  );

  return (
    <article className="sheet" aria-labelledby={`${id}-name`}>
      <header className="sheet__head">
        <p className="sheet__trail">
          <Link to={`${base}/journeys`} className="sheet__all">All journeys</Link>
        </p>
        <h2 id={`${id}-name`} ref={heading} tabIndex={-1} className="sheet__title" dir="auto">{journey.name}</h2>
        <p className="sheet__meta">
          {offering ? (
            <>
              Fulfils <Link to={`${base}/offerings/${encodeURIComponent(offering.id)}`} dir="auto">{offering.name}</Link>
              {(orderType || journey.order_type_code) && <>, <span dir="auto">{orderType?.name ?? journey.order_type_code}</span></>}
            </>
          ) : (
            "Not tied to an offering"
          )}
          {journey.confidence && <> · {CONFIDENCE[journey.confidence]}</>}
        </p>
        {journey.description && <p className="sheet__description" dir="auto">{journey.description}</p>}
      </header>

      <section className="govsection" aria-labelledby={`${id}-steps`}>
        <h3 id={`${id}-steps`} className="govsection__title">Steps</h3>
        {steps.length ? (
          <table className="govtable steps">
            <caption className="visually-hidden">Steps of {journey.name}, in order</caption>
            <thead>
              <tr>
                <th scope="col" className="cell--end steps__no">No.</th>
                <th scope="col">Step</th>
                <th scope="col">Performed by</th>
              </tr>
            </thead>
            {phaseRuns(steps).map((run, index, runs) => (
              <tbody key={`${run.phase ?? "none"}:${index}`}>
                {run.phase && (
                  <tr className="steps__phase">
                    <th scope="colgroup" colSpan={3} dir="auto">
                      {runs.slice(0, index).some((earlier) => earlier.phase === run.phase)
                        ? `Back to ${run.phase.charAt(0).toLocaleLowerCase()}${run.phase.slice(1)}`
                        : run.phase}
                    </th>
                  </tr>
                )}
                {run.steps.map((step) => {
                  const next = nextSteps(journey, step.number);
                  return (
                    <tr key={step.number} className="row">
                      <th scope="row" className="cell--end steps__no">{step.number}</th>
                      <td dir="auto">
                        <span className="steps__name">{step.name}</span>
                        {step.customer_visible && <span className="secondary govtable__by">Seen by the customer</span>}
                        {step.description && <span className="secondary govtable__by" dir="auto">{step.description}</span>}
                        {next && <span className="secondary govtable__by">{next}</span>}
                      </td>
                      <td>
                        {step.performing_system_id ? system(step.performing_system_id) : <span className="secondary">No system named</span>}
                        {step.supporting_system_ids.length > 0 && (
                          <span className="secondary govtable__by">
                            with{" "}
                            {step.supporting_system_ids.map((systemId, position) => (
                              <span key={systemId}>
                                {position > 0 && ", "}
                                {system(systemId)}
                              </span>
                            ))}
                          </span>
                        )}
                        {step.mode && <span className="secondary govtable__by" dir="auto">{step.mode}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        ) : (
          <p className="timetable__quiet">No step is recorded.</p>
        )}
      </section>

      {journey.integrations.length > 0 && (
        <section className="govsection" aria-labelledby={`${id}-handovers`}>
          <h3 id={`${id}-handovers`} className="govsection__title">Hand-overs</h3>
          <table className="govtable">
            <caption className="visually-hidden">How steps of {journey.name} hand over to each other</caption>
            <thead>
              <tr>
                <th scope="col">Between steps</th>
                <th scope="col">How</th>
              </tr>
            </thead>
            <tbody>
              {journey.integrations.map((link) => (
                <tr key={`${link.from_activity}>${link.to_activity}:${link.interface ?? ""}`} className="row">
                  <th scope="row">
                    {link.from_activity} to {link.to_activity}
                    <span className="secondary govtable__by" dir="auto">
                      {names.get(link.from_activity)} to {names.get(link.to_activity)}
                    </span>
                  </th>
                  <td dir="auto">
                    {link.interaction ?? link.interface ?? "Not described"}
                    {[link.interaction ? link.interface : null, link.payload, link.timing].filter(Boolean).length > 0 && (
                      <span className="secondary govtable__by" dir="auto">
                        {[link.interaction ? link.interface : null, link.payload, link.timing].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}
