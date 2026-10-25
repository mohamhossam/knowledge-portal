/**
 * The keys suggestions provide and require ("system:cwom", "channel:business web"),
 * normalised as the service finds what they name.
 */

/** An offering's key: by id, code or name alike, without case, spaces or punctuation, as the service finds it. */
export const offeringKey = (reference: string) => `offering:${reference.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}`;

type Layer = "cfs" | "rfs" | "resource";

/** The layers a record in each layer is realised by: the ones below it, as the service finds them. */
const BELOW: Record<Layer, Layer[]> = { cfs: ["rfs", "resource"], rfs: ["resource"], resource: [] };

/**
 * A realisation record's keys: its id and names, once for each layer above its own, as it can
 * only realise a record in a layer above it ("realisation:ddosucpecfs@cfs" is never provided).
 */
export function realisationKeys(layer: Layer, ...references: string[]): string[] {
  const above = (Object.keys(BELOW) as Layer[]).filter((upper) => BELOW[upper].includes(layer));
  return nodeKeys("realisation", ...references).flatMap((key) => above.map((upper) => `${key}@${upper}`));
}

/** What realises a record in `layer`, in words: "a resource" for an RFS. */
export const BELOW_WORDS: Record<Layer, string> = { cfs: "an RFS or a resource", rfs: "a resource", resource: "nothing" };

/** The key a record in `layer` needs for what realises it: that reference, in a layer below. */
export function realisedByKey(layer: Layer, reference: string): string[] {
  return nodeKeys("realisation", reference).map((key) => `${key}@${layer}`);
}

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
