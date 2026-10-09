import { describe, expect, it } from "vitest";

import type { LibraryDocument, Organisation, Release, RequirementCorpus } from "../api/client";
import {
  architectureOverview,
  libraryOverview,
  nameDirectory,
  requirementOverview,
  squadOverview,
  type DraftJobs,
} from "./derive";

const amina = { id: "fake-owner", display_name: "Amina Owner", email: null };

function document(overrides: Partial<LibraryDocument> & { stage?: string; approvedVersion?: boolean }): LibraryDocument {
  const { stage = "ready_for_review", approvedVersion = false, ...rest } = overrides;
  const version = { id: `${rest.id}-v1`, number: 1, stage, uploaded_at: "2026-10-01T09:00:00Z", uploaded_by: amina, error: null };
  const publication = {
    id: `${rest.id}-p1`, version_id: version.id, approved_at: "2026-10-02T09:00:00Z",
    approved_by: amina, withdrawn_at: null, indexing_error: null,
  };
  return {
    id: "doc", title: "Coverage policy", can_edit: true, is_owner: true, owner: amina, version: 1,
    published_id: approvedVersion ? publication.id : null,
    publications: approvedVersion ? [publication] : [],
    versions: [version],
    ...rest,
  } as unknown as LibraryDocument;
}

describe("libraryOverview", () => {
  it("counts a document as awaiting review only while no publication came from its newest version", () => {
    const awaiting = document({ id: "a", title: "Awaiting" });
    // The stage stays "ready_for_review" after approval; the publication says it was approved.
    const published = document({ id: "p", title: "Published", approvedVersion: true });

    const overview = libraryOverview([awaiting, published]);

    expect(overview.lines.map((line) => [line.name, line.cells.status])).toEqual([["Awaiting", "Awaiting your review"]]);
    expect(overview.totals.find((total) => total.key === "service")?.value).toBe("1");
    expect(overview.alert).toEqual({ rank: "due", text: "1 to review" });
    expect(overview.next).toEqual({ to: "/library", label: "1 document awaits your review" });
  });

  it("puts a disruption first and says what failed", () => {
    const failed = document({ id: "f", title: "Broken", stage: "failed" });
    const awaiting = document({ id: "a", title: "Awaiting" });

    const overview = libraryOverview([awaiting, failed]);

    expect(overview.lines.map((line) => [line.rank, line.cells.status])).toEqual([
      ["delayed", "Extraction failed"],
      ["due", "Awaiting your review"],
    ]);
    expect(overview.notes[0]?.text).toBe("Version 1 uploaded by Amina Owner on 1 Oct 2026. The file could not be read.");
  });

  it("notes which version stays in service while a new one awaits review", () => {
    const base = document({ id: "d", title: "Discounts", approvedVersion: true });
    const second = { ...base.versions[0]!, id: "d-v2", number: 2, stage: "ready_for_review" };
    const overview = libraryOverview([{ ...base, versions: [...base.versions, second] } as LibraryDocument]);

    expect(overview.lines[0]?.cells.version).toBe("v2");
    expect(overview.lines[0]?.note).toBe("pub-d");
    // The document is also the latest publication, so its note points to note 1 rather than repeat it.
    expect(overview.notes.map((note) => note.text)).toEqual([
      "Latest publication: ‘Discounts’ version 1, approved by Amina Owner on 2 Oct 2026.",
      "Version 1, the latest publication (note 1), stays in service until version 2 is approved.",
    ]);
    expect(overview.edition).toEqual({ text: "Edition of 2 Oct 2026 · 1 document in service · last change 2 Oct 2026", note: "latest" });
  });

  it("says on its edition line when the library last changed: the newest upload, approval or withdrawal", () => {
    const published = document({ id: "p", approvedVersion: true });
    const withdrawn = {
      ...published,
      id: "w",
      publications: [{ ...published.publications[0]!, withdrawn_at: "2026-10-04T08:00:00Z" }],
    } as LibraryDocument;

    expect(libraryOverview([published]).edition.text).toBe("Edition of 2 Oct 2026 · 1 document in service · last change 2 Oct 2026");
    expect(libraryOverview([published, withdrawn]).edition.text).toContain("· last change 4 Oct 2026");
    expect(libraryOverview([]).edition.text).toBe("Nothing published yet. Requirement work can cite only what is published here.");
  });

  it("says when nothing awaits a curator, without a link", () => {
    const overview = libraryOverview([document({ id: "p", approvedVersion: true })]);

    expect(overview.lines).toEqual([]);
    expect(overview.next).toEqual({ label: "Nothing in the library awaits a curator." });
  });
});

const release = (overrides: Partial<Release>): Release => ({
  id: "r", name: null, status: "draft", revision: 1, created_by: "fake-owner", published_by: null,
  published_at: null, systems: [], relationships: [], capability_domains: [], journeys: [],
  ...overrides,
} as unknown as Release);

describe("architectureOverview", () => {
  it("ranks a draft with proposed suggestions as due, and names who prepared it", () => {
    const active = release({ id: "seed", name: "Initial catalogue", status: "published", published_by: "fake-owner", published_at: "2026-01-01T00:00:00Z" });
    const draft = release({ id: "oct", name: "October update" });
    const suggestions = new Map([["oct", {
      runs: [], suggestions: [{ status: "proposed" }, { status: "proposed" }, { status: "accepted" }],
    } as never]]);

    const overview = architectureOverview([active, draft], active, suggestions, nameDirectory([{ ...amina, roles: [] }]));

    expect(overview.lines).toMatchObject([{ rank: "due", name: "October update", cells: { status: "2 suggestions to decide", preparedBy: "Amina Owner" } }]);
    expect(overview.next).toEqual({ to: "/architecture/versions/oct/sources", label: "2 suggestions to decide in ‘October update’" });
    expect(overview.notes[0]?.text).toContain("Published by Amina Owner on 1 Jan 2026, revision 1.");
    expect(overview.lines[0]?.note).toBe("draft-oct");
    expect(overview.notes[1]?.text).toBe(
      "Prepared by Amina Owner, now at revision 1. 0 catalogue readings proposed 3 suggestions; each waits for a curator's decision.",
    );
  });

  const job = (status: string, error_category: string | null = null) => ({
    id: "j", kind: "index", subject_id: "oct", fingerprint: "f", actor_id: "fake-owner", attempts: 3, status, error_category,
  }) as unknown as DraftJobs["build"];
  const draftOnly = (jobs: DraftJobs) => architectureOverview(
    [release({ id: "oct", name: "October update" })],
    null,
    new Map([["oct", { runs: [{ created_at: "2026-10-03T10:00:00Z" }], suggestions: [{ status: "proposed" }] } as never]]),
    nameDirectory([]),
    new Map([["oct", jobs]]),
  );

  it("puts a failed build first and sends it to Check, where an index is rebuilt", () => {
    const overview = draftOnly({ build: job("failed", "attempts_exhausted"), extractions: [] });

    expect(overview.lines).toMatchObject([{ rank: "delayed", cells: { status: "Index build failed" }, statusDetail: "1 suggestion to decide" }]);
    expect(overview.next).toEqual({ to: "/architecture/versions/oct/check", label: "Rebuild the evidence index of ‘October update’" });
    expect(overview.notes.at(-1)?.text).toContain("Its evidence index could not be built: it stopped after three attempts.");
    expect(overview.alert).toEqual({ rank: "delayed", text: "1 draft failed" });
  });

  it("names the document a failed reading was of, and sends the reader to Sources to read it again", () => {
    const overview = architectureOverview(
      [release({ id: "oct", name: "October update", documents: [{ id: "v1", title: "Target state", filename: "target.md" }] as never })],
      null,
      new Map([["oct", { runs: [], suggestions: [] } as never]]),
      nameDirectory([]),
      new Map([["oct", {
        build: job("failed"),
        extractions: [{ document_version_id: "v1", job: job("failed", "catalogue_extraction_unsupported")! }],
      }]]),
    );

    expect(overview.lines[0]?.cells.status).toBe("Build and 1 reading failed");
    expect(overview.next).toEqual({ to: "/architecture/versions/oct/sources", label: "Read 1 document again in ‘October update’, then rebuild" });
    expect(overview.notes.at(-1)?.text).toContain("‘Target state’ could not be read: this kind of file cannot be read here.");
  });

  it("does not call a draft ready to a reader who may not see its builds, and says on the edition line what last changed", () => {
    const unseen = architectureOverview(
      [release({ id: "oct", name: "October update" })],
      null,
      new Map([["oct", { runs: [{ created_at: "2026-10-03T10:00:00Z" }], suggestions: [] } as never]]),
      nameDirectory([]),
    );

    expect(unseen.lines).toMatchObject([{ rank: "service", cells: { status: "No suggestions to decide" } }]);
    expect(unseen.totals).toEqual([]);
    expect(unseen.edition.text).toContain("Last change 3 Oct 2026, a reading in ‘October update’.");
  });

  it("names the packaged initial catalogue rather than its actor id", () => {
    expect(nameDirectory([])("packaged-seed")).toBe("the packaged initial catalogue");
  });

  it("says plainly when no edition is in force", () => {
    const overview = architectureOverview([], null, new Map(), nameDirectory([]));

    expect(overview.edition.text).toBe("No edition is in force. Requirement work maps against nothing until a release is published.");
    expect(overview.totals).toEqual([]);
  });
});

describe("squadOverview", () => {
  const organisation = {
    people: [{ id: "layla", name: "Layla", active: true }],
    value_streams: [{ id: "retail", name: "Retail" }],
    products: [],
    squads: [{ id: "sales", name: "Sales", systems: [{ system_id: "bcrm", person_id: "layla" }] }],
  } as unknown as Organisation;

  it("lists the systems in force that no squad owns, keeping their Arabic names", () => {
    const active = release({
      status: "published",
      systems: [
        { id: "bcrm", name: "BCRM", name_ar: null },
        { id: "cim", name: "CIM", name_ar: "إدارة العملاء" },
      ] as never,
    });

    const overview = squadOverview(organisation, active, [], nameDirectory([]));

    expect(overview.lines).toMatchObject([{ key: "cim", rank: "due", nameAr: "إدارة العملاء" }]);
    expect(overview.edition.text).toBe("1 squad owning 1 system of the 2 in force (Table 2)");
    expect(overview.next.label).toBe("1 system in force has no owning squad");
  });

  it("shows the first eight and says how many more", () => {
    const systems = Array.from({ length: 11 }, (_, index) => ({ id: `s${index}`, name: `System ${index}`, name_ar: null }));
    const overview = squadOverview(organisation, release({ systems: systems as never }), [], nameDirectory([]));

    expect(overview.lines).toHaveLength(8);
    expect(overview.more).toBe("and 3 more systems with no owning squad");
  });
});

const corpus = (overrides: Partial<RequirementCorpus> = {}): RequirementCorpus => ({
  requirements: 12, duplicates: 1, retired: 0, current: 12, waiting: 0, failed: 0, rebuild_required: false,
  open_findings: { under_7_days: 0, from_7_to_30_days: 0, over_30_days: 0 },
  as_of: "2026-10-06T09:00:00Z",
  ...overrides,
});

describe("requirementOverview", () => {
  const WORK = "/";

  it("is quiet when everything is indexed and no finding stands open", () => {
    const overview = requirementOverview(corpus(), WORK);

    expect(overview.lines).toEqual([]);
    expect(overview.next).toEqual({ label: "Nothing in requirement knowledge awaits anyone." });
    expect(overview.alert).toBeUndefined();
    expect(overview.extent).toEqual({ value: 12, label: "12 requirements" });
    expect(overview.edition).toEqual({ text: "12 requirements, 12 indexed and current", note: "source" });
    expect(overview.totals.map((total) => [total.label, total.value])).toEqual([
      ["Requirements", "12"],
      ["Indexed and current", "12"],
      ["Of them closed as duplicates", "1"],
      ["Of them retired", "0"],
      ["Open findings", "0"],
    ]);
  });

  it("ranks stopped indexing and month-old findings as disruptions and leads to the overdue findings", () => {
    const overview = requirementOverview(corpus({
      current: 9, waiting: 2, failed: 1,
      open_findings: { under_7_days: 3, from_7_to_30_days: 1, over_30_days: 2 },
    }), WORK);

    expect(overview.lines.map((line) => [line.rank, line.name, line.cells.count, line.to])).toEqual([
      ["delayed", "Requirements that stopped indexing", "1", "/requirement-knowledge/requirements?state=failed"],
      ["delayed", "Findings open over 30 days", "2", "/requirement-knowledge/findings?age=over_30_days"],
      ["due", "Findings open 7 to 30 days", "1", "/requirement-knowledge/findings?age=from_7_to_30_days"],
      ["running", "Findings open under 7 days", "3", "/requirement-knowledge/findings?age=under_7_days"],
      ["running", "Requirements waiting to be indexed", "2", "/requirement-knowledge/requirements?state=waiting"],
    ]);
    expect(overview.next).toEqual({
      to: "/requirement-knowledge/findings?age=over_30_days",
      label: "Ask the owners to decide the 2 overdue findings",
    });
    expect(overview.alert).toEqual({ rank: "delayed", text: "1 stopped indexing, 2 overdue" });
    expect(overview.notes.map((note) => note.id)).toEqual(["source", "failed", "findings"]);
    expect(overview.totals.at(-1)?.value).toBe("6");
  });

  it("treats a finding this week as in progress, and one older as awaiting its owners", () => {
    const recent = requirementOverview(corpus({ open_findings: { under_7_days: 1, from_7_to_30_days: 0, over_30_days: 0 } }), WORK);
    const older = requirementOverview(corpus({ open_findings: { under_7_days: 0, from_7_to_30_days: 1, over_30_days: 0 } }), WORK);

    expect(recent.next).toEqual({ label: "Nothing in requirement knowledge awaits anyone." });
    expect(recent.alert).toBeUndefined();
    expect(older.next).toEqual({ to: "/requirement-knowledge/findings?age=from_7_to_30_days", label: "1 finding awaits its owners" });
    expect(older.alert).toEqual({ rank: "due", text: "1 finding awaiting owners" });
  });

  it("leads to the requirements that stopped indexing when no finding is overdue", () => {
    const overview = requirementOverview(corpus({ current: 11, failed: 1 }), WORK);

    expect(overview.next).toEqual({
      to: "/requirement-knowledge/requirements?state=failed",
      label: "Retry the 1 requirement that stopped indexing",
    });
  });

  it("says a model change needs a rebuild before anything else", () => {
    const overview = requirementOverview(corpus({ rebuild_required: true, current: 0, requirements: 0 }), WORK);

    expect(overview.lines[0]).toMatchObject({ rank: "delayed", name: "Requirement index", cells: { status: "Rebuild required" } });
    expect(overview.next).toMatchObject({ href: "/", label: "Rebuild the requirement index in requirement work" });
    expect(overview.edition.text).toBe("0 requirements · the index must be rebuilt");
  });

  it("names the rebuild without a link when requirement work is not connected", () => {
    const overview = requirementOverview(corpus({ rebuild_required: true, current: 0, requirements: 0 }), null);

    expect(overview.next).toEqual({ label: "Rebuild the requirement index in requirement work" });
  });
});

describe("note order", () => {
  it("numbers notes as they are read: the edition's first, then each row top to bottom", () => {
    const published = document({ id: "p", title: "Published", approvedVersion: true });
    const failed = document({ id: "f", title: "Broken", stage: "failed" });
    const base = document({ id: "d", title: "Discounts", approvedVersion: true });
    const second = { ...base.versions[0]!, id: "d-v2", number: 2, stage: "ready_for_review" };
    const withNewVersion = { ...base, versions: [...base.versions, second] } as LibraryDocument;

    const overview = libraryOverview([withNewVersion, published, failed]);

    expect(overview.lines.map((line) => line.note)).toEqual(["fail-f", "pub-d"]);
    expect(overview.notes.map((note) => note.id)).toEqual(["latest", "fail-f", "pub-d"]);
  });
});
