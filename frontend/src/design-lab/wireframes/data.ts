/**
 * Read-only queries for the wireframes, against the real seeded API. Nothing
 * in this file writes. Derivations follow docs/ux/ia/object-model.md.
 */
import { useQuery } from "@tanstack/react-query";

import { api, type LibraryDocument, type Organisation, type Release } from "../../api/client";
import { newestVersion, standing } from "../../library/model";

export function useDocuments() {
  return useQuery({ queryKey: ["wf", "documents"], queryFn: api.libraryDocuments });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: ["wf", "document", id], queryFn: () => api.libraryDocument(id) });
}

export function useReleases() {
  return useQuery({ queryKey: ["wf", "releases"], queryFn: api.releases });
}

export function useRelease(id: string | undefined) {
  return useQuery({ queryKey: ["wf", "release", id], queryFn: () => api.release(id!), enabled: Boolean(id) });
}

export function useActiveRelease() {
  return useQuery({ queryKey: ["wf", "active"], queryFn: api.activeRelease });
}

export function useSuggestions(id: string | undefined) {
  return useQuery({ queryKey: ["wf", "suggestions", id], queryFn: () => api.suggestions(id!), enabled: Boolean(id) });
}

export function useChanges(id: string | undefined, base?: string) {
  return useQuery({ queryKey: ["wf", "changes", id, base], queryFn: () => api.releaseChanges(id!, base), enabled: Boolean(id) });
}

export function useOrganisation() {
  return useQuery({ queryKey: ["wf", "organisation"], queryFn: api.organisation });
}

export function useReminders() {
  return useQuery({ queryKey: ["wf", "reminders"], queryFn: api.reminders });
}

export function useExplorerRelease() {
  return useQuery({ queryKey: ["wf", "explorer"], queryFn: api.explorerRelease });
}

/** Actor ids to names: releases record who published by id only. */
export function useActorName() {
  const actors = useQuery({ queryKey: ["wf", "actors"], queryFn: api.knownActors });
  return (id: string | null | undefined, fallback = "—") =>
    (id && actors.data?.find((actor) => actor.id === id)?.display_name) || id || fallback;
}

export function useDependencies(id: string) {
  return useQuery({ queryKey: ["wf", "deps", id], queryFn: () => api.dependencies(id, 0) });
}

/** One display state per document (object model: Document › States). */
export type DocState = "reading" | "review" | "service" | "withdrawn" | "attention" | "held" | "stopped" | "none";

export const DOC_STATE_WORDS: Record<DocState, string> = {
  reading: "Being read",
  review: "Ready for review",
  service: "In service",
  withdrawn: "Withdrawn",
  attention: "Needs attention",
  held: "Held",
  stopped: "Stopped",
  none: "Not in service",
};

export function docState(doc: LibraryDocument): DocState {
  const stage = newestVersion(doc)?.stage;
  if (stage === "failed") return "attention";
  if (stage === "quarantined") return "held";
  if (stage === "cancelled") return "stopped";
  if (stage === "queued" || stage === "scanning" || stage === "extracting") return "reading";
  if (stage === "ready_for_review" && !doc.publications.some((p) => p.version_id === newestVersion(doc)?.id && !p.withdrawn_at)) {
    const s = standing(doc);
    if (s.kind === "withdrawn") return "withdrawn";
    return "review";
  }
  const s = standing(doc);
  if (s.kind === "service" || s.kind === "indexing") return "service";
  if (s.kind === "withdrawn") return "withdrawn";
  return "none";
}

/** Gaps: systems in service with no squad, or a squad but no contact. */
export function gaps(release: Release | null | undefined, organisation: Organisation | undefined) {
  if (!release || !organisation) return [];
  const run = new Map<string, { squad: string; contact: string | null | undefined }>();
  for (const squad of organisation.squads) {
    for (const item of squad.systems) run.set(item.system_id, { squad: squad.name, contact: item.person_id });
  }
  return release.systems
    .filter((system) => !run.has(system.id) || !run.get(system.id)?.contact)
    .map((system) => ({
      system,
      kind: run.has(system.id) ? ("no-contact" as const) : ("no-squad" as const),
      squad: run.get(system.id)?.squad,
    }));
}

/** The squad that already runs other systems of the same product (Journey 3: the suggested squad). */
export function suggestedSquad(systemId: string, organisation: Organisation | undefined) {
  if (!organisation) return null;
  const product = organisation.products.find((item) => item.system_ids.includes(systemId));
  if (!product) return null;
  const counts = new Map<string, number>();
  for (const squad of organisation.squads) {
    const shared = squad.systems.filter((item) => product.system_ids.includes(item.system_id)).length;
    if (shared > 0) counts.set(squad.id, shared);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const squad = organisation.squads.find((item) => item.id === best[0])!;
  return { squad, product, shared: best[1] };
}
