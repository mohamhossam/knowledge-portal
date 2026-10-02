"""This service's /internal routes, for requirement work only (requirement-portal ADR-0099).

Every route needs the `requirements` service token. The request and response
bodies are the shared contract values themselves: `ArchitectureQuery`,
`ArchitectureKnowledgeMatch`, `ReferenceEvidence` and `KnowledgeEvent`.
`contracts/knowledge-internal.openapi.json` is the committed contract.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, FastAPI, Query
from pydantic import BaseModel, Field

from knowledge_portal.application.ports.architecture_knowledge import (
    ArchitectureKnowledgeMatch,
    ArchitectureQuery,
)
from knowledge_portal.application.ports.knowledge_events import KnowledgeEvent
from knowledge_portal.application.ports.reference_grounding import ReferenceEvidence
from knowledge_portal.interfaces.api.dependencies import ContainerDep, require_service_caller

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
