import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";

import { api } from "../api/client";
import { type Catalogue, catalogue } from "./catalogue";

/** What every catalogue page reads: the version, where its pages live, and who did what. */
export type CatalogueContext = {
  book: Catalogue;
  /** Where this version's pages live: "/architecture", or "/architecture/versions/:id". */
  base: string;
  inService: boolean;
  actorName: (actorId: string | null | undefined) => string;
};

export function useCatalogueContext() {
  return useOutletContext<CatalogueContext>();
}

/** The version in service, or the one named. */
export function useRelease(releaseId: string | undefined) {
  const active = useQuery({
    queryKey: ["architecture", "active"],
    queryFn: api.activeRelease,
  });
  const named = useQuery({
    queryKey: ["architecture", "releases", releaseId],
    queryFn: () => api.release(releaseId!),
    enabled: releaseId !== undefined,
  });
  const query = releaseId === undefined ? active : named;
  const book = useMemo(() => (query.data ? catalogue(query.data) : undefined), [query.data]);
  return { query, book, activeId: active.data?.id };
}

/** Who publishes the catalogue the platform ships with. */
const SEED_ACTOR = "packaged-seed";

export function useActorNames() {
  const actors = useQuery({ queryKey: ["identity", "actors"], queryFn: api.knownActors });
  return useMemo(() => {
    const names = new Map((actors.data ?? []).map((actor) => [actor.id, actor.display_name]));
    return (actorId: string | null | undefined) =>
      !actorId ? "someone" : actorId === SEED_ACTOR ? "the platform" : names.get(actorId) ?? actorId;
  }, [actors.data]);
}

export function useMappingImpact() {
  return useQuery({ queryKey: ["architecture", "mapping-impact"], queryFn: api.mappingImpact });
}

export function useReleases() {
  return useQuery({ queryKey: ["architecture", "releases"], queryFn: api.releases });
}

/** Puts a published version back in service; everything that read the old one reads again. */
export function useActivate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, rationale }: { releaseId: string; rationale: string }) => api.activateRelease(releaseId, rationale),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["architecture"] }),
  });
}
