# ADR — Golden set report: stored runs on their own queue

## Status

Proposed 2026-10-19, with the Golden set report. The number is for the owner to assign: the
platform-level ADRs in requirement-portal share this series.

## Context

The impact mapper is scored against the catalogue's golden set by `interfaces/evaluate.py`: one
run, printed, then gone. A curator cannot read it, compare it with the last run, or see which
cases and systems the mapper gets wrong. A real-model run takes minutes and costs provider calls.

## Decision

1. **A run is a queued job with a stored result.** `GoldenSetRuns` extends `LeasedJobs` on its
   own queue table (`golden_run_jobs`) and worker, as historic imports do, so the catalogue's
   worker never claims one. The result is one JSON document on `golden_runs`, written once when
   the run finishes. One run waits or runs at a time (409 otherwise).
2. **A run holds scores with their counts, and every case's answer.** Not the live catalogue:
   each pass builds its own in-memory graph and publishes the golden set's catalogue into a
   throwaway release.
3. **Several runs, one record.** A model answers differently each time, so a run may repeat the
   pass (1 to 5); the report shows the mean and the spread, never a range from one pass's counts.
4. **A held-out split.** `split: "held_out"` on a case keeps it out of tuning (12 of 59, one in
   four of each verdict's cases by id order). Scores are reported for all cases, tuning and held-out.
   The split only protects cases nobody tunes against from now on: every case was visible when
   the golden set was written.
5. **Floors are per provider kind** (`fake`, `live`) in `tests/fixtures/golden/impact_floors.json`.
   The fake floors guard the harness in CI; the live floors are empty until real runs set them.
   The screen reads them and never sets them.
6. **The deployment carries the files.** The golden set, its floors and the catalogue are not in
   `src/`; the API image copies them under `EVALUATION_ROOT` (default: the repository root).
   Without them the report says so (503 `golden_set_unavailable`) and queues nothing.

## Consequences

- Public contract: three additive routes under `/evaluation`, and the `golden_run` value of
  `ArchitectureJobKind`. A client that validates that enum strictly must accept it.
- A Postgres migration adds two tables; nothing existing changes.
- The shell's Jobs panel is derived from library documents and does not list golden runs; the
  report follows its own run's progress.
- 59 cases is small: one case is 1.7 points. Labels are hand-written, not user evidence.
- Not built: cancelling or retrying a run from the screen (the job base class supports both);
  the library golden set's report.
