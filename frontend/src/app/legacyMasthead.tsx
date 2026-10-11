/**
 * Transitional (redesign Phase 8): the Timetable Book's masthead pieces, still
 * used by the reader view (area 8 rebuilds it) and covered by the reviews
 * tests (area 6). Unchanged from app/Shell.tsx; removed with those areas.
 */
import { LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import type { Actor } from "../api/client";
import { useAuth } from "../auth/authContext";
import { useReminders } from "../reviews/useReviews";

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
