import { useQuery } from "@tanstack/react-query";
import { CircleHelp, ExternalLink, ListChecks, UserRound, WifiOff, X } from "lucide-react";
import { type ReactNode, type RefObject, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router-dom";

import { api } from "../../api/client";
import { useAuth } from "../../auth/authContext";
import { REQUIREMENT_APP_URL } from "../../auth/paths";
import { newestVersion } from "../../library/model";
import { helpFor } from "./help";
import { useDisclosure, useGlobalShortcuts, useRouteFocus, useStickySize } from "./hooks";
import { BASE_PATH, DIRECTIONS, type Direction, elapsed, type LabJob, SCENARIOS, type Scenario, type Theme, useLab, wf } from "./lab-context";
import { useWorkQueue } from "./queue";
import { Status } from "./ui";

const AREAS = [
  { to: "", label: "Your work", end: true },
  { to: "/library", label: "Library" },
  { to: "/architecture", label: "Catalogue" },
  { to: "/ownership", label: "Ownership" },
  { to: "/requirement-knowledge", label: "Requirements" },
];

/** The wireframe shell (IA §2): skip links, top bar utilities, the five-area rail. */
export function WfShell({ children }: { children: ReactNode }) {
  const lab = useLab();
  const auth = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const needsYou = useWorkQueue().mine;
  const top = useRef<HTMLDivElement>(null);
  useStickySize(top, "--wf-sticky-top");
  useRouteFocus();

  const help = useDisclosure(() => document.getElementById("wf-help-button"));
  const jobs = useDisclosure(() => document.getElementById("wf-jobs-button"));
  const account = useDisclosure(() => document.getElementById("wf-account-button"));
  const handlers = useMemo(() => ({ help: () => help.show(), jobs: () => jobs.show() }), [help, jobs]);
  useGlobalShortcuts(handlers);

  // A link like "?help=shortcuts" opens Help at its shortcuts section.
  const helpParam = params.get("help");
  const helpOpen = help.open || helpParam !== null;
  const closeHelp = () => {
    if (helpParam !== null) {
      params.delete("help");
      setParams(params, { replace: true });
    }
    help.close();
  };

  const derived = useDerivedJobs();
  const allJobs = [...lab.jobs, ...derived];
  const busy = allJobs.filter((job) => job.state === "working" || job.state === "attention" || job.state === "held").length;
  const path = location.pathname.slice(BASE_PATH.length) || "/";
  const reader = path.startsWith("/explorer") && params.get("as") === "reader";

  return (
    <div className={`wf density-${lab.density}`} data-direction={lab.direction} data-theme={lab.theme}>
      <a className="wf-skip" href="#wf-main">Skip to content</a>
      {!reader && <a className="wf-skip" href="#wf-rail">Skip to navigation</a>}

      <LabBar />

      <div className="wf-top" ref={top}>
        <div className="wf-brand">
          <span className="wf-logo" aria-label="e& logo placeholder" role="img">e&</span>
          <Link to={wf()} className="wf-product">Knowledge portal</Link>
          <a className="wf-out" href={REQUIREMENT_APP_URL}>Requirement AI <ExternalLink size={12} aria-hidden="true" /><span className="visually-hidden"> (opens Requirement AI)</span></a>
        </div>
        <div className="wf-utilities">
          {!reader && (
            <button id="wf-jobs-button" type="button" className="wf-utility" aria-expanded={jobs.open} onClick={(event) => (jobs.open ? jobs.close() : jobs.show(event))}>
              <ListChecks size={16} aria-hidden="true" /> Jobs
              {busy > 0 && <span className="wf-badge"><span className="visually-hidden">, </span>{busy}<span className="visually-hidden"> active or needing attention</span></span>}
            </button>
          )}
          <button id="wf-help-button" type="button" className="wf-utility" aria-expanded={helpOpen} onClick={(event) => (helpOpen ? closeHelp() : help.show(event))}>
            <CircleHelp size={16} aria-hidden="true" /> Help
          </button>
          <button id="wf-account-button" type="button" className="wf-utility" aria-expanded={account.open} onClick={(event) => (account.open ? account.close() : account.show(event))}>
            <UserRound size={16} aria-hidden="true" /> {reader ? "Omar Observer" : auth?.actor?.display_name ?? "Account"}
          </button>
        </div>
      </div>

      {lab.scenario === "offline" && (
        <p className="wf-banner" role="status">
          <WifiOff size={16} aria-hidden="true" /> The portal can't reach its service. Your unsaved work stays here. Trying again…
        </p>
      )}

      <div className={reader ? "wf-body wf-body--reader" : "wf-body"}>
        {!reader && (
          <nav id="wf-rail" className="wf-rail" aria-label="Areas" tabIndex={-1}>
            <ul>
              {AREAS.map((area) => (
                <li key={area.label}>
                  <NavLink to={wf(area.to)} end={area.end} className="wf-rail__link">
                    <span>{area.label}</span>
                    {area.label === "Your work" && needsYou > 0 && (
                      <span className="wf-count">
                        <span className="visually-hidden">, </span>
                        {needsYou}
                        <span className="visually-hidden"> need you</span>
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
            <ul className="wf-rail__more">
              <li><NavLink to={wf("/explorer")} className="wf-rail__link">Explorer</NavLink></li>
              <li><NavLink to={wf("/lab")} className="wf-rail__link wf-rail__lab">Lab index</NavLink></li>
            </ul>
          </nav>
        )}
        <main id="wf-main" className="wf-main" tabIndex={-1}>
          {children}
        </main>
        {jobs.open && <JobsPanel jobs={allJobs} onClose={jobs.close} panelRef={jobs.panel} />}
        {helpOpen && <HelpPanel path={path} section={helpParam} onClose={closeHelp} panelRef={help.panel} />}
        {account.open && <AccountPanel onClose={account.close} panelRef={account.panel} />}
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">{lab.announcement}</p>
    </div>
  );
}

/** Lab-only controls: clearly outside the design. */
function LabBar() {
  const lab = useLab();
  const current = SCENARIOS.find((item) => item.id === lab.scenario);
  return (
    <div className="wf-labbar" role="region" aria-label="Wireframe lab controls (not part of the design)">
      <label>
        Scenario{" "}
        <select value={lab.scenario} onChange={(event) => lab.setScenario(event.target.value as Scenario)}>
          {SCENARIOS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label>
        Direction{" "}
        <select value={lab.direction} onChange={(event) => lab.setDirection(event.target.value as Direction)}>
          {DIRECTIONS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label>
        Theme{" "}
        <select value={lab.theme} onChange={(event) => lab.setTheme(event.target.value as Theme)}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <span>{current?.what} Reads use the seeded data; every action is simulated and nothing is saved.</span>
    </div>
  );
}

/** BG1: no job list endpoint, so jobs are derived from the objects plus this session's. */
function useDerivedJobs(): LabJob[] {
  const documents = useQuery({ queryKey: ["wf", "documents"], queryFn: api.libraryDocuments });
  return (documents.data ?? []).flatMap((doc): LabJob[] => {
    const version = newestVersion(doc);
    if (!version) return [];
    const base = { kind: "Reading", subject: doc.title, to: wf(`/library/${doc.id}`), attempts: version.attempt ?? 1, startedAt: Date.parse(version.uploaded_at) };
    if (version.stage === "failed") return [{ ...base, id: `doc-${doc.id}`, state: "attention" as const, cause: version.error ?? "The file couldn't be read.", fix: "Upload a new version" }];
    if (version.stage === "quarantined") return [{ ...base, id: `doc-${doc.id}`, state: "held" as const, cause: "The malware scan flagged the file.", fix: "Upload a clean copy" }];
    if (["queued", "scanning", "extracting"].includes(version.stage)) return [{ ...base, id: `doc-${doc.id}`, state: "working" as const }];
    return [];
  });
}

function Drawer({ title, onClose, panelRef, children }: { title: string; onClose: () => void; panelRef: RefObject<HTMLElement | null>; children: ReactNode }) {
  return (
    <aside
      className="wf-drawer"
      aria-labelledby="wf-drawer-title"
      ref={panelRef as RefObject<HTMLElement>}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="wf-drawer__head">
        <h2 id="wf-drawer-title" tabIndex={-1}>{title}</h2>
        <button type="button" className="wf-icon-button" onClick={onClose} aria-label={`Close ${title}`}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {children}
    </aside>
  );
}

function JobsPanel({ jobs, onClose, panelRef }: { jobs: LabJob[]; onClose: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const lab = useLab();
  const order = { attention: 0, held: 1, working: 2, waiting: 3, stopped: 4, done: 5 };
  const sorted = [...jobs].sort((a, b) => order[a.state] - order[b.state]);
  return (
    <Drawer title="Jobs" onClose={onClose} panelRef={panelRef}>
      <p className="wf-hint">Running, needing attention, and finished in the last 30 minutes.</p>
      {sorted.length === 0 ? (
        <p>No jobs are running. Reading, indexing and building appear here while they run.</p>
      ) : (
        <ul className="wf-jobs">
          {sorted.map((job) => (
            <li key={job.id} className="wf-job">
              <Status state={job.state} />
              <p className="wf-job__what">
                {job.kind}: {job.to ? <Link to={job.to}><bdi>{job.subject}</bdi></Link> : <bdi>{job.subject}</bdi>}
              </p>
              <p className="wf-hint">
                {job.state === "working" ? `${elapsed(job.startedAt)} so far` : job.endedAt ? `Ended after ${elapsed(job.startedAt, job.endedAt)}` : ""}
                {job.attempts > 1 ? ` · attempt ${job.attempts}` : ""}
              </p>
              {job.cause && <p>{job.cause}</p>}
              <div className="wf-actions">
                {job.state === "attention" && job.id.startsWith("job-") && (
                  <button type="button" className="wf-button" onClick={() => lab.retryJob(job.id)}>Try again</button>
                )}
                {job.fix && job.fix !== "Try again" && job.to && <Link className="wf-button" to={job.to}>{job.fix}</Link>}
                {job.state === "working" && job.id.startsWith("job-") && (
                  <button type="button" className="wf-button" onClick={() => lab.cancelJob(job.id)}>Stop</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function HelpPanel({ path, section, onClose, panelRef }: { path: string; section: string | null; onClose: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const lab = useLab();
  const { entry, global } = helpFor(path);
  return (
    <Drawer title="Help" onClose={onClose} panelRef={panelRef}>
      <section aria-labelledby="wf-help-page">
        <h3 id="wf-help-page">{entry.title}</h3>
        {entry.body.map((line) => <p key={line}>{line}</p>)}
      </section>
      <section aria-labelledby="wf-help-keys" data-open={section === "shortcuts" || undefined}>
        <h3 id="wf-help-keys">Keyboard shortcuts</h3>
        {entry.keys.length > 0 && (
          <dl className="wf-keylist">
            {entry.keys.map(([key, what]) => (<div key={key}><dt><kbd>{key}</kbd></dt><dd>{what}</dd></div>))}
          </dl>
        )}
        <p className="wf-hint">Page-wide shortcuts are {lab.shortcuts ? "on" : "off"}.{" "}
          <button type="button" className="wf-link-button" onClick={() => lab.setShortcuts(!lab.shortcuts)}>
            Turn them {lab.shortcuts ? "off" : "on"}
          </button>
        </p>
        <dl className="wf-keylist">
          {global.map(([key, what]) => (<div key={key}><dt><kbd>{key}</kbd></dt><dd>{what}</dd></div>))}
        </dl>
      </section>
      <section aria-labelledby="wf-help-terms">
        <h3 id="wf-help-terms">Terms on this page</h3>
        <dl>
          {entry.terms.map(([term, meaning]) => (<div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>))}
        </dl>
      </section>
      <section aria-labelledby="wf-help-contact">
        <h3 id="wf-help-contact">Ask the knowledge team</h3>
        <p className="wf-hint">Contact to be configured (placeholder until the team supplies one).</p>
      </section>
    </Drawer>
  );
}

function AccountPanel({ onClose, panelRef }: { onClose: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const lab = useLab();
  const auth = useAuth();
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <Drawer title="Account" onClose={onClose} panelRef={panelRef}>
      <p>Signed in as <strong>{auth?.actor?.display_name ?? "—"}</strong> (Knowledge admin).</p>
      <fieldset className="wf-fieldset">
        <legend>Density</legend>
        {(["automatic", "comfortable", "compact"] as const).map((value) => (
          <label key={value} className="wf-choice">
            <input
              type="radio"
              name="wf-density"
              checked={lab.density === value}
              onChange={() => {
                lab.setDensity(value);
                setSaved(`Density: ${value}. Saved.`);
              }}
            />{" "}
            {value === "automatic" ? "Automatic (compact on review desks)" : value[0]!.toUpperCase() + value.slice(1)}
          </label>
        ))}
      </fieldset>
      <label className="wf-choice">
        <input type="checkbox" checked={lab.shortcuts} onChange={(event) => { lab.setShortcuts(event.target.checked); setSaved(`Keyboard shortcuts ${event.target.checked ? "on" : "off"}. Saved.`); }} />{" "}
        Page-wide keyboard shortcuts (g, ?, /)
      </label>
      <p className="wf-outcome" role="status">{saved}</p>
    </Drawer>
  );
}
