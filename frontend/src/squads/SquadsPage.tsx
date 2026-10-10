import { RotateCw } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { useActorNames } from "../catalogue/useCatalogue";
import { count, formatDay } from "../home/format";
import { gaps, historyLine } from "./organisation";
import { type OrgContext, useHistory, useOrganisation } from "./useOrganisation";

/** Table 3, the squad catalogue: what the organisation sells, who runs each system, and the people. */
export function SquadsPage() {
  const hook = useOrganisation();
  const { organisation, active } = hook;
  useEffect(() => {
    document.title = "Squad catalogue · Knowledge portal";
  }, []);
  const head = (body: ReactNode) => (
    <header className="docpage__head">
      <p className="docpage__number" aria-hidden="true">3</p>
      <div className="docpage__heading">
        <h1 id="squads-title" className="docpage__title">
          <span className="visually-hidden">Table 3:</span> Squad catalogue
        </h1>
        {body}
      </div>
    </header>
  );
  if (organisation.isPending || active.isPending) {
    return (
      <section className="docpage" aria-labelledby="squads-title" aria-busy="true">
        {head(<p className="docpage__edition">Opening the squad catalogue…</p>)}
      </section>
    );
  }
  if (organisation.isError) {
    return (
      <section className="docpage" aria-labelledby="squads-title">
        {head(
          <p className="docpage__failure" role="alert">
            {errorMessage(organisation.error)}
            <button type="button" className="text-button" onClick={() => void organisation.refetch()}>
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          </p>,
        )}
      </section>
    );
  }
  const org = organisation.data;
  const release = active.data ?? null;
  const context: OrgContext = { org, release, flags: hook.references.data ?? [], hook };
  return (
    <section className="docpage squads" aria-labelledby="squads-title">
      {head(
        <>
          <p className="docpage__edition">
            Kept current in place: {count(org.value_streams.length, "value stream")}, {count(org.squads.length, "squad")},{" "}
            {count(org.products.length, "product")}, {count(org.people.filter((person) => person.active).length, "active person", "active people")}.
          </p>
          <LastChange />
          <Gaps context={context} />
          <SubIndex />
        </>,
      )}
      <Outlet context={context} />
    </section>
  );
}

function LastChange() {
  const history = useHistory();
  const actorName = useActorNames();
  const { organisation } = useOrganisation();
  const last = history.data?.[0];
  if (!last || !organisation.data) return null;
  return (
    <p className="docpage__version">
      Last change: {historyLine(last, organisation.data)}, by {actorName(last.actor_id)} on {formatDay(last.created_at)}.
    </p>
  );
}

/** Ownership across the version in service, counted first, like a timetable's list of changes. */
function Gaps({ context }: { context: OrgContext }) {
  const { org, release } = context;
  if (!release) {
    return <p className="docpage__notice">No architecture version is in service, so ownership cannot be counted and systems cannot be linked yet.</p>;
  }
  const counted = gaps(org, release);
  const toCheck = context.flags.filter((flag) => flag.subject === "product").length;
  return (
    <div className="notice-table squads__gaps" role="status" aria-label="Ownership of the systems in service">
      <p className="notice-table__title">Who runs the systems in service</p>
      <dl className="notice-table__grid">
        <div className="notice-table__item"><dt>Systems in service</dt><dd>{counted.inService}</dd></div>
        <div className="notice-table__item"><dt>Run by a squad</dt><dd>{counted.run}</dd></div>
        <div className="notice-table__item"><dt>No squad</dt><dd>{counted.noSquad}</dd></div>
        {counted.lapsed > 0 && <div className="notice-table__item"><dt>Links no longer in service</dt><dd>{counted.lapsed}</dd></div>}
        {toCheck > 0 && <div className="notice-table__item"><dt>Products to check</dt><dd>{toCheck}</dd></div>}
      </dl>
      <p className="notice-table__total">
        {counted.noSquad
          ? `${counted.noSquad} of ${counted.inService} systems in service ${counted.noSquad === 1 ? "has" : "have"} no squad.`
          : `Every one of the ${counted.inService} systems in service has a squad.`}
      </p>
    </div>
  );
}

function SubIndex() {
  const { pathname } = useLocation();
  const pages = [
    { label: "Products", to: "/squads", current: pathname === "/squads" || pathname === "/squads/" },
    { label: "Squads", to: "/squads/squads", current: pathname.startsWith("/squads/squads") },
    { label: "People", to: "/squads/people", current: pathname.startsWith("/squads/people") },
    { label: "History", to: "/squads/history", current: pathname.startsWith("/squads/history") },
  ];
  return (
    <nav className="subindex" aria-label="This catalogue">
      <ul className="subindex__list">
        {pages.map((page) => (
          <li key={page.label}>
            <Link to={page.to} className="subindex__link" aria-current={page.current ? "page" : undefined}>{page.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
