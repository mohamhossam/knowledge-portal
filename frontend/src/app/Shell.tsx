import { BookOpen, CircleHelp, Compass, FileText, Inbox, Layers, ListChecks, UserRound, UsersRound, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/authContext";
import { REQUIREMENT_APP_URL } from "../auth/paths";
import { AppShell, LiveMessage, MastheadButton, type NavItem } from "../design/components";
import { useDisclosure, useFocusAfterRender } from "../design/hooks";
import { RouterLink } from "../shell/links";
import { SHORTCUTS_EVENT } from "../shell/shortcuts";
import { useGlobalSearch } from "../shell/GlobalSearch";
import { AccountPanel, HelpPanel, JobsPanel } from "../shell/panels";
import { densityFor, usePreferences } from "../shell/preferences";
import { useGlobalShortcuts } from "../shell/useGlobalShortcuts";
import { activeJobs, useJobs } from "../shell/useJobs";
import { useWorkQueue } from "../work/queue";

type Panel = "jobs" | "help" | "account";

/** Every area's address; the legacy one (Requirements) keeps its island. */
const AREAS = ["/library", "/architecture", "/explorer", "/squads", "/requirement-knowledge"];

/**
 * Routes rebuilt on the design system (redesign Phase 8). Any other route
 * renders in the legacy island, looking as it did, until its area is built.
 */
const REDESIGNED: ((path: string) => boolean)[] = [
  (path) => path === "/",
  // Area 2: the library, its search and every document's pages.
  (path) => path === "/library" || path.startsWith("/library/"),
  // Areas 3 and 5: the architecture catalogue, every version's pages and a draft's steps. Pages not
  // rebuilt yet (Landscape, Channels, Versions, Compare) keep their body in an island under the new head.
  (path) => path === "/architecture" || path.startsWith("/architecture/"),
  (path) => path === "/explorer",
  // Area 4: ownership (the systems grid, products, squads, people and history).
  (path) => path === "/squads" || path.startsWith("/squads/"),
  // An address outside every area: the rebuilt "Page not found" (UX rebuild, phase 1).
  (path) => path !== "/" && !AREAS.some((area) => path === area || path.startsWith(`${area}/`)),
];

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
 * The portal's frame (IA §2): skip links, the slim maroon brand bar with search
 * and the same three utilities on every page (Jobs, Help, Account; WCAG 3.2.6),
 * the sidebar (To do with the shared "need you" count, then the look-up areas),
 * and Jobs, Help and Account as side panels beside the page. "?help" in the
 * address opens Help.
 */
export function Shell() {
  const auth = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { density } = usePreferences();
  const online = useOnline();
  const needsYou = useWorkQueue().mine;
  const jobs = useJobs();
  const search = useGlobalSearch();
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
  // A grid's "All shortcuts" link opens Help at its keys in place: no navigation, and Esc or Close
  // hands focus back to the link, so the reviewer keeps their place (area 2 critique).
  useEffect(() => {
    const open = (event: Event) => {
      const opener = (event as CustomEvent<HTMLElement | null>).detail;
      openShortcuts();
      show("help", { currentTarget: opener });
    };
    window.addEventListener(SHORTCUTS_EVENT, open);
    return () => window.removeEventListener(SHORTCUTS_EVENT, open);
  }, [openShortcuts, show]);

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
  // To do first, with the one count; then the areas you look things up in (UX rebuild plan, phase 1).
  const navigation: NavItem[] = [
    { href: "/", label: "To do", current: path === "/", count: needsYou, countLabel: "need you", icon: <Inbox /> },
    { href: "/library", label: "Library", current: under("/library"), icon: <BookOpen />, group: "Look up" },
    { href: "/architecture", label: "Catalogue", current: under("/architecture"), icon: <Layers />, group: "Look up" },
    { href: "/squads", label: "Ownership", current: under("/squads"), icon: <UsersRound />, group: "Look up" },
    { href: "/requirement-knowledge", label: "Requirements", current: under("/requirement-knowledge"), icon: <FileText />, group: "Look up" },
  ];
  // Re-confirmations are To do's now (UX rebuild, phase 2): "/reminders" leads there.
  const secondary: NavItem[] = [
    { href: "/explorer", label: "Explorer", current: under("/explorer"), icon: <Compass /> },
  ];

  const actor = auth?.actor ?? null;
  const panel = isOpen("jobs") ? (
    <JobsPanel jobs={jobs.jobs} state={jobs.state} onRetry={jobs.retry} onAct={jobs.act} said={jobs.said} onClose={close} panelRef={sidePanel} />
  ) : isOpen("help") ? (
    <HelpPanel path={path} section={helpParam} onClose={close} panelRef={sidePanel} />
  ) : isOpen("account") && actor ? (
    <AccountPanel actor={actor} onClose={close} panelRef={sidePanel} />
  ) : null;

  const redesigned = REDESIGNED.some((match) => match(path));
  // Focus mode (UX rebuild, phase 2): one question at a time, without the sidebar.
  const focus = /\/focus\/?$/.test(path);
  const busy = activeJobs(jobs.jobs);

  return (
    // A page without a dark mode (not rebuilt yet, or the light-only catalogue redesign) keeps its whole view light, so one view is one theme.
    <div data-density={densityFor(density, "page")} data-theme={redesigned ? undefined : "light"}>
      <AppShell
        homeHref="/"
        product="Knowledge Portal"
        link={RouterLink}
        outbound={REQUIREMENT_APP_URL === null ? undefined : { href: REQUIREMENT_APP_URL, label: "Requirement AI" }}
        locationKey={location.pathname}
        navigation={navigation}
        secondaryNavigation={secondary}
        reader={focus}
        banner={online ? undefined : <><WifiOff size={16} aria-hidden="true" /> You're offline. Your unsaved work stays here; the portal carries on when your connection returns.</>}
        utilities={
          <>
            <MastheadButton id="shell-jobs" icon={<ListChecks size={16} />} label="Jobs" count={busy} countLabel="active or needing attention" expanded={isOpen("jobs")} onClick={toggle("jobs")} />
            <MastheadButton id="shell-help" icon={<CircleHelp size={16} />} label="Help" expanded={isOpen("help")} onClick={toggle("help")} />
            <MastheadButton id="shell-account" icon={<UserRound size={16} />} label={actor?.display_name ?? "Account"} hiddenPrefix={actor ? "Account:" : undefined} expanded={isOpen("account")} onClick={toggle("account")} />
          </>
        }
        panel={panel}
        search={search.trigger}
        overlay={search.overlay}
      >
        <LiveMessage message={jobs.announcement} />
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
