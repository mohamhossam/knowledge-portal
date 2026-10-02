const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "2 Oct 2026": dates as a timetable prints them. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : day.format(date);
}

/** "22:15, 2 Oct 2026". */
export function formatMoment(at: Date): string {
  return `${clock.format(at)}, ${day.format(at)}`;
}

/** "1 document", "3 documents". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
