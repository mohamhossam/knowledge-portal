import "./layout.css";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";

import { rovingKeyDown, useFocusAfterRender, useStickySize } from "../hooks";
import { Badge } from "./feedback";

/** Any link component (e.g. react-router's NavLink) or a plain anchor. */
export type LinkLike = ComponentType<{ href: string; className?: string; "aria-current"?: "page"; children: ReactNode }>;

const Anchor: LinkLike = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;

export type NavItem = { href: string; label: string; current?: boolean; count?: number; countLabel?: string };

/**
 * IA §2: skip links, the maroon masthead (logo slot, product, utilities in a
 * fixed order on every page), the five-area rail with the red active marker,
 * then the page. On a location change, focus moves to the page h1 and the view
 * starts at the top (§1). `reader` drops the rail (Explorer readers).
 */
export function AppShell({
  product = "Knowledge portal",
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
  children,
}: {
  product?: string;
  homeHref: string;
  /** The e& logo slot; defaults to a labelled placeholder until brand files exist. */
  logo?: ReactNode;
  /** The way back to requirement-portal, e.g. { href, label: "Requirement AI" }. */
  outbound?: { href: string; label: string };
  /** Jobs, Help, Account: the same three, in the same place, on every page (WCAG 3.2.6). */
  utilities?: ReactNode;
  navigation?: NavItem[];
  secondaryNavigation?: NavItem[];
  reader?: boolean;
  /** Changes on every route change (e.g. location.pathname). */
  locationKey?: string;
  link?: LinkLike;
  /** One shell-level banner, e.g. "The portal can't reach its service." */
  banner?: ReactNode;
  /** A non-modal side panel (Jobs, Help, Account) beside the page; the page stays usable. */
  panel?: ReactNode;
  children: ReactNode;
}) {
  const masthead = useRef<HTMLElement>(null);
  useStickySize(masthead, "--sticky-top");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // An address with a target ("#passage-…") is the page's to focus: if it already did, it keeps it.
    const main = document.getElementById("ds-main");
    const active = document.activeElement;
    if (window.location.hash && main && active && active !== main && main.contains(active)) return;
    window.scrollTo(0, 0);
    const title = document.getElementById("ds-page-title");
    if (title) {
      title.focus({ preventScroll: true });
      return;
    }
    // The page is still loading (a skeleton, no h1 yet): focus its h1 when it arrives,
    // unless the person has moved focus somewhere themselves in the meantime.
    if (!main) return;
    const observer = new MutationObserver(() => {
      const arrived = document.getElementById("ds-page-title");
      if (!arrived) return;
      observer.disconnect();
      const now = document.activeElement;
      if (!now || now === document.body || now === main) arrived.focus({ preventScroll: true });
    });
    observer.observe(main, { childList: true, subtree: true });
    const stop = setTimeout(() => observer.disconnect(), 10000);
    return () => {
      observer.disconnect();
      clearTimeout(stop);
    };
  }, [locationKey]);

  const nav = (items: NavItem[]) =>
    items.map((item) => (
      <li key={`${item.href}|${item.label}`}>
        <Link href={item.href} className="ds-rail__link" aria-current={item.current ? "page" : undefined}>
          <span>{item.label}</span>
          {item.count !== undefined && item.count > 0 && <Badge count={item.count} label={item.countLabel} />}
        </Link>
      </li>
    ));

  return (
    <div className={`ds-root ds-shell${reader ? " ds-shell--reader" : ""}${panel ? " ds-shell--panel" : ""}`}>
      <a className="ds-skip" href="#ds-main">Skip to content</a>
      {!reader && <a className="ds-skip" href="#ds-rail">Skip to navigation</a>}
      <header className="ds-masthead" ref={masthead}>
        <div className="ds-masthead__brand">
          <Link href={homeHref} className="ds-masthead__home">
            {logo ?? <span className="ds-logo" role="img" aria-label="e&">e&</span>}
            <span className="ds-masthead__product">{product}</span>
          </Link>
          {outbound && (
            <a className="ds-masthead__out" href={outbound.href}>
              {outbound.label}{" "}
              <span className="ds-visually-hidden">(opens {outbound.label})</span>
            </a>
          )}
        </div>
        {utilities && <div className="ds-masthead__utilities">{utilities}</div>}
      </header>
      {banner && <div className="ds-banner" role="status">{banner}</div>}
      <div className="ds-shell__body">
        {!reader && (
          <nav id="ds-rail" className="ds-rail" aria-label="Areas" tabIndex={-1}>
            <ul>{nav(navigation)}</ul>
            {secondaryNavigation.length > 0 && <ul className="ds-rail__secondary">{nav(secondaryNavigation)}</ul>}
          </nav>
        )}
        <main id="ds-main" className="ds-main" tabIndex={-1}>
          {children}
        </main>
        {panel}
      </div>
    </div>
  );
}

/** A utility button for the masthead (Jobs, Help, Account): text label, icon, optional count. */
export function MastheadButton({ icon, label, count, countLabel, expanded, onClick, id }: { icon: ReactNode; label: string; count?: number; countLabel?: string; expanded?: boolean; onClick: (event: { currentTarget: EventTarget | null }) => void; id?: string }) {
  return (
    <button id={id} type="button" className="ds-masthead__button" aria-expanded={expanded} onClick={onClick}>
      <span aria-hidden="true" className="ds-masthead__icon">{icon}</span>
      {label}
      {count !== undefined && count > 0 && <Badge count={count} label={countLabel} />}
    </button>
  );
}

/**
 * Every page's head: the h1 receives focus on arrival and sets the document
 * title first; status, owner and provenance sit under it; actions to the end.
 */
export function PageHeader({
  title,
  documentTitle,
  lead,
  meta,
  provenance,
  actions,
  children,
}: {
  title: ReactNode;
  /** The tab title; defaults to the title when it is a string. */
  documentTitle?: string;
  lead?: ReactNode;
  meta?: ReactNode;
  provenance?: ReactNode;
  actions?: ReactNode;
  /** Tabs, sub-navigation or a state line under the head. */
  children?: ReactNode;
}) {
  const tabTitle = documentTitle ?? (typeof title === "string" ? title : undefined);
  useEffect(() => {
    if (tabTitle) document.title = `${tabTitle} · Knowledge portal`;
  }, [tabTitle]);
  return (
    <div className="ds-pagehead">
      <div className="ds-pagehead__top">
        <div className="ds-pagehead__titles">
          <h1 id="ds-page-title" tabIndex={-1} dir="auto">{title}</h1>
          {lead && <p className="ds-pagehead__lead">{lead}</p>}
          {meta && <div className="ds-pagehead__meta">{meta}</div>}
          {provenance && <p className="ds-provenance">{provenance}</p>}
        </div>
        {actions && <div className="ds-pagehead__actions">{actions}</div>}
      </div>
      {children}
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

export function ProvenanceLine({ children }: { children: ReactNode }) {
  return <p className="ds-provenance">{children}</p>;
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
 * The review desk's split (from direction C): the list beside a full-height
 * sticky pane from 1200 px; stacked below that, with the pane after the list.
 */
export function SplitPane({ list, pane, paneLabel }: { list: ReactNode; pane: ReactNode; paneLabel: string }) {
  return (
    <div className="ds-split">
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
