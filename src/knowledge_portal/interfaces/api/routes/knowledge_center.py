"""The Knowledge Center's Requirement knowledge table: counts (A′), rows, findings and
nudges (B2).

Routes translate HTTP to use-case calls and domain results to API schemas. Every route here
needs a knowledge admin, like the rest of the portal. Requirement work answers each one; when it
cannot, the route answers 503 rather than an empty table.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from knowledge_portal.application.ports.requirement_corpus import (
    CorpusQuery,
    FindingAge,
    FindingKind,
    FindingQuery,
    IndexState,
)
from knowledge_portal.application.use_cases.requirement_corpus import (
    NudgeFindingOwners,
    ReadRequirementCorpus,
)
from knowledge_portal.interfaces.api.dependencies import (
    CurrentActorDep,
    KnowledgeActorDep,
    get_nudge_finding_owners,
    get_read_requirement_corpus,
)
from knowledge_portal.interfaces.api.schemas.knowledge_center import (
    CorpusFindingsResponse,
    CorpusRequirementsResponse,
    NudgeResponse,
    RequirementCorpusResponse,
)

router = APIRouter(prefix="/knowledge-center", tags=["knowledge-center"])
CorpusDep = Annotated[ReadRequirementCorpus, Depends(get_read_requirement_corpus)]
OwnerQuery = Annotated[str | None, Query(min_length=1, max_length=200)]


@router.get("/requirement-corpus", response_model=RequirementCorpusResponse)
def requirement_corpus(actor: KnowledgeActorDep, corpus: CorpusDep) -> RequirementCorpusResponse:
    """Requirement work's corpus in counts. 503 when requirement work cannot answer."""
    return RequirementCorpusResponse.from_domain(corpus.execute(actor))


@router.get("/requirement-corpus/requirements", response_model=CorpusRequirementsResponse)
def corpus_requirements(
    actor: KnowledgeActorDep,
    corpus: CorpusDep,
    index_state: IndexState | None = None,
    owner_id: OwnerQuery = None,
    q: str = Query("", max_length=200),
    open_findings_only: bool = False,
    not_screened_for_days: int | None = Query(None, ge=1, le=3650),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> CorpusRequirementsResponse:
    """The corpus Requirement by Requirement, by title: identity and state, never content."""
    query = CorpusQuery(index_state, owner_id, q, open_findings_only, not_screened_for_days)
    return CorpusRequirementsResponse.from_domain(corpus.requirements(actor, query, offset, limit))


@router.get("/requirement-corpus/findings", response_model=CorpusFindingsResponse)
def corpus_findings(
    actor: KnowledgeActorDep,
    corpus: CorpusDep,
    kind: FindingKind | None = None,
    age: FindingAge | None = None,
    owner_id: OwnerQuery = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> CorpusFindingsResponse:
    """Possible duplicates and contradictions in force, the longest-standing first."""
    query = FindingQuery(kind, age, owner_id)
    return CorpusFindingsResponse.from_domain(corpus.findings(actor, query, offset, limit))


@router.post(
    "/requirement-corpus/findings/{finding_id}/nudge",
    response_model=NudgeResponse,
    responses={404: {"description": "No such finding"}, 409: {"description": "Not now"}},
)
def nudge_finding_owners(
    finding_id: str,
    actor: CurrentActorDep,
    nudge: Annotated[NudgeFindingOwners, Depends(get_nudge_finding_owners)],
) -> NudgeResponse:
    """Ask both Requirements' owners to decide a finding, in the admin's name.

    409 with requirement work's reason when the finding was decided, a Requirement changed,
    it was nudged in the last 7 days, or neither Requirement has an owner.
    """
    return NudgeResponse.from_domain(nudge.execute(actor, finding_id))
