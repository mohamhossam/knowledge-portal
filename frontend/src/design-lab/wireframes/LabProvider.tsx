import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type Density,
  type Lab,
  LabContext,
  type LabJob,
  type Scenario,
  SimulatedFailure,
  type Write,
} from "./lab-context";

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked; the setting then lasts for this page only.
  }
}

const FAILURE_COPY = {
  conflict: "Someone changed this while you were working.",
  "rate-limit": "Too many checks in a minute. You can try again in 30 s.",
  offline: "The portal can't reach its service. Your unsaved work stays here.",
  "rp-unreachable": "Couldn't ask Requirement AI. The count is unknown, not zero.",
} as const;

/** Holds the lab's scenario, simulated writes and jobs. Nothing here calls the API. */
export function LabProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenarioState] = useState<Scenario>(() => stored("wf.scenario", "none"));
  const [jobs, setJobs] = useState<LabJob[]>([]);
  const [writes, setWrites] = useState<Record<string, Write>>({});
  const [density, setDensityState] = useState<Density>(() => stored("wf.density", "automatic"));
  const [shortcuts, setShortcutsState] = useState(() => stored<string>("wf.shortcuts", "off") === "on");
  const [announcement, setAnnouncement] = useState("");
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // A conflict happens once, then the reloaded state saves cleanly.
  const conflictSpent = useRef(false);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = useCallback((ms: number, run: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      run();
    }, ms);
    timers.current.add(id);
  }, []);

  const setScenario = useCallback((next: Scenario) => {
    conflictSpent.current = false;
    store("wf.scenario", next);
    setScenarioState(next);
  }, []);

  const announce = useCallback((message: string) => {
    // Clear first so a repeated message is announced again.
    setAnnouncement("");
    later(30, () => setAnnouncement(message));
  }, [later]);

  const finish = useCallback((id: string) => {
    setJobs((all) =>
      all.map((job) => {
        if (job.id !== id || job.state !== "working") return job;
        if (scenario === "job-failed") {
          return { ...job, state: "attention", endedAt: Date.now(), cause: "The service timed out while working.", fix: "Try again" };
        }
        return { ...job, state: "done", endedAt: Date.now() };
      }),
    );
  }, [scenario]);

  const startJob = useCallback<Lab["startJob"]>((input, ms = 4000) => {
    const id = `job-${Math.random().toString(36).slice(2, 9)}`;
    const held = scenario === "held" && input.kind === "Reading";
    setJobs((all) => [
      {
        ...input,
        id,
        attempts: 1,
        startedAt: Date.now(),
        state: held ? "held" : "working",
        ...(held ? { endedAt: Date.now(), cause: "The malware scan flagged the file. It won't be read.", fix: "Upload a clean copy" } : {}),
      },
      ...all,
    ]);
    if (!held) later(ms, () => finish(id));
    return id;
  }, [scenario, later, finish]);

  const retryJob = useCallback((id: string) => {
    setJobs((all) => all.map((job) => (job.id === id ? { ...job, state: "working", attempts: job.attempts + 1, startedAt: Date.now(), endedAt: undefined, cause: undefined } : job)));
    later(3000, () =>
      setJobs((all) => all.map((job) => (job.id === id && job.state === "working" ? { ...job, state: "done", endedAt: Date.now() } : job))),
    );
  }, [later]);

  const cancelJob = useCallback((id: string) => {
    setJobs((all) => all.map((job) => (job.id === id ? { ...job, state: "stopped", endedAt: Date.now() } : job)));
  }, []);

  const simulate = useCallback<Lab["simulate"]>((key, value, ms = 350) => {
    return new Promise<void>((resolve, reject) => {
      later(ms, () => {
        if (scenario === "offline") return reject(new SimulatedFailure("offline", FAILURE_COPY.offline));
        if (scenario === "conflict" && !conflictSpent.current) {
          conflictSpent.current = true;
          return reject(new SimulatedFailure("conflict", FAILURE_COPY.conflict));
        }
        if (scenario === "rate-limit" && key.startsWith("check:")) {
          return reject(new SimulatedFailure("rate-limit", FAILURE_COPY["rate-limit"]));
        }
        setWrites((all) => ({ ...all, [key]: { key, value, at: Date.now() } }));
        resolve();
      });
    });
  }, [scenario, later]);

  const forget = useCallback((key: string) => {
    setWrites((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
  }, []);

  const setDensity = useCallback((next: Density) => {
    store("wf.density", next);
    setDensityState(next);
  }, []);

  const setShortcuts = useCallback((on: boolean) => {
    store("wf.shortcuts", on ? "on" : "off");
    setShortcutsState(on);
  }, []);

  const value = useMemo<Lab>(
    () => ({ scenario, setScenario, jobs, startJob, retryJob, cancelJob, writes, simulate, forget, density, setDensity, shortcuts, setShortcuts, announce, announcement }),
    [scenario, setScenario, jobs, startJob, retryJob, cancelJob, writes, simulate, forget, density, setDensity, shortcuts, setShortcuts, announce, announcement],
  );

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}
