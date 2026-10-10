/** The picked system and the links between systems, shared by the Landscape and Systems pages. */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { CatalogueData } from "../../architecture/adapter";
import { allIntegrations, links } from "./posterModel";

/** The picked system, from `?system=`, and a setter that keeps the rest of the URL. */
export function useSystemParam(): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params);
      if (id) next.set("system", id);
      else next.delete("system");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  return [params.get("system"), select];
}

/** The links between systems, counted by pair, for the boards and the drawer. */
export function useLinkCounts(data: CatalogueData) {
  const integrations = useMemo(() => allIntegrations(data), [data]);
  const linkCounts = useMemo(() => links(data, integrations), [data, integrations]);
  return { integrations, linkCounts };
}
