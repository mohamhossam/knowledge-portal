"""Stored golden set runs: what a run asked for, what it scored, and where it is kept.

A run scores the impact mapper over the catalogue's golden set, once or several times (a
model answers a little differently each time, so one run is one sample). What is stored is
what the Golden set report shows: scores with the counts behind them, and every case's
expected and predicted answer. The run never holds anything of the live catalogue.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from knowledge_portal.application.errors import InvalidGoldenRunError
from knowledge_portal.application.ports.architecture_jobs import ProgressReport

MAX_REPEATS = 5


class GoldenMapper(StrEnum):
    """The assessment (`/internal/architecture/assess`) or today's per-item match."""

    ASSESS = "assess"
    MATCH = "match"


class GoldenPrecedents(StrEnum):
    """No precedents, or every other labelled case kept as an accepted verdict."""

    NONE = "none"
    LEAVE_ONE_OUT = "loo"


@dataclass(frozen=True)
class GoldenRunOptions:
    mapper: GoldenMapper = GoldenMapper.ASSESS
    precedents: GoldenPrecedents = GoldenPrecedents.NONE
    repeats: int = 1

    def __post_init__(self) -> None:
        if not 1 <= self.repeats <= MAX_REPEATS:
            raise InvalidGoldenRunError(f"Run between 1 and {MAX_REPEATS} times.")
        if self.mapper is GoldenMapper.MATCH and self.precedents is not GoldenPrecedents.NONE:
            raise InvalidGoldenRunError("Today's match reads no precedents.")

    @property
    def key(self) -> str:
        return f"{self.mapper.value}|{self.precedents.value}|{self.repeats}"

    @classmethod
    def from_key(cls, key: str) -> GoldenRunOptions:
        parts = key.split("|")
        if len(parts) != 3 or not parts[2].isdigit():
            raise InvalidGoldenRunError("Stored golden run options are malformed.")
        try:
            return cls(GoldenMapper(parts[0]), GoldenPrecedents(parts[1]), int(parts[2]))
        except ValueError as exc:
            raise InvalidGoldenRunError("Stored golden run options are malformed.") from exc


@dataclass(frozen=True)
class CaseRecord:
    """One case: the answer a reviewer labelled and the answer the mapper gave."""

    id: str
    split: str
    expected_verdict: str | None
    expected_offering: str | None
    expected_systems: tuple[str, ...]
    answered: bool
    predicted_verdict: str | None
    predicted_offering: str | None
    predicted_systems: tuple[str, ...]
    failure: str | None
    citations_checked: int
    citations_faithful: int
    # The offering drafted for a new-offering verdict, and why it would not apply (None when
    # nothing was drafted, empty when it applies cleanly).
    draft_offering: str | None
    draft_problems: tuple[str, ...] | None


@dataclass(frozen=True)
class ScoreSet:
    """Every headline score over some cases, with the counts behind the ones that have them.

    A score is None when it was not measured (a mapper that returns no concepts has no concept
    recall), never zero.
    """

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


@dataclass(frozen=True)
class Repetition:
    """One pass over the golden set: scores over all cases and over each split."""

    scores: ScoreSet
    tuning: ScoreSet
    held_out: ScoreSet | None
    cases: tuple[CaseRecord, ...]


@dataclass(frozen=True)
class GoldenRunResult:
    # `fake` or `live`: floors are kept per kind, as a fake model's scores say nothing about
    # a real one's.
    provider: str
    model: str
    golden_set_version: int
    catalogue_version: str
    completed_at: datetime
    repetitions: tuple[Repetition, ...]


@dataclass(frozen=True)
class GoldenRun:
    id: str
    actor_id: str
    requested_at: datetime
    options: GoldenRunOptions
    # None until the run has finished; a failed or cancelled run never gets one.
    result: GoldenRunResult | None = None


@dataclass(frozen=True)
class GoldenSetInfo:
    """What a run would score, and what it would score it with."""

    golden_set_version: int
    catalogue_version: str
    cases: int
    held_out_cases: int
    provider: str
    # The configured provider's own name, such as `openai`; a stored run holds the exact model.
    provider_name: str
    # The least each score may be: floors[provider][score]. Empty where none is agreed.
    floors: dict[str, dict[str, float]]


class GoldenRunRepositoryPort(Protocol):
    def add(self, run: GoldenRun) -> None: ...

    def get(self, run_id: str) -> GoldenRun | None: ...

    def save_result(self, run_id: str, result: GoldenRunResult) -> None: ...

    def newest(self, limit: int) -> tuple[GoldenRun, ...]: ...

    def unfinished(self) -> tuple[GoldenRun, ...]:
        """Runs with no result yet, whether still waiting, running or ended without one."""
        ...


class GoldenSetRunnerPort(Protocol):
    """Scores the mapper over the golden set against a throwaway release.

    It raises `GoldenSetUnavailableError` where the deployment holds no golden set.
    """

    def info(self) -> GoldenSetInfo: ...

    def run(self, options: GoldenRunOptions, progress: ProgressReport) -> GoldenRunResult: ...
