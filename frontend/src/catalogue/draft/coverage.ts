import { useQuery } from "@tanstack/react-query";

import { api, type CatalogueCoverage, type Release } from "../../api/client";

/** What the draft holds that nothing links to (review recommendation 17), at its revision. */
export function useCoverage(release: Release) {
  return useQuery({
    queryKey: ["architecture", "releases", release.id, "coverage", release.revision],
    queryFn: () => api.coverage(release.id),
  });
}

type OrphanKind = {
  key: keyof CatalogueCoverage;
  title: string;
  /** How each is settled, where it is done. */
  settle: string;
  /** Whether an item opens its system's page: its own for a system, its owner's otherwise. */
  onSystem: "self" | "owner" | null;
};

/** Each kind of orphan, in the order a curator settles them: what selects systems first. */
export const ORPHAN_KINDS: readonly OrphanKind[] = [
  {
    key: "unlinked_capabilities",
    title: "Capabilities with no concept",
    settle: "On its system’s page, link each to the business capability it delivers, or say why none fits.",
    onSystem: "owner",
  },
  {
    key: "unplaced_systems",
    title: "Systems outside the landscape",
    settle: "On the system’s page, place it in a landscape domain.",
    onSystem: "self",
  },
  {
    key: "unconsumed_interfaces",
    title: "Interfaces nobody consumes",
    settle: "On its system’s page, name the systems that call or receive it, or link a journey step to it; or remove it.",
    onSystem: "owner",
  },
  {
    key: "unused_terms",
    title: "Terms nothing names",
    settle: "Link a field to it, or retire it in the catalogue file’s Vocabulary sheet.",
    onSystem: null,
  },
];

export const orphanTotal = (found: CatalogueCoverage) =>
  ORPHAN_KINDS.reduce((total, kind) => total + found[kind.key].length, 0);
