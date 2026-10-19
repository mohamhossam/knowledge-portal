"""Start, keep and read golden set runs for the Golden set report.

A run scores the impact mapper with the configured models, which takes minutes and costs
provider calls with a real one, so it is a queued job on its own queue (the report is read
while it runs). Only one runs at a time. The run reads the golden set's own catalogue into a
throwaway release; it never touches the live one.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import GoldenRunBusyError, GoldenRunNotFoundError
from knowledge_portal.application.ports.architecture_jobs import (
    ArchitectureJob,
    ArchitectureJobKind,
    ArchitectureJobRepositoryPort,
    ArchitectureJobStatus,
)
from knowledge_portal.application.ports.golden_runs import (
    CaseRecord,
    GoldenRun,
    GoldenRunOptions,
    GoldenRunRepositoryPort,
    GoldenRunResult,
    GoldenSetInfo,
    GoldenSetRunnerPort,
    Repetition,
    ScoreSet,
)
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.use_cases.leased_jobs import (
    ArchitectureJobExecution,
    CommitFence,
    LeasedJobs,
)
from knowledge_portal.application.use_cases.mapping_evaluation import (
    CaseResult,
    EvaluationReport,
    GoldenSplit,
)

HISTORY_LIMIT = 30
_ACTIVE = frozenset({ArchitectureJobStatus.QUEUED, ArchitectureJobStatus.RUNNING})


@dataclass(frozen=True)
class GoldenRunView:
    """A run and how its job is going; a finished run has its result."""

    run: GoldenRun
    status: ArchitectureJobStatus
    job: ArchitectureJob | None


def score_set(report: EvaluationReport) -> ScoreSet:
    found, expected, named = report.system_tally
    verdicts_right, verdicts_total = report.verdict_tally
    offerings_right, offerings_labelled = report.offering_tally
    labelled, drafted = report.new_offerings
    return ScoreSet(
        cases=len(report.results),
        system_precision=report.system_precision,
        system_recall=report.system_recall,
        verdict_accuracy=report.verdict_accuracy,
        offering_accuracy=report.offering_accuracy,
        concept_recall=report.concept_recall,
        citation_faithfulness=report.citation_faithfulness,
        owner_consumer_reach=report.reach,
        drafts_applied=report.drafts_applied,
        false_changes=report.false_changes,
        new_offerings_labelled=labelled,
        new_offerings_drafted=drafted,
        systems_found=found,
        systems_expected=expected,
        systems_named=named,
        verdicts_right=verdicts_right,
        verdicts_total=verdicts_total,
        offerings_right=offerings_right,
        offerings_labelled=offerings_labelled,
    )


def case_record(result: CaseResult) -> CaseRecord:
    case, prediction = result.case, result.prediction
    verdict = prediction.verdict if prediction else None
    draft = prediction.draft if prediction else None
    return CaseRecord(
        id=case.id,
        split=case.split.value,
        expected_verdict=case.verdict.value if case.verdict else None,
        expected_offering=case.offering_id,
        expected_systems=tuple(sorted(case.system_ids)),
        answered=prediction is not None,
        predicted_verdict=verdict.value if verdict else None,
        predicted_offering=prediction.offering_id if prediction else None,
        predicted_systems=tuple(sorted(result.predicted_systems)),
        failure=result.failure,
        citations_checked=result.citations_checked,
        citations_faithful=result.citations_faithful,
        draft_offering=draft.offering.id if draft else None,
        draft_problems=result.draft_problems,
    )


def repetition(report: EvaluationReport) -> Repetition:
    held_out = report.only(GoldenSplit.HELD_OUT)
    return Repetition(
        scores=score_set(report),
        tuning=score_set(report.only(GoldenSplit.TUNING)),
        held_out=score_set(held_out) if held_out.results else None,
        cases=tuple(case_record(item) for item in report.results),
    )


class GoldenSetRuns(LeasedJobs):
    def __init__(
        self,
        jobs: ArchitectureJobRepositoryPort,
        execution: ArchitectureJobExecution,
        clock: ClockPort,
        runs: GoldenRunRepositoryPort,
        runner: GoldenSetRunnerPort,
    ) -> None:
        super().__init__(jobs, execution, clock)
        self._runs = runs
        self._runner = runner

    def info(self, actor: Actor) -> GoldenSetInfo:
        require_maintainer(actor)
        return self._runner.info()

    def start(self, options: GoldenRunOptions, actor: Actor) -> GoldenRunView:
        require_maintainer(actor)
        # Ask first, so a deployment with no golden set refuses before it queues anything.
        self._runner.info()
        if any(view.status in _ACTIVE for view in self._unfinished()):
            raise GoldenRunBusyError("A golden set run is already waiting or running.")
        run = GoldenRun(uuid4().hex, actor.id, self._clock.now(), options)
        self._runs.add(run)
        job = self._dispatch(
            self._jobs.enqueue(
                ArchitectureJob(
                    uuid4().hex,
                    ArchitectureJobKind.GOLDEN_RUN,
                    run.id,
                    options.key,
                    actor.id,
                    ArchitectureJobStatus.QUEUED,
                )
            )
        )
        return GoldenRunView(run, job.status, job)

    def list(self, actor: Actor, limit: int = HISTORY_LIMIT) -> tuple[GoldenRunView, ...]:
        require_maintainer(actor)
        return tuple(self._view(run) for run in self._runs.newest(limit))

    def read(self, run_id: str, actor: Actor) -> GoldenRunView:
        require_maintainer(actor)
        run = self._runs.get(run_id)
        if run is None:
            raise GoldenRunNotFoundError("Golden set run not found.")
        return self._view(run)

    def _unfinished(self) -> tuple[GoldenRunView, ...]:
        return tuple(self._view(run) for run in self._runs.unfinished())

    def _view(self, run: GoldenRun) -> GoldenRunView:
        if run.result is not None:
            return GoldenRunView(run, ArchitectureJobStatus.SUCCEEDED, None)
        jobs = self._jobs.for_subject(ArchitectureJobKind.GOLDEN_RUN, run.id)
        job = jobs[-1] if jobs else None
        return GoldenRunView(run, job.status if job else ArchitectureJobStatus.FAILED, job)

    def _run(self, job: ArchitectureJob, fence: CommitFence) -> None:
        if job.kind is not ArchitectureJobKind.GOLDEN_RUN:
            raise GoldenRunNotFoundError(f"The golden set queue does not run {job.kind} work.")
        run = self._runs.get(job.subject_id)
        if run is None:
            raise GoldenRunNotFoundError("Golden set run not found.")
        result: GoldenRunResult = self._runner.run(
            GoldenRunOptions.from_key(job.fingerprint), self.reporter(job)
        )
        fence()
        self._runs.save_result(run.id, result)
