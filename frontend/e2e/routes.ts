/**
 * The routes the e2e suites visit. Seeded ids are looked up from the API, by
 * the seed's own titles, so the keys stay stable across reseeds.
 * Every route is on the design system, so none may have a serious or
 * critical accessibility issue (a11y.spec.ts).
 */
import { apiUrl, OWNER } from "./env";

export type Seeded = {
  reviewDocument?: string;
  serviceDocument?: string;
  draft?: string;
  replaced?: string;
  system?: string;
  concept?: string;
  offering?: string;
  journey?: string;
};

export type RouteDef = {
  key: string;
  path: (seeded: Seeded) => string | undefined;
  /** CSS selectors whose content changes between seeds (dates, ids), masked in screenshots. */
  mask?: string[];
  /** The view only, not the whole page: a review desk renders 200 rows (about 10,000 px). */
  viewOnly?: boolean;
};

const at = (path: string) => () => path;

export const ROUTES: RouteDef[] = [
  { key: "home", path: at("") },
  // Dates are the seed's day: masked, so the screenshots hold on any later day.
  { key: "library", path: at("library"), mask: ["tbody td:last-child"] },
  // The offline search orders tied results differently from seed to seed: the list is masked.
  { key: "library-search", path: at("library/search?q=coverage"), mask: [".lib-results"] },
  { key: "library-review", path: (s) => s.reviewDocument && `library/${s.reviewDocument}`, viewOnly: true },
  // Focus mode (UX rebuild, phase 2): the same review, one question at a time.
  { key: "library-review-focus", path: (s) => s.reviewDocument && `library/${s.reviewDocument}/focus` },
  { key: "library-document", path: (s) => s.serviceDocument && `library/${s.serviceDocument}`, mask: [".ds-provenance", ".review-line__text", ".ds-facts dd:first-of-type"] },
  { key: "library-versions", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/versions`, mask: [".ds-provenance", ".review-line__text", "tbody td:nth-child(3)", "tbody th"] },
  { key: "library-cited-by", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/cited-by`, mask: [".ds-provenance", ".review-line__text"] },
  // The old address, kept working until area 10 makes it a redirect.
  { key: "library-citations", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/citations`, mask: [".ds-provenance", ".review-line__text"] },
  { key: "library-ownership", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/ownership`, mask: [".ds-provenance", ".review-line__text", "tbody th"] },
  { key: "library-about", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/about`, mask: [".ds-provenance", ".review-line__text"] },
  // The architecture catalogue.
  { key: "architecture", path: at("architecture") },
  // The map (UX rebuild phase 4): how systems connect, one system in context, what systems do.
  { key: "architecture-golden-set", path: at("architecture/golden-set"), mask: [".golden-meta", "select"] },
  { key: "architecture-map", path: at("architecture/map") },
  { key: "architecture-map-system", path: (s) => s.system && `architecture/map?system=${s.system}` },
  { key: "architecture-map-capabilities", path: at("architecture/map?lens=capabilities") },
  { key: "architecture-system", path: (s) => s.system && `architecture/systems/${s.system}` },
  { key: "architecture-concepts", path: at("architecture/concepts") },
  { key: "architecture-concept", path: (s) => s.concept && `architecture/concepts/${s.concept}` },
  { key: "architecture-offerings", path: at("architecture/offerings") },
  { key: "architecture-offering", path: (s) => s.offering && `architecture/offerings/${s.offering}` },
  { key: "architecture-journeys", path: at("architecture/journeys") },
  { key: "architecture-journey", path: (s) => s.journey && `architecture/journeys/${s.journey}` },
  { key: "architecture-governance", path: at("architecture/governance") },
  { key: "architecture-domains", path: at("architecture/domains") },
  { key: "architecture-channels", path: at("architecture/channels") },
  { key: "architecture-versions", path: at("architecture/versions") },
  { key: "architecture-compare", path: (s) => s.replaced && `architecture/compare?to=${s.replaced}` },
  { key: "architecture-version", path: (s) => s.replaced && `architecture/versions?version=${s.replaced}` },
  { key: "architecture-draft", path: (s) => s.draft && `architecture/versions/${s.draft}` },
  // The draft's steps (area 3: rebuilt on the design system).
  { key: "architecture-draft-sources", path: (s) => s.draft && `architecture/versions/${s.draft}/sources` },
  { key: "architecture-draft-decide", path: (s) => s.draft && `architecture/versions/${s.draft}/decide`, viewOnly: true },
  { key: "architecture-draft-decide-focus", path: (s) => s.draft && `architecture/versions/${s.draft}/decide/focus` },
  { key: "architecture-draft-changes", path: (s) => s.draft && `architecture/versions/${s.draft}/changes` },
  { key: "architecture-draft-check", path: (s) => s.draft && `architecture/versions/${s.draft}/check` },
  { key: "architecture-draft-publish", path: (s) => s.draft && `architecture/versions/${s.draft}/publish` },
  { key: "explorer", path: at("explorer") },
  { key: "squads", path: at("squads") },
  { key: "squads-no-squad", path: at("squads?show=none") },
  // Ownership on the workbench (UX rebuild, phase 3): a record of each kind, and Assign several.
  { key: "squads-system", path: (s) => s.system && `squads/systems/${s.system}` },
  { key: "squads-assign", path: at("squads/assign") },
  { key: "squads-product", path: at("squads/products/fibre-ordering") },
  { key: "squads-squad", path: at("squads/squads/sales") },
  { key: "squads-person", path: at("squads/people/layla") },
  { key: "squads-tree", path: at("squads/tree") },
  { key: "squads-products", path: at("squads/products") },
  { key: "squads-squads", path: at("squads/squads") },
  { key: "squads-people", path: at("squads/people") },
  { key: "squads-history", path: at("squads/history") },
  { key: "requirement-knowledge", path: at("requirement-knowledge") },
  { key: "requirement-knowledge-requirements", path: at("requirement-knowledge/requirements") },
  { key: "requirement-knowledge-findings", path: at("requirement-knowledge/findings") },
  { key: "requirement-knowledge-historic", path: at("requirement-knowledge/historic") },
  { key: "not-found", path: at("no-such-page") },
];

type Named = { id: string; title?: string; name?: string | null; status?: string };

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { headers: OWNER });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

let cached: Promise<Seeded> | undefined;

/** The seed's documents and versions by their titles (scripts/seed_demo.py). */
export function seeded(): Promise<Seeded> {
  cached ??= (async () => {
    const [documents, releases, active] = await Promise.all([
      read<Named[]>("/library/documents?offset=0&limit=100"),
      read<Named[]>("/architecture-knowledge/releases"),
      read<(Named & { systems?: Named[]; business_capabilities?: Named[]; products?: Named[]; journeys?: Named[] }) | null>(
        "/architecture-knowledge/releases/active",
      ),
    ]);
    const byTitle = (word: string) => documents.find((document) => document.title?.includes(word))?.id;
    return {
      reviewDocument: byTitle("Product eligibility matrix"),
      serviceDocument: byTitle("XGPON coverage rules"),
      draft: releases.find((release) => release.status === "draft")?.id,
      replaced: releases.find((release) => release.status !== "draft" && release.id !== active?.id)?.id,
      system: active?.systems?.[0]?.id,
      concept: active?.business_capabilities?.[0]?.id,
      offering: active?.products?.[0]?.id,
      journey: active?.journeys?.[0]?.id,
    };
  })();
  return cached;
}
