/**
 * Transitional (redesign Phase 8): the Timetable Book's reviews line, still
 * covered by the reviews tests (area 6). Unchanged from app/Shell.tsx; removed
 * with that area.
 */
import { Link } from "react-router-dom";

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
