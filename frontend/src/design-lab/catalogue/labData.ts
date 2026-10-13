/** The lab's catalogue: one version, read once, shared by every page of the lab. */
import { createContext, useContext } from "react";
import { useParams } from "react-router-dom";

import { LAB } from "../../app/features";
import type { Catalogue, Offering } from "../../architecture/model";

export { LAB };

export const LabData = createContext<Catalogue | null>(null);

export function useLabData(): Catalogue {
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
export function firstJourneyHref(data: Catalogue, offeringId?: string): string {
  const journey = data.journeys.find((item) => !offeringId || item.offeringId === offeringId) ?? data.journeys[0];
  return journey ? journeyHref(journey.id, journey.channels[0]) : LAB;
}

/** The product the address names, if this catalogue version has it. */
export function useOffering(): Offering | null {
  const data = useLabData();
  const { offeringId } = useParams();
  return data.offerings.find((item) => item.id === offeringId) ?? null;
}

/** True when the lab renders inside the portal's shell, which already provides the page's <main>. */
export const InShell = createContext(false);
