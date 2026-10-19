"""HTTP shapes of the Golden set report: runs of the impact mapper over the golden set."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from knowledge_portal.application.ports.architecture_jobs import ArchitectureJobStatus
from knowledge_portal.application.ports.golden_runs import (
    MAX_REPEATS,
    GoldenMapper,
    GoldenPrecedents,
    GoldenRunOptions,
    GoldenSetInfo,
)
from knowledge_portal.application.use_cases.golden_runs import GoldenRunView


class _FromDomain(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GoldenSetInfoResponse(_FromDomain):
    golden_set_version: int
    catalogue_version: str
    cases: int
    held_out_cases: int
    # `fake` or `live`, and the configured provider's own name.
    provider: str
    provider_name: str
    # The least each score may be, by provider kind; empty where none is agreed.
    floors: dict[str, dict[str, float]]

    @classmethod
    def from_domain(cls, info: GoldenSetInfo) -> GoldenSetInfoResponse:
        return cls.model_validate(info)


class GoldenRunRequest(BaseModel):
    mapper: GoldenMapper = GoldenMapper.ASSESS
    precedents: GoldenPrecedents = GoldenPrecedents.NONE
    repeats: int = Field(default=1, ge=1, le=MAX_REPEATS)

    def options(self) -> GoldenRunOptions:
        return GoldenRunOptions(self.mapper, self.precedents, self.repeats)


class ScoreSetResponse(_FromDomain):
    """Scores over some cases, with the counts behind them. None: not measured."""

    cases: int
    system_precision: float | None
    system_recall: float | None
    verdict_accuracy: float | None
    offering_accuracy: float | None
    concept_recall: float | None
    citation_faithfulness: float | None
    owner_consumer_reach: float | None
    drafts_applied: float | None
    false_changes: int
    new_offerings_labelled: int
    new_offerings_drafted: int
    systems_found: int
    systems_expected: int
    systems_named: int
    verdicts_right: int
    verdicts_total: int
    offerings_right: int
    offerings_labelled: int


class CaseRecordResponse(_FromDomain):
    id: str
    split: str
    expected_verdict: str | None
    expected_offering: str | None
    expected_systems: list[str]
    answered: bool
    predicted_verdict: str | None
    predicted_offering: str | None
    predicted_systems: list[str]
    failure: str | None
    citations_checked: int
    citations_faithful: int
    draft_offering: str | None
    draft_problems: list[str] | None


class RepetitionScoresResponse(_FromDomain):
    scores: ScoreSetResponse
    tuning: ScoreSetResponse
    held_out: ScoreSetResponse | None


class RepetitionResponse(RepetitionScoresResponse):
    cases: list[CaseRecordResponse]


class _ResultHeader(_FromDomain):
    provider: str
    model: str
    golden_set_version: int
    catalogue_version: str
    completed_at: datetime


class GoldenRunResultSummary(_ResultHeader):
    repetitions: list[RepetitionScoresResponse]


class GoldenRunResultResponse(_ResultHeader):
    repetitions: list[RepetitionResponse]


class _RunHeader(BaseModel):
    id: str
    actor_id: str
    requested_at: datetime
    mapper: GoldenMapper
    precedents: GoldenPrecedents
    repeats: int
    status: ArchitectureJobStatus
    error_category: str | None
    # How far a running attempt has got: the pass it is on, and the cases done of the total.
    stage: str | None
    progress_done: int | None
    progress_total: int | None


def _header(view: GoldenRunView) -> dict[str, object]:
    run, job = view.run, view.job
    return {
        "id": run.id,
        "actor_id": run.actor_id,
        "requested_at": run.requested_at,
        "mapper": run.options.mapper,
        "precedents": run.options.precedents,
        "repeats": run.options.repeats,
        "status": view.status,
        "error_category": job.error_category if job else None,
        "stage": job.progress.stage if job and job.progress else None,
        "progress_done": job.progress.done if job and job.progress else None,
        "progress_total": job.progress.total if job and job.progress else None,
    }


class GoldenRunSummaryResponse(_RunHeader):
    result: GoldenRunResultSummary | None

    @classmethod
    def from_domain(cls, view: GoldenRunView) -> GoldenRunSummaryResponse:
        return cls.model_validate(
            {**_header(view), "result": view.run.result},
            from_attributes=True,
        )


class GoldenRunResponse(_RunHeader):
    result: GoldenRunResultResponse | None

    @classmethod
    def from_domain(cls, view: GoldenRunView) -> GoldenRunResponse:
        return cls.model_validate(
            {**_header(view), "result": view.run.result},
            from_attributes=True,
        )


class GoldenRunListResponse(BaseModel):
    runs: list[GoldenRunSummaryResponse]
