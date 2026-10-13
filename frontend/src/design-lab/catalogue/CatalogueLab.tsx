/**
 * Catalogue direction mock-ups ("Layered Architecture Poster", e& calm),
 * mounted at /design-lab/catalogue in development only (App.tsx guards it with
 * import.meta.env.DEV). It reads the catalogue version in service from the
 * API, or the bundled Business Pro Plus sample when VITE_CATALOGUE_SOURCE=sample
 * (catalogueSource.ts). Nothing here writes.
 */
import "../../design";
import "./lab.css";

import { type ReactNode, useContext, useLayoutEffect, useRef, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";

import { errorMessage } from "../../api/errors";
import { EVIDENCE_WORDS, type Evidence } from "../../architecture/model";
import { Button, EmptyState, Skeleton } from "../../design/components";
import { type CatalogueSource, catalogueSource, LabSource, useLabCatalogue, useLabSource } from "./catalogueSource";
import { ProductsIndex } from "./CatalogueIndexes";
import { JourneyFlow } from "./JourneyFlow";
import { JourneysIndex } from "./JourneysIndex";
import { InShell, LAB, LabData, useLabData } from "./labData";
import { useTitle } from "./labUtil";
import { LandscapeHero } from "./LandscapeHero";
import { ProductArchitecture } from "./ProductArchitecture";
import { ProductOverview } from "./ProductPage";
import { ProductComponents, ProductHierarchy, ProductPlans, ProductRules } from "./ProductTabs";
import { SystemsPage } from "./SystemsPage";

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
 * pages, not the navigation). Governance and Versions open the portal's
 * catalogue pages, on the live API, until the lab draws its own.
 */
export function AreaTabs({ current }: { current: "landscape" | "products" | "journeys" | "systems" }) {
  const items: { id: string; label: string; to: string }[] = [
    { id: "landscape", label: "Landscape", to: LAB },
    { id: "products", label: "Products", to: `${LAB}/products` },
    { id: "journeys", label: "Journeys", to: `${LAB}/journeys` },
    { id: "systems", label: "Systems", to: `${LAB}/systems` },
    { id: "governance", label: "Governance", to: "/architecture/governance" },
    { id: "versions", label: "Versions", to: "/architecture/versions" },
  ];
  const icon = (id: string) => (
    <svg className="cl-area-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {ICONS[id]}
    </svg>
  );
  return (
    <>
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
          {items.map((item) => (
            <Link key={item.id} to={item.to} aria-current={item.id === current ? "page" : undefined}>
              {icon(item.id)}
              {item.label}
            </Link>
          ))}
        </nav>
        <SourceSwitch />
      </div>
      <SampleNotice />
    </>
  );
}

/**
 * Development only, like the lab: which catalogue the screens draw, the API's
 * version in service or the bundled sample, to compare the two. The sample says
 * so under the bar, so it is never taken for the live catalogue.
 */
export function SourceSwitch() {
  const lab = useLabSource();
  if (!lab) return null;
  const options: { id: CatalogueSource; label: string }[] = [
    { id: "api", label: "Live API" },
    { id: "sample", label: "Sample JSON" },
  ];
  return (
    <div className="cl-source" role="group" aria-label="Data source">
      <span className="cl-source-label" aria-hidden="true">Data</span>
      <div className="cl-seg">
        {options.map((option) => (
          <button key={option.id} type="button" aria-pressed={lab.source === option.id} onClick={() => lab.setSource(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Under the bar while the sample is shown: not the catalogue in service. */
function SampleNotice() {
  const lab = useLabSource();
  if (lab?.source !== "sample") return null;
  return (
    <p className="cl-source-notice" role="status">
      Showing the bundled sample (smb-release.json), not the catalogue version in service.
    </p>
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
 * The catalogue's frame inside the portal's shell: the portal draws the
 * masthead and the areas bar; the catalogue adds its section bar and pages.
 */
function LabShell({ children }: { children: ReactNode }) {
  // Inside the portal shell, the shell's <main> holds the page. Rendered alone (a test, a preview), the lab brings its own.
  const inShell = useContext(InShell);
  return <div className="cl cl--embedded">{inShell ? <div className="cl-page">{children}</div> : <main className="cl-page">{children}</main>}</div>;
}

/** While the catalogue is read, or when it can't be: the page keeps its h1, says why, and offers the sample. */
function LabState({ children }: { children: ReactNode }) {
  useTitle("Architecture");
  return (
    <LabShell>
      <h1>Architecture catalogue</h1>
      {children}
      <SourceSwitch />
    </LabShell>
  );
}

/**
 * The lab; `inShell` when the portal's shell already provides the page's <main>.
 * `source` overrides the configured one (catalogueSource.ts), e.g. in tests.
 */
export default function CatalogueLab({ inShell = false, source: initial = catalogueSource() }: { inShell?: boolean; source?: CatalogueSource }) {
  const [source, setSource] = useState(initial);
  return (
    <LabSource.Provider value={{ source, setSource }}>
      <LabPages inShell={inShell} source={source} />
    </LabSource.Provider>
  );
}

function LabPages({ inShell, source }: { inShell: boolean; source: CatalogueSource }) {
  const catalogue = useLabCatalogue(source);
  if (catalogue.state !== "ready") {
    return (
      <InShell.Provider value={inShell}>
        <LabState>
          {catalogue.state === "loading" ? (
            <Skeleton label="Reading the catalogue" rows={6} />
          ) : catalogue.state === "error" ? (
            <EmptyState title="The catalogue couldn't be read" action={<Button onClick={catalogue.retry}>Try again</Button>}>
              {errorMessage(catalogue.error)}
            </EmptyState>
          ) : (
            <EmptyState title="No catalogue version is in service yet">Publish a version from Versions to read it here.</EmptyState>
          )}
        </LabState>
      </InShell.Provider>
    );
  }
  const data = catalogue.data;
  return (
    <InShell.Provider value={inShell}>
    <LabData.Provider value={data}>
      <LabShell>
        <Routes>
          <Route index element={<LandscapeHero />} />
          <Route path="products" element={<ProductsIndex />} />
          <Route path="journeys" element={<JourneysIndex />} />
          <Route path="systems" element={<SystemsPage />} />
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
    </InShell.Provider>
  );
}
