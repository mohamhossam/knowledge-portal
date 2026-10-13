/**
 * Where the catalogue lab reads its catalogue. By default, the API's version in
 * service (`/architecture-knowledge/releases/active`), the same one the rest of
 * the portal reads. The lab's "Data source" switch turns to the bundled Business
 * Pro Plus sample (fixtures/smb-release.json) and back, to compare the two; a
 * reload returns to the default. `VITE_CATALOGUE_SOURCE=sample` makes the sample
 * the default, for working with no service.
 */
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";

import { api } from "../../api/client";
import { catalogueSourceSetting } from "../../app/features";
import { fromRelease } from "../../architecture/adapter";
import type { Catalogue } from "../../architecture/model";
import { loadSampleRelease } from "../../architecture/sample";

export type CatalogueSource = "api" | "sample";

/** The configured source (features.ts): "sample" only when asked for by name; anything else reads the API. */
export function catalogueSource(value: unknown = catalogueSourceSetting): CatalogueSource {
  return value === "sample" ? "sample" : "api";
}

/** The source the lab reads now, and the way to switch it (the lab's "Data source" switch). */
export const LabSource = createContext<{ source: CatalogueSource; setSource: (source: CatalogueSource) => void } | null>(null);

export function useLabSource() {
  return useContext(LabSource);
}

export type LabCatalogue =
  | { state: "loading" }
  | { state: "error"; error: unknown; retry: () => void }
  | { state: "empty" }
  | { state: "ready"; data: Catalogue; source: CatalogueSource };

export function useLabCatalogue(source: CatalogueSource): LabCatalogue {
  const live = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease, enabled: source === "api" });
  const bundled = useQuery({ queryKey: ["catalogue-lab", "sample"], queryFn: loadSampleRelease, enabled: source === "sample", staleTime: Infinity });
  const query = source === "sample" ? bundled : live;
  const data = useMemo(() => (query.data ? fromRelease(query.data) : null), [query.data]);
  if (data) return { state: "ready", data, source };
  if (query.isError) return { state: "error", error: query.error, retry: () => void query.refetch() };
  if (query.isPending) return { state: "loading" };
  return { state: "empty" };
}
