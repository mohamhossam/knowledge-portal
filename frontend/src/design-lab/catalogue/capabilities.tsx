/**
 * What each bundle component does for the customer, by keyword, so any
 * product's components group the same way: connectivity, security, in the
 * office, run and manage, resilience. The grouping is this catalogue's
 * reading, not the source's; anything it cannot place is "More".
 */
import type { ReactNode } from "react";

import type { CatalogueData } from "../../architecture/adapter";

export const CAPABILITIES: { id: string; name: string; blurb: string; test: RegExp; icon: ReactNode }[] = [
  {
    id: "connect",
    name: "Connectivity",
    blurb: "Getting the site online",
    test: /gpon|fibre|fiber|broadband|internet|static ip|\bip\b/i,
    icon: <path d="M2 6.5a9 9 0 0 1 12 0M4.2 9a5.6 5.6 0 0 1 7.6 0M6.4 11.4a2.3 2.3 0 0 1 3.2 0M8 13.6h.01" />,
  },
  {
    id: "secure",
    name: "Security",
    blurb: "Protecting the network",
    test: /firewall|sd-?wan|secur|utm/i,
    icon: (
      <>
        <path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.6-5.5 7-3.2-1.4-5.5-3.8-5.5-7v-4z" />
        <path d="m5.5 8 1.8 1.8L10.8 6.3" />
      </>
    ),
  },
  {
    id: "office",
    name: "In the office",
    blurb: "Wi-Fi where people work",
    test: /access point|fortiap|wi-?fi|\bap\b/i,
    icon: (
      <>
        <rect x="3" y="10" width="10" height="3.5" rx="1" />
        <path d="M4.5 7.5a5 5 0 0 1 7 0M2.5 5.2a8 8 0 0 1 11 0" />
      </>
    ),
  },
  {
    id: "manage",
    name: "Run and manage",
    blurb: "Seeing and running the service",
    test: /portal|monitor|self-?service|report|manage/i,
    icon: (
      <>
        <rect x="2" y="2.5" width="12" height="8.5" rx="1.2" />
        <path d="M6 14h4M8 11v3M4.5 8l2-2 2 1.5 3-3" />
      </>
    ),
  },
  {
    id: "resilience",
    name: "Resilience",
    blurb: "Staying online when the fibre is down",
    test: /backup|failover|redundan|resilien/i,
    icon: <path d="M13 6.2A5 5 0 0 0 4 4.6M3 9.8a5 5 0 0 0 9 1.6M4 1.8v3h3M12 14.2v-3H9" />,
  },
];

export const DEVICE_ICON = (
  <>
    <rect x="1.5" y="8" width="13" height="5" rx="1.2" />
    <path d="M4 8V4.5M12 8V4.5M4.5 10.5h.01M7 10.5h.01M9.5 10.5h3" />
  </>
);

/** The capability a component belongs to, or undefined. */
export function capabilityOf(name: string) {
  return CAPABILITIES.find((item) => item.test.test(name));
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

/** The kinds of bundle part, in the order a bundle reads: the device first, anything unplaced last. */
export const PART_KINDS: { id: string; name: string; icon: ReactNode }[] = [
  { id: "device", name: "At the heart", icon: DEVICE_ICON },
  ...CAPABILITIES.map(({ id, name, icon }) => ({ id, name, icon })),
  { id: "more", name: "More", icon: <path d="M3 8h.01M8 8h.01M13 8h.01" /> },
];

/** A component's kind: the device by its name, else its capability, else "More". */
export function partKind(name: string): string {
  return /device|router/i.test(name) ? "device" : (capabilityOf(name)?.id ?? "more");
}

export type Part = { component: string; product: string; responsibility: string };

/** Every system's parts, by kind, across all products. */
export function systemParts(data: CatalogueData): Map<string, Map<string, Part[]>> {
  const result = new Map<string, Map<string, Part[]>>();
  for (const offering of data.offerings)
    for (const component of offering.components)
      for (const item of component.systems) {
        const kinds = result.get(item.systemId) ?? new Map<string, Part[]>();
        const kind = partKind(component.name);
        kinds.set(kind, [...(kinds.get(kind) ?? []), { component: component.name, product: offering.name, responsibility: item.responsibility }]);
        result.set(item.systemId, kinds);
      }
  return result;
}
