import type { ReactNode } from "react";

import { type CataloguePageId, CatalogueHeader } from "./CatalogueHeader";

/**
 * A catalogue page whose body doesn't carry its own head (Landscape, Channels,
 * Compare, a cited passage): the catalogue's head, then the body.
 */
export function HeadedPage({ page, children }: { page: CataloguePageId; children: ReactNode }) {
  return (
    <>
      <CatalogueHeader page={page} />
      {children}
    </>
  );
}
