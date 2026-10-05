import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import type { Journey } from "../api/client";
import { CONFIDENCE, systemName } from "./catalogue";
import { EditButton, JourneyEdit, WholeRemove } from "./DraftEdits";
import { JourneyHandovers, JourneySteps } from "./JourneyTimetable";
import { useCatalogueContext } from "./useCatalogue";

/** The journeys in a version: how an order travels from system to system. */
export function JourneysPage() {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const journeys = book.release.journeys ?? [];
  const offerings = new Map((book.release.products ?? []).map((item) => [item.id, item]));
  return (
    <section className="govsection catalogue__first" aria-labelledby="journeys-title">
      <h2 id="journeys-title" className="govsection__title">Journeys</h2>
      <p className="govsection__lead">Each journey is read like a timetable: its steps in order, and the system that performs each.</p>
      {editable && !adding && (
        <p className="govsection__actions">
          <EditButton onClick={() => setAdding(true)}>Add a journey</EditButton>
        </p>
      )}
      {adding && (
        <JourneyEdit
          onDone={(saved) => {
            setAdding(false);
            if (saved) navigate(`${base}/journeys/${encodeURIComponent(saved)}`);
          }}
        />
      )}
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
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<"edit" | "remove" | null>(null);
  const location = useLocation();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const offering = (book.release.products ?? []).find((item) => item.id === journey.product_id);
  const orderType = offering?.order_types.find((item) => item.code === journey.order_type_code);
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
        {editable && (
          <p className="docpage__actions">
            <EditButton expanded={editing === "edit"} onClick={() => setEditing(editing === "edit" ? null : "edit")}>Edit this journey</EditButton>
            <EditButton expanded={editing === "remove"} onClick={() => setEditing(editing === "remove" ? null : "remove")}>Remove this journey</EditButton>
          </p>
        )}
      </header>
      {editing === "edit" && <JourneyEdit journey={journey} onDone={() => setEditing(null)} />}
      {editing === "remove" && (
        <WholeRemove kind="journey" item={journey} onDone={(removed) => (removed ? navigate(`${base}/journeys`) : setEditing(null))} />
      )}
      {editing !== "edit" && (
        <>
          <JourneySteps journey={journey} headingId={`${id}-steps`} system={system} />
          <JourneyHandovers journey={journey} headingId={`${id}-handovers`} />
        </>
      )}
    </article>
  );
}
