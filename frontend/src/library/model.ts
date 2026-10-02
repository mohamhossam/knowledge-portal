/**
 * The review of one library document, as pure data.
 *
 * The page compares the working copy (the newest version and its draft
 * review) against what requirement work cites today: the passages of the
 * publication in service. With nothing in service, it compares against the
 * extraction itself. Passages of an older version are matched to the new
 * version's blocks by their extracted content, then by where they sit
 * (section and label); what matches nothing is new or removed.
 */
import type { components } from "../api/schema";
import type { LibraryDocument, LibraryVersion, Publication } from "../api/client";

type Schemas = components["schemas"];
export type Block = Schemas["DocumentEvidenceBlock"];
export type Warning = Schemas["DocumentExtractionWarning"];
export type ReviewedPassage = Schemas["ReviewedPassage"];
export type Revision = Schemas["ExtractionRevision"];

/** The reviewer's working decision for one block. */
export type Draft = { text: string; included: boolean; reason: string };
export type Drafts = Record<string, Draft>;

export type Change = "same" | "edited" | "excluded" | "new" | "removed";
export type Filter = "all" | "changed" | "flagged" | "excluded" | "removed";

export type Row = {
  key: string;
  ordinal: number;
  where: string;
  block: Block | null;
  /** The text on the comparison side: in service, or as extracted. */
  basis: string | null;
  /** The working decision; null for a passage removed since the edition. */
  draft: Draft | null;
  change: Change;
  warnings: Warning[];
  /** An unresolved blocking warning: approval waits until the passage is excluded and saved. */
  blocking: boolean;
};

export const IN_PROGRESS = new Set(["queued", "scanning", "extracting"]);

export function newestVersion(document: LibraryDocument): LibraryVersion | undefined {
  return [...document.versions].sort((a, b) => b.number - a.number)[0];
}

export function latestRevision(version: LibraryVersion | undefined): Revision | undefined {
  return version?.revisions.at(-1);
}

export function livePublication(document: LibraryDocument): Publication | undefined {
  return document.publications.find((item) => item.id === document.published_id);
}

const isHidden = (block: Block, warnings: Warning[]) =>
  (block.section_path[0] ?? "").startsWith("Hidden worksheet")
  || warnings.some((warning) => warning.block_id === block.id && warning.code === "hidden_worksheet");

const placeholder = (block: Block): string => block.text ?? `[Image: ${block.label}]`;

/**
 * Where a review starts: the latest saved revision, or the extraction.
 *
 * Without a saved revision every passage with text is kept. An image has no
 * text to publish and a hidden worksheet was not chosen for publication, so
 * both start excluded with that reason, ready to be overruled.
 */
export function initialDrafts(version: LibraryVersion): Drafts {
  const saved = latestRevision(version);
  if (saved) {
    return Object.fromEntries(saved.passages.map((passage) => [
      passage.block_id,
      { text: passage.text, included: passage.included, reason: passage.exclusion_reason ?? "" },
    ]));
  }
  return Object.fromEntries(version.blocks.map((block) => {
    const draft: Draft = isHidden(block, version.warning_details)
      ? { text: placeholder(block), included: false, reason: "Hidden worksheet: not selected for publication." }
      : block.text == null
        ? { text: placeholder(block), included: false, reason: "Image with no text to publish." }
        : { text: placeholder(block), included: true, reason: "" };
    return [block.id, draft];
  }));
}

/** Where a passage sits: its label, after any section its label does not already name. */
const whereOf = (block: Block) =>
  [...block.section_path.filter((segment) => !block.label.includes(segment)), block.label]
    .filter(Boolean)
    .join(" › ");
const placeKey = (block: Block) => `${block.section_path.join("/")}::${block.label}`;

/** What the working copy is compared against, and the passages it cites. */
export type Basis =
  | { kind: "edition"; publication: Publication; version: LibraryVersion; passages: Map<string, ReviewedPassage> }
  | { kind: "extraction" };

export function comparisonBasis(document: LibraryDocument): Basis {
  const live = livePublication(document);
  const version = live && document.versions.find((item) => item.id === live.version_id);
  const revision = version?.revisions.find((item) => item.id === live?.revision_id);
  if (!live || !version || !revision) return { kind: "extraction" };
  return {
    kind: "edition",
    publication: live,
    version,
    passages: new Map(revision.passages.map((passage) => [passage.block_id, passage])),
  };
}

/** Every row of the review, in reading order, with removed passages after their neighbours. */
export function reviewRows(document: LibraryDocument, working: LibraryVersion, drafts: Drafts): Row[] {
  const basis = comparisonBasis(document);
  const matched = new Map<string, Block>();
  if (basis.kind === "edition") {
    const oldBlocks = basis.version.blocks.filter((block) => basis.passages.get(block.id)?.included);
    const used = new Set<string>();
    const byContent = new Map<string, Block[]>();
    const byPlace = new Map<string, Block[]>();
    for (const block of oldBlocks) {
      byContent.set(block.content_fingerprint, [...(byContent.get(block.content_fingerprint) ?? []), block]);
      byPlace.set(placeKey(block), [...(byPlace.get(placeKey(block)) ?? []), block]);
    }
    const take = (candidates: Block[] | undefined) => candidates?.find((block) => !used.has(block.id));
    for (const block of working.blocks) {
      const old = basis.version.id === working.id
        ? oldBlocks.find((item) => item.id === block.id)
        : take(byContent.get(block.content_fingerprint)) ?? take(byPlace.get(placeKey(block)));
      if (old) {
        used.add(old.id);
        matched.set(block.id, old);
      }
    }
  }

  const rows: Row[] = [...working.blocks].sort((a, b) => a.ordinal - b.ordinal).map((block) => {
    const draft = drafts[block.id] ?? { text: placeholder(block), included: true, reason: "" };
    const warnings = working.warning_details.filter((warning) => warning.block_id === block.id);
    const old = matched.get(block.id);
    const basisText = basis.kind === "edition"
      ? (old ? basis.passages.get(old.id)?.text ?? null : null)
      : block.text ?? null;
    const change: Change = !draft.included
      ? "excluded"
      : basis.kind === "edition" && !old
        ? "new"
        : basisText !== null && draft.text.trim() !== basisText.trim() ? "edited" : "same";
    return {
      key: block.id,
      ordinal: block.ordinal,
      where: whereOf(block),
      block,
      basis: basisText,
      draft,
      change,
      warnings,
      blocking: warnings.some((warning) => warning.severity === "blocking") && draft.included,
    };
  });

  if (basis.kind === "edition" && basis.version.id !== working.id) {
    const kept = new Set([...matched.values()].map((block) => block.id));
    for (const block of basis.version.blocks) {
      const passage = basis.passages.get(block.id);
      if (!passage?.included || kept.has(block.id)) continue;
      rows.push({
        key: `removed-${block.id}`,
        ordinal: block.ordinal,
        where: whereOf(block),
        block: null,
        basis: passage.text,
        draft: null,
        change: "removed",
        warnings: [],
        blocking: false,
      });
    }
    rows.sort((a, b) => a.ordinal - b.ordinal || (a.change === "removed" ? 1 : 0) - (b.change === "removed" ? 1 : 0));
  }
  return rows;
}

/**
 * What the change notice counts. Against an edition, "excluded" counts only
 * passages that are in service today and would leave it; a passage the edition
 * already left out is not a change.
 */
export function counts(rows: Row[], against: Basis["kind"] = "extraction") {
  return {
    all: rows.length,
    edited: rows.filter((row) => row.change === "edited").length,
    excluded: rows.filter((row) => row.change === "excluded" && (against === "extraction" || row.basis !== null)).length,
    excludedAll: rows.filter((row) => row.change === "excluded").length,
    new: rows.filter((row) => row.change === "new").length,
    removed: rows.filter((row) => row.change === "removed").length,
    flagged: rows.filter((row) => row.warnings.length > 0).length,
    blocking: rows.filter((row) => row.blocking).length,
  };
}

export function matches(row: Row, filter: Filter, find: string): boolean {
  const passes = filter === "all"
    || (filter === "changed" && (row.change === "edited" || row.change === "new" || row.change === "removed"))
    || (filter === "flagged" && row.warnings.length > 0)
    || (filter === "excluded" && row.change === "excluded")
    || (filter === "removed" && row.change === "removed");
  if (!passes) return false;
  const needle = find.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [row.where, row.basis ?? "", row.draft?.text ?? ""].some((text) => text.toLocaleLowerCase().includes(needle));
}

/** How many passages differ from the last saved revision (or from where the review started). */
export function unsaved(version: LibraryVersion, drafts: Drafts): number {
  const start = initialDrafts(version);
  return version.blocks.filter((block) => {
    const a = drafts[block.id];
    const b = start[block.id];
    if (!a || !b) return false;
    return a.text !== b.text || a.included !== b.included || (!a.included && a.reason !== b.reason);
  }).length;
}

/** What stops this draft from being saved, in the reviewer's words; empty when it can be. */
export function saveProblems(version: LibraryVersion, drafts: Drafts, summary: string): string[] {
  const problems: string[] = [];
  const missingReason = version.blocks.filter((block) => drafts[block.id] && !drafts[block.id]!.included && !drafts[block.id]!.reason.trim()).length;
  const blank = version.blocks.filter((block) => drafts[block.id] && !drafts[block.id]!.text.trim()).length;
  if (missingReason) problems.push(`${missingReason} excluded ${missingReason === 1 ? "passage needs" : "passages need"} a reason.`);
  if (blank) problems.push(`${blank} ${blank === 1 ? "passage has" : "passages have"} no text.`);
  if (!summary.trim()) problems.push("Write a review summary.");
  return problems;
}

export function reviewBody(version: LibraryVersion, drafts: Drafts, summary: string, expectedVersion: number) {
  return {
    expected_version: expectedVersion,
    explanation: summary.trim(),
    passages: version.blocks.map((block) => {
      const draft = drafts[block.id] ?? { text: placeholder(block), included: true, reason: "" };
      return {
        block_id: block.id,
        text: draft.text.trim() ? draft.text : placeholder(block),
        included: draft.included,
        exclusion_reason: draft.included ? "" : draft.reason.trim(),
      };
    }),
  };
}

/** Why the saved revision cannot be approved now; null when it can. */
export function approvalBlocker(document: LibraryDocument, version: LibraryVersion, dirty: number): string | null {
  const saved = latestRevision(version);
  if (!saved || !document.review_fingerprint) return "Save a review before approving it.";
  if (dirty > 0) return "Save your changes before approving.";
  if (version.blocking_warnings.length > 0) {
    return `${version.blocking_warnings.length} blocking ${version.blocking_warnings.length === 1 ? "warning stays" : "warnings stay"} unresolved. Exclude the affected passages and save, or upload a new version.`;
  }
  if (document.publications.some((item) => !item.withdrawn_at && item.requires_activation && !item.activated_at)) {
    return "A table-aware build awaits activation; activate or discard it first.";
  }
  if (document.publications.some((item) => !item.withdrawn_at && item.fingerprint === document.review_fingerprint)) {
    return "This exact revision is already approved.";
  }
  return null;
}

export type Standing =
  | { kind: "service"; publication: Publication; versionNumber: number | undefined }
  | { kind: "indexing"; publication: Publication; stuck: boolean }
  | { kind: "withdrawn"; publication: Publication }
  | { kind: "none" };

/** Where the document stands with requirement work: what it can cite from it today. */
export function standing(document: LibraryDocument): Standing {
  const live = livePublication(document);
  if (live) {
    return { kind: "service", publication: live, versionNumber: document.versions.find((item) => item.id === live.version_id)?.number };
  }
  const pending = [...document.publications].reverse().find((item) => !item.withdrawn_at && !item.activated_at && !item.requires_activation);
  if (pending) return { kind: "indexing", publication: pending, stuck: pending.indexing_attempts >= 3 };
  const withdrawn = [...document.publications].reverse().find((item) => item.withdrawn_at);
  if (withdrawn) return { kind: "withdrawn", publication: withdrawn };
  return { kind: "none" };
}

/** Whether the saved working copy is exactly the edition in service. */
export function isTheEdition(document: LibraryDocument, version: LibraryVersion, dirty: number): boolean {
  const live = livePublication(document);
  return dirty === 0 && live?.version_id === version.id && live.revision_id === latestRevision(version)?.id;
}

/** Whether the page should keep asking: the file is being read, or an approval is being indexed. */
export function settling(document: LibraryDocument): boolean {
  const newest = newestVersion(document);
  if (newest && IN_PROGRESS.has(newest.stage)) return true;
  // An approval or a build still being indexed.
  return document.publications.some((item) =>
    !item.withdrawn_at && !item.activated_at && !item.built_at && item.indexing_attempts < 3);
}
