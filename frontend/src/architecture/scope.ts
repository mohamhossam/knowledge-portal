import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import type { Catalogue } from "./model";

/**
 * The context bar's selection: version, product, order type and channel, kept
 * in the address so every view (and a shared link) shows the same lens.
 */
export type Scope = { version: string | null; product: string | null; order: string | null; channel: string | null };

const KEYS = ["version", "product", "order", "channel"] as const;

/** The lens as the address says it, keeping only what the catalogue in view knows. */
export function useScope(data?: Catalogue): [Scope, (next: Partial<Scope>) => void] {
  const [params, setParams] = useSearchParams();
  const offering = data?.offerings.find((item) => item.id === params.get("product"));
  const known = !data || Boolean(offering);
  const product = known ? params.get("product") : null;
  const order = product && (!offering || offering.orderTypes.some((type) => type.code === params.get("order"))) ? params.get("order") : null;
  const channel = product && (!data || data.channels.some((item) => item.id === params.get("channel"))) ? params.get("channel") : null;
  const set = useCallback(
    (next: Partial<Scope>) =>
      setParams(
        (previous) => {
          const merged = new URLSearchParams(previous);
          for (const key of KEYS) {
            if (!(key in next)) continue;
            const value = next[key];
            if (value) merged.set(key, value);
            else merged.delete(key);
          }
          // A narrower choice can't outlive the product it belongs to.
          if (!merged.get("product")) {
            merged.delete("order");
            merged.delete("channel");
          }
          return merged;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [{ version: params.get("version"), product, order, channel }, set];
}

/** A page about one product (or one of its journeys) puts it in the lens when the lens is empty. */
export function useImpliedScope(implied: Partial<Scope>) {
  const [scope, setScope] = useScope();
  const product = implied.product ?? null;
  const order = implied.order ?? null;
  useEffect(() => {
    if (!product || scope.product) return;
    setScope({ product, ...(order ? { order } : {}) });
  }, [product, order, scope.product, setScope]);
}

/** The scope as a query string, so links between views keep the lens. */
export function scopeQuery(scope: Scope): string {
  const params = new URLSearchParams();
  for (const key of KEYS) if (scope[key]) params.set(key, scope[key] as string);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** A link's address with the lens kept and extra parameters added. */
export function withScope(path: string, scope: Scope, extra: Record<string, string | null | undefined> = {}): string {
  const params = new URLSearchParams(scopeQuery(scope).slice(1));
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}
