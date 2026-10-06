"""The Knowledge Center's Requirement knowledge reads (A′) and its rows, findings and
nudges (B2)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from knowledge_portal.application.ports.requirement_corpus import (
    CorpusFindingsPage,
    CorpusRequirementsPage,
    CorpusState,
    CorpusSummary,
    FindingAge,
    FindingKind,
    IndexState,
    MembershipResult,
    NudgeReceipt,
    ReindexResult,
    ReindexScope,
)


class OpenFindingAgesResponse(BaseModel):
    under_7_days: int
    from_7_to_30_days: int
    over_30_days: int


class RequirementCorpusResponse(BaseModel):
    """Requirement work's corpus in counts; never which Requirements."""

    requirements: int
    duplicates: int
    current: int
    waiting: int
    failed: int
    rebuild_required: bool
    open_findings: OpenFindingAgesResponse
    as_of: datetime
    retired: int

    @classmethod
    def from_domain(cls, summary: CorpusSummary) -> RequirementCorpusResponse:
        ages = summary.open_findings
        return cls(
            requirements=summary.requirements,
            duplicates=summary.duplicates,
            current=summary.current,
            waiting=summary.waiting,
            failed=summary.failed,
            rebuild_required=summary.rebuild_required,
            retired=summary.retired,
            open_findings=OpenFindingAgesResponse(
                under_7_days=ages.under_7_days,
                from_7_to_30_days=ages.from_7_to_30_days,
                over_30_days=ages.over_30_days,
            ),
            as_of=summary.as_of,
        )


class _FromDomain(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PersonNameResponse(_FromDomain):
    """An id and a display name; never an email."""

    id: str
    display_name: str


class CorpusRequirementResponse(_FromDomain):
    requirement_id: str
    title: str
    duplicate: bool
    owner: PersonNameResponse | None
    index_state: IndexState
    last_screened_at: datetime | None
    open_findings: int
    retired: RetiredMarkResponse | None


class RetiredMarkResponse(_FromDomain):
    at: datetime
    by: str
    reason: str


class CorpusRequirementsResponse(_FromDomain):
    """Requirements by title: identity and state, never content."""

    items: list[CorpusRequirementResponse]
    next_offset: int | None

    @classmethod
    def from_domain(cls, page: CorpusRequirementsPage) -> CorpusRequirementsResponse:
        return cls.model_validate(page)


class FindingSideResponse(_FromDomain):
    requirement_id: str
    title: str
    owner: PersonNameResponse | None


class NudgeMarkResponse(_FromDomain):
    at: datetime
    by: str


class CorpusFindingResponse(_FromDomain):
    finding_id: str
    kind: FindingKind
    rationale: str
    raised_at: datetime
    age: FindingAge
    subject: FindingSideResponse
    related: FindingSideResponse
    last_nudge: NudgeMarkResponse | None
    next_nudge_at: datetime | None


class CorpusFindingsResponse(_FromDomain):
    """Findings in force, the longest-standing first."""

    items: list[CorpusFindingResponse]
    next_offset: int | None

    @classmethod
    def from_domain(cls, page: CorpusFindingsPage) -> CorpusFindingsResponse:
        return cls.model_validate(page)


class NudgeResponse(_FromDomain):
    finding_id: str
    nudged_at: datetime
    recipients: list[str]
    next_nudge_at: datetime

    @classmethod
    def from_domain(cls, receipt: NudgeReceipt) -> NudgeResponse:
        return cls.model_validate(receipt)


class CorpusActionRequest(BaseModel):
    """Why: requirement work records it with the action and tells the owner."""

    reason: str = Field(min_length=1, max_length=500)


class MembershipResponse(_FromDomain):
    requirement_id: str
    state: CorpusState
    changed_at: datetime
    closed_findings: int
    notified: str | None

    @classmethod
    def from_domain(cls, result: MembershipResult) -> MembershipResponse:
        return cls.model_validate(result)


class ReindexRequest(BaseModel):
    scope: ReindexScope
    requirement_ids: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(
        default_factory=list, max_length=500
    )


class ReindexResponse(_FromDomain):
    requirements: int

    @classmethod
    def from_domain(cls, result: ReindexResult) -> ReindexResponse:
        return cls.model_validate(result)
