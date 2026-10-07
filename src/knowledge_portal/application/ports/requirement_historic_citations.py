"""Where requirement work cites each historic requirement (Knowledge Center E2, ADR-0102)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class HistoricCitation:
    """A Requirement whose prior art cites a historic requirement: who and when, never what."""

    requirement_id: str
    title: str
    owner: str
    checked_at: datetime
    # Whether that check still stands for the Requirement as it is now.
    current: bool
    retired: bool
    duplicate: bool


@dataclass(frozen=True)
class HistoricCitationPage:
    items: tuple[HistoricCitation, ...]
    next_offset: int | None


class RequirementHistoricCitationsPort(Protocol):
    def counts(self, historic_ids: tuple[str, ...]) -> dict[str, int]:
        """Requirements citing each historic requirement; 0 when none do.

        Fails as `ServiceUnavailableError` when requirement work cannot answer.
        """
        ...

    def citations(self, historic_id: str, offset: int, limit: int) -> HistoricCitationPage: ...
