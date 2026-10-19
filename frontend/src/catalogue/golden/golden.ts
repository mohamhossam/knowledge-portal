import { useQuery } from "@tanstack/react-query";

import { formatClock, formatDay } from "../../home/format";
import { api, type GoldenCase, type GoldenRunSummary, type GoldenScoreSet, type GoldenSetInfo } from "../../api/client";

/** The scores a run reports, in the order the report reads them. */
export type ScoreKey =
  | "system_recall" | "system_precision" | "verdict_accuracy" | "offering_accuracy" | "concept_recall"
  | "citation_faithfulness" | "owner_consumer_reach" | "drafts_applied";

type Counts = (set: GoldenScoreSet) => [number, number, string] | null;

export type ScoreDefinition = {
  key: ScoreKey;
  label: string;
  /** The question the score answers, in plain words. */
  question: string;
  counts: Counts;
  /** The two core scores read larger than the rest. */
  size: "hero" | "regular" | "compact";
};

export type ScoreGroup = { title: string; lead: string; scores: ScoreDefinition[] };

const none: Counts = () => null;

export const SCORE_GROUPS: ScoreGroup[] = [
  {
    title: "Did it find the right impact?",
    lead: "The core job: name the systems a change touches.",
    scores: [
      { key: "system_recall", label: "Systems found", question: "Of the systems that really change, how many were found", counts: (s) => [s.systems_found, s.systems_expected, "systems"], size: "hero" },
      { key: "system_precision", label: "Systems correct", question: "Of the systems named, how many were right", counts: (s) => [s.systems_found, s.systems_named, "systems"], size: "hero" },
    ],
  },
  {
    title: "Did it judge the change correctly?",
    lead: "The kind of change, and where it lands.",
    scores: [
      { key: "verdict_accuracy", label: "Right verdict", question: "Picked the right kind of change", counts: (s) => [s.verdicts_right, s.verdicts_total, "cases"], size: "regular" },
      { key: "offering_accuracy", label: "Right offering", question: "Targeted the right existing offering", counts: (s) => [s.offerings_right, s.offerings_labelled, "cases"], size: "regular" },
      { key: "concept_recall", label: "Concepts found", question: "Expected capabilities that were found", counts: none, size: "regular" },
    ],
  },
  {
    title: "Can the output be trusted?",
    lead: "Integrity checks. These should stay near 100%.",
    scores: [
      { key: "citation_faithfulness", label: "Citations faithful", question: "Quoted sources say what is claimed", counts: none, size: "compact" },
      { key: "owner_consumer_reach", label: "Owner and consumer reach", question: "Owners and consumers of changed systems are reached", counts: none, size: "compact" },
      { key: "drafts_applied", label: "Drafts that apply", question: "Generated drafts apply cleanly to a release", counts: none, size: "compact" },
    ],
  },
];

export const ALL_SCORES = SCORE_GROUPS.flatMap((group) => group.scores);

export type Split = "all" | "tuning" | "held_out";

/** The run's scores over one split of its cases; null where the golden set has none of that split. */
type Scored = { scores: GoldenScoreSet; tuning: GoldenScoreSet; held_out: GoldenScoreSet | null };

export function scoreSetOf(repetition: Scored, split: Split): GoldenScoreSet | null {
  return split === "all" ? repetition.scores : split === "tuning" ? repetition.tuning : repetition.held_out;
}

/** The 95% Wilson interval of k out of n: the range a score could plausibly have on cases like these. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export type ScoreView = {
  /** The score, or the mean over a run's repetitions; null when it was not measured. */
  value: number | null;
  /** Lowest and highest over repetitions, when there are several. */
  spread: [number, number] | null;
  /** The counts behind it and the range they allow; for a single repetition. */
  counts: { found: number; of: number; unit: string; range: [number, number] } | null;
};

/** One score of a run over a split: its mean, its spread across repetitions, or the counts and range of one. */
export function scoreView(repetitions: Scored[], split: Split, definition: ScoreDefinition): ScoreView {
  const sets = repetitions.map((repetition) => scoreSetOf(repetition, split)).filter((set): set is GoldenScoreSet => set !== null);
  const values = sets.map((set) => set[definition.key]).filter((value): value is number => typeof value === "number");
  if (!values.length) return { value: null, spread: null, counts: null };
  const value = values.reduce((sum, item) => sum + item, 0) / values.length;
  if (sets.length > 1) return { value, spread: [Math.min(...values), Math.max(...values)], counts: null };
  const counts = definition.counts(sets[0]!);
  return { value, spread: null, counts: counts && counts[1] > 0 ? { found: counts[0], of: counts[1], unit: counts[2], range: wilson(counts[0], counts[1]) } : null };
}

export type FloorState = "meets" | "below" | "none";

export const floorState = (value: number | null, floor: number | undefined): FloorState =>
  value === null || floor === undefined ? "none" : value >= floor ? "meets" : "below";

/** The floors that hold for a run: by the kind of model it ran with (fake or live). */
export const floorsFor = (info: GoldenSetInfo | undefined, provider: string): Partial<Record<ScoreKey, number>> => info?.floors[provider] ?? {};

/** Two cases' worth of the score, in points: a difference smaller than this is not evidence of anything. */
export const noisePoints = (cases: number): number => (cases > 0 ? (2 / cases) * 100 : 0);

export type Outcome = "matches" | "partial" | "wrong";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  matches: "Matches",
  partial: "Right verdict, systems or offering off",
  wrong: "Wrong verdict",
};

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item));

export const missedSystems = (item: GoldenCase) => item.expected_systems.filter((id) => !item.predicted_systems.includes(id));
export const extraSystems = (item: GoldenCase) => item.predicted_systems.filter((id) => !item.expected_systems.includes(id));

/** How one case went: nothing answered counts as the wrong verdict. */
export function outcomeOf(item: GoldenCase): Outcome {
  if (item.predicted_verdict !== item.expected_verdict) return "wrong";
  return sameSet(item.expected_systems, item.predicted_systems) && item.expected_offering === item.predicted_offering ? "matches" : "partial";
}

const OUTCOME_RANK: Record<Outcome, number> = { wrong: 0, partial: 1, matches: 2 };

/** Cases that went wrong first, the worst (most systems missed or raised) at the top, then by id. */
export function problemsFirst(cases: GoldenCase[]): GoldenCase[] {
  const trouble = (item: GoldenCase) => missedSystems(item).length + extraSystems(item).length;
  return [...cases].sort((a, b) => OUTCOME_RANK[outcomeOf(a)] - OUTCOME_RANK[outcomeOf(b)] || trouble(b) - trouble(a) || a.id.localeCompare(b.id));
}

export const VERDICTS = ["change_existing_offering", "new_plan", "new_offering_in_family", "new_product_line", null] as const;
export type VerdictId = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<string, string> = {
  change_existing_offering: "Change to an existing offering",
  new_plan: "New plan",
  new_offering_in_family: "New offering in a family",
  new_product_line: "New product line",
  none: "Needs more information",
};
export const verdictLabel = (verdict: string | null): string => VERDICT_LABEL[verdict ?? "none"] ?? verdict ?? VERDICT_LABEL.none!;

/** How many cases of each expected verdict got each predicted one. */
export function confusion(cases: GoldenCase[]): { expected: VerdictId; total: number; predicted: { verdict: VerdictId; count: number }[] }[] {
  return VERDICTS.map((expected) => {
    const mine = cases.filter((item) => item.expected_verdict === expected);
    return { expected, total: mine.length, predicted: VERDICTS.map((verdict) => ({ verdict, count: mine.filter((item) => item.predicted_verdict === verdict).length })) };
  }).filter((row) => row.total > 0);
}

export type SystemTrouble = { id: string; missed: number; expected: number; raised: number };

/** Per system: how often it was missed out of how often it was expected, and how often it was raised by mistake. */
export function systemTroubles(cases: GoldenCase[]): SystemTrouble[] {
  const table = new Map<string, SystemTrouble>();
  const row = (id: string) => table.get(id) ?? table.set(id, { id, missed: 0, expected: 0, raised: 0 }).get(id)!;
  for (const item of cases) {
    for (const id of item.expected_systems) row(id).expected += 1;
    for (const id of missedSystems(item)) row(id).missed += 1;
    for (const id of extraSystems(item)) row(id).raised += 1;
  }
  return [...table.values()];
}

export type CaseChange = { id: string; from: Outcome; to: Outcome };

/** What changed between two runs of the same golden set: cases now better, and cases now worse. */
export function compareCases(before: GoldenCase[], after: GoldenCase[]): { better: CaseChange[]; worse: CaseChange[] } {
  const was = new Map(before.map((item) => [item.id, outcomeOf(item)]));
  const better: CaseChange[] = [];
  const worse: CaseChange[] = [];
  for (const item of after) {
    const from = was.get(item.id);
    if (!from) continue;
    const to = outcomeOf(item);
    if (OUTCOME_RANK[to] > OUTCOME_RANK[from]) better.push({ id: item.id, from, to });
    if (OUTCOME_RANK[to] < OUTCOME_RANK[from]) worse.push({ id: item.id, from, to });
  }
  return { better, worse };
}

export const isActive = (run: Pick<GoldenRunSummary, "status">) => run.status === "queued" || run.status === "running";

/** The run a result is compared with: the one before it that was run the same way, on the same kind of model. */
export function previousComparable(runs: GoldenRunSummary[], run: GoldenRunSummary): GoldenRunSummary | undefined {
  return runs.find(
    (other) =>
      other.id !== run.id &&
      other.result !== null &&
      other.requested_at < run.requested_at &&
      other.mapper === run.mapper &&
      other.precedents === run.precedents &&
      other.result.provider === run.result?.provider &&
      other.result.golden_set_version === run.result?.golden_set_version,
  );
}

export const GOLDEN_KEY = ["evaluation", "golden"] as const;

export function useGoldenInfo() {
  return useQuery({ queryKey: [...GOLDEN_KEY, "info"], queryFn: api.goldenSetInfo, retry: false });
}

/** Every run, newest first; asked again every few seconds while one waits or runs. */
export function useGoldenRuns() {
  return useQuery({
    queryKey: [...GOLDEN_KEY, "runs"],
    queryFn: async () => (await api.goldenRuns()).runs,
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 2000 : false),
  });
}

export function useGoldenRun(runId: string | undefined, active: boolean) {
  return useQuery({
    queryKey: [...GOLDEN_KEY, "run", runId],
    queryFn: () => api.goldenRun(runId!),
    enabled: runId !== undefined,
    refetchInterval: active ? 2000 : false,
  });
}

/** 0.737 as "73.7": whole when it is whole, so 1 reads "100". */
export const percent = (value: number): string => String(Math.round(value * 1000) / 10);

/** A change in a score, in points, signed: "+2.1", "−3". */
export const points = (change: number): string => {
  const rounded = Math.round(change * 1000) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)}`;
};

export type CaseFilter = "all" | "problems" | "wrong" | "missed" | "raised";

export const caseMatches: Record<CaseFilter, (item: GoldenCase) => boolean> = {
  all: () => true,
  problems: (item) => outcomeOf(item) !== "matches",
  wrong: (item) => outcomeOf(item) === "wrong",
  missed: (item) => missedSystems(item).length > 0,
  raised: (item) => extraSystems(item).length > 0,
};

export const isCaseFilter = (value: string | null): value is CaseFilter => value !== null && value in caseMatches;

const stamp = (run: GoldenRunSummary) => `${formatDay(run.requested_at)} ${formatClock(run.requested_at)}`;

/** A run in a list: when, how it was run, how many times, and with what. */
export const runLabel = (run: GoldenRunSummary) =>
  `${stamp(run)} · ${run.mapper === "assess" ? "assessment" : "match"}${run.precedents === "loo" ? " + precedents" : ""} · ${run.repeats} ${run.repeats === 1 ? "run" : "runs"}${run.result ? ` · ${run.result.provider === "fake" ? "fake model" : run.result.model}` : ""}`;
