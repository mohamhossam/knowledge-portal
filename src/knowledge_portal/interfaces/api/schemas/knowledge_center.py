"""The Knowledge Center front page's own reads (A′)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from knowledge_portal.application.ports.requirement_corpus import CorpusSummary


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
            open_findings=OpenFindingAgesResponse(
                under_7_days=ages.under_7_days,
                from_7_to_30_days=ages.from_7_to_30_days,
                over_30_days=ages.over_30_days,
            ),
            as_of=summary.as_of,
        )
