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

/** A journey's flow, seen through a channel when it has one (its first, by default). */
export function journeyHref(journeyId: string, channel?: string | null): string {
  const query = channel ? `?${new URLSearchParams({ channel }).toString()}` : "";
  return `${LAB}/journeys/${encodeURIComponent(journeyId)}${query}`;
}

/** The first modelled journey of the first product: where "Journeys" and the lab bar lead. */
export function firstJourneyHref(data: CatalogueData, offeringId?: string): string {
  const journey = data.journeys.find((item) => !offeringId || item.offeringId === offeringId) ?? data.journeys[0];
  return journey ? journeyHref(journey.id, journey.channels[0]) : LAB;
}
