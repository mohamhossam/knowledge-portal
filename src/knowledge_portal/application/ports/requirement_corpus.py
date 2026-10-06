"""The Requirement knowledge corpus, read from requirement work (A′ and B2).

Requirement work owns the corpus (requirement-portal ADR-0099, Amendment 1). Its summary is
counts only. Its rows carry identity and state, plus a finding's one-line rationale: never an
email, a description, a passage or an evidence excerpt. The knowledge service reads them on
demand and stores none of it.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
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
    # Retired from the corpus by a knowledge admin (B3); kept readable, out of screening.
    retired: int = 0


class IndexState(StrEnum):
    CURRENT = "current"
    WAITING = "waiting"
    FAILED = "failed"
    # The embedding model changed; every Requirement waits for the rebuild.
    REBUILD_REQUIRED = "rebuild_required"


class FindingAge(StrEnum):
    UNDER_7_DAYS = "under_7_days"
    FROM_7_TO_30_DAYS = "from_7_to_30_days"
    OVER_30_DAYS = "over_30_days"


class FindingKind(StrEnum):
    POSSIBLE_DUPLICATE = "possible_duplicate"
    POSSIBLE_CONTRADICTION = "possible_contradiction"


@dataclass(frozen=True)
class PersonName:
    """Someone named in a row: an id and a display name, never an email."""

    id: str
    display_name: str


@dataclass(frozen=True)
class RetiredMark:
    """A Requirement retired from the corpus: when, by which knowledge admin, and why."""

    at: datetime
    by: str
    reason: str


@dataclass(frozen=True)
class CorpusRequirement:
    requirement_id: str
    title: str
    # Closed as a duplicate: kept in the corpus with no passages.
    duplicate: bool
    owner: PersonName | None
    index_state: IndexState
    last_screened_at: datetime | None
    # Findings in force that name this Requirement.
    open_findings: int
    retired: RetiredMark | None = None


@dataclass(frozen=True)
class CorpusRequirementsPage:
    items: tuple[CorpusRequirement, ...]
    next_offset: int | None


@dataclass(frozen=True)
class CorpusQuery:
    index_state: IndexState | None = None
    owner_id: str | None = None
    # Matched against titles, ignoring case.
    text: str = ""
    open_findings_only: bool = False
    # Never screened, or last screened longer ago than this.
    not_screened_for_days: int | None = None
    # Only Requirements retired from the corpus.
    retired_only: bool = False


@dataclass(frozen=True)
class FindingSide:
    requirement_id: str
    title: str
    owner: PersonName | None


@dataclass(frozen=True)
class NudgeMark:
    at: datetime
    # The knowledge admin who asked, by display name.
    by: str


@dataclass(frozen=True)
class CorpusFinding:
    finding_id: str
    kind: FindingKind
    # The screening judge's one line on why; never the evidence it cites.
    rationale: str
    raised_at: datetime
    age: FindingAge
    subject: FindingSide
    related: FindingSide
    last_nudge: NudgeMark | None
    # When it may be nudged again; None when it may be nudged now.
    next_nudge_at: datetime | None


@dataclass(frozen=True)
class CorpusFindingsPage:
    items: tuple[CorpusFinding, ...]
    next_offset: int | None


@dataclass(frozen=True)
class FindingQuery:
    kind: FindingKind | None = None
    age: FindingAge | None = None
    # Either Requirement's owner.
    owner_id: str | None = None


@dataclass(frozen=True)
class NudgeReceipt:
    finding_id: str
    nudged_at: datetime
    # The owners notified, by display name.
    recipients: tuple[str, ...]
    next_nudge_at: datetime


class CorpusState(StrEnum):
    ACTIVE = "active"
    RETIRED = "retired"


@dataclass(frozen=True)
class MembershipResult:
    requirement_id: str
    state: CorpusState
    changed_at: datetime
    # Findings requirement work closed as "source retired"; none on reinstatement.
    closed_findings: int
    # The owner told of it, by display name; None when the Requirement has no owner.
    notified: str | None


class ReindexScope(StrEnum):
    # Retry every Requirement that stopped indexing.
    FAILED = "failed"
    # Index the chosen Requirements again.
    REQUIREMENTS = "requirements"


@dataclass(frozen=True)
class ReindexResult:
    # Requirements retried or marked for indexing again.
    requirements: int


class RequirementNotInCorpusError(Exception):
    """Requirement work has no such Requirement."""


class RequirementCorpusConflictError(Exception):
    """Requirement work refused a corpus action; the message says why, in its words."""


class RequirementFindingNotFoundError(Exception):
    """Requirement work has no such finding."""


class RequirementFindingConflictError(Exception):
    """Requirement work refused a nudge; the message says why, in its words."""


class RequirementCorpusPort(Protocol):
    def summary(self) -> CorpusSummary: ...

    def requirements(self, query: CorpusQuery, offset: int, limit: int) -> CorpusRequirementsPage:
        """Requirements by title, then id."""
        ...

    def findings(self, query: FindingQuery, offset: int, limit: int) -> CorpusFindingsPage:
        """Findings in force, the longest-standing first."""
        ...

    def nudge(self, finding_id: str, actor_id: str, actor_name: str) -> NudgeReceipt:
        """Ask both Requirements' owners to decide a finding; at most once a week."""
        ...

    def retire(
        self, requirement_id: str, actor_id: str, actor_name: str, reason: str
    ) -> MembershipResult:
        """Take a Requirement out of the corpus; requirement work closes the findings citing it."""
        ...

    def reinstate(
        self, requirement_id: str, actor_id: str, actor_name: str, reason: str
    ) -> MembershipResult:
        """Return a retired Requirement to the corpus."""
        ...

    def reindex(
        self,
        scope: ReindexScope,
        requirement_ids: tuple[str, ...],
        actor_id: str,
        actor_name: str,
    ) -> ReindexResult:
        """Retry what stopped indexing, or index chosen Requirements again."""
        ...
