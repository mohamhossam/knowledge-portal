"""Where a library document's changes reach requirements (requirement-portal ADR-0099).

Requirement work owns the dependencies and the retain-or-revise decisions on
them, and filters them by the asking actor's access. This service only shows a
document's owner where review is needed. Currency comes from requirement work's
copy of the library's state, so it trails a publication change by one event poll.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId, ActorSnapshot


class ImpactDecisionKind(StrEnum):
    """What a requirement member decided about a citation whose source changed."""

    RETAIN = "retain_historical"
    REVISE = "revise_content"


@dataclass(frozen=True)
class ImpactDecision:
    dependency_id: str
    publication_state: str
    decision: ImpactDecisionKind
    reason: str
    actor: ActorSnapshot
    recorded_at: datetime
    version: int


@dataclass(frozen=True)
class SourceLineage:
    citation: PublishedReference
    via: tuple[str, ...] = ()


@dataclass(frozen=True)
class CitingDependency:
    """One requirement statement that cites a passage of the document."""

    id: str
    requirement_id: str
    requirement_title: str
    target_kind: str
    target_id: str
    statement: str
    content_fingerprint: str
    lineage: SourceLineage
    active: bool
    analysis_id: str | None = None
    round_number: int | None = None
    current: bool = True
    status: str = "recorded"


@dataclass(frozen=True)
class DependencyImpact:
    dependency: CitingDependency
    publication_current: bool
    publication_state: str
    needs_review: bool
    decisions: tuple[ImpactDecision, ...]


@dataclass(frozen=True)
class DependencyImpactPage:
    items: tuple[DependencyImpact, ...]
    next_offset: int | None


class RequirementImpactPort(Protocol):
    def document_impact(
        self,
        actor_id: ActorId,
        document_id: str,
        *,
        active_only: bool,
        query: str,
        offset: int,
        limit: int,
    ) -> DependencyImpactPage:
        """The document's citing dependencies on requirements the actor may see."""
        ...
