/**
 * The routes the e2e suites visit. Seeded ids are looked up from the API, by
 * the seed's own titles, so the keys stay stable across reseeds.
 *
 * `REDESIGNED` lists the route keys rebuilt on the design system. Each Phase 8
 * area adds its keys here, which brings them under the visual spec, and drops
 * them from `a11y-baseline.json` (they must have no serious or critical issues).
 */
import { apiUrl, OWNER } from "./env";

export type Seeded = {
  reviewDocument?: string;
  serviceDocument?: string;
  draft?: string;
  replaced?: string;
  system?: string;
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
  { key: "reminders", path: at("reminders") },
  // Dates are the seed's day: masked, so the screenshots hold on any later day.
  { key: "library", path: at("library"), mask: ["tbody td:last-child"] },
  // The offline search orders tied results differently from seed to seed: the list is masked.
  { key: "library-search", path: at("library/search?q=coverage"), mask: [".lib-results"] },
  { key: "library-review", path: (s) => s.reviewDocument && `library/${s.reviewDocument}`, viewOnly: true },
  { key: "library-document", path: (s) => s.serviceDocument && `library/${s.serviceDocument}`, mask: [".ds-provenance", ".lib-reconfirm__line", ".ds-facts dd:first-of-type"] },
  { key: "library-versions", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/versions`, mask: [".ds-provenance", ".lib-reconfirm__line", "tbody td:nth-child(3)", "tbody th"] },
  { key: "library-cited-by", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/cited-by`, mask: [".ds-provenance", ".lib-reconfirm__line"] },
  // The old address, kept working until area 10 makes it a redirect.
  { key: "library-citations", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/citations`, mask: [".ds-provenance", ".lib-reconfirm__line"] },
  { key: "library-ownership", path: (s) => s.serviceDocument && `library/${s.serviceDocument}/ownership`, mask: [".ds-provenance", ".lib-reconfirm__line", "tbody th"] },
  // The architecture catalogue, rebuilt from the SDD and the SMB reference (no seeded ids needed).
  { key: "architecture", path: at("architecture") },
  { key: "architecture-lens", path: at("architecture?product=business-pro-plus&order=NEW&channel=b2b-web&system=cwom") },
  { key: "architecture-portfolio", path: at("architecture/portfolio") },
  { key: "architecture-offering", path: at("architecture/offerings/business-pro-plus") },
  { key: "architecture-offering-journeys", path: at("architecture/offerings/business-pro-plus?tab=journeys") },
  { key: "architecture-journeys", path: at("architecture/journeys") },
  { key: "architecture-journey", path: at("architecture/journeys/bpp-new-digital") },
  { key: "architecture-journey-integrations", path: at("architecture/journeys/bpp-new-digital?tab=integrations") },
  { key: "architecture-journey-tracking", path: at("architecture/journeys/bpp-new-digital?tab=tracking") },
  { key: "architecture-systems", path: at("architecture/systems") },
  { key: "architecture-governance", path: at("architecture/governance") },
  { key: "architecture-versions", path: at("architecture/versions") },
  { key: "explorer", path: at("explorer") },
  { key: "squads", path: at("squads") },
  { key: "squads-squads", path: at("squads/squads") },
  { key: "squads-people", path: at("squads/people") },
  { key: "squads-history", path: at("squads/history") },
  { key: "requirement-knowledge", path: at("requirement-knowledge") },
  { key: "requirement-knowledge-requirements", path: at("requirement-knowledge/requirements") },
  { key: "requirement-knowledge-findings", path: at("requirement-knowledge/findings") },
  { key: "requirement-knowledge-historic", path: at("requirement-knowledge/historic") },
  { key: "not-found", path: at("no-such-page") },
];

/** Route keys rebuilt on the design system (Phase 8 adds to this, area by area). */
export const REDESIGNED: string[] = [
  "home",
  // Area 2: the library.
  "library",
  "library-search",
  "library-review",
  "library-document",
  "library-versions",
  "library-cited-by",
  "library-citations",
  "library-ownership",
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
      read<(Named & { systems?: Named[] }) | null>("/architecture-knowledge/releases/active"),
    ]);
    const byTitle = (word: string) => documents.find((document) => document.title?.includes(word))?.id;
    return {
      reviewDocument: byTitle("Product eligibility matrix"),
      serviceDocument: byTitle("XGPON coverage rules"),
      draft: releases.find((release) => release.status === "draft")?.id,
      replaced: releases.find((release) => release.status !== "draft" && release.id !== active?.id)?.id,
      system: active?.systems?.[0]?.id,
    };
  })();
  return cached;
}
