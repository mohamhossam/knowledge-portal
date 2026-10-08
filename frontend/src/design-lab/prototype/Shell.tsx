import { useQuery } from "@tanstack/react-query";
import { CircleHelp, ListChecks, UserRound, WifiOff } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { api } from "../../api/client";
import { useAuth } from "../../auth/authContext";
import { REQUIREMENT_APP_URL } from "../../auth/paths";
import {
  AppShell,
  Checkbox,
  Drawer,
  HelpContent,
  type Job,
  JobTray,
  LiveMessage,
  MastheadButton,
  type NavItem,
  RadioGroup,
  ShortcutHelp,
} from "../../design/components";
import { useDisclosure, useFocusAfterRender } from "../../design/hooks";
import { newestVersion } from "../../library/model";
import { helpFor } from "../wireframes/help";
import { useGlobalShortcuts } from "../wireframes/hooks";
import { type Density, type LabJob, SCENARIOS, type Scenario, type Theme, useLab } from "../wireframes/lab-context";
import { useWorkQueue } from "../wireframes/queue";
import { elapsed, PROTO_BASE, proto } from "./paths";
import { ButtonLink, RouterLink } from "./ui";

type Panel = "jobs" | "help" | "account";

/**
 * The hi-fi shell: the design system's AppShell with the same three
 * utilities on every page (WCAG 3.2.6), the five-area rail with the shared
 * "need you" count, and Jobs, Help and Account as side panels beside the page.
 */
export function ProtoShell({ children }: { children: ReactNode }) {
  const lab = useLab();
  const auth = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const needsYou = useWorkQueue().mine;
  // One side panel at a time (Jobs, Help or Account), one disclosure for its focus.
  const [which, setWhich] = useState<Panel>("help");
  const side = useDisclosure(() => document.getElementById(`proto-${which}`));
  const focusLater = useFocusAfterRender();
  const { open: sideOpen, show: sideShow, panel: sidePanelRef } = side;
  const show = useCallback((next: Panel, event?: { currentTarget: EventTarget | null }) => {
    setWhich(next);
    if (sideOpen) focusLater(() => sidePanelRef.current?.querySelector<HTMLElement>("h2"));
    else sideShow(event);
  }, [sideOpen, sideShow, sidePanelRef, focusLater]);
  const handlers = useMemo(() => ({ help: () => show("help"), jobs: () => show("jobs") }), [show]);
  useGlobalShortcuts(handlers);

  // "?help=shortcuts" opens Help at its shortcuts section (the keys line under every grid links there).
  const helpParam = params.get("help");
  const open = (panel: Panel) => (side.open && which === panel) || (panel === "help" && helpParam !== null && !(side.open && which !== "help"));
  const close = () => {
    if (helpParam !== null) {
      params.delete("help");
      setParams(params, { replace: true });
    }
    side.close();
  };
  const toggle = (panel: Panel) => (event: { currentTarget: EventTarget | null }) => (open(panel) ? close() : show(panel, event));

  const derived = useDerivedJobs();
  const allJobs = [...lab.jobs, ...derived];
  const busy = allJobs.filter((job) => job.state === "working" || job.state === "attention" || job.state === "held").length;
  const path = location.pathname.slice(PROTO_BASE.length) || "/";
  const reader = path.startsWith("/explorer") && params.get("as") === "reader";
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

  const navigation: NavItem[] = [
    { href: proto(), label: "Your work", current: path === "/", count: needsYou, countLabel: "need you" },
    { href: proto("/library"), label: "Library", current: under("/library") },
    { href: proto("/architecture"), label: "Catalogue", current: under("/architecture") },
    { href: proto("/ownership"), label: "Ownership", current: under("/ownership") },
    { href: proto("/requirement-knowledge"), label: "Requirements", current: under("/requirement-knowledge") },
  ];
  const secondary: NavItem[] = [
    { href: proto("/explorer"), label: "Explorer", current: under("/explorer") },
    { href: proto("/lab"), label: "Prototype index", current: path === "/lab" },
  ];

  const name = reader ? "Omar Observer" : auth?.actor?.display_name ?? "Account";
  const density = lab.density === "automatic" ? "comfortable" : lab.density;
  const sidePanel = open("jobs") ? (
    <Drawer title="Jobs" onClose={close} panelRef={side.panel}>
      <p className="proto-quiet">Running, needing attention, and finished in the last 30 minutes.</p>
      <JobTray jobs={allJobs.map((job) => toTrayJob(job, lab))} link={RouterLink} />
    </Drawer>
  ) : open("help") ? (
    <HelpPanel path={path} section={helpParam} onClose={close} panelRef={side.panel} />
  ) : open("account") ? (
    <AccountPanel name={name} onClose={close} panelRef={side.panel} />
  ) : null;

  return (
    <div className="proto" data-theme={lab.theme} data-density={density}>
      <LabBar />
      <AppShell
        homeHref={proto()}
        link={RouterLink}
        outbound={{ href: REQUIREMENT_APP_URL, label: "Requirement AI" }}
        reader={reader}
        locationKey={location.pathname}
        navigation={navigation}
        secondaryNavigation={secondary}
        banner={lab.scenario === "offline" ? <><WifiOff size={16} aria-hidden="true" /> The portal can't reach its service. Your unsaved work stays here. Trying again…</> : undefined}
        utilities={
          <>
            {!reader && (
              <MastheadButton id="proto-jobs" icon={<ListChecks size={16} />} label="Jobs" count={busy} countLabel="active or needing attention" expanded={open("jobs")} onClick={toggle("jobs")} />
            )}
            <MastheadButton id="proto-help" icon={<CircleHelp size={16} />} label="Help" expanded={open("help")} onClick={toggle("help")} />
            <MastheadButton id="proto-account" icon={<UserRound size={16} />} label={name} expanded={open("account")} onClick={toggle("account")} />
          </>
        }
        panel={sidePanel}
      >
        {children}
      </AppShell>
      <LiveMessage message={lab.announcement} />
    </div>
  );
}

function toTrayJob(job: LabJob, lab: ReturnType<typeof useLab>): Job {
  const session = job.id.startsWith("job-");
  return {
    id: job.id,
    kind: job.kind,
    subject: job.subject,
    state: job.state,
    subjectHref: job.to,
    cause: job.cause,
    timing: job.state === "working" ? `${elapsed(job.startedAt)} so far${job.attempts > 1 ? ` · attempt ${job.attempts}` : ""}` : job.endedAt ? `Ended after ${elapsed(job.startedAt, job.endedAt)}` : undefined,
    fix: job.fix && job.fix !== "Try again" && job.to ? <ButtonLink to={job.to}>{job.fix}</ButtonLink> : undefined,
    onRetry: job.state === "attention" && session ? () => lab.retryJob(job.id) : undefined,
    onCancel: job.state === "working" && session ? () => lab.cancelJob(job.id) : undefined,
  };
}

/** Lab-only controls, outside the design and labelled as such. */
function LabBar() {
  const lab = useLab();
  const location = useLocation();
  const current = SCENARIOS.find((item) => item.id === lab.scenario);
  const wireframe = `/design-lab/wireframes${location.pathname.slice(PROTO_BASE.length)}${location.search}`;
  return (
    <div className="proto-labbar" role="region" aria-label="Prototype lab controls (not part of the design)">
      <label>
        Scenario{" "}
        <select value={lab.scenario} onChange={(event) => lab.setScenario(event.target.value as Scenario)}>
          {SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
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
      <RouterLink href={wireframe}>Same page as a wireframe</RouterLink>
    </div>
  );
}

/** BG1: no job list endpoint, so jobs are derived from the documents plus this session's. */
function useDerivedJobs(): LabJob[] {
  const documents = useQuery({ queryKey: ["wf", "documents"], queryFn: api.libraryDocuments });
  return (documents.data ?? []).flatMap((doc): LabJob[] => {
    const version = newestVersion(doc);
    if (!version) return [];
    const base = { kind: "Reading", subject: doc.title, to: proto(`/library/${doc.id}`), attempts: version.attempt ?? 1, startedAt: Date.parse(version.uploaded_at) };
    if (version.stage === "failed") return [{ ...base, id: `doc-${doc.id}`, state: "attention", cause: version.error ?? "The file couldn't be read.", fix: "Upload a new version" }];
    if (version.stage === "quarantined") return [{ ...base, id: `doc-${doc.id}`, state: "held", cause: "The malware scan flagged the file.", fix: "Upload a clean copy" }];
    if (["queued", "scanning", "extracting"].includes(version.stage)) return [{ ...base, id: `doc-${doc.id}`, state: "working" }];
    return [];
  });
}

function HelpPanel({ path, section, onClose, panelRef }: { path: string; section: string | null; onClose: () => void; panelRef: ReturnType<typeof useDisclosure>["panel"] }) {
  const lab = useLab();
  const { entry, global } = helpFor(path);
  return (
    <Drawer title="Help" onClose={onClose} panelRef={panelRef}>
      <HelpContent
        page={{ title: entry.title, body: entry.body.map((line) => <p key={line}>{line}</p>) }}
        shortcuts={
          <div data-open={section === "shortcuts" || undefined}>
            <ShortcutHelp
              widget={entry.keys.length ? [{ title: "On this page", shortcuts: entry.keys.map(([keys, does]) => ({ keys, does })) }] : []}
              global={global.map(([keys, does]) => ({ keys, does }))}
              enabled={lab.shortcuts}
              onToggle={lab.setShortcuts}
            />
          </div>
        }
        terms={entry.terms.map(([term, meaning]) => ({ term, meaning }))}
        contact={<p className="proto-quiet">Contact to be configured (placeholder until the team supplies one).</p>}
      />
    </Drawer>
  );
}

function AccountPanel({ name, onClose, panelRef }: { name: string; onClose: () => void; panelRef: ReturnType<typeof useDisclosure>["panel"] }) {
  const lab = useLab();
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <Drawer title="Account" onClose={onClose} panelRef={panelRef}>
      <p>Signed in as <strong><bdi>{name}</bdi></strong> (Knowledge admin).</p>
      <RadioGroup<Density>
        legend="Density"
        name="proto-density"
        value={lab.density}
        options={[
          { value: "automatic", label: "Automatic", hint: "Compact on review desks, comfortable elsewhere" },
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" },
        ]}
        onChange={(value) => {
          lab.setDensity(value);
          setSaved(`Density: ${value}. Saved.`);
        }}
      />
      <Checkbox
        label="Page-wide keyboard shortcuts (g, ?, /)"
        hint="Off by default. Keys inside a review grid always work."
        checked={lab.shortcuts}
        onChange={(event) => {
          lab.setShortcuts(event.target.checked);
          setSaved(`Keyboard shortcuts ${event.target.checked ? "on" : "off"}. Saved.`);
        }}
      />
      <p className="proto-outcome" role="status">{saved}</p>
    </Drawer>
  );
}
