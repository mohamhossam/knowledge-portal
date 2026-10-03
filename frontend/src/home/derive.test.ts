import { describe, expect, it } from "vitest";

import type { LibraryDocument, Organisation, Release } from "../api/client";
import { architectureOverview, libraryOverview, nameDirectory, squadOverview } from "./derive";

const amina = { id: "fake-owner", display_name: "Amina Owner", email: null };

function document(overrides: Partial<LibraryDocument> & { stage?: string; approvedVersion?: boolean }): LibraryDocument {
  const { stage = "ready_for_review", approvedVersion = false, ...rest } = overrides;
  const version = { id: `${rest.id}-v1`, number: 1, stage, uploaded_at: "2026-10-01T09:00:00Z", uploaded_by: amina, error: null };
  const publication = {
    id: `${rest.id}-p1`, version_id: version.id, approved_at: "2026-10-02T09:00:00Z",
    approved_by: amina, withdrawn_at: null, indexing_error: null,
  };
  return {
    id: "doc", title: "Coverage policy", can_edit: true, owner: amina, version: 1,
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
    expect(overview.totals.find((total) => total.key === "service")?.value).toBe("1 document");
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
    expect(overview.edition).toEqual({ text: "Edition of 2 Oct 2026 · 1 document in service", note: "latest" });
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
    expect(overview.next).toEqual({ to: "/architecture/versions/oct/suggestions", label: "2 suggestions to decide in ‘October update’" });
    expect(overview.notes[0]?.text).toContain("Published by Amina Owner on 1 Jan 2026, revision 1.");
    expect(overview.lines[0]?.note).toBe("draft-oct");
    expect(overview.notes[1]?.text).toBe(
      "Prepared by Amina Owner, now at revision 1. 0 catalogue readings proposed 3 suggestions; each waits for a curator's decision.",
    );
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
