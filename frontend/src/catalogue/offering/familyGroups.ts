import type { Offering } from "../../api/client";

export type FamilyGroup = { id: string; label: string | null; offerings: Offering[]; /** Rows name their own family: the group gathers families of one offering. */ mixed: boolean };

const byName = (a: Offering, b: Offering) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/**
 * Offerings by family, the one order the list and the side-by-side table share: a family of
 * two or more under its own name, A to Z; the families of one offering together under
 * "Other families", each row naming its own, so a heading never stands over a single row;
 * then those with no family stated. Within a group, by name.
 */
export function familyGroups(offerings: readonly Offering[]): FamilyGroup[] {
  const sizes = new Map<string, number>();
  for (const offering of offerings) if (offering.family) sizes.set(offering.family, (sizes.get(offering.family) ?? 0) + 1);
  const named = [...sizes.entries()]
    .filter(([, size]) => size > 1)
    .map(([family]) => family)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const groups: FamilyGroup[] = named.map((family) => ({ id: family, label: family, offerings: offerings.filter((offering) => offering.family === family).sort(byName), mixed: false }));
  const single = offerings.filter((offering) => offering.family && sizes.get(offering.family) === 1).sort(byName);
  // Only one family of one offering: it keeps its own name, not "Other families".
  if (single.length === 1) groups.push({ id: single[0]!.family!, label: single[0]!.family!, offerings: single, mixed: false });
  else if (single.length) groups.push({ id: "other", label: "Other families", offerings: single, mixed: true });
  const none = offerings.filter((offering) => !offering.family).sort(byName);
  if (none.length) groups.push({ id: "none", label: null, offerings: none, mixed: false });
  return groups;
}
