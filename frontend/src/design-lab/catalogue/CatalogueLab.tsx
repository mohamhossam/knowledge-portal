/**
 * Catalogue direction mock-ups ("Layered Architecture Poster", e& calm),
 * mounted at /design-lab/catalogue in development only (App.tsx guards it with
 * import.meta.env.DEV). Four screens on the real Business Pro Plus catalogue:
 * the draft seeded from catalogues/smb-architecture.yaml, read from the same
 * fixture the catalogue's tests use. Nothing here writes.
 */
import "../../design";
import "./lab.css";

import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { Link, Route, Routes } from "react-router-dom";

import type { Release } from "../../api/client";
import { fromRelease } from "../../architecture/adapter";
import release from "../../architecture/fixtures/smb-release.json";
import { EVIDENCE_WORDS, type Evidence } from "../../architecture/model";
import brandLogo from "./assets/etisalat-logo-white.svg";
import { ProductsIndex } from "./CatalogueIndexes";
import { JourneyFlow } from "./JourneyFlow";
import { JourneysIndex } from "./JourneysIndex";
import { LAB, LabData, useLabData } from "./labData";
import { LandscapeHero } from "./LandscapeHero";
import { ProductArchitecture } from "./ProductArchitecture";
import { ProductOverview } from "./ProductPage";
import { ProductComponents, ProductHierarchy, ProductPlans, ProductRules } from "./ProductTabs";

/** "Confirmed · SDD v2.3 §P1.1": how sure, and from where, in one line. */
export function EvidenceTag({ evidence }: { evidence: Evidence }) {
  const data = useLabData();
  const source = data.sources.find((item) => item.id === evidence.source);
  const where = [source?.short, evidence.where].filter(Boolean).join(" ");
  return (
    <span className={`cl-ev ${evidence.status}`}>
      <i aria-hidden="true" />
      {EVIDENCE_WORDS[evidence.status]}
      {where ? ` · ${where}` : ""}
    </span>
  );
}

/** One line icon per catalogue section, drawn on a 16px grid in the text colour. */
const ICONS: Record<string, ReactNode> = {
  landscape: (
    <>
      <path d="M8 2 14 5 8 8 2 5z" />
      <path d="m2 8 6 3 6-3" />
      <path d="m2 11 6 3 6-3" />
    </>
  ),
  products: (
    <>
      <path d="M2.5 4.5 8 2l5.5 2.5v7L8 14l-5.5-2.5z" />
      <path d="M2.5 4.5 8 7l5.5-2.5M8 7v7" />
    </>
  ),
  journeys: (
    <>
      <circle cx="3.5" cy="12.5" r="1.5" />
      <circle cx="12.5" cy="3.5" r="1.5" />
      <path d="M5 12.5h4.5a2 2 0 0 0 0-4h-3a2 2 0 0 1 0-4H11" />
    </>
  ),
  systems: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  governance: (
    <>
      <path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.6-5.5 7-3.2-1.4-5.5-3.8-5.5-7v-4z" />
      <path d="m5.5 8 1.8 1.8L10.8 6.3" />
    </>
  ),
  versions: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </>
  ),
};

/**
 * The catalogue's own bar, the same on every screen: which catalogue this is,
 * then its sections, each with an icon and no count (counts belong to the
 * pages, not the navigation). The sections not in these mock-ups are shown,
 * but say so.
 */
export function AreaTabs({ current }: { current: "landscape" | "products" | "journeys" }) {
  const items: { id: string; label: string; to?: string }[] = [
    { id: "landscape", label: "Landscape", to: LAB },
    { id: "products", label: "Products", to: `${LAB}/products` },
    { id: "journeys", label: "Journeys", to: `${LAB}/journeys` },
    { id: "systems", label: "Systems" },
    { id: "governance", label: "Governance" },
    { id: "versions", label: "Versions" },
  ];
  const icon = (id: string) => (
    <svg className="cl-area-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {ICONS[id]}
    </svg>
  );
  return (
    <div className="cl-area">
      <div className="cl-area-id">
        <span className="cl-area-mark" aria-hidden="true">
          {icon("landscape")}
        </span>
        <span>
          <strong>SMB architecture</strong>
          <small>
            Architecture catalogue
          </small>
        </span>
      </div>
      <nav className="cl-area-nav" aria-label="Catalogue sections">
        {items.map((item) =>
          item.to ? (
            <Link key={item.id} to={item.to} aria-current={item.id === current ? "page" : undefined}>
              {icon(item.id)}
              {item.label}
            </Link>
          ) : (
            <span key={item.id} className="cl-area-off" title="Not in these mock-ups">
              {icon(item.id)}
              {item.label}
              <span className="ds-visually-hidden"> (not in these mock-ups)</span>
            </span>
          ),
        )}
      </nav>
    </div>
  );
}

/**
 * Where a page sits, drawn as a hierarchy rail: one line through a node per
 * level, each with its kind ("Business unit", "Segment"…) above its name. Every
 * item has the same two lines, so names share one baseline; the page itself is
 * the filled node at the end of the rail.
 */
export function PathBar({ label, items }: { label: string; items: { level: string; name: string; to?: string }[] }) {
  const rail = useRef<HTMLElement>(null);
  // On a narrow screen the rail scrolls; start at its end, where the page itself is.
  useLayoutEffect(() => {
    const element = rail.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [items.length]);
  return (
    <nav ref={rail} className="cl-path" aria-label={label}>
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.name}-${index}`} aria-current={last ? "page" : undefined}>
              <i className="cl-path-node" aria-hidden="true" />
              <small>{item.level}</small>
              {item.to && !last ? <Link to={item.to}>{item.name}</Link> : <strong>{item.name}</strong>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The portal shell. Tier one is the masthead: the "Etisalat | Knowledge Portal"
 * lockup (one link home: the portal is a product named Knowledge Portal, owned
 * by Etisalat), the portal's areas, and the signed-in person. Its content sits
 * on the same 1440px column as the page, so the logo lines up with everything
 * below it. Tier two is each screen's catalogue bar.
 */
function LabShell({ children }: { children: ReactNode }) {
  return (
    <div className="cl">
      <a className="cl-skip" href="#main">
        Skip to content
      </a>
      <header className="cl-mast">
        <div className="cl-mast-inner">
          <Link className="cl-lockup" to={LAB}>
            <img className="cl-brand" src={brandLogo} alt="Etisalat" width={115} height={24} />
            <span className="cl-mast-divider" aria-hidden="true" />
            <span className="cl-product">Knowledge Portal</span>
          </Link>
          <nav aria-label="Areas">
            <a href="#main">Your work</a>
            <a href="#main">Library</a>
            <a href="#main" aria-current="page">
              Catalogue
            </a>
            <a href="#main">Ownership</a>
            <a href="#main">Requirements</a>
            <a href="#main">Explorer</a>
          </nav>
          <span className="cl-me">
            <span className="cl-avatar" aria-hidden="true">
              AO
            </span>
            Amina Owner
          </span>
        </div>
      </header>
      <main id="main" className="cl-page" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export default function CatalogueLab() {
  const data = useMemo(() => fromRelease(release as unknown as Release), []);
  return (
    <LabData.Provider value={data}>
      <LabShell>
        <Routes>
          <Route index element={<LandscapeHero />} />
          <Route path="products" element={<ProductsIndex />} />
          <Route path="journeys" element={<JourneysIndex />} />
          <Route path="products/:offeringId" element={<ProductOverview />} />
          <Route path="products/:offeringId/hierarchy" element={<ProductHierarchy />} />
          <Route path="products/:offeringId/plans" element={<ProductPlans />} />
          <Route path="products/:offeringId/rules" element={<ProductRules />} />
          <Route path="products/:offeringId/components" element={<ProductComponents />} />
          <Route path="products/:offeringId/architecture" element={<ProductArchitecture />} />
          <Route path="journeys/:journeyId" element={<JourneyFlow />} />
        </Routes>
      </LabShell>
    </LabData.Provider>
  );
}
