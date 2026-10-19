/**
 * The catalogue lab's chrome, shared by every page: the section bar with its data source
 * switch and the sample notice, the evidence tag, and the hierarchy path. Kept apart from
 * CatalogueLab, which routes to the pages, so no page imports the router back.
 */
import { type ReactNode, useContext, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { EVIDENCE_WORDS, type Evidence } from "../../catalogue/model/model";
import { type CatalogueSource, useLabSource } from "./catalogueSource";
import { LAB, LabData, useLabData } from "./labData";
import { catalogueName } from "./words";

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
export function AreaTabs({ current }: { current?: "landscape" | "products" | "journeys" | "systems" }) {
  // The bar also heads the loading and not-found pages, before any catalogue is read.
  const data = useContext(LabData);
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
            <strong>{data ? catalogueName(data) : "Catalogue"}</strong>
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
