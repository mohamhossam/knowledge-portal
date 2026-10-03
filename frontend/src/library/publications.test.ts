import { describe, expect, it } from "vitest";

import type { LibraryDocument, Publication } from "../api/client";
import { buildStaleness, canRetryIndexing, pendingBuild, publicationState } from "./publications";

const pub = (id: string, extra: Partial<Publication> = {}): Publication => ({
  id, version_id: "v1", revision_id: "r1", requires_activation: false, activated_at: null, built_at: null,
  withdrawn_at: null, indexing_attempts: 0, replaces_publication_id: null, ...extra,
} as Publication);

const doc = (publications: Publication[], extra: Partial<LibraryDocument> = {}): LibraryDocument => ({
  id: "d", published_id: null, publications,
  versions: [{ id: "v1", number: 1, revisions: [{ id: "r1" }] }],
  ...extra,
} as unknown as LibraryDocument);

describe("publicationState", () => {
  it("names each publication's state", () => {
    const live = pub("live", { activated_at: "t" });
    const d = doc([live], { published_id: "live" });
    expect(publicationState(d, live)).toBe("in-service");
    expect(publicationState(d, pub("old", { activated_at: "t" }))).toBe("previous");
    expect(publicationState(d, pub("w", { withdrawn_at: "t" }))).toBe("withdrawn");
    expect(publicationState(d, pub("x", { withdrawn_at: "t", requires_activation: true }))).toBe("discarded");
    expect(publicationState(d, pub("b", { requires_activation: true, built_at: "t" }))).toBe("ready");
    expect(publicationState(d, pub("i", { indexing_attempts: 1 }))).toBe("indexing");
    expect(publicationState(d, pub("s", { indexing_attempts: 3 }))).toBe("stuck");
  });
});

describe("pending builds", () => {
  const build = pub("b", { requires_activation: true, built_at: "t", replaces_publication_id: "live" });

  it("finds the build awaiting activation, and says when it went stale", () => {
    const d = doc([pub("live", { activated_at: "t" }), build], { published_id: "live" });
    expect(pendingBuild(d)?.id).toBe("b");
    expect(buildStaleness(d, build)).toBeNull();
    expect(buildStaleness({ ...d, published_id: null } as LibraryDocument, build)).toBe("The version in service changed since this build.");
    const resaved = { ...d, versions: [{ id: "v1", number: 1, revisions: [{ id: "r1" }, { id: "r2" }] }] } as unknown as LibraryDocument;
    expect(buildStaleness(resaved, build)).toBe("The review was saved again since this build.");
  });
});

describe("canRetryIndexing", () => {
  it("only once the service has stopped trying", () => {
    expect(canRetryIndexing(doc([pub("a", { indexing_attempts: 2 })]))).toBe(false);
    expect(canRetryIndexing(doc([pub("a", { indexing_attempts: 3 })]))).toBe(true);
    expect(canRetryIndexing(doc([pub("a", { indexing_attempts: 3, withdrawn_at: "t" })]))).toBe(false);
  });
});
