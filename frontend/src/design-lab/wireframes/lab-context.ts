/**
 * The wireframe lab's shared state. Development only (Phase 3 of the redesign).
 *
 * Reads go to the real seeded API; every write is simulated here and never
 * sent. A scenario forces one failure path so each journey can be walked
 * through its failures on demand (docs/ux/interaction/model.md §6–7).
 */
import { createContext, useContext } from "react";

export type Scenario =
  | "none"
  | "job-failed"
  | "held"
  | "conflict"
  | "rate-limit"
  | "rp-unreachable"
  | "offline"
  | "stale-link"
  | "due-items";

export const SCENARIOS: { id: Scenario; label: string; what: string }[] = [
  { id: "none", label: "Happy path", what: "Every simulated action succeeds." },
  { id: "job-failed", label: "A job fails", what: "Reading, indexing and building end in Needs attention." },
  { id: "held", label: "Held by the malware scan", what: "An uploaded file is held and never read." },
  { id: "conflict", label: "Someone else changed it (409)", what: "The next save or decision meets a conflict." },
  { id: "rate-limit", label: "Too many checks (429)", what: "Check and compare are refused for 30 s." },
  { id: "rp-unreachable", label: "Requirement AI unreachable", what: "Cited-by counts and mapping impact are unknown." },
  { id: "offline", label: "Service unreachable", what: "The shell shows the offline banner; actions wait." },
  { id: "stale-link", label: "Stale Explorer link", what: "The Explorer is opened with an offering that doesn't exist." },
  { id: "due-items", label: "Re-confirmations due (simulated)", what: "Adds clearly marked simulated due items, because the seed has none." },
];

export type JobState = "waiting" | "working" | "done" | "attention" | "stopped" | "held";

export type LabJob = {
  id: string;
  kind: string;
  subject: string;
  to?: string;
  state: JobState;
  startedAt: number;
  endedAt?: number;
  cause?: string;
  fix?: string;
  attempts: number;
};

export type Density = "automatic" | "comfortable" | "compact";

/** Phase 4: direction A (chosen at GATE 4) over the wireframes; "none" is the greyscale wireframe. B and C are archived in docs/redesign/02-directions.md. */
export type Direction = "none" | "a";
export type Theme = "light" | "dark";
export const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: "none", label: "Wireframe (greyscale)" },
  { id: "a", label: "A · Timetable, evolved" },
];

/** A simulated write, kept so screens can show its outcome. */
export type Write = { key: string; value: unknown; at: number };

export class SimulatedFailure extends Error {
  constructor(
    readonly kind: "conflict" | "rate-limit" | "offline" | "rp-unreachable",
    message: string,
  ) {
    super(message);
  }
}

export type Lab = {
  /** Where this lab is mounted: the wireframes or the hi-fi prototype (Phase 6). */
  base: string;
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
  jobs: LabJob[];
  startJob: (job: Pick<LabJob, "kind" | "subject" | "to">, ms?: number) => string;
  retryJob: (id: string) => void;
  cancelJob: (id: string) => void;
  writes: Record<string, Write>;
  /** Runs a simulated write: resolves after a short delay or fails per the scenario. Never calls the API. */
  simulate: (key: string, value: unknown, ms?: number) => Promise<void>;
  forget: (key: string) => void;
  density: Density;
  setDensity: (density: Density) => void;
  shortcuts: boolean;
  setShortcuts: (on: boolean) => void;
  direction: Direction;
  setDirection: (direction: Direction) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** One polite message for the shell's status line. */
  announce: (message: string) => void;
  announcement: string;
};

export const LabContext = createContext<Lab | null>(null);

export function useLab(): Lab {
  const lab = useContext(LabContext);
  if (!lab) throw new Error("useLab outside the wireframe lab");
  return lab;
}

/** The value a simulated write left behind, if any. */
export function useWrite<T>(key: string): T | undefined {
  return useLab().writes[key]?.value as T | undefined;
}

export const BASE_PATH = "/design-lab/wireframes";

export function wf(path = ""): string {
  return `${BASE_PATH}${path}`;
}

export const JOB_WORDS: Record<JobState, string> = {
  waiting: "Waiting",
  working: "Working",
  done: "Done",
  attention: "Needs attention",
  stopped: "Stopped",
  held: "Held",
};

export function elapsed(from: number, to = Date.now()): string {
  const s = Math.max(0, Math.round((to - from) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
