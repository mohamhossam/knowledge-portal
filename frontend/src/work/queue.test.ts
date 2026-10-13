import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryDocument, Organisation, Release, Reminders, Suggestion } from "../api/client";
import { isNew, matches, mineCount, ordered, type QueueInput, readLastVisit, workQueue, writeLastVisit } from "./queue";

const amina = { id: "fake-owner", display_name: "Amina Owner", email: null };

function document(id: string, title: string, { stage = "ready_for_review", mine = true, error = null as string | null, published = false } = {}): LibraryDocument {
  const version = { id: `${id}-v1`, number: 1, stage, uploaded_at: "2026-10-01T09:00:00Z", uploaded_by: amina, error };
  const publication = { id: `${id}-p1`, version_id: version.id, approved_at: "2026-10-02T09:00:00Z", approved_by: amina, withdrawn_at: null, indexing_error: null };
  return {
    id, title, can_edit: true, is_owner: mine, owner: amina, version: 1,
    published_id: published ? publication.id : null,
    publications: published ? [publication] : [],
    versions: [version],
  } as unknown as LibraryDocument;
}

const release = (id: string, status: string, systems: { id: string; name: string }[] = []) => ({ id, name: `Version ${id}`, status, systems }) as unknown as Release;
// Inferred, so a person must decide it (suggestions.ts needsOneByOne).
const suggestion = (id: string) => ({ id, status: "proposed", basis: "inferred", match: "new", possible_matches: [], citations: [], content: { kind: "system", name: "Billing", aliases: [], system_id: "billing" } }) as unknown as Suggestion;
const reminder = (id: string, state: "current" | "due_soon" | "overdue", due: string) =>
  ({ id, kind: "document", title: `Doc ${id}`, standing: { state, due_at: due, last_reviewed_at: due, reviewer: amina } }) as unknown as Reminders["items"][number];

function input(overrides: Partial<QueueInput> = {}): QueueInput {
  return {
    documents: [],
    releases: [],
    active: null,
    suggestions: [],
    organisation: { squads: [], people: [], products: [], value_streams: [] } as unknown as Organisation,
    reminders: { overdue: 0, due_soon: 0, items: [] },
    ...overrides,
  };
}

describe("workQueue", () => {
  it("ranks a failed read first, then reviews and the draft's decisions, then what is due, then gaps", () => {
    const sections = workQueue(input({
      documents: [document("r", "To review"), document("f", "Broken", { stage: "failed", error: "Row 2 is short." })],
      releases: [release("draft-1", "draft")],
      suggestions: [suggestion("s1")],
      active: release("live", "published", [{ id: "crm", name: "CRM" }]),
      reminders: { overdue: 1, due_soon: 0, items: [reminder("a", "overdue", "2026-09-30T00:00:00Z")] },
    }));
    expect(sections.attention).toEqual([expect.objectContaining({ kind: "unreadable", subject: "Broken", cause: "Row 2 is short.", to: "/library/f" })]);
    expect(sections.decisions.map((entry) => entry.kind)).toEqual(["review", "suggestions"]);
    expect(sections.decisions[1]).toEqual(expect.objectContaining({ count: 1, to: "/architecture/versions/draft-1/decide/focus?from=todo", record: "/architecture/versions/draft-1/decide" }));
    expect(sections.decisions[0]).toEqual(expect.objectContaining({ to: "/library/r/focus?from=todo", record: "/library/r" }));
    expect(sections.due).toEqual([expect.objectContaining({ kind: "due", overdue: true, what: "document", to: "/library/a" })]);
    expect(sections.gaps).toEqual([expect.objectContaining({ kind: "gaps", count: 1, subject: "CRM" })]);
  });

  it("says a held file apart from a failed one", () => {
    const sections = workQueue(input({ documents: [document("h", "Flagged deck", { stage: "quarantined" })] }));
    expect(sections.attention[0]).toEqual(expect.objectContaining({ held: true }));
  });

  it("lists only what is due or overdue, overdue first", () => {
    const sections = workQueue(input({
      reminders: {
        overdue: 1, due_soon: 1,
        items: [reminder("soon", "due_soon", "2026-10-14T00:00:00Z"), reminder("fine", "current", "2027-04-01T00:00:00Z"), reminder("late", "overdue", "2026-09-30T00:00:00Z")],
      },
    }));
    expect(sections.due.map((entry) => entry.subject)).toEqual(["Doc late", "Doc soon"]);
  });

  it("gives the rail the same count as the queue's own entries (mine)", () => {
    const sections = workQueue(input({
      documents: [document("a", "Mine"), document("b", "Someone else's", { mine: false })],
    }));
    expect(mineCount(sections)).toBe(1);
    expect(Object.values(sections).flat()).toHaveLength(2);
  });

  it("lists the gaps backlog but keeps it out of the rail's count, so the count can reach zero", () => {
    const sections = workQueue(input({ active: release("live", "published", [{ id: "crm", name: "CRM" }, { id: "erp", name: "ERP" }]) }));
    expect(sections.gaps).toEqual([expect.objectContaining({ count: 2 })]);
    expect(mineCount(sections)).toBe(0);
  });

  it("puts the review that has waited longest first", () => {
    const newer = document("n", "Newer");
    const older = { ...document("o", "Older"), versions: [{ ...document("o", "Older").versions[0]!, uploaded_at: "2026-09-01T09:00:00Z" }] } as LibraryDocument;
    const sections = workQueue(input({ documents: [newer, older] }));
    expect(sections.decisions.map((entry) => entry.subject)).toEqual(["Older", "Newer"]);
  });

  it("ranks a review that blocks approval before one that is only older", () => {
    const old = { ...document("o", "Old"), versions: [{ ...document("o", "Old").versions[0]!, uploaded_at: "2026-09-01T09:00:00Z" }] } as LibraryDocument;
    const blocked = { ...document("b", "Blocked"), versions: [{ ...document("b", "Blocked").versions[0]!, warnings: ["w"], blocking_warnings: ["w"] }] } as LibraryDocument;
    const sections = workQueue(input({ documents: [old, blocked] }));
    expect(sections.decisions.map((entry) => entry.subject)).toEqual(["Blocked", "Old"]);
  });

  it("has nothing to say when nothing needs anyone", () => {
    const sections = workQueue(input({ documents: [document("p", "Published", { published: true })] }));
    expect(Object.values(sections).flat()).toEqual([]);
  });
});

describe("To do's order, find and new marks", () => {
  const uploaded = (id: string, title: string, at: string) =>
    ({ ...document(id, title), versions: [{ ...document(id, title).versions[0]!, uploaded_at: at }] }) as LibraryDocument;
  const reviews = () => workQueue(input({
    documents: [uploaded("a", "August", "2026-08-01T09:00:00Z"), uploaded("c", "October", "2026-10-05T09:00:00Z"), uploaded("s", "September", "2026-09-01T09:00:00Z")],
    releases: [release("draft-1", "draft")],
    suggestions: [suggestion("s1")],
  })).decisions;

  it("keeps the ranking by default, or orders by how long each has waited; what has no time stays last, in rank", () => {
    expect(ordered(reviews(), "urgent").map((entry) => entry.subject)).toEqual(["August", "September", "October", "Version draft-1"]);
    expect(ordered(reviews(), "newest").map((entry) => entry.subject)).toEqual(["October", "September", "August", "Version draft-1"]);
    expect(ordered(reviews(), "oldest").map((entry) => entry.subject)).toEqual(["August", "September", "October", "Version draft-1"]);
  });

  it("marks as new only what began waiting after the last visit, and nothing on a first visit", () => {
    const [august, september, october, draft] = reviews();
    const lastVisit = Date.parse("2026-09-15T00:00:00Z");
    expect([august, september, october, draft].map((entry) => isNew(entry!, lastVisit))).toEqual([false, false, true, false]);
    expect(isNew(october!, null)).toBe(false);
    // An overdue re-confirmation is new once it fell due after the last visit; one due soon isn't yet.
    const due = workQueue(input({ reminders: { overdue: 1, due_soon: 1, items: [reminder("late", "overdue", "2026-10-01T00:00:00Z"), reminder("soon", "due_soon", "2026-10-20T00:00:00Z")] } })).due;
    expect(due.map((entry) => isNew(entry, lastVisit))).toEqual([true, false]);
  });

  it("finds by name, owner, or a system's name in a group, ignoring case", () => {
    const [august] = reviews();
    expect(matches(august!, "  aug ")).toBe(true);
    expect(matches(august!, "amina")).toBe(true);
    expect(matches(august!, "billing")).toBe(false);
    expect(matches(august!, "")).toBe(true);
  });

  describe("the last visit", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      window.localStorage.clear();
    });

    it("is kept in this browser, and is none on a first visit", () => {
      window.localStorage.clear();
      expect(readLastVisit()).toBeNull();
      writeLastVisit(1_760_000_000_000);
      expect(readLastVisit()).toBe(1_760_000_000_000);
    });

    it("is none, and nothing breaks, when storage is blocked", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => writeLastVisit(1)).not.toThrow();
      expect(readLastVisit()).toBeNull();
    });
  });
});
