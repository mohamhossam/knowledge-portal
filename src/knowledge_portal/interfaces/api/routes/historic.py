"""Historic Requirements: import old BRDs, link their breakdown, publish, refresh, withdraw.

Every route is a knowledge admin's (Knowledge Center E, ADR-0102). Nothing here writes to
Azure DevOps: reading a breakdown is the only thing done there, by a background job.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool

from knowledge_portal.application.errors import UnsupportedDocumentError
from knowledge_portal.application.use_cases.architecture_documents import (
    MAX_BATCH_FILES,
    IncomingFile,
)
from knowledge_portal.application.use_cases.historic_requirements import (
    PAGE_MAX,
    HistoricImports,
)
from knowledge_portal.domain.historic.historic_requirement import HistoricStatus
from knowledge_portal.interfaces.api.dependencies import (
    CurrentActorDep,
    get_historic_imports,
    require_authenticated_actor,
)
from knowledge_portal.interfaces.api.schemas.historic import (
    HistoricDetail,
    HistoricImportResponse,
    HistoricPageResponse,
    LinkRequest,
    RenameRequest,
    SharedRootsResponse,
    SharedRootView,
    StatusFilter,
    Versioned,
    WithdrawRequest,
)

router = APIRouter(
    prefix="/historic-requirements",
    tags=["historic requirements"],
    dependencies=[Depends(require_authenticated_actor)],
)
ImportsDep = Annotated[HistoricImports, Depends(get_historic_imports)]
VersionQuery = Annotated[int, Query(ge=1)]


@router.get("")
def list_historic(
    imports: ImportsDep,
    status: StatusFilter | None = None,
    q: Annotated[str, Query(max_length=200)] = "",
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=PAGE_MAX)] = 50,
) -> HistoricPageResponse:
    """Newest first, with how many there are in each state."""
    page = imports.list(None if status is None else HistoricStatus(status), q, offset, limit)
    return HistoricPageResponse.of(page, imports.counts(), imports.refresh_waiting())


async def _incoming(file: UploadFile, max_bytes: int) -> IncomingFile:
    # One byte past the limit is enough for validation to refuse an oversized file.
    content = await file.read(max_bytes + 1)
    return IncomingFile(file.filename or "", file.content_type or "", content)


@router.post("/batch", status_code=201)
async def import_brds(
    imports: ImportsDep,
    actor: CurrentActorDep,
    files: Annotated[list[UploadFile], File(max_length=MAX_BATCH_FILES)],
) -> HistoricImportResponse:
    """Up to twenty BRDs (Word or PDF): each starts its own draft, or is refused with why."""
    if len(files) > MAX_BATCH_FILES:
        raise UnsupportedDocumentError(f"Choose at most {MAX_BATCH_FILES} files at a time.")
    incoming = tuple([await _incoming(file, imports.max_bytes) for file in files])
    results = await run_in_threadpool(imports.import_files, incoming, actor)
    return HistoricImportResponse(results=list(results))


@router.get("/{historic_id}")
def get_historic(historic_id: str, imports: ImportsDep) -> HistoricDetail:
    return HistoricDetail.of(imports.get(historic_id))


@router.get("/{historic_id}/shared-roots")
def shared_roots(historic_id: str, imports: ImportsDep) -> SharedRootsResponse:
    """Its roots and suggested ids that other historic requirements already hold as roots."""
    return SharedRootsResponse(
        items=[SharedRootView.of(shared) for shared in imports.shared_roots(historic_id)]
    )


@router.patch("/{historic_id}")
def rename_historic(historic_id: str, data: RenameRequest, imports: ImportsDep) -> HistoricDetail:
    return HistoricDetail.of(imports.rename(historic_id, data.title, data.expected_version))


@router.delete("/{historic_id}", status_code=204)
def discard_historic(
    historic_id: str, expected_version: VersionQuery, imports: ImportsDep
) -> Response:
    """Remove a draft that was never published, with its files."""
    imports.discard(historic_id, expected_version)
    return Response(status_code=204)


@router.post("/{historic_id}/brds")
async def add_brd(
    historic_id: str,
    imports: ImportsDep,
    actor: CurrentActorDep,
    file: Annotated[UploadFile, File()],
    expected_version: Annotated[int, Form(ge=1)],
) -> HistoricDetail:
    incoming = await _incoming(file, imports.max_bytes)
    updated = await run_in_threadpool(
        imports.add_brd, historic_id, incoming, expected_version, actor
    )
    return HistoricDetail.of(updated)


@router.post("/{historic_id}/brds/{brd_id}/reading")
def read_brd_again(
    historic_id: str, brd_id: str, data: Versioned, imports: ImportsDep, actor: CurrentActorDep
) -> HistoricDetail:
    return HistoricDetail.of(imports.read_again(historic_id, brd_id, data.expected_version, actor))


@router.put("/{historic_id}/work-items")
def link_work_items(
    historic_id: str, data: LinkRequest, imports: ImportsDep, actor: CurrentActorDep
) -> HistoricDetail:
    """Name its root work items, and read the breakdown beneath them from Azure DevOps."""
    return HistoricDetail.of(
        imports.link(historic_id, tuple(data.root_ids), data.expected_version, actor)
    )


@router.post("/{historic_id}/publication")
def publish_historic(
    historic_id: str, data: Versioned, imports: ImportsDep, actor: CurrentActorDep
) -> HistoricDetail:
    return HistoricDetail.of(imports.publish(historic_id, data.expected_version, actor))


@router.post("/{historic_id}/withdrawal")
def withdraw_historic(
    historic_id: str, data: WithdrawRequest, imports: ImportsDep, actor: CurrentActorDep
) -> HistoricDetail:
    return HistoricDetail.of(
        imports.withdraw(historic_id, data.reason, data.expected_version, actor)
    )


@router.post("/{historic_id}/refresh")
def refresh_historic(
    historic_id: str, data: Versioned, imports: ImportsDep, actor: CurrentActorDep
) -> HistoricDetail:
    """Read a published breakdown again; what changed waits to be accepted or discarded."""
    return HistoricDetail.of(imports.refresh(historic_id, data.expected_version, actor))


@router.post("/{historic_id}/refresh/acceptance")
def accept_refresh(
    historic_id: str, data: Versioned, imports: ImportsDep, actor: CurrentActorDep
) -> HistoricDetail:
    return HistoricDetail.of(imports.accept_refresh(historic_id, data.expected_version, actor))


@router.delete("/{historic_id}/refresh")
def discard_refresh(
    historic_id: str, expected_version: VersionQuery, imports: ImportsDep
) -> HistoricDetail:
    return HistoricDetail.of(imports.discard_refresh(historic_id, expected_version))
