import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { api, type Release } from "../api/client";
import { type CatalogueData, fromRelease } from "./adapter";

/**
 * Which catalogue version the views read: the one named in the address
 * (?version=), else the draft being prepared, else the version in service.
 */
export function useCatalogueQuery() {
  const [params] = useSearchParams();
  const releases = useQuery({ queryKey: ["architecture", "releases"], queryFn: api.releases });
  const asked = params.get("version");
  const list: Release[] = releases.data ?? [];
  const chosen = list.find((item) => item.id === asked) ?? list.find((item) => item.status === "draft") ?? list.find((item) => item.status === "published");
  const release = useQuery({
    queryKey: ["architecture", "release", chosen?.id],
    queryFn: () => api.release(chosen!.id),
    enabled: Boolean(chosen),
  });
  const data = useMemo(() => (release.data ? fromRelease(release.data) : null), [release.data]);
  return {
    data,
    releases: list,
    pending: releases.isPending || (Boolean(chosen) && release.isPending),
    error: releases.error ?? release.error ?? null,
    empty: releases.isSuccess && !chosen,
    retry: () => {
      void releases.refetch();
      void release.refetch();
    },
  };
}

const CatalogueContext = createContext<{ data: CatalogueData; releases: Release[] } | null>(null);

export const CatalogueProvider = CatalogueContext.Provider;

/** The catalogue version in view; only under a loaded frame. */
export function useCatalogue(): CatalogueData {
  const value = useContext(CatalogueContext);
  if (!value) throw new Error("useCatalogue is used outside a loaded catalogue frame.");
  return value.data;
}

export function useCatalogueReleases(): Release[] {
  return useContext(CatalogueContext)?.releases ?? [];
}
