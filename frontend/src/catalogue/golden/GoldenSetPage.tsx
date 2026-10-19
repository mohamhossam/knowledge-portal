import { useSearchParams } from "react-router-dom";

import type { GoldenRepetition, GoldenRun, GoldenRunSummary } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { EmptyState, FilterStrip, Section, Select, Skeleton, Status } from "../../design/components";
import { count, formatClock, formatDay } from "../../home/format";
import { CaseTable } from "./CaseTable";
import { CompareRuns } from "./CompareRuns";
import { OutcomeStrip, VerdictTable, WeakSystems } from "./Diagnosis";
import { type CaseFilter, floorsFor, isActive, isCaseFilter, noisePoints, percent, previousComparable, runLabel, scoreSetOf, useGoldenInfo, useGoldenRun, useGoldenRuns, type Split } from "./golden";
import { Progress, RunPanel } from "./RunPanel";
import { ScoreCards } from "./ScoreCards";
import "./golden.css";

const SPLITS: Split[] = ["all", "tuning", "held_out"];
const isSplit = (value: string | null): value is Split => SPLITS.includes(value as Split);

/** One sentence that says how the run went, in the words a reader of the report would use. */
function summary(repetition: GoldenRepetition): string {
  const { scores } = repetition;
  const parts = [`${scores.verdicts_right} of ${count(scores.verdicts_total, "case")} got the right verdict`];
  if (scores.system_recall !== null) parts.push(`it found ${percent(scores.system_recall)}% of the systems that really change`);
  if (scores.system_precision !== null) parts.push(`${percent(scores.system_precision)}% of the systems it named were right`);
  return `${parts.join("; ")}.`;
}

function RunFacts({ run }: { run: GoldenRun & { result: NonNullable<GoldenRun["result"]> } }) {
  const { result } = run;
  const facts: [string, string][] = [
    ["Run", `${formatDay(run.requested_at)}, ${formatClock(run.requested_at)}`],
    ["Mapper", `${run.mapper === "assess" ? "assessment" : "match"}${run.precedents === "loo" ? " with leave-one-out precedents" : ""}`],
    ["Model", result.provider === "fake" ? `${result.model} (fake)` : result.model],
    ["Golden set", `version ${result.golden_set_version}`],
    ["Catalogue", result.catalogue_version],
    ["Runs", String(result.repetitions.length)],
  ];
  return (
    <dl className="golden-meta">
      {facts.map(([term, detail]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd><bdi>{detail}</bdi></dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The Golden set report: how well the impact mapper agrees with the catalogue's hand-labelled
 * answer key. A run scores in the background; this page reads its stored result, the scores with
 * the counts and ranges behind them, how each case went, and where the mapper goes wrong.
 */
export function GoldenSetPage() {
  const [params, setParams] = useSearchParams();
  const info = useGoldenInfo();
  const runs = useGoldenRuns();
  const list: GoldenRunSummary[] = runs.data ?? [];
  const chosenId = params.get("run") ?? list.find((run) => run.result !== null)?.id ?? list[0]?.id;
  const chosen = list.find((run) => run.id === chosenId);
  const detail = useGoldenRun(chosen?.result ? chosen.id : undefined, false);
  const set = (changes: Record<string, string | undefined>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });

  const asked = params.get("split");
  const split: Split = isSplit(asked) ? asked : "all";
  const shown = params.get("show");
  const filter: CaseFilter = isCaseFilter(shown) ? shown : "all";
  const run = detail.data;
  const result = run?.result ?? null;
  const index = Math.min(Number(params.get("pass") ?? 1) - 1 || 0, (result?.repetitions.length ?? 1) - 1);
  const pass = result?.repetitions[Math.max(0, index)];
  const previous = chosen ? previousComparable(list, chosen) : undefined;
  const previousDetail = useGoldenRun(previous?.id, false);
  const openCase = (id: string | undefined) => set({ case: id });

  return (
    <>
      <Section title="Run">
        {info.isPending ? (
          <Skeleton label="Reading what a run would score" rows={3} />
        ) : info.isError ? (
          <EmptyState title="Runs are not available here">{errorMessage(info.error)}</EmptyState>
        ) : (
          <RunPanel info={info.data} runs={list} onStarted={(id) => set({ run: id })} />
        )}
      </Section>

      {runs.isPending ? (
        <Skeleton label="Reading the runs" rows={4} />
      ) : runs.isError ? (
        <p role="alert"><Status tone="attention">{errorMessage(runs.error)}</Status></p>
      ) : list.length === 0 ? (
        <EmptyState title="No run yet">Run the evaluation to see how the mapper scores against the golden set.</EmptyState>
      ) : (
        <>
          <Section title="Report">
            <Select label="Run shown" value={chosen?.id ?? ""} onChange={(event) => set({ run: event.target.value, case: undefined, pass: undefined })}>
              {list.map((item) => (
                <option key={item.id} value={item.id}>{runLabel(item)}{item.result ? "" : ` · ${item.status}`}</option>
              ))}
            </Select>
            {chosen && isActive(chosen) && <Progress run={chosen} />}
            {chosen && !chosen.result && !isActive(chosen) && (
              <p role="alert">
                <Status tone="attention">This run {chosen.status === "cancelled" ? "was cancelled" : "failed"}{chosen.error_category ? ` (${chosen.error_category})` : ""}. Nothing was scored.</Status>
              </p>
            )}
            {chosen?.result && detail.isPending && <Skeleton label="Reading the run" rows={6} />}
            {detail.isError && <p role="alert"><Status tone="attention">{errorMessage(detail.error)}</Status></p>}
          </Section>

          {run && result && pass && (
            <>
              <RunFacts run={{ ...run, result }} />
              {result.provider === "fake" && (
                <p className="golden-note" role="note">
                  <strong>Fake model.</strong> These numbers test the harness, not the AI. Run with a real model for scores that mean anything.
                </p>
              )}
              <p className="golden-summary">{summary(pass)}</p>
              <p className="golden-muted">
                {count(pass.scores.false_changes, "false change")} (a change reported that was not needed) · {pass.scores.new_offerings_drafted} of {pass.scores.new_offerings_labelled} new offerings drafted.
              </p>

              <Section title="Scores">
                <FilterStrip
                  label="Cases scored"
                  active={split}
                  onChange={(id) => set({ split: id === "all" ? undefined : id })}
                  filters={[
                    { id: "all", label: "All cases", count: pass.scores.cases },
                    { id: "tuning", label: "Tuning", count: pass.tuning.cases },
                    ...(pass.held_out ? [{ id: "held_out", label: "Held out", count: pass.held_out.cases }] : []),
                  ]}
                />
                {split === "held_out" && (
                  <p className="golden-muted">Held-out cases are not tuned against, so their score is the honest one. With {pass.held_out?.cases ?? 0} cases it moves a lot: one case is about {percent(1 / (pass.held_out?.cases ?? 1))} points.</p>
                )}
                {scoreSetOf(pass, split) ? (
                  <ScoreCards
                    repetitions={result.repetitions}
                    split={split}
                    floors={floorsFor(info.data, result.provider)}
                    previous={previousDetail.data?.result?.repetitions}
                    cases={scoreSetOf(pass, split)!.cases}
                  />
                ) : (
                  <EmptyState title="No cases in this set" />
                )}
                <p className="golden-muted">
                  Bar: the result. Shaded: the range it could plausibly have on cases like these. Black tick: the floor a run must reach.
                </p>
              </Section>

              {result.repetitions.length > 1 && (
                <Select label="Run shown below" value={String(index + 1)} onChange={(event) => set({ pass: event.target.value, case: undefined })}>
                  {result.repetitions.map((_, n) => (
                    <option key={n} value={n + 1}>Run {n + 1} of {result.repetitions.length}</option>
                  ))}
                </Select>
              )}

              <Section title={`All ${count(pass.cases.length, "case")} at a glance`}>
                <p className="golden-muted">✓ matches · ▲ right verdict, systems or offering off · ✕ wrong verdict. Select one to open it.</p>
                <OutcomeStrip cases={pass.cases} onOpen={openCase} />
              </Section>

              <Section title="Verdict: expected against said">
                <p className="golden-muted">Rows are the labelled answer, columns what the mapper said. The diagonal is right.</p>
                <VerdictTable cases={pass.cases} />
              </Section>

              <Section title="Where it goes wrong: systems">
                <p className="golden-muted">The systems it gets wrong most often. This is where the catalogue's text, its chunking or the mapping needs work.</p>
                <WeakSystems cases={pass.cases} />
              </Section>

              <Section title="Cases" count={pass.cases.length}>
                <CaseTable cases={pass.cases} filter={filter} onFilter={(next) => set({ show: next === "all" ? undefined : next })} chosen={params.get("case") ?? undefined} onChoose={openCase} />
              </Section>

              {chosen && (
                <Section title="Compare with another run">
                  <CompareRuns runs={list} current={chosen} onOpenCase={openCase} />
                </Section>
              )}

              <Section title="Read with care">
                <ul>
                  <li>{pass.scores.cases} cases is small: one case moves a score by about {percent(1 / pass.scores.cases)} points. A difference under about {Math.round(noisePoints(pass.scores.cases) * 10) / 10} points is two cases and is not evidence.</li>
                  <li>The labels are hand-written fixtures from the catalogue, not evidence from users.</li>
                  <li>A real model answers differently each time; trust the mean of several runs, not one.</li>
                </ul>
              </Section>
            </>
          )}
        </>
      )}
    </>
  );
}
