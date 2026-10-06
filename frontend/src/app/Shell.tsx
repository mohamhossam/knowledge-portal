import { LogOut, RotateCw } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";

import type { Actor } from "../api/client";
import { useAuth } from "../auth/authContext";
import { REQUIREMENT_APP_URL } from "../auth/paths";
import { TABLES } from "../home/tables";
import { formatMoment } from "../home/format";
import { useOverview, type TableState } from "../home/useOverview";
import { useReminders } from "../reviews/useReviews";

const ENTRIES = [
  { key: "library", spec: TABLES.library },
  { key: "architecture", spec: TABLES.architecture },
  { key: "squads", spec: TABLES.squads },
  { key: "requirements", spec: TABLES.requirements },
] as const;

function extent(state: TableState) {
  return state.status === "ready" ? state.overview.extent : null;
}

/** An entry's most pressing state, in its rows' rank styling; said only when there is one. */
function Alert({ state }: { state: TableState }) {
  if (state.status === "error") return <span className="index__alert index__alert--delayed">Could not be read</span>;
  const alert = state.status === "ready" ? state.overview.alert : undefined;
  if (!alert) return null;
  return (
    <span className={`index__alert index__alert--${alert.rank}`}>
      <span className="visually-hidden">, </span>
      {alert.text}
    </span>
  );
}

/**
 * The timetable book's binding: a masthead strip, the index of tables, and
 * the page. Every screen of the portal sits inside it.
 */
export function Shell() {
  const auth = useAuth();
  const overview = useOverview();
  const extents = ENTRIES.map((entry) => extent(overview[entry.key]));
  const largest = Math.max(1, ...extents.map((item) => item?.value ?? 0));

  return (
    <>
      <a className="skip-link" href="#main">Skip to the tables</a>
      <header className="masthead">
        <p className="masthead__title">
          <a href={REQUIREMENT_APP_URL}>Requirement AI</a>
          <span aria-hidden="true" className="masthead__dot">·</span>
          <Link to="/" className="masthead__portal">Knowledge portal</Link>
        </p>
        <p className="masthead__valid" aria-live="polite">
          {overview.validAt ? (
            <>Valid as of <time dateTime={overview.validAt.toISOString()}>{formatMoment(overview.validAt)}</time></>
          ) : "Reading the tables…"}
          <button
            type="button"
            className="text-button"
            onClick={overview.refresh}
            disabled={overview.refreshing}
            aria-label={overview.refreshing ? "Refreshing the tables" : "Refresh the tables"}
          >
            <RotateCw size={14} aria-hidden="true" className={overview.refreshing ? "spin" : undefined} />
            <span aria-hidden="true">{overview.refreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </p>
        <ReviewsDue />
        <Account actor={auth?.actor ?? null} />
      </header>

      <nav className="index" aria-label="Tables">
        <ol className="index__list">
          {ENTRIES.map((entry, index) => {
            const size = extents[index];
            return (
              <li key={entry.key}>
                <NavLink to={entry.spec.to} className="index__entry">
                  <span className="index__number" aria-hidden="true">{entry.spec.number}</span>
                  <span className="index__title">
                    <span className="visually-hidden">Table {entry.spec.number}:</span>{" "}
                    {entry.spec.title}
                  </span>
                  <span className="index__extent">
                    <span className="visually-hidden">: </span>
                    <span className="index__count">{size?.label ?? "—"}</span>
                    <span className="index__track" aria-hidden="true">
                      <span
                        className="index__rule"
                        style={{ inlineSize: `${size ? Math.max(3, (size.value / largest) * 100) : 0}%` }}
                      />
                    </span>
                  </span>
                  <Alert state={overview[entry.key]} />
                </NavLink>
              </li>
            );
          })}
        </ol>
      </nav>

      <main id="main" className="page" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}

/**
 * How many reviews the signed-in person answers for are due, linking to their reminders;
 * nothing at all when none is. Changes are announced politely.
 */
export function ReviewsDue() {
  const reminders = useReminders();
  const overdue = reminders.data?.overdue ?? 0;
  const soon = reminders.data?.due_soon ?? 0;
  return (
    <p className="masthead__reviews" aria-live="polite">
      {overdue + soon > 0 && (
        <Link to="/reminders" className="masthead__due">
          Reviews:{" "}
          {overdue > 0 && <span className="masthead__overdue">{overdue} overdue</span>}
          {overdue > 0 && soon > 0 && " · "}
          {soon > 0 && `${soon} due soon`}
        </Link>
      )}
    </p>
  );
}

/** Who is signed in: a persona switch offline, otherwise the name and Sign out. */
export function Account({ actor }: { actor: Actor | null }) {
  const auth = useAuth();
  if (!auth || !actor) return null;
  return (
    <div className="masthead__account">
      {auth.config?.mode === "fake" ? (
        <label className="persona">
          <span className="persona__label">Persona</span>
          <select
            value={actor.id}
            onChange={(event) => void auth.switchFakeActor(event.target.value)}
          >
            {auth.config.fake_actors.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <span className="masthead__name">{actor.display_name}</span>
          <button type="button" className="text-button" onClick={() => void auth.signOut()}>
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </>
      )}
    </div>
  );
}
