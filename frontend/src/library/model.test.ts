import { describe, expect, it } from "vitest";

import type { LibraryDocument, LibraryVersion } from "../api/client";
import {
  approvalBlocker, awaitingReview, comparisonBasis, counts, initialDrafts, isTheEdition, matches, nextToReview, reviewBody, reviewRows, saveProblems,
  standing, unsaved, type Block,
} from "./model";

const amina = { id: { value: "fake-owner" }, display_name: "Amina Owner", email: null };

const block = (id: string, ordinal: number, text: string | null, extra: Partial<Block> = {}): Block => ({
  id, ordinal, text, kind: text === null ? "image" : "paragraph", label: `Line ${ordinal}`, section_path: [],
  content_fingerprint: `fp-${text}`, asset_id: null, ...extra,
} as Block);

function version(id: string, number: number, blocks: Block[], extra: Partial<LibraryVersion> = {}): LibraryVersion {
  return {
    id, number, blocks, stage: "ready_for_review", revisions: [], warning_details: [], blocking_warnings: [],
    warnings: [], uploaded_at: "2026-10-01T09:00:00Z", uploaded_by: amina, filename: "policy.txt",
    ...extra,
  } as unknown as LibraryVersion;
}

function document(versions: LibraryVersion[], extra: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id: "doc", title: "Coverage", owner: amina, versions, version: 4, publications: [], published_id: null,
    can_edit: true, is_owner: true, review_fingerprint: null, build_fingerprint: null, ...extra,
  } as unknown as LibraryDocument;
}

describe("initialDrafts", () => {
  it("keeps text, and starts images and hidden worksheets excluded with a reason", () => {
    const v = version("v1", 1, [
      block("a", 1, "Coverage is required."),
      block("img", 2, null, { label: "Slide 1, graphic 1" }),
      block("h", 3, "Internal", { section_path: ["Hidden worksheet: Worksheet 2"] }),
    ]);

    expect(initialDrafts(v)).toEqual({
      a: { text: "Coverage is required.", included: true, reason: "" },
      img: { text: "[Image: Slide 1, graphic 1]", included: false, reason: "Image with no text to publish." },
      h: { text: "Internal", included: false, reason: "Hidden worksheet: not selected for publication." },
    });
  });

  it("resumes from the latest saved revision", () => {
    const v = version("v1", 1, [block("a", 1, "Raw")], {
      revisions: [{ id: "r1", passages: [{ block_id: "a", text: "Fixed", included: true, exclusion_reason: "" }] }] as never,
    });
    expect(initialDrafts(v).a).toEqual({ text: "Fixed", included: true, reason: "" });
  });
});

describe("reviewRows on a first upload", () => {
  it("compares the reviewed text against the extraction", () => {
    const v = version("v1", 1, [block("a", 1, "Raw text"), block("b", 2, "Kept")]);
    const d = document([v]);
    const drafts = { ...initialDrafts(v), a: { text: "Corrected text", included: true, reason: "" } };

    const rows = reviewRows(d, v, drafts);

    expect(comparisonBasis(d).kind).toBe("extraction");
    expect(rows.map((row) => [row.key, row.change, row.basis])).toEqual([
      ["a", "edited", "Raw text"],
      ["b", "same", "Kept"],
    ]);
  });

  it("flags a blocking warning until the passage is excluded", () => {
    const v = version("v1", 1, [block("img", 1, "Chart")], {
      warning_details: [{ block_id: "img", code: "unsupported_slide_graphic", severity: "blocking", message: "Unsupported graphic" }],
    } as never);
    const d = document([v]);

    expect(reviewRows(d, v, initialDrafts(v))[0]?.blocking).toBe(true);
    const excluded = { img: { text: "Chart", included: false, reason: "Graphic not readable" } };
    expect(reviewRows(d, v, excluded)[0]?.blocking).toBe(false);
  });
});

describe("reviewRows against the edition in service", () => {
  const old = version("v1", 1, [
    block("o1", 1, "Same rule", { content_fingerprint: "same" }),
    block("o2", 2, "Old wording", { content_fingerprint: "old", label: "Clause 2" }),
    block("o3", 3, "Dropped clause", { content_fingerprint: "gone", label: "Clause 3" }),
  ], {
    revisions: [{ id: "r1", passages: [
      { block_id: "o1", text: "Same rule", included: true, exclusion_reason: "" },
      { block_id: "o2", text: "Old wording", included: true, exclusion_reason: "" },
      { block_id: "o3", text: "Dropped clause", included: true, exclusion_reason: "" },
    ] }] as never,
  });
  const working = version("v2", 2, [
    block("n1", 1, "Same rule", { content_fingerprint: "same" }),
    block("n2", 2, "New wording", { content_fingerprint: "changed", label: "Clause 2" }),
    block("n4", 4, "Brand new clause", { content_fingerprint: "fresh", label: "Clause 4" }),
  ]);
  const doc = document([old, working], {
    published_id: "p1",
    publications: [{ id: "p1", version_id: "v1", revision_id: "r1", approved_by: amina, approved_at: "2026-10-01T10:00:00Z", fingerprint: "f" }] as never,
  });

  it("matches by content, then by place, and lists what is new and what was removed", () => {
    const rows = reviewRows(doc, working, initialDrafts(working));

    expect(rows.map((row) => [row.key, row.change, row.basis])).toEqual([
      ["n1", "same", "Same rule"],
      ["n2", "edited", "Old wording"],
      ["removed-o3", "removed", "Dropped clause"],
      ["n4", "new", null],
    ]);
    expect(counts(rows)).toMatchObject({ edited: 1, new: 1, removed: 1, excluded: 0 });
  });

  it("filters and finds", () => {
    const rows = reviewRows(doc, working, initialDrafts(working));
    expect(rows.filter((row) => matches(row, "changed", "")).map((row) => row.key)).toEqual(["n2", "removed-o3", "n4"]);
    expect(rows.filter((row) => matches(row, "all", "brand")).map((row) => row.key)).toEqual(["n4"]);
  });
});

describe("saving and approving", () => {
  const v = version("v1", 1, [block("a", 1, "Text"), block("img", 2, null)]);

  it("names what stops a save", () => {
    const drafts = { a: { text: " ", included: true, reason: "" }, img: { text: "[Image]", included: false, reason: "" } };
    expect(saveProblems(v, drafts, "")).toEqual([
      "1 excluded passage needs a reason.",
      "1 passage has no text.",
      "Write a review summary.",
    ]);
  });

  it("sends every block, with a placeholder for blank text", () => {
    const body = reviewBody(v, { a: { text: "Text", included: true, reason: "x" } }, " Checked ", 4);
    expect(body).toEqual({
      expected_version: 4,
      explanation: "Checked",
      passages: [
        { block_id: "a", text: "Text", included: true, exclusion_reason: "" },
        { block_id: "img", text: "[Image: Line 2]", included: true, exclusion_reason: "" },
      ],
    });
  });

  it("counts unsaved changes against where the review started", () => {
    const start = initialDrafts(v);
    expect(unsaved(v, start)).toBe(0);
    expect(unsaved(v, { ...start, a: { text: "Edited", included: true, reason: "" } })).toBe(1);
  });

  it("explains why approval waits", () => {
    const saved = version("v1", 1, [block("a", 1, "Text")], {
      revisions: [{ id: "r1", passages: [] }] as never, blocking_warnings: ["Unsupported graphic"],
    });
    expect(approvalBlocker(document([v]), v, 0)).toBe("Save a review before approving it.");
    expect(approvalBlocker(document([saved], { review_fingerprint: "f" }), saved, 2)).toBe("Save your changes before approving.");
    expect(approvalBlocker(document([saved], { review_fingerprint: "f" }), saved, 0)).toMatch(/^1 blocking warning stays unresolved/);
    const clean = { ...saved, blocking_warnings: [] } as LibraryVersion;
    expect(approvalBlocker(document([clean], { review_fingerprint: "f" }), clean, 0)).toBeNull();
    expect(approvalBlocker(document([clean], {
      review_fingerprint: "f", publications: [{ fingerprint: "f", withdrawn_at: null }] as never,
    }), clean, 0)).toBe("This exact revision is already approved.");
  });
});

describe("standing", () => {
  it("says what requirement work can cite today", () => {
    expect(standing(document([])).kind).toBe("none");
    expect(standing(document([], {
      publications: [{ id: "p", activated_at: null, requires_activation: false, withdrawn_at: null, indexing_attempts: 3 }] as never,
    }))).toMatchObject({ kind: "indexing", stuck: true });
    expect(standing(document([], {
      publications: [{ id: "p", withdrawn_at: "2026-10-02T00:00:00Z" }] as never,
    })).kind).toBe("withdrawn");
  });
});

describe("the change notice against an edition", () => {
  it("counts only exclusions of passages that are in service, and knows when the working copy is the edition", () => {
    const v = version("v1", 1, [block("a", 1, "Kept"), block("b", 2, "Left out before"), block("c", 3, "Taken out now")], {
      revisions: [{ id: "r1", passages: [
        { block_id: "a", text: "Kept", included: true, exclusion_reason: "" },
        { block_id: "b", text: "Left out before", included: false, exclusion_reason: "Draft note" },
        { block_id: "c", text: "Taken out now", included: true, exclusion_reason: "" },
      ] }] as never,
    });
    const doc = document([v], {
      published_id: "p1",
      publications: [{ id: "p1", version_id: "v1", revision_id: "r1", approved_by: amina, approved_at: "2026-10-01T10:00:00Z", fingerprint: "f" }] as never,
    });

    expect(isTheEdition(doc, v, 0)).toBe(true);
    const drafts = { ...initialDrafts(v), c: { text: "Taken out now", included: false, reason: "Superseded" } };
    const tally = counts(reviewRows(doc, v, drafts), "edition");
    expect([tally.excluded, tally.excludedAll]).toEqual([1, 2]);
    expect(isTheEdition(doc, v, 1)).toBe(false);
  });
});

describe("nextToReview (backlog O-1)", () => {
  const working = version("v", 1, [block("a", 1, "A"), block("b", 2, "B"), block("c", 3, "C"), block("d", 4, "D")], {
    warning_details: [{ code: "w", severity: "warning", message: "Check.", block_id: "c" }],
  });
  const rows = reviewRows(document([working]), working, initialDrafts(working));

  it("goes to the next flagged passage not seen yet first, then the next not seen, round from the top", () => {
    expect(nextToReview(rows, "a", new Set(["a"]))?.key).toBe("c");
    expect(nextToReview(rows, "c", new Set(["a", "c"]))?.key).toBe("d");
    expect(nextToReview(rows, "d", new Set(["a", "c", "d"]))?.key).toBe("b");
    expect(nextToReview(rows, "b", new Set(["a", "b", "c", "d"]))).toBeUndefined();
  });

  it("goes backward with Shift+n", () => {
    expect(nextToReview(rows, "d", new Set(["d"]), true)?.key).toBe("c");
    expect(nextToReview(rows, "c", new Set(["c", "d"]), true)?.key).toBe("b");
  });
});

describe("awaitingReview", () => {
  const saved = (passages: boolean) => version("v", 1, [block("a", 1, "A")], passages ? { revisions: [{ id: "r", passages: [] }] as never } : {});

  it("is the desk while the newest version's saved review has never been published", () => {
    expect(awaitingReview(document([saved(false)]))).toBe(true);
    expect(awaitingReview(document([saved(true)], { review_fingerprint: "f" }))).toBe(true);
    const published = { id: "p", version_id: "v", fingerprint: "f", withdrawn_at: null } as never;
    expect(awaitingReview(document([saved(true)], { review_fingerprint: "f", publications: [published] }))).toBe(false);
    // A withdrawn edition returns to service as it was: no desk.
    const withdrawn = { id: "p", version_id: "v", fingerprint: "f", withdrawn_at: "2026-10-08T00:00:00Z" } as never;
    expect(awaitingReview(document([saved(true)], { review_fingerprint: "f", publications: [withdrawn] }))).toBe(false);
    // Not for someone who can't edit it, nor before it is read.
    expect(awaitingReview(document([saved(false)], { can_edit: false }))).toBe(false);
    expect(awaitingReview(document([version("v", 1, [], { stage: "extracting" })]))).toBe(false);
  });
});
