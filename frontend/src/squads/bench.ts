/**
 * What the Ownership workbench pages share (UX rebuild, phase 3): the
 * addresses of each record, and the list's filters kept in the address.
 */
import { useLocation, useSearchParams } from "react-router-dom";

const at = (base: string) => (id: string) => `${base}/${encodeURIComponent(id)}`;

/** Each record's own address in Ownership. */
export const href = {
  system: at("/squads/systems"),
  product: at("/squads/products"),
  squad: at("/squads/squads"),
  person: at("/squads/people"),
};

/** The list's filters, kept in the address: set a few at once, an empty value removes one. */
export function useListParams(): [URLSearchParams, (changes: Record<string, string | null>) => void] {
  const [params, setParams] = useSearchParams();
  const set = (changes: Record<string, string | null>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  return [params, set];
}

/** The address's query as it stands ("?show=none"), so a row's link keeps the list as filtered. */
export function useSearch(): string {
  return useLocation().search;
}

/** What a removal leaves for the list it returns to: a line saying what it did. */
export type Notice = { notice?: string } | null;
