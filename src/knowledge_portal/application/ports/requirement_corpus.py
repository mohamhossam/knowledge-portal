"""The Requirement knowledge corpus's health, read from requirement work (A′).

Requirement work owns the corpus (requirement-portal ADR-0099, Amendment 1) and answers
counts only, so nothing about any Requirement reaches the knowledge service.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class OpenFindingAges:
    """Possible duplicates and contradictions still in force, by how long they have stood."""

    under_7_days: int
    from_7_to_30_days: int
    over_30_days: int


@dataclass(frozen=True)
class CorpusSummary:
    # Every Requirement, including those closed as duplicates.
    requirements: int
    # Closed as duplicates: kept with no passages, so never a candidate.
    duplicates: int
    # Indexed at their latest change.
    current: int
    # Changed and not yet indexed again.
    waiting: int
    # Stopped retrying after repeated failures, until someone retries them.
    failed: int
    # The embedding model changed and the index must be rebuilt first.
    rebuild_required: bool
    open_findings: OpenFindingAges
    as_of: datetime


class RequirementCorpusPort(Protocol):
    def summary(self) -> CorpusSummary: ...
