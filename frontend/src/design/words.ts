/** Shared vocabulary (docs/ux/content/microcopy.md §7): one word per state, everywhere. */

/** §6: the display states every job enum maps to. */
export type JobState = "waiting" | "working" | "done" | "attention" | "stopped" | "held";

export const JOB_WORDS: Record<JobState, string> = {
  waiting: "Waiting",
  working: "Working",
  done: "Done",
  attention: "Needs attention",
  stopped: "Stopped",
  held: "Held",
};

/** The platform's own modifier: ⌘ on Apple keyboards, Ctrl elsewhere. */
export function searchShortcut(): string {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  return /Mac|iPhone|iPad/.test(platform) ? "⌘K" : "Ctrl K";
}
