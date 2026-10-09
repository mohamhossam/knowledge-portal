/** The lab's catalogue: one version, read once, shared by the four mock-ups. */
import { createContext, useContext } from "react";

import type { CatalogueData } from "../../architecture/adapter";

export const LAB = "/design-lab/catalogue";

export const LabData = createContext<CatalogueData | null>(null);

export function useLabData(): CatalogueData {
  const data = useContext(LabData);
  if (!data) throw new Error("useLabData outside the catalogue lab");
  return data;
}
