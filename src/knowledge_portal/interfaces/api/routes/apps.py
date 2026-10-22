"""The knowledge base's API for apps, under /apps/v2 (ADR-0126).

Any app registered in APP_CLIENT_IDS or APP_TOKENS may call it, under the name it was
registered with; no app is named here. The request and response bodies are the
contract values themselves: `ArchitectureQuery`,
`ArchitectureKnowledgeMatch`, `AssessmentQuery`, `ArchitectureAssessment`,
`PrecedentReceipt`, `ReferenceEvidence`, `DeliveryReceipt` and `KnowledgeEvent`, plus
the read-only viewers' `CitedPassage` and `EvidenceChunk`, and a published historic
requirement's content, read a page at a time (ADR-0102, amendment 1).
`contracts/knowledge-apps.openapi.json` is the committed contract.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, FastAPI, Path, Query, Response
from pydantic import BaseModel, Field

from knowledge_portal.application.ports.architecture_knowledge import (
    ArchitectureKnowledgeMatch,
)
from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.application.ports.knowledge_events import KnowledgeEvent
from knowledge_portal.application.ports.precedents import PrecedentReceipt
from knowledge_portal.application.ports.reference_grounding import ReferenceEvidence
from knowledge_portal.application.ports.requirement_assessment import ArchitectureAssessment
from knowledge_portal.application.use_cases.cited_passages import CitedPassage, PassageCitation
from knowledge_portal.domain.historic.historic_requirement import CONTENT_PAGE_MAX, ContentPart
from knowledge_portal.interfaces.api.dependencies import (
    AppDep,
    ArchitectureMatchDep,
    CitedPassagesDep,
    HistoricImportsDep,
    KnowledgeEventsDep,
    ManageArchitectureKnowledgeDep,
    ReceiveChangeRequestDep,
    ReceiveDeliveryDep,
    RecordPrecedentDep,
    ReferenceKnowledgeDep,
    RequirementAssessmentDep,
    SystemReviewsDep,
    require_app,
)
from knowledge_portal.interfaces.api.schemas.app_queries import (
    ArchitectureQuery,
    AssessmentQuery,
)
from knowledge_portal.interfaces.api.schemas.change_requests import (
    ApprovedBacklogRequest,
    ChangeRequestReceipt,
    DeliveryReceipt,
    DeliveryRequest,
    DeliveryState,
)
from knowledge_portal.interfaces.api.schemas.historic import (
    HistoricItemEntry,
    HistoricItemsPage,
    HistoricPassageEntry,
    HistoricPassagesPage,
)
from knowledge_portal.interfaces.api.schemas.precedents import PrecedentBody

# The path carries the contract's MAJOR version: a breaking change is served under the next.
APPS_PREFIX = "/apps"
router = APIRouter(prefix=f"{APPS_PREFIX}/v2", dependencies=[Depends(require_app)])


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)


class PublishedResponse(BaseModel):
    has_published: bool


@router.post("/architecture/match")
def match(
    query: ArchitectureQuery, architecture: ArchitectureMatchDep
) -> ArchitectureKnowledgeMatch:
    return architecture.match(query.to_query())


@router.post("/architecture/assess")
def assess(query: AssessmentQuery, assessment: RequirementAssessmentDep) -> ArchitectureAssessment:
    """A whole requirement's product verdict, systems, gaps and owners (ontology plan Phase 3).

    With no verdict yet, the answer carries the questions to ask instead.
    """
    return assessment.assess(query.to_query())


@router.post(
    "/architecture/precedents",
    status_code=201,
    responses={200: {"description": "The same decision, or a later one, is already kept."}},
)
def record_precedent(
    body: PrecedentBody, response: Response, precedents: RecordPrecedentDep
) -> PrecedentReceipt:
    """A person's decision on the suggested verdict, made in the sending app (ontology plan
    Phase 5).

    Kept once per analysis: a later decision replaces it, and the same one delivered again,
    or an older one arriving late, answers 200 and changes nothing. The release must be
    published (404 otherwise); systems and concepts it does not hold are left out, and the
    systems are named in the receipt.
    """
    receipt = precedents.execute(body.to_request())
    if not receipt.recorded:
        response.status_code = 200
    return receipt


@router.get("/library/published")
def published(library: ReferenceKnowledgeDep) -> PublishedResponse:
    return PublishedResponse(has_published=library.has_published())


@router.post("/library/search")
def search(body: SearchRequest, library: ReferenceKnowledgeDep) -> list[ReferenceEvidence]:
    return list(library.search_evidence(body.query))


@router.post("/library/retrieve")
def retrieve(body: SearchRequest, library: ReferenceKnowledgeDep) -> list[ReferenceEvidence]:
    return list(library.retrieve(body.query))


Identifier = Annotated[str, Query(min_length=1, max_length=200)]


@router.get("/library/passages")
def passage(
    passages: CitedPassagesDep,
    document_id: Identifier,
    publication_id: Identifier,
    version_id: Identifier,
    revision_id: Identifier,
    block_id: Identifier,
) -> CitedPassage:
    """A cited passage, only while its publication is live (409 otherwise)."""
    return passages.read(
        PassageCitation(document_id, publication_id, version_id, revision_id, block_id)
    )


@router.post(
    "/change-requests",
    status_code=201,
    responses={200: {"description": "The same approval was delivered before."}},
)
def receive_change_request(
    body: ApprovedBacklogRequest, response: Response, receive: ReceiveChangeRequestDep, app: AppDep
) -> ChangeRequestReceipt:
    """An approved backlog, kept once per final approval for a knowledge admin to read into a
    draft, with the name of the app that sent it. Delivering the same approval again answers
    200 with the first change request; the same approval for another subject is a 409."""
    item, created = receive.execute(body.to_backlog(), app)
    if not created:
        response.status_code = 200
    return ChangeRequestReceipt(
        change_request_id=item.id, approval_id=item.approval_id, created=created
    )


@router.post(
    "/change-requests/deliveries",
    status_code=201,
    responses={
        200: {"description": "The same closure was delivered before, or the Epic was removed."}
    },
)
def receive_delivery(
    body: DeliveryRequest, response: Response, deliveries: ReceiveDeliveryDep, app: AppDep
) -> DeliveryReceipt:
    """A published Epic closed or removed in the work-item tracker (ontology plan Phase 7).

    A closure is kept once per delivery id as a catalogue change, for a knowledge admin to
    read into a draft; it replaces one of the same Epic still waiting. A removal withdraws
    the Epic's catalogue changes still waiting and answers 200 with their ids. The same
    delivery id for another body is a 409."""
    if body.state is DeliveryState.REMOVED:
        withdrawn = deliveries.removed(body.requirement_id, body.epic.external_id, app)
        response.status_code = 200
        return DeliveryReceipt(change_request_id=None, created=False, withdrawn=list(withdrawn))
    item, created = deliveries.closed(body.to_delivery(), app)
    if not created:
        response.status_code = 200
    return DeliveryReceipt(change_request_id=item.id, created=created, withdrawn=[])


@router.get("/architecture/releases/{release_id}/evidence/{chunk_id}")
def evidence(
    release_id: str,
    chunk_id: str,
    knowledge: ManageArchitectureKnowledgeDep,
    reviews: SystemReviewsDep,
) -> EvidenceChunk:
    """Evidence of a published release; a draft answers 404. A system's own record says when
    that system falls due for review (Knowledge Center D)."""
    chunk = knowledge.published_evidence(release_id, chunk_id)
    return reviews.with_review(chunk)


@router.get("/events")
def events(
    outbox: KnowledgeEventsDep,
    after: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, Any]]:
    return [_event(e) for e in outbox.after(after, limit)]


HistoricId = Annotated[str, Path(min_length=1, max_length=200)]
Publication = Annotated[int, Query(ge=1, le=100_000)]
Offset = Annotated[int, Query(ge=0, le=1_000_000)]
PageLimit = Annotated[int, Query(ge=1, le=CONTENT_PAGE_MAX)]


@router.get(
    "/historic-requirements/{historic_requirement_id}/passages",
    responses={404: {"description": "Not published"}, 409: {"description": "Superseded"}},
)
def historic_passages(
    historic_requirement_id: HistoricId,
    historic: HistoricImportsDep,
    publication: Publication,
    offset: Offset = 0,
    limit: PageLimit = CONTENT_PAGE_MAX,
) -> HistoricPassagesPage:
    """A published historic requirement's BRD passages, a page at a time. An older
    publication answers 409; a withdrawn or unknown record 404 (ADR-0102, amendment 1)."""
    page = historic.content(
        historic_requirement_id, publication, ContentPart.PASSAGES, offset, limit
    )
    return HistoricPassagesPage(
        historic_requirement_id=historic_requirement_id,
        publication=page.publication,
        fingerprint=page.fingerprint,
        entries=[HistoricPassageEntry.model_validate(entry) for entry in page.entries],
        next_offset=page.next_offset,
    )


@router.get(
    "/historic-requirements/{historic_requirement_id}/items",
    responses={404: {"description": "Not published"}, 409: {"description": "Superseded"}},
)
def historic_items(
    historic_requirement_id: HistoricId,
    historic: HistoricImportsDep,
    publication: Publication,
    offset: Offset = 0,
    limit: PageLimit = CONTENT_PAGE_MAX,
) -> HistoricItemsPage:
    """A published historic requirement's Epics, Features and User Stories, a page at a time."""
    page = historic.content(historic_requirement_id, publication, ContentPart.ITEMS, offset, limit)
    return HistoricItemsPage(
        historic_requirement_id=historic_requirement_id,
        publication=page.publication,
        fingerprint=page.fingerprint,
        entries=[HistoricItemEntry.model_validate(entry) for entry in page.entries],
        next_offset=page.next_offset,
    )


def _event(event: KnowledgeEvent) -> dict[str, Any]:
    return {
        "seq": event.seq,
        "kind": event.kind,
        "subject_id": event.subject_id,
        "payload": event.payload,
        "created_at": event.created_at.isoformat(),
    }


# The app API's version, MAJOR.MINOR.PATCH: a breaking change raises MAJOR (served under a new
# path, released with the apps that call it), an additive one raises MINOR, a description-only
# one may raise PATCH. CI checks it against the base branch's contract
# (scripts/check_app_contract.py, interfaces/api/contract_compat.py). 2.0.0 is the internal
# API's 1.0.0 opened to any app under /apps/v2 (ADR-0126).
APP_CONTRACT_VERSION = "2.0.0"


def contract_openapi() -> dict[str, Any]:
    """The app API on its own: the contract apps build against."""
    application = FastAPI(title="Knowledge base API for apps", version=APP_CONTRACT_VERSION)
    application.include_router(router)
    return application.openapi()
