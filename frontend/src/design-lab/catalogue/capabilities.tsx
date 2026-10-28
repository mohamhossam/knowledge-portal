/**
 * What each bundle component does for the customer: its kind, a component_kind term of the
 * version's vocabulary (connectivity, security, in the office…), in the vocabulary's order. A
 * kind's icon follows its code (notation); a kind with another code, or none, has a plain one.
 * A part the version gives no kind is "More".
 */
import type { ReactNode } from "react";

import type { Catalogue, Component } from "../../catalogue/model/model";

export const DEVICE_ICON = (
  <>
    <rect x="1.5" y="8" width="13" height="5" rx="1.2" />
    <path d="M4 8V4.5M12 8V4.5M4.5 10.5h.01M7 10.5h.01M9.5 10.5h3" />
  </>
);

/** The icon for each kind code the lab draws; any other kind gets PLAIN_ICON. */
const KIND_ICONS: Record<string, ReactNode> = {
  DEV: DEVICE_ICON,
  CONN: <path d="M2 6.5a9 9 0 0 1 12 0M4.2 9a5.6 5.6 0 0 1 7.6 0M6.4 11.4a2.3 2.3 0 0 1 3.2 0M8 13.6h.01" />,
  SEC: (
      <>
        <path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.6-5.5 7-3.2-1.4-5.5-3.8-5.5-7v-4z" />
        <path d="m5.5 8 1.8 1.8L10.8 6.3" />
      </>
    ),
  WIFI: (
      <>
        <rect x="3" y="10" width="10" height="3.5" rx="1" />
        <path d="M4.5 7.5a5 5 0 0 1 7 0M2.5 5.2a8 8 0 0 1 11 0" />
      </>
    ),
  MGMT: (
      <>
        <rect x="2" y="2.5" width="12" height="8.5" rx="1.2" />
        <path d="M6 14h4M8 11v3M4.5 8l2-2 2 1.5 3-3" />
      </>
    ),
  RESIL: <path d="M13 6.2A5 5 0 0 0 4 4.6M3 9.8a5 5 0 0 0 9 1.6M4 1.8v3h3M12 14.2v-3H9" />,
};

const PLAIN_ICON = <path d="M4 8h8" />;

export type PartKind = { id: string; name: string; blurb: string; icon: ReactNode };

/** The parts the version gives no kind. */
export const MORE: PartKind = { id: "more", name: "More", blurb: "Other parts of the bundle", icon: <path d="M3 8h.01M8 8h.01M13 8h.01" /> };

/** The kinds of bundle part, in the version's order, then "More". */
export function partKinds(data: Pick<Catalogue, "componentKinds">): PartKind[] {
  return [
    ...data.componentKinds.map((kind) => ({ id: kind.id, name: kind.name, blurb: kind.blurb, icon: (kind.code && KIND_ICONS[kind.code]) || PLAIN_ICON })),
    MORE,
  ];
}

/** A component's kind, or "More" when the version gives it none (or one its vocabulary lacks). */
export function kindOf(data: Pick<Catalogue, "componentKinds">, component: Pick<Component, "kind">): PartKind {
  return partKinds(data).find((kind) => kind.id === component.kind) ?? MORE;
}

/** A component's short name: without its brackets or a trailing "on the …". */
export function shortComponentName(name: string): string {
  return (
    name
      .replace(/\s*\(.*?\)/g, "")
      .replace(/\s+on the .*$/i, "")
      .trim() || name
  );
}

export type Part = { component: string; product: string; responsibility: string };

/** Every system's parts, by kind, across all products. */
export function systemParts(data: Catalogue): Map<string, Map<string, Part[]>> {
  const result = new Map<string, Map<string, Part[]>>();
  for (const offering of data.offerings)
    for (const component of offering.components)
      for (const item of component.systems) {
        const kinds = result.get(item.systemId) ?? new Map<string, Part[]>();
        const kind = kindOf(data, component).id;
        kinds.set(kind, [...(kinds.get(kind) ?? []), { component: component.name, product: offering.name, responsibility: item.responsibility }]);
        result.set(item.systemId, kinds);
      }
  return result;
}
