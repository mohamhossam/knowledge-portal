import "./layout.css";

import { ChevronLeft, ChevronRight, Info, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import etisalatLogo from "../assets/etisalat-logo-white.svg";
import { rovingKeyDown, useFillHeight, useFocusAfterRender, useStickySize } from "../hooks";
import { Badge, Status, type StatusTone } from "./feedback";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
}

/** Any link component (e.g. react-router's NavLink) or a plain anchor. */
export type LinkLike = ComponentType<{ href: string; className?: string; "aria-current"?: "page"; children: ReactNode }>;

const Anchor: LinkLike = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;

export type NavItem = {
  href: string;
  label: string;
  current?: boolean;
  count?: number;
  countLabel?: string;
  /** A 16px icon drawn before the label; on its own when the sidebar is collapsed. */
  icon?: ReactNode;
  /** The sidebar group it starts or belongs to ("Look up"); consecutive items share one. */
  group?: string;
};

const SIDEBAR_KEY = "knowledge-portal.sidebar";
const sidebarListeners = new Set<() => void>();

function readSidebar(): "expanded" | "collapsed" | null {
  try {
    const value = window.localStorage.getItem(SIDEBAR_KEY);
    return value === "expanded" || value === "collapsed" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The sidebar's width: what the person chose last, kept in this browser; until
 * they choose, expanded on a window 1440px or wider and collapsed to icons below.
 */
function useSidebar(): [boolean, () => void] {
  const wide = useMediaQuery("(min-width: 1440px)");
  const chosen = useSyncExternalStore(
    (onChange) => {
      sidebarListeners.add(onChange);
      return () => sidebarListeners.delete(onChange);
    },
    readSidebar,
    () => null,
  );
  const [memory, setMemory] = useState<"expanded" | "collapsed" | null>(null);
  const choice = chosen ?? memory;
  const expanded = choice ? choice === "expanded" : wide;
  const toggle = () => {
    const next = expanded ? "collapsed" : "expanded";
    setMemory(next);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // Blocked storage: the choice lasts for this page.
    }
    sidebarListeners.forEach((listener) => listener());
  };
  return [expanded, toggle];
}

/** Consecutive items that share a group, in order. */
function grouped(items: NavItem[]): { name?: string; items: NavItem[] }[] {
  const groups: { name?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return groups;
}

/**
 * The workbench frame (UX rebuild, phase 1): skip links; a slim maroon brand
 * bar (the Etisalat lockup, global search, the way out and the utilities, in a
 * fixed order on every page); under it a sidebar of the areas beside the page.
 * The sidebar collapses to icons (each keeps its name, shown beside it on hover
 * or focus); below 640px it becomes a row that scrolls sideways. On a location
 * change, focus moves to the page h1 and the view starts at the top (§1).
 * `reader` drops the sidebar (Explorer readers).
 */
export function AppShell({
  product = "Knowledge Portal",
  homeHref,
  logo,
  outbound,
  utilities,
  navigation = [],
  secondaryNavigation = [],
  reader = false,
  locationKey,
  link: Link = Anchor,
  banner,
  panel,
  search,
  overlay,
  children,
}: {
  product?: string;
  homeHref: string;
  /** The logo slot; defaults to the white Etisalat lockup. */
  logo?: ReactNode;
  /** The way back to requirement-portal, e.g. { href, label: "Requirement AI" }. */
  outbound?: { href: string; label: string };
  /** Jobs, Help, Account: the same three, in the same place, on every page (WCAG 3.2.6). */
  utilities?: ReactNode;
  /** The sidebar's areas, top first; `group` names the groups. */
  navigation?: NavItem[];
  /** Areas set apart at the sidebar's foot. */
  secondaryNavigation?: NavItem[];
  reader?: boolean;
  /** Changes on every route change (e.g. location.pathname). */
  locationKey?: string;
  link?: LinkLike;
  /** One shell-level banner, e.g. "The portal can't reach its service." */
  banner?: ReactNode;
  /** A non-modal side panel (Jobs, Help, Account) beside the page; the page stays usable. */
  panel?: ReactNode;
  /** The way into global search, in the middle of the brand bar (e.g. a SearchTrigger). */
  search?: ReactNode;
  /** A modal layer outside the page and the panel (e.g. the search dialog), so neither can make it inert. */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const masthead = useRef<HTMLDivElement>(null);
  useStickySize(masthead, "--sticky-top");
  // Below 1024px a side panel overlays the page: the page goes inert, so focus can't
  // move under the panel (WCAG 2.4.11). Esc or Close hands focus back.
  const narrow = useMediaQuery("(max-width: 1023px)");
  const covered = Boolean(panel) && narrow;
  const [expanded, toggleSidebar] = useSidebar();
  // Esc hides a collapsed item's name shown on hover or focus, until focus or the pointer moves (WCAG 1.4.13).
  const [quiet, setQuiet] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // An address with a target ("#passage-…") is the page's to focus: if it already did, it keeps it.
    // So does a record pane marked data-takes-focus that focused its own heading (a chosen row).
    const main = document.getElementById("ds-main");
    const active = document.activeElement;
    const placed = Boolean(main && active && active !== main && main.contains(active));
    if (placed && (window.location.hash || active?.closest("[data-takes-focus]"))) return;
    window.scrollTo(0, 0);
    // The page's h1: the page header's, or else the page's first h1.
    const titleOf = () => document.getElementById("ds-page-title") ?? main?.querySelector<HTMLElement>("h1") ?? null;
    const focusTitle = (title: HTMLElement) => {
      if (!title.hasAttribute("tabindex")) title.setAttribute("tabindex", "-1");
      title.focus({ preventScroll: true });
    };
    const title = titleOf();
    if (title) focusTitle(title);
    // The page is still loading (a skeleton, or its own code chunk), or its h1 is a loading
    // one that the page replaces (the catalogue's, then a focus page's): focus its h1 when it
    // arrives, unless the person has moved focus somewhere themselves in the meantime. Focus
    // still on what navigated here (the sidebar link pressed) hasn't been moved by them.
    if (!main) return;
    const navigatedFrom = active;
    const observer = new MutationObserver(() => {
      const arrived = titleOf();
      const now = document.activeElement;
      if (!arrived || arrived === now) return;
      if (!now || now === document.body || now === main || now === navigatedFrom) focusTitle(arrived);
    });
    observer.observe(main, { childList: true, subtree: true });
    const stop = setTimeout(() => observer.disconnect(), 10000);
    return () => {
      observer.disconnect();
      clearTimeout(stop);
    };
  }, [locationKey]);

  const list = (items: NavItem[], key: string) =>
    grouped(items).map((group, index) => (
      <div key={`${key}-${index}`} className="ds-sidebar__group">
        {group.name && <p className="ds-sidebar__heading" id={`ds-rail-${key}-${index}`}>{group.name}</p>}
        <ul aria-labelledby={group.name ? `ds-rail-${key}-${index}` : undefined}>
          {group.items.map((item) => (
            <li key={`${item.href}|${item.label}`}>
              <Link href={item.href} className="ds-sidebar__link" aria-current={item.current ? "page" : undefined}>
                {item.icon && <span className="ds-sidebar__icon" aria-hidden="true">{item.icon}</span>}
                <span className="ds-sidebar__label">{item.label}</span>
                {item.count !== undefined && item.count > 0 && <Badge count={item.count} label={item.countLabel} />}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ));

  return (
    <div className={`ds-root ds-shell${reader ? " ds-shell--reader" : ""}${panel ? " ds-shell--panel" : ""}${expanded ? "" : " ds-shell--collapsed"}`}>
      <a className="ds-skip" href="#ds-main">Skip to content</a>
      {!reader && <a className="ds-skip" href="#ds-rail">Skip to navigation</a>}
      {/* The slim brand bar, pinned and measured (--sticky-top). */}
      <div className="ds-topbar" ref={masthead}>
        <header className="ds-masthead">
          <div className="ds-masthead__brand">
            <Link href={homeHref} className="ds-masthead__home">
              {logo ?? <img className="ds-masthead__logo" src={etisalatLogo} alt="Etisalat" width={96} height={20} />}
              <span className="ds-masthead__divider" aria-hidden="true" />
              <span className="ds-masthead__product">{product}</span>
            </Link>
          </div>
          {search && <div className="ds-masthead__search" role="search" aria-label="Portal">{search}</div>}
          <div className="ds-masthead__end">
            {outbound && (
              <a className="ds-masthead__out" href={outbound.href}>
                {outbound.label}{" "}
                <span className="ds-visually-hidden">(leaves the knowledge portal)</span>
              </a>
            )}
            {utilities && <div className="ds-masthead__utilities">{utilities}</div>}
          </div>
        </header>
      </div>
      {/* Always present, so a banner that appears later is announced (a live region must exist first). */}
      <div className={banner ? "ds-banner" : "ds-visually-hidden"} role="status">{banner}</div>
      <div className="ds-shell__body">
        {!reader && (
          <nav
            id="ds-rail"
            className={`ds-sidebar${quiet ? " ds-sidebar--quiet" : ""}`}
            aria-label="Areas"
            tabIndex={-1}
            inert={covered || undefined}
            onKeyDown={(event) => event.key === "Escape" && !expanded && setQuiet(true)}
            onFocus={() => setQuiet(false)}
            onPointerMove={quiet ? () => setQuiet(false) : undefined}
          >
            <div className="ds-sidebar__lists">
              {list(navigation, "main")}
              {secondaryNavigation.length > 0 && <div className="ds-sidebar__secondary">{list(secondaryNavigation, "more")}</div>}
            </div>
            <button type="button" className="ds-sidebar__toggle" aria-label={expanded ? "Collapse the sidebar" : "Expand the sidebar"} onClick={toggleSidebar}>
              {expanded ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeftOpen size={16} aria-hidden="true" />}
              <span className="ds-sidebar__toggle-label" aria-hidden="true">Collapse</span>
            </button>
          </nav>
        )}
        <main id="ds-main" className="ds-main" tabIndex={-1} inert={covered || undefined}>
          {children}
        </main>
        {panel}
      </div>
      {overlay}
    </div>
  );
}

/** A utility button for the masthead (Jobs, Help, Account): text label, icon, optional count. */
export function MastheadButton({ icon, label, hiddenPrefix, count, countLabel, expanded, onClick, id }: { icon: ReactNode; label: string; /** Said before the label, e.g. "Account:" before a name. */ hiddenPrefix?: string; count?: number; countLabel?: string; expanded?: boolean; onClick: (event: { currentTarget: EventTarget | null }) => void; id?: string }) {
  return (
    <button id={id} type="button" className="ds-masthead__button" aria-expanded={expanded} onClick={onClick}>
      <span aria-hidden="true" className="ds-masthead__icon">{icon}</span>
      {hiddenPrefix && <><span className="ds-visually-hidden">{hiddenPrefix}</span>{" "}</>}
      <span className="ds-masthead__label" title={label}>{label}</span>
      {count !== undefined && count > 0 && <Badge count={count} label={countLabel} />}
    </button>
  );
}

/**
 * Every page's head, on one line: the h1 (the record's or the page's own name)
 * with its status and facts beside it, the actions at the end. The h1
 * receives focus on arrival and sets the document title first. Where the page
 * sits and what it is for (breadcrumbs, lead, provenance) wait behind "About
 * this page". `children` (tabs, a draft's steps) take a second, slim row.
 */
export function PageHeader({
  title,
  documentTitle,
  lead,
  meta,
  provenance,
  actions,
  breadcrumbs,
  children,
}: {
  title: ReactNode;
  /** The tab title; defaults to the title when it is a string. */
  documentTitle?: string;
  /** What the page is for, in a sentence: behind "About this page". */
  lead?: ReactNode;
  /** Status and facts, on the title's line (a Status there shows as a pill). */
  meta?: ReactNode;
  /** Where the record comes from: behind "About this page". */
  provenance?: ReactNode;
  actions?: ReactNode;
  /** Where this page sits (a Breadcrumbs): behind "About this page". */
  breadcrumbs?: ReactNode;
  /** Tabs, sub-navigation or a state line under the head. */
  children?: ReactNode;
}) {
  const tabTitle = documentTitle ?? (typeof title === "string" ? title : undefined);
  useEffect(() => {
    if (tabTitle) document.title = `${tabTitle} · Knowledge portal`;
  }, [tabTitle]);
  const heading = useRef<HTMLHeadingElement>(null);
  useTruncatedTitle(heading);
  return (
    <div className="ds-pagehead">
      <div className="ds-pagehead__top">
        <div className="ds-pagehead__titles">
          <h1 ref={heading} id="ds-page-title" tabIndex={-1} dir="auto">{title}</h1>
          {meta && <div className="ds-pagehead__meta">{meta}</div>}
          {(breadcrumbs || lead || provenance) && (
            <PageAbout>
              {breadcrumbs}
              {lead && <p className="ds-pagehead__lead">{lead}</p>}
              {provenance && <p className="ds-provenance">{provenance}</p>}
            </PageAbout>
          )}
        </div>
        {actions && <div className="ds-pagehead__actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** A name cut short by its ellipsis shows whole on hover (a `title`), and only then. */
function useTruncatedTitle(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const check = () => {
      if (element.scrollWidth > element.clientWidth + 1) element.title = element.textContent ?? "";
      else element.removeAttribute("title");
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  });
}

/**
 * "About this page": a disclosure beside the title, not a modal. Its panel
 * follows the button in reading order; Esc or a press outside closes it, and
 * Esc hands focus back to the button.
 */
function PageAbout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={wrap}
      className="ds-pageabout"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button ref={button} type="button" className="ds-icon-button ds-pageabout__button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((on) => !on)}>
        <Info size={16} aria-hidden="true" />
        <span className="ds-visually-hidden">About this page</span>
      </button>
      <div id={id} className="ds-pageabout__panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/**
 * The sticky line that says which mode and state you're in: a draft's steps,
 * or a version that isn't in service ("proof", on its own calm tint). It
 * publishes its height so focus never hides under it.
 */
export function StateLine({ tone = "plain", children }: { tone?: "plain" | "proof"; children: ReactNode }) {
  const line = useRef<HTMLDivElement>(null);
  useStickySize(line, "--sticky-state");
  return (
    <div ref={line} className={`ds-stateline ds-stateline--${tone}`} role="status">
      {children}
    </div>
  );
}

/**
 * The page's own bottom bar (a draft's "Save and continue", the review desk's
 * progress). Sticky and measured like the selection bar, so scroll padding
 * keeps the focused row clear of it (§1.1). A labelled region, not a footer
 * landmark: the page has one contentinfo at most.
 */
export function StickyFooter({ label, children }: { label: string; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useStickySize(bar, "--sticky-bottom");
  return (
    <div ref={bar} className="ds-stickyfoot" role="region" aria-label={label}>
      {children}
    </div>
  );
}

export function Breadcrumbs({ items, link: Link = Anchor }: { items: { href?: string; label: string }[]; link?: LinkLike }) {
  return (
    <nav aria-label="Breadcrumb" className="ds-breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href && index < items.length - 1 ? (
              <Link href={item.href}><bdi>{item.label}</bdi></Link>
            ) : (
              <span aria-current="page"><bdi>{item.label}</bdi></span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Second level that changes the URL: a labelled nav with aria-current (IA §3). */
export function SubNav({ label, items, link: Link = Anchor }: { label: string; items: NavItem[]; link?: LinkLike }) {
  return (
    <nav className="ds-subnav" aria-label={label}>
      <ul>
        {items.map((item) => (
          <li key={`${item.href}|${item.label}`}>
            <Link href={item.href} aria-current={item.current ? "page" : undefined} className="ds-subnav__link">
              {item.label}
              {item.count !== undefined && <span className="ds-subnav__count"> {item.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Second level that keeps the URL: ARIA tabs. ← → move between tabs, Home/End
 * jump; the selected tab is the one tab stop; its panel follows.
 */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
}: {
  label: string;
  tabs: { id: T; label: ReactNode }[];
  selected: T;
  onSelect: (id: T) => void;
  children: ReactNode;
}) {
  const id = useId();
  const focusLater = useFocusAfterRender();
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === selected);
    const next =
      event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] :
      event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length] :
      event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : undefined;
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    focusLater(() => document.getElementById(`${id}-tab-${next.id}`));
  };
  return (
    <div className="ds-tabs">
      <div role="tablist" aria-label={label} className="ds-tabs__list" onKeyDown={keyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${id}-tab-${tab.id}`}
            type="button"
            role="tab"
            className="ds-tabs__tab"
            aria-selected={tab.id === selected}
            aria-controls={`${id}-panel`}
            tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`} className="ds-tabs__panel" tabIndex={0}>
        {children}
      </div>
    </div>
  );
}

/** ARIA toolbar: one tab stop; ← → move between its controls. */
export function Toolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className="ds-toolbar" onKeyDown={(event) => rovingKeyDown(event, "button,a[href],input,select", "horizontal")}>
      {children}
    </div>
  );
}

/**
 * The list and its record (UX rebuild, phase 1): once the page is wide enough
 * the list and the record sit side by side and fill the window down to the
 * page's bottom bar, each scrolling on its own, so the record never scrolls
 * away from the row it shows. Narrower, they stack, the record after the list.
 */
export function SplitPane({ list, pane, paneLabel }: { list: ReactNode; pane: ReactNode; paneLabel: string }) {
  const split = useRef<HTMLDivElement>(null);
  useFillHeight(split);
  return (
    <div ref={split} className="ds-split">
      <div className="ds-split__list">{list}</div>
      <aside className="ds-split__pane" aria-label={paneLabel}>
        {pane}
      </aside>
    </div>
  );
}

/** Pages of a long list; the current page is marked and said. */
export function Pagination({ page, pages, onPage, label = "Pages" }: { page: number; pages: number; onPage: (page: number) => void; label?: string }) {
  if (pages <= 1) return null;
  const shown = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className="ds-pagination" aria-label={label}>
      <button type="button" className="ds-pagination__step" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={14} aria-hidden="true" /> Previous
      </button>
      <ol>
        {shown.map((n, i) => (
          <li key={n}>
            {i > 0 && n - shown[i - 1]! > 1 && <span aria-hidden="true" className="ds-pagination__gap">…</span>}
            <button type="button" className="ds-pagination__page" aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>
              {n}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="ds-pagination__step" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  );
}

/** A record's facts: label and value pairs, labels in the secondary ink (promoted from the prototype). */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="ds-facts">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A plain ledger list: one item per line, hair rules between (promoted from the prototype). */
export function Lines({ label, children }: { label?: string; children: ReactNode }) {
  return <ul className="ds-lines" aria-label={label}>{children}</ul>;
}

/** Section with a ledger-ruled heading (direction A's signature carried to every view). */
export function Section({ title, count, actions, children, headingLevel = 2 }: { title: ReactNode; count?: number; actions?: ReactNode; children: ReactNode; headingLevel?: 2 | 3 }) {
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="ds-section" aria-labelledby={id}>
      <div className="ds-section__head">
        <Heading id={id} className="ds-section__title">
          {title}
          {count !== undefined && <>{" "}<span className="ds-section__count">{count.toLocaleString("en")}</span></>}
        </Heading>
        {actions}
      </div>
      {children}
    </section>
  );
}

export type Step = {
  href: string;
  label: string;
  current?: boolean;
  /** Where the step stands, in words with its tone: "12 waiting", "Built". */
  status?: { tone: StatusTone; text: string };
};

/**
 * A guided workflow's steps, in order (a draft's Sources → Decide → Changes →
 * Check → Publish). Each step is a link that changes the URL: an ordered list
 * in a labelled nav, the current step marked with aria-current. Each step says
 * where it stands with a Status (icon and words), never colour alone. Any step
 * can be opened: the order is advice, not a gate.
 */
export function Stepper({ label, steps, link: Link = Anchor }: { label: string; steps: Step[]; link?: LinkLike }) {
  return (
    <nav className="ds-stepper" aria-label={label}>
      <ol>
        {steps.map((step, index) => (
          <li key={step.href} className="ds-stepper__step">
            <Link href={step.href} aria-current={step.current ? "page" : undefined} className="ds-stepper__link">
              <span className="ds-stepper__number" aria-hidden="true">{index + 1}</span>
              <span className="ds-stepper__text">
                <span className="ds-stepper__label">
                  <span className="ds-visually-hidden">Step {index + 1}:</span> {step.label}
                </span>
                {step.status && <span className="ds-visually-hidden">,</span>}{" "}
                {step.status && (
                  <span className="ds-stepper__status">
                    <Status tone={step.status.tone}>{step.status.text}</Status>
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
