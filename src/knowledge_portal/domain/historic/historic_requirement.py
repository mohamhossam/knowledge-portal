"""A historic Requirement: an old BRD with its delivered breakdown, as reference knowledge.

It is read-only knowledge, never live work: no workflow, no owner, no approvals. A curator
imports its BRDs, links them to their root work items in Azure DevOps, previews the
breakdown and publishes it. A published record is never edited in place; a refresh from Azure
DevOps is accepted (published again) or discarded, and withdrawal takes a reason (ADR-0102).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum

from smb_kernel.documents.model import (
    DocumentEvidenceBlock,
    DocumentExtractionWarning,
    ExtractionWarningSeverity,
)

from knowledge_portal.domain.historic.errors import (
    HistoricRequirementStateError,
    InvalidHistoricRequirementError,
)
from knowledge_portal.domain.historic.id_suggestions import IdSuggestion, suggest_work_item_ids
from knowledge_portal.domain.historic.work_items import (
    Breakdown,
    ItemChange,
    ItemError,
    breakdown_diff,
)
from knowledge_portal.domain.identity.entities import ActorSnapshot

TITLE_MAX = 200
REASON_MAX = 2000
# A curator links at most this many root work items to one historic Requirement.
ROOTS_MAX = 50
BRDS_MAX = 10


class HistoricStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    WITHDRAWN = "withdrawn"


class BrdStage(StrEnum):
    QUEUED = "queued"
    READ = "read"
    FAILED = "failed"


@dataclass(frozen=True)
class HistoricBrd:
    """One BRD file, as uploaded and as read by the document pipeline."""

    id: str
    filename: str
    mime_type: str
    size_bytes: int
    checksum: str
    uploaded_at: datetime
    uploaded_by: ActorSnapshot
    stage: BrdStage = BrdStage.QUEUED
    error: str | None = None
    extraction_version: str | None = None
    blocks: tuple[DocumentEvidenceBlock, ...] = ()
    warnings: tuple[DocumentExtractionWarning, ...] = ()

    @property
    def blocking(self) -> tuple[str, ...]:
        return tuple(
            w.message for w in self.warnings if w.severity is ExtractionWarningSeverity.BLOCKING
        )

    @property
    def passages(self) -> tuple[DocumentEvidenceBlock, ...]:
        return tuple(block for block in self.blocks if block.text and block.text.strip())


class RunKind(StrEnum):
    FETCH = "fetch"
    REFRESH = "refresh"


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass(frozen=True)
class ImportRun:
    """One read of the breakdown from Azure DevOps, with its progress and its error report."""

    id: str
    kind: RunKind
    root_ids: tuple[int, ...]
    started_at: datetime
    started_by: ActorSnapshot
    status: RunStatus = RunStatus.QUEUED
    done: int = 0
    total: int = 0
    item_errors: tuple[ItemError, ...] = ()
    # The public error code when the run itself failed, as the job recorded it.
    failure: str | None = None
    finished_at: datetime | None = None


@dataclass(frozen=True)
class PendingRefresh:
    """A newer read of a published breakdown, waiting to be accepted or discarded."""

    breakdown: Breakdown
    changes: tuple[ItemChange, ...]


@dataclass(frozen=True)
class HistoricPublication:
    number: int
    published_at: datetime
    published_by: ActorSnapshot
    # Of the published state, so a consumer can tell one publication from the next.
    fingerprint: str


@dataclass(frozen=True)
class Withdrawal:
    withdrawn_at: datetime
    withdrawn_by: ActorSnapshot
    reason: str


def _title(value: str) -> str:
    title = " ".join(value.split())
    if not title or len(title) > TITLE_MAX:
        raise InvalidHistoricRequirementError(
            f"A historic requirement's title has 1 to {TITLE_MAX} characters."
        )
    return title


def title_from_filename(filename: str) -> str:
    """A draft's first title: its BRD's file name without the extension, tidied."""
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return " ".join(stem.replace("_", " ").replace("-", " ").split())[:TITLE_MAX] or "Untitled BRD"


@dataclass(frozen=True)
class HistoricRequirement:
    id: str
    title: str
    version: int
    created_at: datetime
    created_by: ActorSnapshot
    brds: tuple[HistoricBrd, ...]
    status: HistoricStatus = HistoricStatus.DRAFT
    root_ids: tuple[int, ...] = ()
    suggestions: tuple[IdSuggestion, ...] = ()
    breakdown: Breakdown | None = None
    run: ImportRun | None = None
    pending_refresh: PendingRefresh | None = None
    publications: tuple[HistoricPublication, ...] = ()
    withdrawal: Withdrawal | None = None

    @classmethod
    def start(
        cls, id: str, brd: HistoricBrd, actor: ActorSnapshot, now: datetime
    ) -> HistoricRequirement:
        return cls(id, _title(title_from_filename(brd.filename)), 1, now, actor, (brd,))

    def _next(self, **changes: object) -> HistoricRequirement:
        return replace(self, version=self.version + 1, **changes)  # type: ignore[arg-type]

    def _require(self, *allowed: HistoricStatus, doing: str) -> None:
        if self.status not in allowed:
            raise HistoricRequirementStateError(
                f"A {self.status.value} historic requirement cannot be {doing}."
            )

    def brd(self, brd_id: str) -> HistoricBrd:
        found = next((brd for brd in self.brds if brd.id == brd_id), None)
        if found is None:
            raise InvalidHistoricRequirementError("That BRD is not part of this requirement.")
        return found

    # --- Drafting --------------------------------------------------------------------

    def rename(self, title: str) -> HistoricRequirement:
        self._require(HistoricStatus.DRAFT, doing="renamed")
        return self._next(title=_title(title))

    def add_brd(self, brd: HistoricBrd) -> HistoricRequirement:
        self._require(HistoricStatus.DRAFT, doing="given another BRD")
        if len(self.brds) >= BRDS_MAX:
            raise InvalidHistoricRequirementError(
                f"A historic requirement holds at most {BRDS_MAX} BRDs."
            )
        if any(item.checksum == brd.checksum for item in self.brds):
            raise InvalidHistoricRequirementError(f"{brd.filename} is already one of its BRDs.")
        return self._next(brds=(*self.brds, brd))

    def brd_read(
        self,
        brd_id: str,
        blocks: tuple[DocumentEvidenceBlock, ...],
        warnings: tuple[DocumentExtractionWarning, ...],
        extraction_version: str,
    ) -> HistoricRequirement:
        read = replace(
            self.brd(brd_id),
            stage=BrdStage.READ,
            error=None,
            blocks=blocks,
            warnings=warnings,
            extraction_version=extraction_version,
        )
        brds = tuple(read if item.id == brd_id else item for item in self.brds)
        return self._next(brds=brds, suggestions=_suggestions(brds))

    def brd_failed(self, brd_id: str, reason: str) -> HistoricRequirement:
        failed = replace(self.brd(brd_id), stage=BrdStage.FAILED, error=reason[:REASON_MAX])
        return self._next(brds=tuple(failed if item.id == brd_id else item for item in self.brds))

    def brd_requeued(self, brd_id: str) -> HistoricRequirement:
        brd = self.brd(brd_id)
        if brd.stage is not BrdStage.FAILED:
            raise HistoricRequirementStateError("Only a BRD that could not be read is read again.")
        again = replace(brd, stage=BrdStage.QUEUED, error=None)
        return self._next(brds=tuple(again if item.id == brd_id else item for item in self.brds))

    # --- Reading the breakdown -----------------------------------------------------------

    def link(self, root_ids: tuple[int, ...], run: ImportRun) -> HistoricRequirement:
        """Name its root work items and start reading the breakdown under them."""
        self._require(HistoricStatus.DRAFT, doing="linked to other work items")
        roots = tuple(dict.fromkeys(root_ids))
        if not roots or len(roots) > ROOTS_MAX or any(item < 1 for item in roots):
            raise InvalidHistoricRequirementError(
                f"Link 1 to {ROOTS_MAX} work items, each by its positive id."
            )
        self._idle()
        return self._next(
            root_ids=roots, run=replace(run, kind=RunKind.FETCH, root_ids=roots), breakdown=None
        )

    def refresh(self, run: ImportRun) -> HistoricRequirement:
        self._require(HistoricStatus.PUBLISHED, doing="refreshed")
        self._idle()
        return self._next(
            run=replace(run, kind=RunKind.REFRESH, root_ids=self.root_ids), pending_refresh=None
        )

    def _idle(self) -> None:
        if self.run is not None and self.run.status in {RunStatus.QUEUED, RunStatus.RUNNING}:
            raise HistoricRequirementStateError("Its breakdown is being read already.")

    def _current_run(self, run_id: str) -> ImportRun:
        if self.run is None or self.run.id != run_id:
            raise HistoricRequirementStateError("That read of the breakdown was replaced.")
        return self.run

    def progress(self, run_id: str, done: int, total: int) -> HistoricRequirement:
        run = self._current_run(run_id)
        return self._next(
            run=replace(run, status=RunStatus.RUNNING, done=done, total=max(total, done))
        )

    def breakdown_read(
        self, run_id: str, breakdown: Breakdown, now: datetime
    ) -> HistoricRequirement:
        run = replace(
            self._current_run(run_id),
            status=RunStatus.SUCCEEDED,
            done=len(breakdown.items),
            total=len(breakdown.items),
            item_errors=breakdown.errors,
            finished_at=now,
        )
        if run.kind is RunKind.FETCH:
            return self._next(run=run, breakdown=breakdown)
        previous = self.breakdown
        if previous is None:  # A refresh runs only on a published record, which has one.
            raise HistoricRequirementStateError("There is no breakdown to refresh.")
        return self._next(
            run=run, pending_refresh=PendingRefresh(breakdown, breakdown_diff(previous, breakdown))
        )

    def run_failed(self, run_id: str, failure: str, now: datetime) -> HistoricRequirement:
        run = self._current_run(run_id)
        return self._next(
            run=replace(run, status=RunStatus.FAILED, failure=failure, finished_at=now)
        )

    # --- Publishing --------------------------------------------------------------------

    def blockers(self) -> tuple[str, ...]:
        """Why it cannot be published yet, in the curator's words; empty when it can."""
        reasons: list[str] = []
        read = [brd for brd in self.brds if brd.stage is BrdStage.READ]
        if not read:
            reasons.append("No BRD has been read yet.")
        for brd in read:
            if brd.blocking:
                reasons.append(f"{brd.filename} has a reading problem that blocks publication.")
        if any(brd.stage is BrdStage.QUEUED for brd in self.brds):
            reasons.append("A BRD is still being read.")
        if self.breakdown is None:
            reasons.append("Its breakdown has not been read from Azure DevOps.")
        elif not self.breakdown.reachable:
            reasons.append("None of its root work items could be read.")
        return tuple(reasons)

    def publish(self, actor: ActorSnapshot, now: datetime) -> HistoricRequirement:
        self._require(HistoricStatus.DRAFT, doing="published")
        problems = self.blockers()
        if problems:
            raise HistoricRequirementStateError(" ".join(problems))
        return self._published(actor, now, run=self.run)

    def accept_refresh(self, actor: ActorSnapshot, now: datetime) -> HistoricRequirement:
        self._require(HistoricStatus.PUBLISHED, doing="refreshed")
        if self.pending_refresh is None:
            raise HistoricRequirementStateError("There is no refresh waiting to be accepted.")
        if not self.pending_refresh.breakdown.reachable:
            raise HistoricRequirementStateError("None of its root work items could be read.")
        accepted = replace(self, breakdown=self.pending_refresh.breakdown, pending_refresh=None)
        return accepted._published(actor, now, run=self.run)

    def discard_refresh(self) -> HistoricRequirement:
        if self.pending_refresh is None:
            raise HistoricRequirementStateError("There is no refresh waiting.")
        return self._next(pending_refresh=None)

    def _published(
        self, actor: ActorSnapshot, now: datetime, run: ImportRun | None
    ) -> HistoricRequirement:
        number = len(self.publications) + 1
        draft = replace(self, status=HistoricStatus.PUBLISHED, run=run, withdrawal=None)
        fingerprint = _fingerprint(draft._content())
        publication = HistoricPublication(number, now, actor, fingerprint)
        return draft._next(publications=(*self.publications, publication))

    def withdraw(self, actor: ActorSnapshot, now: datetime, reason: str) -> HistoricRequirement:
        self._require(HistoricStatus.PUBLISHED, doing="withdrawn")
        why = reason.strip()
        if not why or len(why) > REASON_MAX:
            raise InvalidHistoricRequirementError(
                f"Say why it is withdrawn, in 1 to {REASON_MAX} characters."
            )
        return self._next(
            status=HistoricStatus.WITHDRAWN,
            withdrawal=Withdrawal(now, actor, why),
            pending_refresh=None,
        )

    # --- What requirement work receives -------------------------------------------------

    def _content(self) -> dict[str, object]:
        breakdown = self.breakdown
        return {
            "title": self.title,
            "brds": [
                {
                    "id": brd.id,
                    "filename": brd.filename,
                    "checksum": brd.checksum,
                    "passages": [
                        {
                            "block_id": block.id,
                            "label": block.label,
                            "section_path": list(block.section_path),
                            "text": block.text,
                        }
                        for block in brd.passages
                    ],
                }
                for brd in self.brds
                if brd.stage is BrdStage.READ
            ],
            "root_ids": list(self.root_ids),
            "items": []
            if breakdown is None
            else [
                {
                    "id": item.id,
                    "type": item.type.value,
                    "title": item.title,
                    "state": item.state,
                    "revision": item.revision,
                    "url": item.url,
                    "description": item.description,
                    "acceptance_criteria": item.acceptance_criteria,
                    "area_path": item.area_path,
                    "iteration_path": item.iteration_path,
                    "tags": list(item.tags),
                    "parent_id": item.parent_id,
                    "child_ids": list(item.child_ids),
                }
                for item in breakdown.items
            ],
            "fetched_at": None if breakdown is None else breakdown.fetched_at.isoformat(),
        }

    def citable_state(self) -> dict[str, object]:
        """The event payload: the whole published state, or none once withdrawn (ADR-0102)."""
        published = self.status is HistoricStatus.PUBLISHED and self.publications
        latest = self.publications[-1] if self.publications else None
        return {
            "historic_requirement_id": self.id,
            "version": self.version,
            "published": None
            if not published or latest is None
            else {
                **self._content(),
                "publication": latest.number,
                "fingerprint": latest.fingerprint,
                "published_at": latest.published_at.isoformat(),
                "published_by": {
                    "id": latest.published_by.id.value,
                    "name": latest.published_by.display_name,
                },
                "imported_at": self.created_at.isoformat(),
                "imported_by": {
                    "id": self.created_by.id.value,
                    "name": self.created_by.display_name,
                },
            },
        }


def _suggestions(brds: tuple[HistoricBrd, ...]) -> tuple[IdSuggestion, ...]:
    return suggest_work_item_ids(
        tuple(block for brd in brds if brd.stage is BrdStage.READ for block in brd.passages)
    )


def _fingerprint(content: dict[str, object]) -> str:
    encoded = json.dumps(content, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()
