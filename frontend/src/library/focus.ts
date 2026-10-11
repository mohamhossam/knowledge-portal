/**
 * A library review as questions (UX rebuild plan, phase 2): what needs the
 * reviewer comes first, the rest is accepted a sheet, slide or stretch at a
 * time. Pure functions over the document, its version and the working copy,
 * shared by the focus page and To do (which shows the count and the first).
 */
import type { LibraryDocument, LibraryVersion } from "../api/client";
import { type Drafts, type Row, type Warning, reviewRows } from "./model";
import { humanWhere, locationGroup, plural } from "./where";

export type ReviewQuestion =
  /** Warnings about the whole file that block approval: no exclusion clears them. */
  | { kind: "file-block"; id: string; messages: string[] }
  /** Notes about the whole file: read once, then carry on. */
  | { kind: "file-notes"; id: string; messages: string[] }
  /** A passage whose warning blocks approval until it is left out (or a new file comes). */
  | { kind: "block"; id: string; row: Row; warnings: Warning[] }
  /** A passage flagged by the reading: keep it or leave it out. */
  | { kind: "flag"; id: string; row: Row; warnings: Warning[] }
  /** The passages nothing flagged, a sheet, slide or stretch at a time; `phrase` names it inside a sentence. */
  | { kind: "group"; id: string; label: string; phrase: string; rows: Row[] };

/** Past this many passages with no sheet or slide to group them by, they come in stretches of this size. */
const STRETCH = 100;
/** Up to this many unflagged passages with nothing to group them by are one question. */
const ONE_GROUP = 60;

/**
 * The sheet, slide or page a passage sits on. A slide's passages sit under a "Slide text"
 * section the desk's location groups by, so the slide's own number is looked for first.
 */
export function placeOf(where: string): string {
  return /\b(?:Slide|Sheet|Page) \d+(?: \(hidden\))?/.exec(humanWhere(where))?.[0] ?? locationGroup(where);
}

/** Where a passage sits, without a section its slide or sheet already says ("Slide text › Slide 2, paragraph 1"). */
export function shortWhere(where: string): string {
  const human = humanWhere(where);
  const last = human.split(" › ").at(-1) ?? human;
  return /^(?:Slide|Sheet|Page) \d+/.test(last) ? last : human;
}

/** The unflagged passages, grouped: by sheet or slide where the file has them, else in stretches. */
type Group = { label: string; phrase: string; rows: Row[] };

function groupsOf(rows: Row[], all: number): Group[] {
  if (rows.length === 0) return [];
  const byPlace = new Map<string, Row[]>();
  for (const row of rows) {
    const name = placeOf(row.where);
    byPlace.set(name, [...(byPlace.get(name) ?? []), row]);
  }
  // Grouping means something when places hold more than one passage (the desk's "Select a location").
  const meaningful = byPlace.size > 1 && [...byPlace.values()].some((group) => group.length > 1) && byPlace.size < rows.length;
  if (meaningful) return [...byPlace.entries()].map(([label, group]) => ({ label, phrase: label, rows: group }));
  if (rows.length <= ONE_GROUP) {
    return [rows.length === all
      ? { label: "All passages", phrase: rows.length === 1 ? "its one passage" : "all its passages", rows }
      : { label: "The other passages", phrase: rows.length === 1 ? "the other passage" : "the other passages", rows }];
  }
  const stretches: Group[] = [];
  for (let start = 0; start < rows.length; start += STRETCH) {
    const stretch = rows.slice(start, start + STRETCH);
    const label = `${humanWhere(stretch[0]!.where)} to ${humanWhere(stretch.at(-1)!.where)}`;
    stretches.push({ label, phrase: label, rows: stretch });
  }
  return stretches;
}

/** The questions a review asks, in the order they are asked. */
export function reviewQuestions(document: LibraryDocument, version: LibraryVersion, drafts: Drafts): ReviewQuestion[] {
  const rows = reviewRows(document, version, drafts).filter((row) => row.draft);
  const file = version.warning_details.filter((warning) => !warning.block_id);
  const fileBlocking = file.filter((warning) => warning.severity === "blocking");
  const fileNotes = file.filter((warning) => warning.severity !== "blocking");
  const questions: ReviewQuestion[] = [];
  if (fileBlocking.length) questions.push({ kind: "file-block", id: "file-block", messages: fileBlocking.map((warning) => warning.message) });
  if (fileNotes.length) questions.push({ kind: "file-notes", id: "file-notes", messages: fileNotes.map((warning) => warning.message) });
  const flagged = rows.filter((row) => row.warnings.length > 0);
  // A blocking warning first, whether its passage is still in or already left out.
  for (const row of flagged.filter((each) => each.warnings.some((warning) => warning.severity === "blocking"))) {
    questions.push({ kind: "block", id: `block-${row.key}`, row, warnings: row.warnings });
  }
  for (const row of flagged.filter((each) => !each.warnings.some((warning) => warning.severity === "blocking"))) {
    questions.push({ kind: "flag", id: `flag-${row.key}`, row, warnings: row.warnings });
  }
  const rest = rows.filter((row) => row.warnings.length === 0);
  for (const group of groupsOf(rest, rows.length)) questions.push({ kind: "group", id: `group-${group.label}`, ...group });
  return questions;
}

/** A warning's message without the place it starts with, when the line names the place already. */
export function unplaced(message: string, where: string): string {
  for (const place of [where, humanWhere(where), shortWhere(where)]) {
    if (!message.startsWith(`${place}: `)) continue;
    const rest = message.slice(place.length + 2);
    return rest.charAt(0).toLocaleUpperCase() + rest.slice(1);
  }
  return message;
}

/** The first question that asks something: notes about the whole file are read, not answered. */
export function firstAsked(questions: ReviewQuestion[]): ReviewQuestion | undefined {
  return questions.find((question) => question.kind !== "file-notes") ?? questions[0];
}

/** A question as one line: To do shows the first one, so you know what you start on. */
export function questionLine(question: ReviewQuestion): string {
  switch (question.kind) {
    case "file-block":
      return `It can't be approved as it is: ${question.messages[0]}`;
    case "file-notes":
      return `A note about the whole file: ${question.messages[0]}`;
    case "block":
      return `${shortWhere(question.row.where)} blocks approval: ${unplaced(question.warnings[0]?.message ?? "", question.row.where)}`;
    case "flag":
      return `${shortWhere(question.row.where)} is flagged: ${unplaced(question.warnings[0]?.message ?? "", question.row.where)}`;
    case "group":
      return `Accept ${question.phrase} as read${question.rows.length > 1 ? ` (${plural(question.rows.length, "passage")})` : ""}`;
  }
}

/** How a group's passages stand now: kept as read, changed, new, or left out. */
export function groupTally(rows: Row[]) {
  return {
    kept: rows.filter((row) => row.draft?.included).length,
    out: rows.filter((row) => row.draft && !row.draft.included).length,
    changed: rows.filter((row) => row.change === "edited").length,
    added: rows.filter((row) => row.change === "new").length,
  };
}
