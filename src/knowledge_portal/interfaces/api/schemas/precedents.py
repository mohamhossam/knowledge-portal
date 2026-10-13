"""HTTP shapes for decided verdicts (ontology plan Phase 5).

`PrecedentBody` is what requirement-portal sends when a Requirement Owner decides the
suggested verdict. `PrecedentSummariesResponse` is what a knowledge admin reads: counts
per release and the concepts most overridden, never a requirement's text.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field

from knowledge_portal.application.ports.precedents import (
    PrecedentRequest,
    PrecedentSystemRequest,
)
from knowledge_portal.application.use_cases.precedents import ReleasePrecedents
from knowledge_portal.domain.architecture.precedents import (
    CONCEPT_LIMIT,
    SYSTEM_LIMIT,
    PrecedentDecision,
)
from knowledge_portal.domain.architecture.verdicts import ProductVerdict
from knowledge_portal.interfaces.api.schemas.bounds import (
    MAX_ITEMS,
    Identifier,
    RequiredIdentifier,
    Text,
)


class PrecedentSystemBody(BaseModel):
    id: RequiredIdentifier
    # Kept as written: a role or change type added later must not refuse the decision.
    role: Identifier | None = None
    change_type: Identifier | None = None


class PrecedentBody(BaseModel):
    """A verdict decision on one requirement analysis."""

    # requirement-portal's analysis id; a later decision on it replaces the earlier one.
    precedent_id: RequiredIdentifier
    requirement_id: RequiredIdentifier
    # "analysis-id@version": the analysis version decided.
    version: RequiredIdentifier
    # The release the requirement was assessed against.
    release_id: RequiredIdentifier
    # The requirement's text as it was assessed, a part per item.
    text: list[Text] = Field(min_length=1, max_length=MAX_ITEMS)
    decision: PrecedentDecision
    decided_at: AwareDatetime
    suggested_verdict: ProductVerdict | None = None
    verdict: ProductVerdict | None = None
    offering_id: Identifier | None = None
    concept_ids: list[RequiredIdentifier] = Field(default=[], max_length=CONCEPT_LIMIT)
    systems: list[PrecedentSystemBody] = Field(default=[], max_length=SYSTEM_LIMIT)

    def to_request(self) -> PrecedentRequest:
        return PrecedentRequest(
            precedent_id=self.precedent_id,
            requirement_id=self.requirement_id,
            version=self.version,
            release_id=self.release_id,
            text=tuple(self.text),
            decision=self.decision,
            decided_at=self.decided_at,
            suggested_verdict=self.suggested_verdict,
            verdict=self.verdict,
            offering_id=self.offering_id or None,
            concept_ids=tuple(self.concept_ids),
            systems=tuple(
                PrecedentSystemRequest(item.id, item.role or None, item.change_type or None)
                for item in self.systems
            ),
        )


class ConceptOverridesResponse(BaseModel):
    concept_id: str
    label: str
    decided: int
    overridden: int


class ReleasePrecedentsResponse(BaseModel):
    release_id: str
    release_name: str | None
    accepted: int
    overridden: int
    unknown: int
    # Overridden among the decided; null before any suggestion was decided.
    override_rate: float | None
    last_decided_at: datetime | None
    # Concepts a decision needed, most overridden first.
    concepts: list[ConceptOverridesResponse]

    @classmethod
    def from_domain(cls, item: ReleasePrecedents) -> ReleasePrecedentsResponse:
        summary = item.summary
        return cls(
            release_id=summary.release_id,
            release_name=item.release_name,
            accepted=summary.accepted,
            overridden=summary.overridden,
            unknown=summary.unknown,
            override_rate=summary.override_rate,
            last_decided_at=summary.last_decided_at,
            concepts=[
                ConceptOverridesResponse(
                    concept_id=concept.concept_id,
                    label=concept.label,
                    decided=concept.decided,
                    overridden=concept.overridden,
                )
                for concept in item.concepts
            ],
        )


class PrecedentSummariesResponse(BaseModel):
    """How reviewers decided suggested verdicts, per release, newest decision first."""

    releases: list[ReleasePrecedentsResponse]

    @classmethod
    def from_domain(cls, items: tuple[ReleasePrecedents, ...]) -> PrecedentSummariesResponse:
        return cls(releases=[ReleasePrecedentsResponse.from_domain(item) for item in items])
