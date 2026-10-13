import { describe, expect, it } from "vitest";

import { BAND_DOMAINS, ERROR_END_TRACKS, MAIN_TRACK, parseDrop, parseProposition, parseQuestion, trackKind } from "./conventions";

describe("the delivery drop in an order type's description", () => {
  it("takes the drop out of the description", () => {
    expect(parseDrop("A new subscription on a new or existing account. Delivered in drop P1.")).toEqual({ drop: "P1", note: "A new subscription on a new or existing account." });
    expect(parseDrop("Change of plan. Delivered in drop P2 / P3.")).toEqual({ drop: "P2 / P3", note: "Change of plan." });
  });

  it("keeps a description with no drop whole, and reads a missing one as empty", () => {
    expect(parseDrop("Static IP and other add-ons.")).toEqual({ note: "Static IP and other add-ons." });
    expect(parseDrop("Delivered in drop P4.")).toEqual({ drop: "P4", note: "" });
    expect(parseDrop(null)).toEqual({ note: "" });
    expect(parseDrop(undefined)).toEqual({ note: "" });
  });
});

describe("a proposition", () => {
  it("is its first paragraph as the summary and the rest as its purpose", () => {
    expect(parseProposition("One line.\n\nWhy it exists.\n\nAnd more.")).toEqual({ summary: "One line.", purpose: "Why it exists.\n\nAnd more." });
  });

  it("has no purpose with one paragraph, and nothing when missing", () => {
    expect(parseProposition("Only a summary.")).toEqual({ summary: "Only a summary.", purpose: "" });
    expect(parseProposition(null)).toEqual({ summary: "", purpose: "" });
  });
});

describe("a question's title", () => {
  it("is the text before the first colon, the rest its detail", () => {
    expect(parseQuestion("Backup 5G: which plans carry it? And when.")).toEqual({ title: "Backup 5G", detail: "which plans carry it? And when." });
    expect(parseQuestion("A: b: c")).toEqual({ title: "A", detail: "b: c" });
  });

  it("keeps the whole text when there is no colon", () => {
    expect(parseQuestion("Which plans carry backup 5G?")).toEqual({ title: "Which plans carry backup 5G?", detail: "" });
    expect(parseQuestion("Ratio 1:2 holds?")).toEqual({ title: "Ratio 1:2 holds?", detail: "" });
    expect(parseQuestion(": no title")).toEqual({ title: ": no title", detail: "" });
  });
});

describe("the named conventions", () => {
  it("draws the enterprise domain and the integration layer as bands", () => {
    expect(BAND_DOMAINS).toEqual(["enterprise", "integration"]);
  });

  it("ends the flow in error only on the correction track", () => {
    expect(ERROR_END_TRACKS).toEqual(["CORRECTION"]);
    expect(trackKind("CORRECTION")).toBe("error");
    expect(trackKind("correction")).toBe("error");
    // A rejected order ends on its own track, drawn as a step (not an error end) until the service says otherwise.
    expect(trackKind("REJECTED")).toBe("side");
  });

  it("reads no track, or the main one in any case, as the main track", () => {
    expect(MAIN_TRACK).toBe("MAIN");
    expect([null, undefined, "", "MAIN", "main"].map(trackKind)).toEqual(["main", "main", "main", "main", "main"]);
    expect(trackKind("BRANCH-BACKUP")).toBe("side");
  });
});
