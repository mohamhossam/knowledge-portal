/**
 * What the adapter reads from prose and naming conventions, parsed here, once, and tested,
 * for a catalogue version saved before the service sent the field that says it:
 * - a proposition's summary and purpose, from its paragraphs (newer versions carry `purpose`);
 * - a question's title and detail, from "title: detail" (newer versions carry `title`);
 * - for a catalogue version saved before the service sent them, the delivery drop (from
 *   "Delivered in drop …" in an order type's description) and the cross-cutting domains
 *   (from their ids in `BAND_DOMAINS`). Newer versions carry `delivery_drop` and
 *   `cross_cutting`, and the adapter reads those.
 */

/** The cross-cutting TAM domains, for a catalogue version that marks none. */
export const BAND_DOMAINS: readonly string[] = ["enterprise", "integration"];

/*
 * Where TAM's layers sit on the map. The order is the version's own (its landscape
 * domains, top to bottom); these say only where TAM draws two kinds of layer.
 */
/** The integration layer: the bus, drawn just under the last customer-facing layer. */
export const BUS_DOMAIN = "integration";
/** The last layer above the bus: TAM's customer domain. */
export const ABOVE_BUS_DOMAIN = "customer";
/** The layers drawn last, side by side (in the compact map, in a column beside it). */
export const SIDE_DOMAINS: readonly string[] = ["engaged-party", "enterprise"];
/** A layer with this many groups or more takes a row of its own; narrower ones share a row in pairs. */
export const WIDE_LAYER_GROUPS = 4;

const DROP = /\s*Delivered in drop ([^.]+)\./;

/** An order type's description, and the delivery drop it names ("Delivered in drop P2 / P3."), taken out of it. */
export function parseDrop(description: string | null | undefined): { drop?: string; note: string } {
  const text = description ?? "";
  const found = DROP.exec(text);
  return { ...(found ? { drop: found[1] } : {}), note: text.replace(DROP, "") };
}

/** A proposition: its first paragraph is the summary, the rest its purpose. */
export function parseProposition(text: string | null | undefined): { summary: string; purpose: string } {
  const [summary = "", ...purpose] = (text ?? "").split("\n\n");
  return { summary, purpose: purpose.join("\n\n") };
}

/** A question as "title: detail"; a title with no colon keeps the whole text. */
export function parseQuestion(text: string): { title: string; detail: string } {
  const at = text.indexOf(": ");
  return at > 0 ? { title: text.slice(0, at), detail: text.slice(at + 2) } : { title: text, detail: "" };
}
