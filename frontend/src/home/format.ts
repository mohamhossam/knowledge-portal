const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "2 Oct 2026": dates as a timetable prints them. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : day.format(date);
}

/** "22:15": a clock time, the one way every page prints it ("Saved at 22:15"). */
export function formatClock(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  return Number.isNaN(date.getTime()) ? "—" : clock.format(date);
}

/** "22:15, 2 Oct 2026". */
export function formatMoment(at: Date): string {
  return `${clock.format(at)}, ${day.format(at)}`;
}

/** "45 s", "1 min 20 s", "2 h 5 min": how long a job has run, from `from` to `to` (epoch ms). */
export function formatElapsed(from: number, to: number): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ${seconds % 60} s` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** "1 document", "3 documents". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
