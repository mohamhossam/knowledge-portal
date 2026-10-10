/**
 * Catalogue direction mock-ups ("Layered Architecture Poster", e& calm),
 * mounted at /design-lab/catalogue in development only (App.tsx guards it with
 * import.meta.env.DEV). Four screens on the real Business Pro Plus catalogue:
 * the draft seeded from catalogues/smb-architecture.yaml, read from the same
 * fixture the catalogue's tests use. Nothing here writes.
 */
import "../../design";
import "./lab.css";

import { type ReactNode, useMemo } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import type { Release } from "../../api/client";
import { fromRelease } from "../../architecture/adapter";
import release from "../../architecture/fixtures/smb-release.json";
import { EVIDENCE_WORDS, type Evidence } from "../../architecture/model";
import { JourneyFlow } from "./JourneyFlow";
import { firstJourneyHref, LAB, LabData, useLabData } from "./labData";
import { LandscapeHero } from "./LandscapeHero";
import { ProductArchitecture, ProductOverview } from "./ProductPage";
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

/** The catalogue's sections, the same on every screen; the ones not mocked are shown as such. */
export function AreaTabs({ current }: { current: "landscape" | "products" | "journeys" }) {
  const data = useLabData();
  const product = data.offerings[0];
  const items: { id: string; label: string; to?: string; count?: number }[] = [
    { id: "landscape", label: "Landscape", to: LAB },
    { id: "products", label: "Products", to: product ? `${LAB}/products/${product.id}` : undefined, count: data.offerings.length },
    { id: "journeys", label: "Journeys", to: firstJourneyHref(data), count: data.journeys.length },
    { id: "systems", label: "Systems", count: data.systems.length },
    { id: "governance", label: "Governance", count: data.findings.length },
    { id: "versions", label: "Versions" },
  ];
  return (
    <nav className="cl-tabs" aria-label="Catalogue sections">
      {items.map((item) =>
        item.to ? (
          <Link key={item.id} to={item.to} aria-current={item.id === current ? "page" : undefined}>
            {item.label}
            {item.count !== undefined && <span className="cl-count">{item.count}</span>}
          </Link>
        ) : (
          <span key={item.id} className="cl-tab-off">
            {item.label}
            {item.count !== undefined && <span className="cl-count">{item.count}</span>}
            <span className="ds-visually-hidden"> (not in these mock-ups)</span>
          </span>
        ),
      )}
    </nav>
  );
}

function LabShell({ children }: { children: ReactNode }) {
  const data = useLabData();
  const product = data.offerings[0];
  const { pathname } = useLocation();
  const screens = [
    { to: LAB, label: "Landscape" },
    { to: `${LAB}/products/${product?.id}`, label: "Product" },
    { to: `${LAB}/products/${product?.id}/architecture`, label: "Product › Architecture" },
    { to: firstJourneyHref(data).split("?")[0] ?? LAB, label: "Journey flow" },
  ];
  const active = (to: string) => pathname.replace(/\/$/, "") === to || (to.includes("/journeys/") && pathname.includes("/journeys/"));
  return (
    <div className="cl">
      <a className="cl-skip" href="#main">
        Skip to content
      </a>
      <header className="cl-mast">
        <span className="cl-logo" aria-hidden="true">
          e&amp;
        </span>
        <b>Knowledge portal</b>
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
        <span className="cl-me">Amina Owner</span>
      </header>
      <nav className="cl-labbar" aria-label="Mock-up screens">
        <strong>Mock-up</strong>
        {screens.map((screen, index) => (
          <Link key={screen.label} to={screen.to} aria-current={active(screen.to) ? "page" : undefined}>
            <span aria-hidden="true">{index + 1}</span>
            {screen.label}
          </Link>
        ))}
      </nav>
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
