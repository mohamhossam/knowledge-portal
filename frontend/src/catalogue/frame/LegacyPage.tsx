import type { ReactNode } from "react";

import { type CataloguePageId, CatalogueHeader } from "./CatalogueHeader";

/**
 * A catalogue page not rebuilt yet (Landscape, Channels, Compare, a
 * cited passage): the new head over its old body, which keeps the Timetable
 * Book look in the legacy island until its area moves (docs/ux/backlog.md).
 */
export function LegacyPage({ page, first, children }: {
  page: CataloguePageId;
  /** Rebuilt on the design system already: shown under the head, before the old body. */
  first?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <CatalogueHeader page={page} />
      {first}
      <div className="ds-legacy cat-legacy">
        <section className="docpage catalogue" aria-label="Page contents">
          {children}
        </section>
      </div>
    </>
  );
}
