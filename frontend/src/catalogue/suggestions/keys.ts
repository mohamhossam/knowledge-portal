/**
 * The keys suggestions provide and require ("system:cwom", "channel:business web"),
 * normalised as the service finds what they name.
 */

/** An offering's key: by id, code or name alike, without case, spaces or punctuation, as the service finds it. */
export const offeringKey = (reference: string) => `offering:${reference.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}`;

/** A business area's or portfolio node's keys: its id and its name, by their words, as the service finds a parent. */
export function nodeKeys(tree: "area" | "portfolio" | "realisation" | "source", ...references: string[]): string[] {
  return references.filter(Boolean).map((reference) => `${tree}:${reference.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}`);
}

/** An interface's keys: its id and its name, without case, as the service finds a relayed one. */
export function interfaceKeys(...references: string[]): string[] {
  return references.filter(Boolean).map((reference) => `interface:${reference.trim().toLowerCase()}`);
}

/**
 * A channel's keys: its id and its name, without case. A document names a channel as
 * it writes it ("Business Web"), and the service finds it by id or name alike.
 */
export function channelKeys(...references: string[]): string[] {
  return references.filter(Boolean).map((reference) => `channel:${reference.trim().toLowerCase()}`);
}
