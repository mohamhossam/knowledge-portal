/**
 * The impact lens: which TAM systems a product, channel and order type touch,
 * and why. Computed from the journeys' steps and integrations, so it can never
 * disagree with the flow.
 */
import { type CatalogueData, journeyViews } from "./adapter";
import { type Integration, type JourneyView, ROLE_RANK, type Step, type StepRole } from "./model";

export type Impacted = {
  systemId: string;
  /** Roles the system plays in the steps it performs, strongest first. */
  roles: StepRole[];
  steps: { journey: JourneyView; step: Step }[];
  integrations: { journey: JourneyView; integration: Integration }[];
  /** Only carries calls between others (an integration layer). */
  carriesOnly: boolean;
};

export type ImpactScope = { offeringId: string; orderType?: string | null; channel?: string | null };

export function impactOf(data: CatalogueData, scope: ImpactScope): { journeys: JourneyView[]; systems: Map<string, Impacted> } {
  const journeys = journeyViews(data, scope.offeringId, scope.orderType, scope.channel);
  const known = new Set(data.systems.map((system) => system.id));
  const systems = new Map<string, Impacted>();
  const entry = (id: string) => {
    let found = systems.get(id);
    if (!found) {
      found = { systemId: id, roles: [], steps: [], integrations: [], carriesOnly: false };
      systems.set(id, found);
    }
    return found;
  };
  for (const journey of journeys) {
    for (const step of journey.steps) {
      if (step.kind !== "task" || !known.has(step.lane)) continue;
      const item = entry(step.lane);
      item.steps.push({ journey, step });
      if (step.role && !item.roles.includes(step.role)) item.roles.push(step.role);
    }
    for (const integration of journey.integrations) {
      for (const id of [integration.from, integration.to, integration.via]) {
        if (!id || !known.has(id)) continue;
        entry(id).integrations.push({ journey, integration });
      }
    }
  }
  for (const item of systems.values()) {
    item.roles.sort((a, b) => ROLE_RANK.indexOf(a) - ROLE_RANK.indexOf(b));
    item.carriesOnly = item.steps.length === 0 && item.integrations.every(({ integration }) => integration.via === item.systemId);
  }
  return { journeys, systems };
}
