"""The shared library, for knowledge admins; private working versions are owner-only."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from knowledge_portal.application.errors import UnsupportedDocumentError
from knowledge_portal.application.ports.library_admin import AdminGrant, LibraryAdminRecord
from knowledge_portal.application.ports.reference_index import ReferenceChunk
from knowledge_portal.application.ports.source_impact import DependencyImpactPage
from knowledge_portal.application.use_cases.document_library import (
    DocumentLibrary,
    LibraryView,
    OriginalPreview,
)
from knowledge_portal.application.use_cases.documents import UploadDocumentInput
from knowledge_portal.application.use_cases.library_admin import AdministerLibraryDocument
from knowledge_portal.application.use_cases.library_bulk import (
    BulkRetryLibrary,
    LibraryRetryResult,
    LibraryRetryScope,
)
from knowledge_portal.application.use_cases.library_governance import (
    LibraryDependencyPage,
    LibraryGovernance,
)
from knowledge_portal.application.use_cases.reference_knowledge import (
    CorpusBuildPreview,
    ReferenceKnowledge,
)
from knowledge_portal.application.use_cases.source_impact import DocumentSourceImpact
from knowledge_portal.domain.document.library import (
    ADMIN_REASON_MAX,
    OwnershipTransfer,
    ReviewedPassage,
)
from knowledge_portal.domain.identity.entities import ActorId
from knowledge_portal.interfaces.api.dependencies import (
    CurrentActorDep,
    get_document_library,
    get_document_source_impact,
    get_library_admin,
    get_library_governance,
    get_library_retry,
    get_reference_knowledge,
    limit_provider_calls,
    require_authenticated_actor,
)

router = APIRouter(
    prefix="/library", tags=["library"], dependencies=[Depends(require_authenticated_actor)]
)
LibraryDep = Annotated[DocumentLibrary, Depends(get_document_library)]
KnowledgeDep = Annotated[ReferenceKnowledge, Depends(get_reference_knowledge)]
GovernanceDep = Annotated[LibraryGovernance, Depends(get_library_governance)]
ImpactDep = Annotated[DocumentSourceImpact, Depends(get_document_source_impact)]
AdminDep = Annotated[AdministerLibraryDocument, Depends(get_library_admin)]
RetryDep = Annotated[BulkRetryLibrary, Depends(get_library_retry)]


@router.get("/documents/{document_id}/source-impact")
def document_source_impact(
    document_id: str,
    actor: CurrentActorDep,
    service: ImpactDep,
    response: Response,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    active_only: bool = False,
    query: str = Query("", max_length=200),
) -> DependencyImpactPage:
    """Where the owner's document is cited, and which citations need review."""
    response.headers["Cache-Control"] = "private, no-store"
    return service.page(
        document_id, actor, active_only=active_only, query=query, offset=offset, limit=limit
    )


@router.get("/documents/{document_id}/versions/{version_id}/blocks/{block_id}/original-preview")
def original_preview(
    document_id: str,
    version_id: str,
    block_id: str,
    actor: CurrentActorDep,
    service: LibraryDep,
    response: Response,
) -> OriginalPreview:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return service.preview_original(document_id, version_id, block_id, actor)


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)


search_router = APIRouter(tags=["knowledge"], dependencies=[Depends(require_authenticated_actor)])


@search_router.post("/knowledge/search", dependencies=[Depends(limit_provider_calls)])
def search(data: KnowledgeSearchRequest, service: KnowledgeDep) -> tuple[ReferenceChunk, ...]:
    return service.search(data.query)


@router.get("/documents/{document_id}/chunks/preview")
def preview_chunks(
    document_id: str, service: KnowledgeDep, actor: CurrentActorDep
) -> tuple[ReferenceChunk, ...]:
    return service.preview_review(document_id, actor)


class LibraryMutation(BaseModel):
    expected_version: int = Field(ge=1)


class LibraryOwnershipRequest(LibraryMutation):
    actor_id: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=2000)


@router.post("/documents/{document_id}/ownership")
def transfer_ownership(
    document_id: str, data: LibraryOwnershipRequest, service: GovernanceDep, actor: CurrentActorDep
) -> OwnershipTransfer:
    return service.transfer(
        document_id, actor, ActorId(data.actor_id), data.expected_version, data.reason
    )


class AdminGrantRequest(BaseModel):
    """Why a knowledge admin needs to act on a document they don't own."""

    reason: str = Field(min_length=1, max_length=ADMIN_REASON_MAX)


@router.post("/documents/{document_id}/admin-grant", status_code=201)
def open_admin_grant(
    document_id: str, data: AdminGrantRequest, service: AdminDep, actor: CurrentActorDep
) -> AdminGrant:
    """Act as admin on this document, on its owner's behalf, for the next eight hours."""
    return service.open(document_id, actor, data.reason)


@router.delete("/documents/{document_id}/admin-grant", status_code=204)
def end_admin_grant(document_id: str, service: AdminDep, actor: CurrentActorDep) -> None:
    service.end(document_id, actor)


@router.get("/documents/{document_id}/admin-record")
def admin_record(
    document_id: str, service: AdminDep, actor: CurrentActorDep
) -> tuple[LibraryAdminRecord, ...]:
    """Every override and bulk action that touched this document, newest first."""
    return service.history(document_id, actor)


@router.post("/retry/reading", status_code=202)
def retry_every_failed_reading(service: RetryDep, actor: CurrentActorDep) -> LibraryRetryResult:
    """Read again every document whose newest version's reading failed, whoever owns it."""
    return service.execute(LibraryRetryScope.READING, actor)


@router.post("/retry/indexing", status_code=202, dependencies=[Depends(limit_provider_calls)])
def retry_every_stopped_index(service: RetryDep, actor: CurrentActorDep) -> LibraryRetryResult:
    """Index again every approval whose indexing stopped; counted like a per-document retry."""
    return service.execute(LibraryRetryScope.INDEXING, actor)


@router.get("/documents/{document_id}/ownership/history")
def ownership_history(
    document_id: str, service: GovernanceDep, actor: CurrentActorDep
) -> tuple[OwnershipTransfer, ...]:
    return service.history(document_id, actor)


@router.get("/documents/{document_id}/dependencies")
def dependencies(
    document_id: str,
    service: GovernanceDep,
    actor: CurrentActorDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> LibraryDependencyPage:
    return service.dependencies(document_id, actor, offset, limit)


class LibraryReviewRequest(LibraryMutation):
    passages: list[ReviewedPassage] = Field(min_length=1, max_length=10000)
    explanation: str = Field(min_length=1, max_length=2000)


class LibraryApprovalRequest(LibraryMutation):
    revision_id: str = Field(min_length=1, max_length=200)
    fingerprint: str = Field(min_length=64, max_length=64)


class LibraryWithdrawalRequest(LibraryMutation):
    reason: str = Field(min_length=1, max_length=2000)


class CorpusBuildRequest(LibraryMutation):
    fingerprint: str = Field(min_length=64, max_length=64)
    index_identity: str = Field(min_length=1, max_length=1000)


class CorpusActivationRequest(LibraryMutation):
    manifest: str = Field(min_length=64, max_length=64)


@router.get("/documents/{document_id}/builds/preview")
def preview_build(
    document_id: str, service: KnowledgeDep, actor: CurrentActorDep
) -> CorpusBuildPreview:
    return service.preview_build(document_id, actor)


@router.post(
    "/documents/{document_id}/builds", status_code=202, dependencies=[Depends(limit_provider_calls)]
)
def build_corpus_member(
    document_id: str,
    data: CorpusBuildRequest,
    service: KnowledgeDep,
    library: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    service.build_review(
        document_id, actor, data.expected_version, data.fingerprint, data.index_identity
    )
    return library.get(document_id, actor)


@router.post("/documents/{document_id}/builds/{build_id}/activation")
def activate_build(
    document_id: str,
    build_id: str,
    data: CorpusActivationRequest,
    service: KnowledgeDep,
    library: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    service.activate_build(document_id, build_id, actor, data.expected_version, data.manifest)
    return library.get(document_id, actor)


@router.post("/documents/{document_id}/builds/{build_id}/discard")
def discard_build(
    document_id: str,
    build_id: str,
    data: LibraryMutation,
    service: KnowledgeDep,
    library: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    service.discard_build(document_id, build_id, actor, data.expected_version)
    return library.get(document_id, actor)


@router.post(
    "/documents/{document_id}/index-retry",
    status_code=202,
    dependencies=[Depends(limit_provider_calls)],
)
def retry_index(
    document_id: str, data: LibraryMutation, service: LibraryDep, actor: CurrentActorDep
) -> LibraryView:
    service.retry_index(document_id, data.expected_version, actor)
    return service.get(document_id, actor)


@router.get("/documents")
def list_documents(
    service: LibraryDep,
    actor: CurrentActorDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> tuple[LibraryView, ...]:
    return service.list(actor, offset, limit)


@router.get("/documents/{document_id}")
def get_document(document_id: str, service: LibraryDep, actor: CurrentActorDep) -> LibraryView:
    return service.get(document_id, actor)


@router.post("/ingestions", status_code=202)
async def submit(
    service: LibraryDep,
    actor: CurrentActorDep,
    file: Annotated[UploadFile, File()],
    title: str = Form(...),
    idempotency_key: str = Form(...),
    document_id: str | None = Form(None),
    expected_version: int | None = Form(None),
) -> LibraryView:
    content = await file.read(service.max_file_bytes + 1)
    if len(content) > service.max_file_bytes:
        raise UnsupportedDocumentError("Document exceeds the configured upload limit.")

    document = await run_in_threadpool(
        service.submit,
        title,
        UploadDocumentInput(file.filename or "", file.content_type or "", content),
        idempotency_key,
        actor,
        document_id,
        expected_version,
    )
    return service.get(document.id, actor)


@router.get("/documents/{document_id}/versions/{version_id}/original")
def original(
    document_id: str, version_id: str, service: LibraryDep, actor: CurrentActorDep
) -> Response:
    version, content = service.original(document_id, version_id, actor)
    return Response(
        content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
            "X-Document-Checksum": version.checksum,
        },
    )


@router.post("/documents/{document_id}/versions/{version_id}/review")
def review(
    document_id: str,
    version_id: str,
    data: LibraryReviewRequest,
    service: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    service.review(
        document_id,
        version_id,
        data.expected_version,
        actor,
        tuple(data.passages),
        data.explanation,
    )
    return service.get(document_id, actor)


@router.post("/documents/{document_id}/versions/{version_id}/approval")
def approve(
    document_id: str,
    version_id: str,
    data: LibraryApprovalRequest,
    service: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    service.approve(
        document_id, version_id, data.revision_id, data.fingerprint, data.expected_version, actor
    )
    return service.get(document_id, actor)


@router.post("/documents/{document_id}/withdrawal")
def withdraw(
    document_id: str, data: LibraryWithdrawalRequest, service: LibraryDep, actor: CurrentActorDep
) -> LibraryView:
    service.withdraw(document_id, data.expected_version, actor, data.reason)
    return service.get(document_id, actor)


@router.post("/documents/{document_id}/versions/{version_id}/retry", status_code=202)
def retry(
    document_id: str,
    version_id: str,
    data: LibraryMutation,
    service: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    service.control(document_id, version_id, data.expected_version, actor, retry=True)
    return service.get(document_id, actor)


@router.post("/documents/{document_id}/versions/{version_id}/cancellation")
def cancel(
    document_id: str,
    version_id: str,
    data: LibraryMutation,
    service: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    service.control(document_id, version_id, data.expected_version, actor, retry=False)
    return service.get(document_id, actor)
