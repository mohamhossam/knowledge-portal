import type { Release } from "../api/client";
import { entityNames } from "./ontology";

export type SharedOwner = { id: string; name: string; note: string | null };
export type SharedEntity = { id: string; name: string; owners: SharedOwner[]; unexplained: number };

/**
 * Information entities more than one system in service is the system of record for
 * (ADR-0123), each with what every owner says it masters. Sharing is allowed; an owner
 * without a note is a reminder, never a refusal.
 */
export function sharedMastery(release: Release): SharedEntity[] {
  const names = entityNames(release);
  const owners = new Map<string, SharedOwner[]>();
  for (const system of release.systems) {
    if (system.deprecated) continue;
    for (const entity of system.masters ?? []) {
      const note = (system.mastery_notes ?? []).find((item) => item.entity_id === entity)?.note ?? null;
      owners.set(entity, [...(owners.get(entity) ?? []), { id: system.id, name: system.name, note }]);
    }
  }
  return [...owners]
    .filter(([, list]) => list.length > 1)
    .map(([id, list]) => ({ id, name: names.get(id) ?? id, owners: list, unexplained: list.filter((owner) => !owner.note).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
