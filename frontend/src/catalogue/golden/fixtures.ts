import type { GoldenCase, GoldenRepetition, GoldenRun, GoldenRunSummary, GoldenScoreSet, GoldenSetInfo } from "../../api/client";

/** A case as the service stores it; each test says only what it cares about. */
export function goldenCase(id: string, extra: Partial<GoldenCase> = {}): GoldenCase {
  return {
    id, split: "tuning", expected_verdict: "change_existing_offering", expected_offering: "offering-a", expected_systems: ["a", "b"],
    answered: true, predicted_verdict: "change_existing_offering", predicted_offering: "offering-a", predicted_systems: ["a", "b"],
    failure: null, citations_checked: 2, citations_faithful: 2, draft_offering: null, draft_problems: null, ...extra,
  };
}

export function scoreSet(extra: Partial<GoldenScoreSet> = {}): GoldenScoreSet {
  return {
    cases: 4, system_precision: 0.75, system_recall: 0.5, verdict_accuracy: 0.75, offering_accuracy: 1, concept_recall: null,
    citation_faithfulness: 1, owner_consumer_reach: 1, drafts_applied: null, false_changes: 1, new_offerings_labelled: 1, new_offerings_drafted: 0,
    systems_found: 6, systems_expected: 12, systems_named: 8, verdicts_right: 3, verdicts_total: 4, offerings_right: 3, offerings_labelled: 3, ...extra,
  };
}

export const CASES: GoldenCase[] = [
  goldenCase("G001"),
  goldenCase("G002", { predicted_systems: ["a"] }),
  goldenCase("G003", { predicted_systems: ["a", "b", "c"] }),
  goldenCase("G004", { split: "held_out", expected_verdict: "new_plan", expected_offering: null, predicted_verdict: "change_existing_offering" }),
];

export function repetition(extra: Partial<GoldenRepetition> = {}): GoldenRepetition {
  return { scores: scoreSet(), tuning: scoreSet({ cases: 3 }), held_out: scoreSet({ cases: 1 }), cases: CASES, ...extra };
}

export const INFO: GoldenSetInfo = {
  golden_set_version: 2, catalogue_version: "catalogue-x", cases: 4, held_out_cases: 1, provider: "fake", provider_name: "fake",
  floors: { fake: { system_recall: 0.4, system_precision: 0.8 }, live: {} },
};

const RESULT = { provider: "fake", model: "fake-model-v1", golden_set_version: 2, catalogue_version: "catalogue-x", completed_at: "2026-10-19T10:00:00Z" };

export function summary(id: string, extra: Partial<GoldenRunSummary> = {}): GoldenRunSummary {
  return {
    id, actor_id: "ada", requested_at: "2026-10-19T09:00:00Z", mapper: "assess", precedents: "none", repeats: 1, status: "succeeded",
    error_category: null, stage: null, progress_done: null, progress_total: null,
    result: { ...RESULT, repetitions: [{ scores: scoreSet(), tuning: scoreSet(), held_out: scoreSet() }] }, ...extra,
  };
}

export function run(id: string, extra: Partial<GoldenRun> = {}): GoldenRun {
  return { ...summary(id), result: { ...RESULT, repetitions: [repetition()] }, ...extra } as GoldenRun;
}
