import { ArrowRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";

import type { OrgProduct, ValueStream } from "../api/client";
import { EditButton } from "../catalogue/DraftEdits";
import { count } from "../home/format";
import { GiveSystem, OrgRemove, ProductEdit, StreamEdit } from "./OrgEdits";
import { type SystemRow, streamSections, unnamedSystems } from "./organisation";
import { useOrgContext } from "./useOrganisation";

type Editing =
  | { what: "add-stream" }
  | { what: "stream" | "remove-stream"; stream: ValueStream }
  | { what: "add-product"; stream: ValueStream }
  | { what: "product" | "remove-product"; product: OrgProduct }
  | null;

/**
 * The organisation read through what it sells: each value stream, its products,
 * each product's systems and who runs each; then the systems no product names.
 */
export function ProductsPage() {
  const { org, release } = useOrgContext();
  const [editing, setEditing] = useState<Editing>(null);
  const [giving, setGivingState] = useState<string | null>(null);
  // The row a reader just gave to a squad stays lit until they act again.
  const [lit, setLit] = useState<string | null>(null);
  const setGiving = (key: string | null) => {
    setLit(null);
    setGivingState(key);
  };
  const sections = streamSections(org, release);
  const unnamed = unnamedSystems(org, release);
  const done = () => setEditing(null);
  const firstGap = [
    ...sections.flatMap((section) => section.products.flatMap((item) => item.rows.map((row) => ({ key: `${item.product.id}:${row.systemId}`, row })))),
    ...unnamed.flatMap((group) => group.rows.map((row) => ({ key: `unnamed:${row.systemId}`, row }))),
  ].find(({ row }) => !row.lapsed && row.runBy.length === 0);

  return (
    <>
      {sections.length === 0 && editing?.what !== "add-stream" && (
        <p className="timetable__quiet catalogue__first">No value stream yet. Add the people first, then a value stream with its lead.</p>
      )}
      <p className="govsection__actions catalogue__first">
        <EditButton expanded={editing?.what === "add-stream"} onClick={() => setEditing(editing?.what === "add-stream" ? null : { what: "add-stream" })}>
          Add a value stream
        </EditButton>
      </p>
      {editing?.what === "add-stream" && <StreamEdit onDone={done} />}

      {sections.map(({ stream, lead, products, squads }) => (
        <section key={stream.id} className="govsection stream" aria-labelledby={`stream-${stream.id}`}>
          <h2 id={`stream-${stream.id}`} className="govsection__title" dir="auto">{stream.name}</h2>
          <p className="govsection__lead">
            {lead ? <>Led by <strong dir="auto">{lead.name}</strong></> : <strong>No lead named</strong>} ·{" "}
            <Link to="/squads/squads">{count(squads.length, "squad")}</Link> · {count(products.length, "product")}
          </p>
          <p className="govsection__actions">
            <EditButton expanded={editing?.what === "add-product" && editing.stream.id === stream.id} onClick={() => setEditing({ what: "add-product", stream })}>
              Add a product<span className="visually-hidden"> to {stream.name}</span>
            </EditButton>
            <EditButton onClick={() => setEditing({ what: "stream", stream })}>
              Edit the value stream<span className="visually-hidden"> {stream.name}</span>
            </EditButton>
            <EditButton onClick={() => setEditing({ what: "remove-stream", stream })}>
              Remove it<span className="visually-hidden"> ({stream.name})</span>
            </EditButton>
          </p>
          {editing?.what === "stream" && editing.stream.id === stream.id && <StreamEdit stream={stream} onDone={done} />}
          {editing?.what === "remove-stream" && editing.stream.id === stream.id && <OrgRemove kind="value-streams" record={stream} onDone={done} />}
          {editing?.what === "add-product" && editing.stream.id === stream.id && <ProductEdit streamId={stream.id} onDone={done} />}

          {products.length === 0 ? (
            <p className="timetable__quiet">No product yet.</p>
          ) : (
            products.map(({ product, rows }) => (
              <div key={product.id} className="product">
                <h3 className="product__title" dir="auto">{product.name}</h3>
                {product.description && <p className="product__description" dir="auto">{product.description}</p>}
                <p className="sheet__row-actions">
                  <EditButton onClick={() => setEditing({ what: "product", product })}>
                    Edit the product<span className="visually-hidden"> {product.name}</span>
                  </EditButton>
                  <EditButton onClick={() => setEditing({ what: "remove-product", product })}>
                    Remove it<span className="visually-hidden"> ({product.name})</span>
                  </EditButton>
                </p>
                {editing?.what === "product" && editing.product.id === product.id && <ProductEdit product={product} onDone={done} />}
                {editing?.what === "remove-product" && editing.product.id === product.id && (
                  <OrgRemove kind="products" record={product} onDone={done} />
                )}
                <SystemRows
                  caption={`Systems ${product.name} rests on, and who runs each`}
                  rows={rows}
                  keyOf={(row) => `${product.id}:${row.systemId}`}
                  giving={giving}
                  setGiving={setGiving}
                  lit={lit}
                  setLit={setLit}
                  empty="It names no system yet."
                />
              </div>
            ))
          )}
        </section>
      ))}

      {release && (
        <section className="govsection" aria-labelledby="unnamed-title">
          <h2 id="unnamed-title" className="govsection__title">Systems no product names</h2>
          <p className="govsection__lead">Systems in service that no product rests on, by where they sit, and who runs each.</p>
          {unnamed.length ? (
            <table className="govtable runs">
              <caption className="visually-hidden">Systems in service that no product names, by where they sit, and who runs each</caption>
              <thead>
                <tr>
                  <th scope="col" className="runs__system">System</th>
                  <th scope="col">Run by</th>
                </tr>
              </thead>
              {unnamed.map((group) => (
                <tbody key={group.place}>
                  <tr className="steps__phase runs__place">
                    <th scope="colgroup" colSpan={2} dir="auto">{group.place}</th>
                  </tr>
                  <RowsBody rows={group.rows} keyOf={(row) => `unnamed:${row.systemId}`} giving={giving} setGiving={setGiving} lit={lit} setLit={setLit} hidePlace />
                </tbody>
              ))}
            </table>
          ) : (
            <p className="timetable__quiet">Every system in service is named by a product.</p>
          )}
        </section>
      )}

      {firstGap ? (
        <p className="timetable__next">
          <button type="button" className="next-button" onClick={() => setGiving(firstGap.key)}>
            Give {firstGap.row.name} to a squad
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </p>
      ) : release ? (
        <p className="timetable__next timetable__next--quiet">Every system in service is run by a squad.</p>
      ) : null}
    </>
  );
}

/** A product's systems, each with the squads that run it and their contact. */
function SystemRows({ caption, rows, keyOf, giving, setGiving, lit, setLit, empty }: {
  caption: string;
  rows: SystemRow[];
  keyOf: (row: SystemRow) => string;
  giving: string | null;
  setGiving: (key: string | null) => void;
  lit: string | null;
  setLit: (key: string | null) => void;
  empty: string;
}) {
  if (!rows.length) return empty ? <p className="timetable__quiet">{empty}</p> : null;
  return (
    <table className="govtable runs">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="runs__system">System</th>
          <th scope="col">Run by</th>
        </tr>
      </thead>
      <tbody>
        <RowsBody rows={rows} keyOf={keyOf} giving={giving} setGiving={setGiving} lit={lit} setLit={setLit} />
      </tbody>
    </table>
  );
}

/** The rows themselves: a system, who runs it, and giving it to a squad in place when nobody does. */
function RowsBody({ rows, keyOf, giving, setGiving, lit, setLit, hidePlace }: {
  rows: SystemRow[];
  keyOf: (row: SystemRow) => string;
  giving: string | null;
  setGiving: (key: string | null) => void;
  lit: string | null;
  setLit: (key: string | null) => void;
  hidePlace?: boolean;
}) {
  // Closing the panel hands focus back to the system it was about.
  const close = (key: string, given: boolean) => {
    setGiving(null);
    if (given) setLit(key);
    setTimeout(() => document.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"] th a, [data-row="${CSS.escape(key)}"] th span`)?.focus(), 0);
  };
  return (
    <>
        {rows.map((row) => {
          const key = keyOf(row);
          const open = giving === key;
          const due = !row.lapsed && row.runBy.length === 0;
          return (
            <Fragment key={key}>
              <tr data-row={key} className={`row${row.lapsed ? " row--past" : due ? " row--due" : ""}${open ? " is-open" : ""}${lit === key ? " is-lit" : ""}`}>
                <th scope="row">
                  {row.lapsed ? (
                    <span dir="auto">{row.name}</span>
                  ) : (
                    <Link to={`/architecture/systems/${encodeURIComponent(row.systemId)}`} dir="auto">{row.name}</Link>
                  )}
                  {row.lapsed && <span className="secondary govtable__by">Not in the catalogue in service</span>}
                  {!hidePlace && !row.lapsed && row.place.length > 0 && (
                    <span className="secondary govtable__by" dir="auto">{row.place.join(" › ")}</span>
                  )}
                </th>
                <td>
                  {row.runBy.length ? (
                    row.runBy.map(({ squad, contact }) => (
                      <span key={squad.id} className="runs__squad">
                        <Link to="/squads/squads" dir="auto">{squad.name}</Link>
                        <span className="secondary govtable__by" dir="auto">{contact ? `Contact: ${contact.name}` : "No contact named"}</span>
                      </span>
                    ))
                  ) : (
                    <span className="status">{row.lapsed ? "—" : "No squad"}</span>
                  )}
                  {due && (
                    <span className="runs__give">
                      <EditButton expanded={open} onClick={() => setGiving(open ? null : key)}>
                        Give it to a squad<span className="visually-hidden"> ({row.name})</span>
                      </EditButton>
                    </span>
                  )}
                </td>
              </tr>
              {open && (
                <tr className="runs__detail">
                  <td colSpan={2}>
                    <GiveSystem systemId={row.systemId} systemName={row.name} onDone={(given) => close(key, given)} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
    </>
  );
}
