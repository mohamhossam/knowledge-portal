/** The picked system and the interfaces between systems, shared by the Landscape and Systems pages. */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { CatalogueData } from "../../architecture/adapter";
import { allIntegrations, distinctInterfaces, links } from "./posterModel";

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

/** The links between systems, for the boards and the drawer: distinct interfaces by pair, so they hold for any product. */
export function useLinkCounts(data: CatalogueData) {
  const interfaces = useMemo(() => distinctInterfaces(allIntegrations(data)), [data]);
  const linkCounts = useMemo(() => links(data, interfaces), [data, interfaces]);
  return { interfaces, linkCounts };
}
