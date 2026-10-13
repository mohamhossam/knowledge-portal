/**
 * What the adapter reads from prose and naming conventions, because the service
 * has no field for it yet. Each one is parsed here, once, and tested; a field
 * from the service would replace it:
 * - the delivery drop, from "Delivered in drop …" in an order type's description;
 * - a proposition's summary and purpose, from its paragraphs;
 * - a question's title and detail, from "title: detail";
 * - the bands under the TAM map, from the domain ids in `BAND_DOMAINS`;
 * - the main track and the error tracks a flow ends on, from activity track names.
 */
import type { TrackKind } from "./model";

/** The TAM domains drawn as bands beneath the domain columns (cross-cutting). */
export const BAND_DOMAINS: readonly string[] = ["enterprise", "integration"];

/** The track an activity is on when its source names none. */
export const MAIN_TRACK = "MAIN";

/** Tracks whose last step ends the flow in error (BPMN error end event). */
export const ERROR_END_TRACKS: readonly string[] = ["CORRECTION"];

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

/** What a track is: the main one (also when none is named), an error track, or another side track. */
export function trackKind(track: string | null | undefined): TrackKind {
  const name = (track ?? "").toUpperCase();
  if (!name || name === MAIN_TRACK) return "main";
  return ERROR_END_TRACKS.includes(name) ? "error" : "side";
}
