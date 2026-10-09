import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { channelById, offeringById, orderTypeByCode } from "./data/portfolio";

/**
 * The context bar's selection: product, order type and channel, kept in the
 * address so every view (and a shared link) shows the same lens.
 */
export type Scope = { product: string | null; order: string | null; channel: string | null };

const KEYS = ["product", "order", "channel"] as const;

export function useScope(): [Scope, (next: Partial<Scope>) => void] {
  const [params, setParams] = useSearchParams();
  const product = offeringById(params.get("product")) ? params.get("product") : null;
  const order = product && orderTypeByCode(params.get("order")) ? params.get("order") : null;
  const channel = product && channelById(params.get("channel")) ? params.get("channel") : null;
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
  return [{ product, order, channel }, set];
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
