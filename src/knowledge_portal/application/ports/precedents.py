"""Where decided verdicts are kept and searched (ontology plan Phase 5).

`POST /internal/architecture/precedents` receives a decision as a `PrecedentRequest`; the
store keeps it with the embedding of its text, so the assessment's precedent lane finds
the nearest decided requirements without embedding them again.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from knowledge_portal.domain.architecture.precedents import (
    Precedent,
    PrecedentDecision,
    PrecedentSummary,
)
from knowledge_portal.domain.architecture.verdicts import ProductVerdict


@dataclass(frozen=True)
class PrecedentSystemRequest:
    id: str
    role: str | None = None
    change_type: str | None = None


@dataclass(frozen=True)
class PrecedentRequest:
    """A decision as requirement-portal sends it: the contract value."""

    precedent_id: str
    requirement_id: str
    version: str
    release_id: str
    text: tuple[str, ...]
    decision: PrecedentDecision
    decided_at: datetime
    suggested_verdict: ProductVerdict | None = None
    verdict: ProductVerdict | None = None
    offering_id: str | None = None
    concept_ids: tuple[str, ...] = ()
    systems: tuple[PrecedentSystemRequest, ...] = ()


@dataclass(frozen=True)
class PrecedentReceipt:
    precedent_id: str
    # False when the same decision, or a later one, was already kept.
    recorded: bool
    # Systems the release does not hold, left out of the precedent.
    dropped_systems: tuple[str, ...] = ()


@dataclass(frozen=True)
class PrecedentMatch:
    precedent: Precedent
    # Cosine similarity of the two texts' embeddings.
    similarity: float


class PrecedentStorePort(Protocol):
    def record(self, precedent: Precedent, embedding_model: str, vector: tuple[float, ...]) -> bool:
        """Keep the precedent unless the one kept for its id is the same or later; whether
        it was kept."""
        ...

    def get(self, precedent_id: str) -> Precedent | None: ...

    def nearest(
        self,
        embedding_model: str,
        vector: tuple[float, ...],
        limit: int,
        *,
        exclude_requirement: str | None = None,
    ) -> tuple[PrecedentMatch, ...]:
        """The decided precedents (a verdict given) whose text is nearest, best first, among
        those embedded with the same model."""
        ...

    def summaries(self) -> tuple[PrecedentSummary, ...]:
        """Per release, newest decision first."""
        ...
