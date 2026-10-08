import { CircleHelp, ListChecks, UserRound, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/authContext";
import { REQUIREMENT_APP_URL } from "../auth/paths";
import { AppShell, MastheadButton, type NavItem } from "../design/components";
import { useDisclosure, useFocusAfterRender } from "../design/hooks";
import { RouterLink } from "../shell/links";
import { AccountPanel, HelpPanel, JobsPanel } from "../shell/panels";
import { densityFor, usePreferences } from "../shell/preferences";
import { useGlobalShortcuts } from "../shell/useGlobalShortcuts";
import { activeJobs, useJobs } from "../shell/useJobs";
import { useWorkQueue } from "../work/queue";

type Panel = "jobs" | "help" | "account";

/**
 * Routes rebuilt on the design system (redesign Phase 8). Any other route
 * renders in the legacy island, looking as it did, until its area is built.
 */
const REDESIGNED: ((path: string) => boolean)[] = [(path) => path === "/"];

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * The portal's frame (IA §2): skip links, the maroon masthead with the same
 * three utilities on every page (Jobs, Help, Account; WCAG 3.2.6), the
 * five-area rail with the shared "need you" count, and Jobs, Help and Account
 * as side panels beside the page. "?help" in the address opens Help.
 */
export function Shell() {
  const auth = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { density } = usePreferences();
  const online = useOnline();
  const needsYou = useWorkQueue().mine;
  const jobs = useJobs();
  const openShortcuts = useCallback(() => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("help", "shortcuts");
      return next;
    }, { replace: true });
  }, [setParams]);

  // One side panel at a time, one disclosure for its focus in and back.
  const [which, setWhich] = useState<Panel>("help");
  const side = useDisclosure(() => document.getElementById(`shell-${which}`));
  const focusLater = useFocusAfterRender();
  const { open: sideOpen, show: sideShow, panel: sidePanel } = side;
  const show = useCallback((next: Panel, event?: { currentTarget: EventTarget | null }) => {
    setWhich(next);
    // Re-show even when a panel is open, so focus goes back to the button pressed last.
    sideShow(event);
    if (sideOpen) focusLater(() => sidePanel.current?.querySelector<HTMLElement>("h2"));
  }, [sideOpen, sideShow, sidePanel, focusLater]);
  // "?" opens Help at its shortcuts (§2.2); "g j" opens Jobs.
  const handlers = useMemo(() => ({ help: openShortcuts, jobs: () => show("jobs") }), [show, openShortcuts]);
  useGlobalShortcuts(handlers);

  const helpParam = params.get("help");
  const isOpen = (panel: Panel) => (side.open && which === panel) || (panel === "help" && helpParam !== null && !(side.open && which !== "help"));
  const close = () => {
    if (helpParam !== null) {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete("help");
        return next;
      }, { replace: true });
    }
    side.close();
  };
  const toggle = (panel: Panel) => (event: { currentTarget: EventTarget | null }) => (isOpen(panel) ? close() : show(panel, event));

  const path = location.pathname;
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  const navigation: NavItem[] = [
    { href: "/", label: "Your work", current: path === "/", count: needsYou, countLabel: "need you" },
    { href: "/library", label: "Library", current: under("/library") },
    { href: "/architecture", label: "Catalogue", current: under("/architecture") },
    { href: "/squads", label: "Ownership", current: under("/squads") },
    { href: "/requirement-knowledge", label: "Requirements", current: under("/requirement-knowledge") },
  ];
  const secondary: NavItem[] = [
    { href: "/explorer", label: "Explorer", current: under("/explorer") },
    { href: "/reminders", label: "Re-confirmations", current: under("/reminders") },
  ];

  const actor = auth?.actor ?? null;
  const panel = isOpen("jobs") ? (
    <JobsPanel jobs={jobs.jobs} state={jobs.state} onRetry={jobs.retry} onClose={close} panelRef={sidePanel} />
  ) : isOpen("help") ? (
    <HelpPanel path={path} section={helpParam} onClose={close} panelRef={sidePanel} />
  ) : isOpen("account") && actor ? (
    <AccountPanel actor={actor} onClose={close} panelRef={sidePanel} />
  ) : null;

  const redesigned = REDESIGNED.some((match) => match(path));
  const busy = activeJobs(jobs.jobs);

  return (
    // A page not rebuilt yet has no dark mode: its whole view stays light, so one view is one theme.
    <div data-density={densityFor(density, "page")} data-theme={redesigned ? undefined : "light"}>
      <AppShell
        homeHref="/"
        link={RouterLink}
        outbound={{ href: REQUIREMENT_APP_URL, label: "Requirement AI" }}
        locationKey={location.pathname}
        navigation={navigation}
        secondaryNavigation={secondary}
        banner={online ? undefined : <><WifiOff size={16} aria-hidden="true" /> You're offline. Your unsaved work stays here; the portal carries on when your connection returns.</>}
        utilities={
          <>
            <MastheadButton id="shell-jobs" icon={<ListChecks size={16} />} label="Jobs" count={busy} countLabel="active or needing attention" expanded={isOpen("jobs")} onClick={toggle("jobs")} />
            <MastheadButton id="shell-help" icon={<CircleHelp size={16} />} label="Help" expanded={isOpen("help")} onClick={toggle("help")} />
            <MastheadButton id="shell-account" icon={<UserRound size={16} />} label={actor?.display_name ?? "Account"} hiddenPrefix={actor ? "Account:" : undefined} expanded={isOpen("account")} onClick={toggle("account")} />
          </>
        }
        panel={panel}
      >
        {redesigned ? (
          <Outlet />
        ) : (
          <div className="ds-legacy">
            <div className="page">
              <Outlet />
            </div>
          </div>
        )}
      </AppShell>
    </div>
  );
}
