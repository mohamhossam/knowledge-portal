"""This service's /internal routes, for requirement work only (requirement-portal ADR-0099).

Every route needs the `requirements` service token. The request and response
bodies are the shared contract values themselves: `ArchitectureQuery`,
`ArchitectureKnowledgeMatch`, `ReferenceEvidence` and `KnowledgeEvent`, plus
the read-only viewers' `CitedPassage` and `EvidenceChunk`.
`contracts/knowledge-internal.openapi.json` is the committed contract.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, FastAPI, Query, Response
from pydantic import BaseModel, Field

from knowledge_portal.application.ports.architecture_knowledge import (
    ArchitectureKnowledgeMatch,
    ArchitectureQuery,
)
from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.application.ports.knowledge_events import KnowledgeEvent
from knowledge_portal.application.ports.reference_grounding import ReferenceEvidence
from knowledge_portal.application.use_cases.cited_passages import CitedPassage, PassageCitation
from knowledge_portal.interfaces.api.dependencies import ContainerDep, require_service_caller
from knowledge_portal.interfaces.api.schemas.change_requests import (
    ApprovedBacklogRequest,
    ChangeRequestReceipt,
)

router = APIRouter(prefix="/internal", dependencies=[Depends(require_service_caller)])


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)


class PublishedResponse(BaseModel):
    has_published: bool


@router.post("/architecture/match")
def match(query: ArchitectureQuery, container: ContainerDep) -> ArchitectureKnowledgeMatch:
    return container.architecture_knowledge.match(query)


@router.get("/library/published")
def published(container: ContainerDep) -> PublishedResponse:
    return PublishedResponse(has_published=container.reference_knowledge.has_published())


@router.post("/library/search")
def search(body: SearchRequest, container: ContainerDep) -> list[ReferenceEvidence]:
    return list(container.reference_knowledge.search_evidence(body.query))


@router.post("/library/retrieve")
def retrieve(body: SearchRequest, container: ContainerDep) -> list[ReferenceEvidence]:
    return list(container.reference_knowledge.retrieve(body.query))


Identifier = Annotated[str, Query(min_length=1, max_length=200)]


@router.get("/library/passages")
def passage(
    container: ContainerDep,
    document_id: Identifier,
    publication_id: Identifier,
    version_id: Identifier,
    revision_id: Identifier,
    block_id: Identifier,
) -> CitedPassage:
    """A cited passage, only while its publication is live (409 otherwise)."""
    return container.cited_passages.read(
        PassageCitation(document_id, publication_id, version_id, revision_id, block_id)
    )


@router.post(
    "/change-requests",
    status_code=201,
    responses={200: {"description": "The same approval was delivered before."}},
)
def receive_change_request(
    body: ApprovedBacklogRequest, response: Response, container: ContainerDep
) -> ChangeRequestReceipt:
    """An approved backlog, kept once per final approval for a knowledge admin to read into a
    draft (requirement-portal ADR-0101, step 7). Delivering the same approval again answers
    200 with the first change request; the same approval for another subject is a 409."""
    item, created = container.receive_change_request.execute(body.to_backlog())
    if not created:
        response.status_code = 200
    return ChangeRequestReceipt(
        change_request_id=item.id, approval_id=item.approval_id, created=created
    )


@router.get("/architecture/releases/{release_id}/evidence/{chunk_id}")
def evidence(release_id: str, chunk_id: str, container: ContainerDep) -> EvidenceChunk:
    """Evidence of a published release; a draft answers 404."""
    return container.manage_architecture_knowledge.published_evidence(release_id, chunk_id)


@router.get("/events")
def events(
    container: ContainerDep,
    after: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, Any]]:
    return [_event(e) for e in container.knowledge_events.after(after, limit)]


def _event(event: KnowledgeEvent) -> dict[str, Any]:
    return {
        "seq": event.seq,
        "kind": event.kind,
        "subject_id": event.subject_id,
        "payload": event.payload,
        "created_at": event.created_at.isoformat(),
    }


def contract_openapi() -> dict[str, Any]:
    """This internal API on its own: the contract requirement work builds against."""
    application = FastAPI(title="Knowledge service internal API")
    application.include_router(router)
    return application.openapi()
