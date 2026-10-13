/**
 * The bundled Business Pro Plus sample (fixtures/smb-release.json, written from the
 * committed catalogue file by scripts/dump_catalogue_fixture.py). It is checked once on
 * the way in, so a sample of the wrong shape fails loudly instead of drawing nothing.
 */
import type { Release } from "../api/client";

/** The lists the screens read; each must be present, even when empty. */
const LISTS = ["systems", "relationships", "journeys", "products", "channels", "landscape_domains", "sources", "conflicts", "portfolio"] as const;

function isRelease(value: unknown): value is Release {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.revision === "number" && LISTS.every((key) => Array.isArray(record[key]));
}

/** The sample as a catalogue version, or an error that says what it lacks. */
export function asRelease(value: unknown): Release {
  if (isRelease(value)) return value;
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const missing = [
    ...(typeof record.id === "string" ? [] : ["id"]),
    ...(typeof record.revision === "number" ? [] : ["revision"]),
    ...LISTS.filter((key) => !Array.isArray(record[key])),
  ];
  throw new Error(`The catalogue sample isn't a catalogue version: it has no ${missing.join(", ")}.`);
}

/** The sample, fetched when it is first asked for (it never reaches the main bundle). */
export async function loadSampleRelease(): Promise<Release> {
  return asRelease((await import("./fixtures/smb-release.json")).default);
}
