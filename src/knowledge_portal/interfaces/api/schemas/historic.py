"""HTTP shapes of historic Requirements (Knowledge Center E, ADR-0102)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from knowledge_portal.application.use_cases.architecture_documents import FileResult
from knowledge_portal.application.use_cases.historic_requirements import HistoricPage, SharedRoot
from knowledge_portal.domain.historic.historic_requirement import (
    REASON_MAX,
    ROOTS_MAX,
    TITLE_MAX,
    BrdStage,
    HistoricBrd,
    HistoricRequirement,
    HistoricStatus,
    ImportRun,
    RunKind,
    RunStatus,
)
from knowledge_portal.domain.historic.work_items import (
    Breakdown,
    ChangeKind,
    ItemProblem,
    LineageNode,
    WorkItem,
    WorkItemType,
)
from knowledge_portal.domain.identity.entities import ActorSnapshot

# Azure DevOps ids are 32-bit integers.
WorkItemId = Annotated[int, Field(ge=1, le=2_147_483_647)]


class ActorRef(BaseModel):
    id: str
    display_name: str

    @classmethod
    def of(cls, actor: ActorSnapshot) -> ActorRef:
        return cls(id=actor.id.value, display_name=actor.display_name)


class PassageView(BaseModel):
    block_id: str
    label: str
    section_path: list[str]
    text: str


class ReadingWarning(BaseModel):
    code: str
    severity: str
    message: str
    block_id: str | None = None


class BrdView(BaseModel):
    id: str
    filename: str
    mime_type: str
    size_bytes: int
    checksum: str
    uploaded_at: datetime
    uploaded_by: ActorRef
    stage: BrdStage
    error: str | None
    warnings: list[ReadingWarning]
    passages: list[PassageView]

    @classmethod
    def of(cls, brd: HistoricBrd) -> BrdView:
        return cls(
            id=brd.id,
            filename=brd.filename,
            mime_type=brd.mime_type,
            size_bytes=brd.size_bytes,
            checksum=brd.checksum,
            uploaded_at=brd.uploaded_at,
            uploaded_by=ActorRef.of(brd.uploaded_by),
            stage=brd.stage,
            error=brd.error,
            warnings=[
                ReadingWarning(
                    code=w.code, severity=w.severity.value, message=w.message, block_id=w.block_id
                )
                for w in brd.warnings
            ],
            passages=[
                PassageView(
                    block_id=block.id,
                    label=block.label,
                    section_path=list(block.section_path),
                    text=block.text or "",
                )
                for block in brd.passages
            ],
        )


class SuggestionView(BaseModel):
    work_item_id: int
    block_id: str
    label: str
    quote: str


class ItemErrorView(BaseModel):
    work_item_id: int
    problem: ItemProblem
    detail: str


class RunView(BaseModel):
    id: str
    kind: RunKind
    status: RunStatus
    root_ids: list[int]
    started_at: datetime
    started_by: ActorRef
    done: int
    total: int
    item_errors: list[ItemErrorView]
    failure: str | None
    finished_at: datetime | None

    @classmethod
    def of(cls, run: ImportRun) -> RunView:
        return cls(
            id=run.id,
            kind=run.kind,
            status=run.status,
            root_ids=list(run.root_ids),
            started_at=run.started_at,
            started_by=ActorRef.of(run.started_by),
            done=run.done,
            total=run.total,
            item_errors=[_error(e) for e in run.item_errors],
            failure=run.failure,
            finished_at=run.finished_at,
        )


def _error(error: object) -> ItemErrorView:
    return ItemErrorView.model_validate(error, from_attributes=True)


class WorkItemView(BaseModel):
    id: int
    type: WorkItemType
    title: str
    state: str
    revision: int
    url: str
    description: str
    acceptance_criteria: str
    area_path: str
    iteration_path: str
    tags: list[str]
    parent_id: int | None

    @classmethod
    def of(cls, item: WorkItem) -> WorkItemView:
        return cls(
            id=item.id,
            type=item.type,
            title=item.title,
            state=item.state,
            revision=item.revision,
            url=item.url,
            description=item.description,
            acceptance_criteria=item.acceptance_criteria,
            area_path=item.area_path,
            iteration_path=item.iteration_path,
            tags=list(item.tags),
            parent_id=item.parent_id,
        )


class LineageNodeView(BaseModel):
    item: WorkItemView
    children: list[LineageNodeView]

    @classmethod
    def of(cls, node: LineageNode) -> LineageNodeView:
        return cls(item=WorkItemView.of(node.item), children=[cls.of(c) for c in node.children])


class TypeCount(BaseModel):
    type: str
    count: int


class BreakdownView(BaseModel):
    root_ids: list[int]
    fetched_at: datetime
    epics: int
    features: int
    stories: int
    not_imported: list[TypeCount]
    errors: list[ItemErrorView]
    lineage: list[LineageNodeView]

    @classmethod
    def of(cls, breakdown: Breakdown) -> BreakdownView:
        return cls(
            root_ids=list(breakdown.root_ids),
            fetched_at=breakdown.fetched_at,
            epics=breakdown.count(WorkItemType.EPIC),
            features=breakdown.count(WorkItemType.FEATURE),
            stories=breakdown.count(WorkItemType.USER_STORY),
            not_imported=[TypeCount(type=t, count=n) for t, n in breakdown.not_imported],
            errors=[_error(e) for e in breakdown.errors],
            lineage=[LineageNodeView.of(node) for node in breakdown.lineage()],
        )


class ItemChangeView(BaseModel):
    kind: ChangeKind
    work_item_id: int
    title: str
    fields: list[str]


class PendingRefreshView(BaseModel):
    breakdown: BreakdownView
    changes: list[ItemChangeView]


class PublicationView(BaseModel):
    number: int
    published_at: datetime
    published_by: ActorRef
    fingerprint: str


class WithdrawalView(BaseModel):
    withdrawn_at: datetime
    withdrawn_by: ActorRef
    reason: str


class HistoricSummary(BaseModel):
    """One row of the historic list: where it stands, without its content."""

    id: str
    title: str
    status: HistoricStatus
    version: int
    created_at: datetime
    created_by: ActorRef
    brds: int
    brds_reading: int
    brds_failed: int
    work_items: int
    run_status: RunStatus | None
    run_failure: str | None
    refresh_waiting: bool
    published_at: datetime | None
    withdrawn_at: datetime | None

    @classmethod
    def of(cls, item: HistoricRequirement) -> HistoricSummary:
        return cls(
            id=item.id,
            title=item.title,
            status=item.status,
            version=item.version,
            created_at=item.created_at,
            created_by=ActorRef.of(item.created_by),
            brds=len(item.brds),
            brds_reading=sum(brd.stage is BrdStage.QUEUED for brd in item.brds),
            brds_failed=sum(brd.stage is BrdStage.FAILED for brd in item.brds),
            work_items=0 if item.breakdown is None else len(item.breakdown.items),
            run_status=None if item.run is None else item.run.status,
            run_failure=None if item.run is None else item.run.failure,
            refresh_waiting=item.pending_refresh is not None,
            published_at=item.publications[-1].published_at if item.publications else None,
            withdrawn_at=None if item.withdrawal is None else item.withdrawal.withdrawn_at,
        )


class HistoricDetail(HistoricSummary):
    brd_files: list[BrdView]
    root_ids: list[int]
    suggestions: list[SuggestionView]
    run: RunView | None
    breakdown: BreakdownView | None
    pending_refresh: PendingRefreshView | None
    publications: list[PublicationView]
    withdrawal: WithdrawalView | None
    # Why it cannot be published yet, in the curator's words.
    blockers: list[str]

    @classmethod
    def of(cls, item: HistoricRequirement) -> HistoricDetail:
        pending = item.pending_refresh
        return cls(
            **HistoricSummary.of(item).model_dump(),
            brd_files=[BrdView.of(brd) for brd in item.brds],
            root_ids=list(item.root_ids),
            suggestions=[
                SuggestionView.model_validate(s, from_attributes=True) for s in item.suggestions
            ],
            run=None if item.run is None else RunView.of(item.run),
            breakdown=None if item.breakdown is None else BreakdownView.of(item.breakdown),
            pending_refresh=None
            if pending is None
            else PendingRefreshView(
                breakdown=BreakdownView.of(pending.breakdown),
                changes=[
                    ItemChangeView(
                        kind=c.kind,
                        work_item_id=c.work_item_id,
                        title=c.title,
                        fields=list(c.fields),
                    )
                    for c in pending.changes
                ],
            ),
            publications=[
                PublicationView(
                    number=p.number,
                    published_at=p.published_at,
                    published_by=ActorRef.of(p.published_by),
                    fingerprint=p.fingerprint,
                )
                for p in item.publications
            ],
            withdrawal=None
            if item.withdrawal is None
            else WithdrawalView(
                withdrawn_at=item.withdrawal.withdrawn_at,
                withdrawn_by=ActorRef.of(item.withdrawal.withdrawn_by),
                reason=item.withdrawal.reason,
            ),
            blockers=list(item.blockers()) if item.status is HistoricStatus.DRAFT else [],
        )


class HistoricCounts(BaseModel):
    draft: int
    published: int
    withdrawn: int
    refresh_waiting: int = Field(description="Published records with a newer read waiting.")


class HistoricPageResponse(BaseModel):
    items: list[HistoricSummary]
    next_offset: int | None
    counts: HistoricCounts

    @classmethod
    def of(
        cls, page: HistoricPage, counts: dict[HistoricStatus, int], refresh_waiting: int
    ) -> HistoricPageResponse:
        return cls(
            items=[HistoricSummary.of(item) for item in page.items],
            next_offset=page.next_offset,
            counts=HistoricCounts(
                draft=counts.get(HistoricStatus.DRAFT, 0),
                published=counts.get(HistoricStatus.PUBLISHED, 0),
                withdrawn=counts.get(HistoricStatus.WITHDRAWN, 0),
                refresh_waiting=refresh_waiting,
            ),
        )


class SharedRootView(BaseModel):
    """A work item that is also the root of another historic requirement."""

    work_item_id: int
    historic_id: str
    title: str
    status: HistoricStatus

    @classmethod
    def of(cls, shared: SharedRoot) -> SharedRootView:
        return cls(
            work_item_id=shared.work_item_id,
            historic_id=shared.holder.id,
            title=shared.holder.title,
            status=shared.holder.status,
        )


class SharedRootsResponse(BaseModel):
    items: list[SharedRootView]


class HistoricImportResponse(BaseModel):
    """Each BRD of a batch: started as a draft, or refused with why. `version_id` is its id."""

    results: list[FileResult]


class Versioned(BaseModel):
    expected_version: int = Field(ge=1)


class RenameRequest(Versioned):
    title: str = Field(min_length=1, max_length=TITLE_MAX)


class LinkRequest(Versioned):
    root_ids: list[WorkItemId] = Field(min_length=1, max_length=ROOTS_MAX)


class WithdrawRequest(Versioned):
    reason: str = Field(min_length=1, max_length=REASON_MAX)


StatusFilter = Literal["draft", "published", "withdrawn"]

LineageNodeView.model_rebuild()


# --- What requirement work reads, a page at a time (ADR-0102, amendment 1) -----------------


class HistoricPassageEntry(BaseModel):
    brd_id: str
    filename: str
    block_id: str
    label: str
    section_path: list[str]
    text: str


class HistoricItemEntry(BaseModel):
    id: int
    type: WorkItemType
    title: str
    state: str
    revision: int
    url: str
    description: str
    acceptance_criteria: str
    area_path: str
    iteration_path: str
    tags: list[str]
    parent_id: int | None
    child_ids: list[int]


class HistoricPassagesPage(BaseModel):
    """Passages of a publication, in order. `fingerprint` is the publication's own."""

    historic_requirement_id: str
    publication: int
    fingerprint: str
    entries: list[HistoricPassageEntry]
    next_offset: int | None


class HistoricItemsPage(BaseModel):
    """Work items of a publication, in order. `fingerprint` is the publication's own."""

    historic_requirement_id: str
    publication: int
    fingerprint: str
    entries: list[HistoricItemEntry]
    next_offset: int | None
