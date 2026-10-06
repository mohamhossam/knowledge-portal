/**
 * Review cycles (Knowledge Center D), in the book's words: when knowledge was last confirmed
 * still right, by whom, and when it falls due again. Being due never takes anything out of use.
 */
import type { ReviewStanding, ReviewState } from "../api/client";
import { formatDay } from "../home/format";
import type { Rank } from "../timetable/TimetableTable";

export const REMINDERS_KEY = ["reviews", "reminders"] as const;
export const SYSTEM_REVIEWS_KEY = ["architecture", "system-reviews"] as const;
/** Every read a confirmation changes: reminders, standings, the library and its documents. */
export const REVIEW_READS = [["reviews"], SYSTEM_REVIEWS_KEY, ["library"]] as const;

/** The rank a standing sets: overdue is a disruption, due soon is due, current is in service. */
export const REVIEW_RANK: Record<ReviewState, Rank> = { overdue: "delayed", due_soon: "due", current: "service" };

/** "Overdue since 3 Oct 2026", "Due 12 Oct 2026", "Due 1 Apr 2027". */
export function dueWords(standing: ReviewStanding): string {
  return standing.state === "overdue" ? `Overdue since ${formatDay(standing.due_at)}` : `Due ${formatDay(standing.due_at)}`;
}

/** The same moment, whatever the serialisation. */
export function sameMoment(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && new Date(a as string).getTime() === new Date(b as string).getTime();
}

/** How many days a cycle runs, from one standing: its due date less its last review. */
export function cycleDays(standing: ReviewStanding): number {
  return Math.round((new Date(standing.due_at).getTime() - new Date(standing.last_reviewed_at).getTime()) / 86_400_000);
}

/** How long before its due date a review is reminded of (the service's window). */
export const REMINDER_WINDOW_DAYS = 14;

/** The cycle's statuses, kept apart from passage review's "Awaiting your review". */
export const REVIEW_STATUS = { overdue: "Re-confirmation overdue", due_soon: "Re-confirmation due soon" } as const;

/** Since when a standing has needed someone: its due date when overdue, else when its reminder window opened. */
export function reviewSince(standing: ReviewStanding): string {
  if (standing.state === "overdue") return standing.due_at;
  return new Date(new Date(standing.due_at).getTime() - REMINDER_WINDOW_DAYS * 86_400_000).toISOString();
}
