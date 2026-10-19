import { describe, expect, it } from "vitest";

import {
  ALL_SCORES, caseMatches, compareCases, confusion, floorState, noisePoints, outcomeOf, percent, points, previousComparable, problemsFirst,
  scoreView, systemTroubles, wilson,
} from "./golden";
import { CASES, goldenCase, repetition, scoreSet, summary } from "./fixtures";

const recall = ALL_SCORES.find((item) => item.key === "system_recall")!;

describe("the range a score could have", () => {
  it("is the 95% Wilson interval of its counts", () => {
    const [low, high] = wilson(70, 212);
    expect(low).toBeCloseTo(0.27, 1);
    expect(high).toBeCloseTo(0.4, 1);
  });

  it("stays inside 0 to 1 whatever the counts, and knows nothing from no cases", () => {
    expect(wilson(0, 10)[0]).toBe(0);
    expect(wilson(10, 10)[1]).toBe(1);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe("reading numbers", () => {
  it("prints a whole score whole and a change with its sign", () => {
    expect(percent(1)).toBe("100");
    expect(percent(0.7368)).toBe("73.7");
    expect(points(0.021)).toBe("+2.1");
    expect(points(-0.03)).toBe("−3");
    expect(points(0)).toBe("0");
  });

  it("says two cases of noise", () => {
    expect(noisePoints(59)).toBeCloseTo(3.39, 2);
    expect(noisePoints(0)).toBe(0);
  });

  it("compares a score with its floor, and says nothing where there is none", () => {
    expect(floorState(0.7, 0.7)).toBe("meets");
    expect(floorState(0.69, 0.7)).toBe("below");
    expect(floorState(0.9, undefined)).toBe("none");
    expect(floorState(null, 0.7)).toBe("none");
  });
});

describe("a score of a run", () => {
  it("carries the counts and the range of a single run", () => {
    const view = scoreView([repetition()], "all", recall);
    expect(view.value).toBe(0.5);
    expect(view.counts).toMatchObject({ found: 6, of: 12, unit: "systems" });
    expect(view.spread).toBeNull();
  });

  it("is the mean and the spread of several runs, never a range from one run's counts", () => {
    const view = scoreView([repetition({ scores: scoreSet({ system_recall: 0.4 }) }), repetition({ scores: scoreSet({ system_recall: 0.6 }) })], "all", recall);
    expect(view.value).toBeCloseTo(0.5);
    expect(view.spread).toEqual([0.4, 0.6]);
    expect(view.counts).toBeNull();
  });

  it("is not measured where the run did not measure it, or has no cases of that split", () => {
    const concepts = ALL_SCORES.find((item) => item.key === "concept_recall")!;
    expect(scoreView([repetition()], "all", concepts).value).toBeNull();
    expect(scoreView([repetition({ held_out: null })], "held_out", recall).value).toBeNull();
  });
});

describe("how a case went", () => {
  it("is wrong when the verdict is, right but off when systems or the offering differ, and matching otherwise", () => {
    expect(outcomeOf(CASES[0]!)).toBe("matches");
    expect(outcomeOf(CASES[1]!)).toBe("partial");
    expect(outcomeOf(CASES[2]!)).toBe("partial");
    expect(outcomeOf(CASES[3]!)).toBe("wrong");
    expect(outcomeOf(goldenCase("x", { predicted_offering: "other" }))).toBe("partial");
  });

  it("counts no answer as the wrong verdict when a verdict was labelled", () => {
    expect(outcomeOf(goldenCase("x", { answered: false, predicted_verdict: null, predicted_systems: [] }))).toBe("wrong");
  });

  it("lists the wrong first, then the most systems off, then by id", () => {
    expect(problemsFirst(CASES).map((item) => item.id)).toEqual(["G004", "G002", "G003", "G001"]);
  });

  it("filters problems, wrong verdicts, missed and extra systems", () => {
    const ids = (filter: keyof typeof caseMatches) => CASES.filter(caseMatches[filter]).map((item) => item.id);
    expect(ids("problems")).toEqual(["G002", "G003", "G004"]);
    expect(ids("wrong")).toEqual(["G004"]);
    expect(ids("missed")).toContain("G002");
    expect(ids("raised")).toContain("G003");
  });
});

describe("what the cases show", () => {
  it("counts each expected verdict against each said one, omitting verdicts nobody labelled", () => {
    const rows = confusion(CASES);
    expect(rows.map((row) => row.expected)).toEqual(["change_existing_offering", "new_plan"]);
    expect(rows[0]!.predicted.find((cell) => cell.verdict === "change_existing_offering")!.count).toBe(3);
    expect(rows[1]!.predicted.find((cell) => cell.verdict === "change_existing_offering")!.count).toBe(1);
  });

  it("finds the systems missed and raised, with how often each was expected", () => {
    const troubles = Object.fromEntries(systemTroubles(CASES).map((item) => [item.id, item]));
    expect(troubles.b).toMatchObject({ missed: 1, expected: 4, raised: 0 });
    expect(troubles.c).toMatchObject({ missed: 0, raised: 1 });
  });

  it("names the cases a second run made better and the ones it made worse", () => {
    const after = [goldenCase("G001", { predicted_systems: ["a"] }), CASES[1]!, CASES[2]!, goldenCase("G004", { split: "held_out", expected_verdict: "new_plan", expected_offering: null, predicted_verdict: "new_plan", predicted_offering: null })];
    const { better, worse } = compareCases(CASES, after);
    expect(better).toEqual([{ id: "G004", from: "wrong", to: "matches" }]);
    expect(worse).toEqual([{ id: "G001", from: "matches", to: "partial" }]);
  });
});

describe("the run to compare with", () => {
  const later = summary("c", { requested_at: "2026-10-19T11:00:00Z" });
  it("is the newest earlier run made the same way on the same kind of model", () => {
    const runs = [later, summary("other-way", { requested_at: "2026-10-19T10:30:00Z", precedents: "loo" }), summary("b", { requested_at: "2026-10-19T10:00:00Z" }), summary("a")];
    expect(previousComparable(runs, later)?.id).toBe("b");
  });

  it("is none for the first run, or when only unfinished runs came before", () => {
    expect(previousComparable([later], later)).toBeUndefined();
    expect(previousComparable([later, summary("b", { requested_at: "2026-10-19T10:00:00Z", result: null, status: "failed" })], later)).toBeUndefined();
  });
});
