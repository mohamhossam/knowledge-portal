"""Which requirements rely on a library document, as requirement work reports it (ADR-0099).

Requirement work owns these rows and filters them by the asking actor's access;
the knowledge service only reads them for the document owner's governance view.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId


class ProposalStatus(StrEnum):
    """Where a cited intent proposal stands in its requirement's analysis."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    EDITED = "edited"
    REJECTED = "rejected"


@dataclass(frozen=True)
class RequirementDependent:
    requirement_id: str
    requirement_title: str
    analysis_id: str | None
    round_number: int | None
    current: bool
    proposal_id: str
    statement: str
    status: ProposalStatus
    citation: PublishedReference


@dataclass(frozen=True)
class RequirementDependentsPage:
    items: tuple[RequirementDependent, ...]
    next_offset: int | None


class RequirementDependentsPort(Protocol):
    def proposals(
        self, actor_id: ActorId, document_id: str, offset: int, limit: int
    ) -> RequirementDependentsPage:
        """Intent proposals citing the document, limited to requirements the actor may see."""
        ...
