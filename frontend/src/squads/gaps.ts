import type { Organisation, Release } from "../api/client";

export type Gap = {
  system: Release["systems"][number];
  kind: "no-squad" | "no-contact";
  squad?: string;
};

/**
 * Ownership gaps (IA: Ownership › Gaps): systems in service that no squad
 * runs, or that a squad runs with no person in a contact seat.
 */
export function gaps(release: Release | null | undefined, organisation: Organisation | undefined): Gap[] {
  if (!release || !organisation) return [];
  const run = new Map<string, { squad: string; contact: string | null | undefined }>();
  for (const squad of organisation.squads) {
    for (const seat of squad.resources) {
      const known = run.get(seat.system_id);
      const contact = seat.role === "system_contact" ? seat.person_id : null;
      if (!known) run.set(seat.system_id, { squad: squad.name, contact });
      else if (!known.contact && contact) known.contact = contact;
    }
  }
  return release.systems
    .filter((system) => !run.has(system.id) || !run.get(system.id)?.contact)
    .map((system) => ({
      system,
      kind: run.has(system.id) ? "no-contact" : "no-squad",
      squad: run.get(system.id)?.squad,
    }));
}
