import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import type { Offering } from "../api/client";
import { CONFIDENCE, roleLabel, systemName } from "./catalogue";
import { EditButton, OfferingEdit, WholeRemove } from "./DraftEdits";
import { useCatalogueContext } from "./useCatalogue";

/** The product offerings in a version. */
export function OfferingsPage() {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const offerings = book.release.products ?? [];
  const journeys = book.release.journeys ?? [];
  return (
    <section className="govsection catalogue__first" aria-labelledby="offerings-title">
      <h2 id="offerings-title" className="govsection__title">Product offerings</h2>
      <p className="govsection__lead">What is sold, its parts, and which systems are responsible for each part.</p>
      {editable && !adding && (
        <p className="govsection__actions">
          <EditButton onClick={() => setAdding(true)}>Add an offering</EditButton>
        </p>
      )}
      {adding && (
        <OfferingEdit
          onDone={(saved) => {
            setAdding(false);
            if (saved) navigate(`${base}/offerings/${encodeURIComponent(saved)}`);
          }}
        />
      )}
      {offerings.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Product offerings in this version</caption>
          <thead>
            <tr>
              <th scope="col">Offering</th>
              <th scope="col" className="cell--end">Parts</th>
              <th scope="col" className="cell--end">Journeys</th>
            </tr>
          </thead>
          <tbody>
            {offerings.map((offering) => (
              <tr key={offering.id} className="row">
                <th scope="row">
                  <Link to={`${base}/offerings/${encodeURIComponent(offering.id)}`} dir="auto">{offering.name}</Link>
                  <span className="secondary govtable__by" dir="auto">
                    {[offering.code, offering.family, offering.version && `version ${offering.version}`, offering.lifecycle]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </th>
                <td className="cell--end">{offering.components.length}</td>
                <td className="cell--end">{journeys.filter((journey) => journey.product_id === offering.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">This version describes no product offering.</p>
      )}
    </section>
  );
}

export function OfferingPage() {
  const { offeringId } = useParams();
  const { book, base } = useCatalogueContext();
  const offering = (book.release.products ?? []).find((item) => item.id === offeringId);
  if (!offering) {
    return (
      <p className="docpage__failure catalogue__first" role="alert">
        This version has no offering “{offeringId}”. <Link to={`${base}/offerings`}>See every offering</Link>
      </p>
    );
  }
  return <OfferingSheet key={offering.id} offering={offering} />;
}

function OfferingSheet({ offering }: { offering: Offering }) {
  const { book, base, editable } = useCatalogueContext();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<"edit" | "remove" | null>(null);
  const location = useLocation();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const journeys = (book.release.journeys ?? []).filter((journey) => journey.product_id === offering.id);
  const orderTypes = new Map(offering.order_types.map((item) => [item.code, item.name]));
  const channelNames = new Map((book.release.channels ?? []).map((item) => [item.id, item.name]));
  useEffect(() => {
    if (location.key !== "default") heading.current?.focus();
  }, [location.key]);

  const points = (title: string, items: { name: string; description?: string | null }[]) =>
    items.length > 0 && (
      <div>
        <dt>{title}</dt>
        <dd>
          {items.map((item, index) => (
            <Fragment key={item.name}>
              {index > 0 && "; "}
              <span dir="auto">{item.name}</span>
              {item.description && <span className="secondary" dir="auto"> ({item.description})</span>}
            </Fragment>
          ))}
        </dd>
      </div>
    );

  return (
    <article className="sheet" aria-labelledby={`${id}-name`}>
      <header className="sheet__head">
        <p className="sheet__trail">
          <Link to={`${base}/offerings`} className="sheet__all">All offerings</Link>
        </p>
        <h2 id={`${id}-name`} ref={heading} tabIndex={-1} className="sheet__title" dir="auto">{offering.name}</h2>
        <p className="sheet__meta" dir="auto">
          {[offering.code, offering.family, offering.version && `version ${offering.version}`, offering.lifecycle]
            .filter(Boolean)
            .join(" · ")}
          {offering.confidence && <> · {CONFIDENCE[offering.confidence]}</>}
        </p>
        {offering.proposition && <p className="sheet__description" dir="auto">{offering.proposition}</p>}
        <dl className="sheet__facts">
          {points("For", offering.audiences)}
          {points("Promises", offering.values)}
        </dl>
        {editable && (
          <p className="docpage__actions">
            <EditButton expanded={editing === "edit"} onClick={() => setEditing(editing === "edit" ? null : "edit")}>Edit this offering</EditButton>
            <EditButton expanded={editing === "remove"} onClick={() => setEditing(editing === "remove" ? null : "remove")}>Remove this offering</EditButton>
          </p>
        )}
      </header>
      {editing === "edit" && <OfferingEdit offering={offering} onDone={() => setEditing(null)} />}
      {editing === "remove" && (
        <WholeRemove kind="offering" item={offering} onDone={(removed) => (removed ? navigate(`${base}/offerings`) : setEditing(null))} />
      )}
      {editing !== "edit" && (
        <>

      <section className="govsection" aria-labelledby={`${id}-orders`}>
        <h3 id={`${id}-orders`} className="govsection__title">Order types</h3>
        {offering.order_types.length ? (
          <table className="govtable">
            <caption className="visually-hidden">Order types of {offering.name}</caption>
            <thead>
              <tr>
                <th scope="col">Order type</th>
                <th scope="col">Code</th>
                <th scope="col">Ordered through</th>
                <th scope="col">Offered</th>
              </tr>
            </thead>
            <tbody>
              {offering.order_types.map((type) => (
                <tr key={type.code} className={type.enabled ? "row" : "row row--past"}>
                  <th scope="row" dir="auto">
                    {type.name}
                    {type.description && <span className="secondary govtable__by" dir="auto">{type.description}</span>}
                  </th>
                  <td>{type.code}</td>
                  <td dir="auto">
                    {(type.channels ?? []).length ? (
                      (type.channels ?? []).map((id) => channelNames.get(id) ?? id).join(", ")
                    ) : (
                      <span className="secondary">Not stated</span>
                    )}
                  </td>
                  <td>{type.enabled ? "Yes" : "Not offered"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="timetable__quiet">No order type is recorded.</p>
        )}
      </section>

      <section className="govsection" aria-labelledby={`${id}-parts`}>
        <h3 id={`${id}-parts`} className="govsection__title">Parts, and who is responsible</h3>
        {offering.components.length ? (
          <table className="govtable">
            <caption className="visually-hidden">Parts of {offering.name} and the systems responsible for them</caption>
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Responsible systems</th>
              </tr>
            </thead>
            <tbody>
              {offering.components.map((part) => (
                <tr key={part.id} className="row">
                  <th scope="row" dir="auto">
                    {part.name}
                    <span className="secondary govtable__by">
                      {[
                        part.kind,
                        part.mandatory === true ? "Always included" : part.mandatory === false ? "Optional" : null,
                        part.customer_visible ? "Seen by the customer" : null,
                        part.code,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </th>
                  <td>
                    {part.responsibilities.length ? (
                      <ul className="sheet__roles">
                        {part.responsibilities.map((item) => (
                          <li key={`${item.system_id}:${item.role}`}>
                            <span dir="auto">{roleLabel(item.role)}</span>:{" "}
                            <Link to={`${base}/systems/${encodeURIComponent(item.system_id)}`} dir="auto">
                              {systemName(book, item.system_id)}
                            </Link>
                            {item.order_types.length > 0 && (
                              <span className="secondary"> for {item.order_types.map((code) => orderTypes.get(code) ?? code).join(", ")}</span>
                            )}
                            {item.description && <span className="secondary govtable__by" dir="auto">{item.description}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="secondary">No system is named</span>
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

      <section className="govsection" aria-labelledby={`${id}-rules`}>
        <h3 id={`${id}-rules`} className="govsection__title">Rules</h3>
        {offering.rules.length ? (
          <ul className="sheet__list">
            {offering.rules.map((rule) => <li key={rule} dir="auto">{rule}</li>)}
          </ul>
        ) : (
          <p className="timetable__quiet">No rule is recorded.</p>
        )}
      </section>

      <section className="govsection" aria-labelledby={`${id}-journeys`}>
        <h3 id={`${id}-journeys`} className="govsection__title">Journeys</h3>
        {journeys.length ? (
          <ul className="sheet__list">
            {journeys.map((journey) => (
              <li key={journey.id}>
                <Link to={`${base}/journeys/${encodeURIComponent(journey.id)}`} dir="auto">{journey.name}</Link>
                {journey.order_type_code && (
                  <span className="secondary"> · {orderTypes.get(journey.order_type_code) ?? journey.order_type_code}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="timetable__quiet">No journey in this version fulfils it.</p>
        )}
      </section>
        </>
      )}
    </article>
  );
}
