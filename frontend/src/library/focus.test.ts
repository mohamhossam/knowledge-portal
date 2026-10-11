import { describe, expect, it } from "vitest";

import type { LibraryDocument, LibraryVersion } from "../api/client";
import { firstAsked, groupTally, placeOf, questionLine, reviewQuestions } from "./focus";
import { type Block, type Warning, initialDrafts } from "./model";

const amina = { id: "fake-owner", display_name: "Amina Owner", email: null };

const block = (id: string, ordinal: number, label: string, section_path: string[] = []): Block => ({
  id, ordinal, text: `Text ${id}`, kind: "paragraph", label, section_path, content_fingerprint: `fp-${id}`, asset_id: null,
} as Block);

const warning = (block_id: string | null, severity: "blocking" | "warning", message: string): Warning =>
  ({ block_id, severity, message, code: "c" }) as Warning;

function version(blocks: Block[], warning_details: Warning[] = []): LibraryVersion {
  return {
    id: "v1", number: 1, blocks, stage: "ready_for_review", revisions: [], warning_details,
    blocking_warnings: warning_details.filter((each) => each.severity === "blocking").map((each) => each.message),
    warnings: [], uploaded_at: "2026-10-01T09:00:00Z", uploaded_by: amina, filename: "f",
  } as unknown as LibraryVersion;
}

const document = (v: LibraryVersion) => ({
  id: "doc", title: "Doc", owner: amina, versions: [v], version: 1, publications: [], published_id: null,
  can_edit: true, is_owner: true, review_fingerprint: null, build_fingerprint: null,
}) as unknown as LibraryDocument;

const ask = (v: LibraryVersion) => reviewQuestions(document(v), v, initialDrafts(v));

describe("reviewQuestions", () => {
  it("asks what needs the reviewer first: the whole file, then what blocks, then what is flagged, then the rest", () => {
    const v = version(
      [block("a", 1, "Line 1"), block("b", 2, "Line 2"), block("c", 3, "Line 3"), block("d", 4, "Line 4")],
      [warning(null, "warning", "Read as plain text."), warning("c", "warning", "Looks cut off."), warning("b", "blocking", "Line 2: Unsupported graphic.")],
    );
    const questions = ask(v);
    expect(questions.map((item) => item.kind)).toEqual(["file-notes", "block", "flag", "group"]);
    expect(questions.map(questionLine)).toEqual([
      "A note about the whole file: Read as plain text.",
      "Line 2 blocks approval: Unsupported graphic.",
      "Line 3 is flagged: Looks cut off.",
      "Accept the other passages as read (2 passages)",
    ]);
    // To do names the first question that asks something: a note is only read.
    expect(firstAsked(questions)?.kind).toBe("block");
  });

  it("puts a blocking note about the whole file before anything else", () => {
    const v = version([block("a", 1, "Line 1")], [warning(null, "blocking", "The file is encrypted.")]);
    expect(ask(v).map((item) => item.kind)).toEqual(["file-block", "group"]);
    expect(questionLine(ask(v)[1]!)).toBe("Accept its one passage as read");
  });

  it("groups by sheet or slide where the file has them", () => {
    const sheet = version([
      block("h", 1, "Worksheet 1", ["Worksheet 1"]),
      block("r2", 2, "Worksheet 1!2:2", ["Worksheet 1"]),
      block("s2", 3, "Worksheet 2!2:2", ["Worksheet 2"]),
      block("s3", 4, "Worksheet 2!3:3", ["Worksheet 2"]),
    ]);
    expect(ask(sheet).map((item) => item.kind === "group" && [item.label, item.rows.length])).toEqual([["Sheet 1", 2], ["Sheet 2", 2]]);
    // A slide's passages sit under a "Slide text" section: the slide's own number groups them.
    expect(placeOf("Slide text › Slide 2, paragraph 1")).toBe("Slide 2");
    expect(placeOf("Sheet 1 (hidden), row 4")).toBe("Sheet 1 (hidden)");
  });

  it("takes a long file with nothing to group it by in stretches", () => {
    const v = version(Array.from({ length: 250 }, (_, at) => block(`b${at + 1}`, at + 1, `Line ${at + 1}`)));
    const groups = ask(v);
    expect(groups.map((item) => item.kind === "group" && item.label)).toEqual(["Line 1 to Line 100", "Line 101 to Line 200", "Line 201 to Line 250"]);
  });

  it("tallies how a group's passages stand", () => {
    const v = version([block("a", 1, "Line 1"), block("b", 2, "Line 2")]);
    const drafts = { ...initialDrafts(v), b: { text: "Text b", included: false, reason: "Out of date." } };
    const [group] = reviewQuestions(document(v), v, drafts);
    expect(group?.kind === "group" && groupTally(group.rows)).toEqual({ kept: 1, out: 1, changed: 0, added: 0 });
  });
});
