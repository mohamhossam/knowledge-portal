"""The Knowledge Center front page's reads that no other screen makes (A′).

Routes translate HTTP to use-case calls and domain results to API schemas.
Every route here needs a knowledge admin, like the rest of the portal.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from knowledge_portal.application.use_cases.requirement_corpus import ReadRequirementCorpus
from knowledge_portal.interfaces.api.dependencies import (
    KnowledgeActorDep,
    get_read_requirement_corpus,
)
from knowledge_portal.interfaces.api.schemas.knowledge_center import RequirementCorpusResponse

router = APIRouter(prefix="/knowledge-center", tags=["knowledge-center"])


@router.get("/requirement-corpus", response_model=RequirementCorpusResponse)
def requirement_corpus(
    actor: KnowledgeActorDep,
    corpus: Annotated[ReadRequirementCorpus, Depends(get_read_requirement_corpus)],
) -> RequirementCorpusResponse:
    """Requirement work's corpus in counts. 503 when requirement work cannot answer."""
    return RequirementCorpusResponse.from_domain(corpus.execute(actor))
