"""Importing old BRDs as historic Requirements with their Azure DevOps lineage (Knowledge Center E).

A curator uploads BRDs (each starts a draft), links each draft to its root work items, reads
the breakdown beneath them, previews it and publishes it as reference knowledge. Reading a BRD
and reading a breakdown are durable jobs on their own queue, with progress and a per-item error
report kept on the record. Publishing, an accepted refresh and a withdrawal each record a
`historic_requirement_changed` event in the same transaction (ADR-0102). Nothing is ever written
to Azure DevOps.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta

from smb_kernel.documents.ports import (
    DocumentExtractorPort,
    DocumentScannerPort,
    DocumentStoragePort,
)
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.document_upload_validation import validate_document_upload
from knowledge_portal.application.errors import (
    DocumentExtractionBusyError,
    DocumentExtractionError,
    DocumentExtractionTimeoutError,
    UnsupportedDocumentError,
)
from knowledge_portal.application.ports.ado_work_items import (
    AdoNotConfiguredError,
    AdoUnavailableError,
    AdoWorkItemSourcePort,
)
from knowledge_portal.application.ports.architecture_jobs import (
    ArchitectureJob,
    ArchitectureJobKind,
    ArchitectureJobRepositoryPort,
    ArchitectureJobStatus,
)
from knowledge_portal.application.ports.historic_requirements import (
    HistoricRequirementConflictError,
    HistoricRequirementNotFoundError,
    HistoricRequirementsPort,
)
from knowledge_portal.application.ports.knowledge_events import (
    HISTORIC_REQUIREMENT_CHANGED,
    KnowledgeEventOutboxPort,
)
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.public_errors import describe_public_error
from knowledge_portal.application.use_cases.architecture_documents import (
    MAX_BATCH_FILES,
    FileResult,
    IncomingFile,
    UploadOutcome,
)
from knowledge_portal.application.use_cases.leased_jobs import (
    ArchitectureJobExecution,
    CommitFence,
    LeasedJobs,
)
from knowledge_portal.domain.document.value_objects import DocumentVersionId
from knowledge_portal.domain.historic.errors import InvalidHistoricRequirementError
from knowledge_portal.domain.historic.historic_requirement import (
    BrdStage,
    ContentPage,
    ContentPart,
    HistoricBrd,
    HistoricRequirement,
    HistoricStatus,
    ImportRun,
    RunKind,
    RunStatus,
)
from knowledge_portal.domain.historic.work_items import Breakdown
from knowledge_portal.domain.identity.entities import ActorProfile

# Old BRDs are mostly Word, some PDF (decision 10). Word 97–2003 is refused with guidance.
BRD_FORMATS = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
_BY_EXTENSION = {extension: mime for mime, extension in BRD_FORMATS.items()}
DEFAULT_MAX_ITEMS = 2000
PAGE_MAX = 100
# Progress is saved at most this often while a breakdown is read.
PROGRESS_EVERY = timedelta(seconds=1)
_RETRIES = 3


def _brd_mime(filename: str, declared: str) -> str:
    """Browsers often send Word and PDF as octet-stream: take the type from the extension then."""
    mime = declared.split(";", 1)[0].strip().lower()
    if mime in ("", "application/octet-stream"):
        return next(
            (m for extension, m in _BY_EXTENSION.items() if filename.lower().endswith(extension)),
            mime,
        )
    return mime


@dataclass(frozen=True)
class HistoricPage:
    items: tuple[HistoricRequirement, ...]
    next_offset: int | None


@dataclass(frozen=True)
class SharedRoot:
    """A work item this record links or suggests that is also another record's root."""

    work_item_id: int
    holder: HistoricRequirement


# One Epic can serve two BRDs, so a shared root is said, never refused (ADR-0102).
SHARED_ROOTS_MAX = 200


class HistoricImportJobs(LeasedJobs):
    """The import's own queue: reading a BRD, and reading a breakdown from Azure DevOps."""

    def __init__(
        self,
        jobs: ArchitectureJobRepositoryPort,
        execution: ArchitectureJobExecution,
        clock: ClockPort,
        records: HistoricRequirementsPort,
        storage: DocumentStoragePort,
        scanner: DocumentScannerPort,
        extractor: DocumentExtractorPort,
        ado: AdoWorkItemSourcePort,
        transactions: TransactionManagerPort,
        max_items: int = DEFAULT_MAX_ITEMS,
    ) -> None:
        super().__init__(jobs, execution, clock)
        self._records, self._storage = records, storage
        self._scanner, self._extractor, self._ado = scanner, extractor, ado
        self._transactions, self._max_items = transactions, max_items

    def enqueue(
        self, kind: ArchitectureJobKind, historic_id: str, key: str, actor_id: str
    ) -> ArchitectureJob:
        job = ArchitectureJob(
            str(uuid.uuid4()), kind, historic_id, key, actor_id, ArchitectureJobStatus.QUEUED
        )
        return self._dispatch(self._jobs.enqueue(job))

    def _apply(
        self,
        historic_id: str,
        change: Callable[[HistoricRequirement], HistoricRequirement],
        fence: CommitFence,
    ) -> None:
        """Apply `change` to the latest record, reloading when a curator saved meanwhile."""
        for attempt in range(_RETRIES):
            with self._transactions.transaction():
                fence()
                current = self._records.get(historic_id)
                if current is None:
                    return  # Discarded meanwhile: nothing left to record.
                try:
                    self._records.save(change(current), current.version)
                except HistoricRequirementConflictError:
                    if attempt == _RETRIES - 1:
                        raise
                    continue
                return

    def _run(self, job: ArchitectureJob, fence: CommitFence) -> None:
        if job.kind is ArchitectureJobKind.HISTORIC_READ_BRD:
            self._read_brd(job.subject_id, job.fingerprint.partition("|")[0], fence)
        elif job.kind is ArchitectureJobKind.HISTORIC_READ_BREAKDOWN:
            self._read_breakdown(job.subject_id, job.fingerprint, fence)
        else:
            raise InvalidHistoricRequirementError(f"An import cannot run a {job.kind} job.")

    def _read_brd(self, historic_id: str, brd_id: str, fence: CommitFence) -> None:
        record = self._records.get(historic_id)
        if record is None:
            return
        brd = record.brd(brd_id)
        if brd.stage is not BrdStage.QUEUED:
            return
        content = self._storage.get(DocumentVersionId(brd.id))
        if not self._scanner.scan(content):
            reason = "The malware scanner held it back; it was never read."
            self._apply(historic_id, lambda r: r.brd_failed(brd_id, reason), fence)
            return
        try:
            extraction = self._extractor.extract_structured(brd.mime_type, content)
            if not extraction.evidence_blocks:
                raise DocumentExtractionError("No text could be read from it.")
        except (DocumentExtractionBusyError, DocumentExtractionTimeoutError):
            reason = "Reading it took too long. Read it again."
            self._apply(historic_id, lambda r: r.brd_failed(brd_id, reason), fence)
            return
        except (DocumentExtractionError, UnsupportedDocumentError) as exc:
            reason = str(exc) or "It could not be read."
            self._apply(historic_id, lambda r: r.brd_failed(brd_id, reason), fence)
            return
        self._apply(
            historic_id,
            lambda r: r.brd_read(
                brd_id,
                extraction.evidence_blocks,
                extraction.warnings,
                extraction.extraction_version,
            ),
            fence,
        )

    def _read_breakdown(self, historic_id: str, run_id: str, fence: CommitFence) -> None:
        record = self._records.get(historic_id)
        run = None if record is None else record.run
        if (
            run is None
            or run.id != run_id
            or run.status
            not in {
                RunStatus.QUEUED,
                RunStatus.RUNNING,
            }
        ):
            return
        last = [self._clock.now() - PROGRESS_EVERY]

        def progress(done: int, total: int) -> None:
            now = self._clock.now()
            if now - last[0] >= PROGRESS_EVERY:
                last[0] = now
                self._apply(historic_id, lambda r: r.progress(run_id, done, total), fence)

        try:
            tree = self._ado.read_tree(run.root_ids, self._max_items, progress)
        except (AdoNotConfiguredError, AdoUnavailableError) as exc:
            code = describe_public_error(exc).code
            self._apply(historic_id, lambda r: r.run_failed(run_id, code, self._clock.now()), fence)
            return
        breakdown = Breakdown(
            run.root_ids, tree.items, self._clock.now(), tree.not_imported, tree.errors
        )
        self._apply(
            historic_id, lambda r: r.breakdown_read(run_id, breakdown, self._clock.now()), fence
        )


class HistoricImports:
    """What a curator does with historic Requirements. Every route is a knowledge admin's."""

    def __init__(
        self,
        records: HistoricRequirementsPort,
        storage: DocumentStoragePort,
        jobs: HistoricImportJobs,
        events: KnowledgeEventOutboxPort,
        transactions: TransactionManagerPort,
        clock: ClockPort,
        max_bytes: int,
    ) -> None:
        self._records, self._storage, self._jobs = records, storage, jobs
        self._events, self._transactions = events, transactions
        self._clock, self._max_bytes = clock, max_bytes

    @property
    def max_bytes(self) -> int:
        return self._max_bytes

    # --- Reading ------------------------------------------------------------------------

    def get(self, historic_id: str) -> HistoricRequirement:
        record = self._records.get(historic_id)
        if record is None:
            raise HistoricRequirementNotFoundError("No historic requirement has that id.")
        return record

    def list(
        self, status: HistoricStatus | None, query: str, offset: int, limit: int
    ) -> HistoricPage:
        limit = max(1, min(limit, PAGE_MAX))
        found = self._records.list(status, query.strip(), max(0, offset), limit + 1)
        more = len(found) > limit
        return HistoricPage(found[:limit], offset + limit if more else None)

    def counts(self) -> dict[HistoricStatus, int]:
        return self._records.counts()

    def content(
        self, historic_id: str, publication: int, part: ContentPart, offset: int, limit: int
    ) -> ContentPage:
        """A page of what a publication says, for requirement work (ADR-0102, amendment 1).

        Only a published record is read; a withdrawn or missing one is not found."""
        record = self.get(historic_id)
        if record.status is not HistoricStatus.PUBLISHED:
            raise HistoricRequirementNotFoundError("No published historic requirement has that id.")
        return record.content_page(publication, part, offset, limit)

    def refresh_waiting(self) -> int:
        return self._records.refresh_waiting()

    def shared_roots(self, historic_id: str) -> tuple[SharedRoot, ...]:
        """Its roots and suggested ids that other records already hold as roots."""
        record = self.get(historic_id)
        ids = set(record.root_ids) | {item.work_item_id for item in record.suggestions}
        holders = self._records.rooted_in(ids, SHARED_ROOTS_MAX)
        return tuple(
            SharedRoot(work_item_id, holder)
            for work_item_id in sorted(ids)
            for holder in holders
            if holder.id != record.id and work_item_id in holder.root_ids
        )

    # --- Importing ----------------------------------------------------------------------

    def _brd(self, file: IncomingFile, actor: ActorProfile) -> tuple[HistoricBrd, bytes]:
        filename, mime = validate_document_upload(
            file.filename,
            _brd_mime(file.filename, file.mime_type),
            file.content,
            self._max_bytes,
            BRD_FORMATS,
        )
        checksum = hashlib.sha256(file.content).hexdigest()
        holder = self._records.holding(checksum)
        if holder is not None:
            raise UnsupportedDocumentError(f"It is already imported, in ‘{holder.title}’.")
        brd = HistoricBrd(
            str(uuid.uuid4()),
            filename,
            mime,
            len(file.content),
            checksum,
            self._clock.now(),
            actor.snapshot(),
        )
        return brd, file.content

    def import_files(
        self, files: tuple[IncomingFile, ...], actor: ActorProfile
    ) -> tuple[FileResult, ...]:
        """Each BRD starts its own draft; a file that cannot be imported says why, alone."""
        if not files or len(files) > MAX_BATCH_FILES:
            raise InvalidHistoricRequirementError(f"Import 1 to {MAX_BATCH_FILES} BRDs at a time.")
        results: list[FileResult] = []
        started: list[tuple[str, str]] = []
        for file in files:
            try:
                brd, content = self._brd(file, actor)
                record = HistoricRequirement.start(
                    str(uuid.uuid4()), brd, actor.snapshot(), self._clock.now()
                )
                with self._transactions.transaction():
                    self._storage.put(DocumentVersionId(brd.id), content)
                    self._records.add(record)
            except (UnsupportedDocumentError, InvalidHistoricRequirementError) as exc:
                results.append(FileResult(file.filename, UploadOutcome.REFUSED, reason=str(exc)))
                continue
            started.append((record.id, brd.id))
            results.append(
                FileResult(
                    file.filename, UploadOutcome.ADDED, version_id=record.id, title=record.title
                )
            )
        for historic_id, brd_id in started:
            self._jobs.enqueue(
                ArchitectureJobKind.HISTORIC_READ_BRD, historic_id, brd_id, actor.id.value
            )
        return tuple(results)

    def _change(
        self,
        historic_id: str,
        expected_version: int,
        change: Callable[[HistoricRequirement], HistoricRequirement],
        publish: bool = False,
    ) -> HistoricRequirement:
        with self._transactions.transaction():
            current = self.get(historic_id)
            if current.version != expected_version:
                raise HistoricRequirementConflictError(
                    "It changed while you worked. Reload it and try again."
                )
            updated = change(current)
            self._records.save(updated, current.version)
            if publish:
                self._events.append(
                    HISTORIC_REQUIREMENT_CHANGED, updated.id, updated.citable_state()
                )
        return updated

    def add_brd(
        self, historic_id: str, file: IncomingFile, expected_version: int, actor: ActorProfile
    ) -> HistoricRequirement:
        brd, content = self._brd(file, actor)

        def add(record: HistoricRequirement) -> HistoricRequirement:
            self._storage.put(DocumentVersionId(brd.id), content)
            return record.add_brd(brd)

        updated = self._change(historic_id, expected_version, add)
        self._jobs.enqueue(
            ArchitectureJobKind.HISTORIC_READ_BRD, historic_id, brd.id, actor.id.value
        )
        return self.get(updated.id)

    def read_again(
        self, historic_id: str, brd_id: str, expected_version: int, actor: ActorProfile
    ) -> HistoricRequirement:
        updated = self._change(historic_id, expected_version, lambda r: r.brd_requeued(brd_id))
        # A fresh key: the queue would otherwise return the finished job as it is.
        self._jobs.enqueue(
            ArchitectureJobKind.HISTORIC_READ_BRD,
            historic_id,
            f"{brd_id}|{updated.version}",
            actor.id.value,
        )
        return self.get(updated.id)

    def rename(self, historic_id: str, title: str, expected_version: int) -> HistoricRequirement:
        return self._change(historic_id, expected_version, lambda r: r.rename(title))

    def _run(self, actor: ActorProfile) -> ImportRun:
        return ImportRun(str(uuid.uuid4()), RunKind.FETCH, (), self._clock.now(), actor.snapshot())

    def link(
        self,
        historic_id: str,
        root_ids: tuple[int, ...],
        expected_version: int,
        actor: ActorProfile,
    ) -> HistoricRequirement:
        """Name its root work items and read the breakdown beneath them."""
        run = self._run(actor)
        updated = self._change(historic_id, expected_version, lambda r: r.link(root_ids, run))
        self._jobs.enqueue(
            ArchitectureJobKind.HISTORIC_READ_BREAKDOWN, historic_id, run.id, actor.id.value
        )
        return self.get(updated.id)

    def refresh(
        self, historic_id: str, expected_version: int, actor: ActorProfile
    ) -> HistoricRequirement:
        """Read a published record's breakdown again; the changes wait to be accepted."""
        run = self._run(actor)
        updated = self._change(historic_id, expected_version, lambda r: r.refresh(run))
        self._jobs.enqueue(
            ArchitectureJobKind.HISTORIC_READ_BREAKDOWN, historic_id, run.id, actor.id.value
        )
        return self.get(updated.id)

    def publish(
        self, historic_id: str, expected_version: int, actor: ActorProfile
    ) -> HistoricRequirement:
        now = self._clock.now()
        return self._change(
            historic_id,
            expected_version,
            lambda r: r.publish(actor.snapshot(), now),
            publish=True,
        )

    def accept_refresh(
        self, historic_id: str, expected_version: int, actor: ActorProfile
    ) -> HistoricRequirement:
        now = self._clock.now()
        return self._change(
            historic_id,
            expected_version,
            lambda r: r.accept_refresh(actor.snapshot(), now),
            publish=True,
        )

    def discard_refresh(self, historic_id: str, expected_version: int) -> HistoricRequirement:
        return self._change(historic_id, expected_version, lambda r: r.discard_refresh())

    def withdraw(
        self, historic_id: str, reason: str, expected_version: int, actor: ActorProfile
    ) -> HistoricRequirement:
        now = self._clock.now()
        return self._change(
            historic_id,
            expected_version,
            lambda r: r.withdraw(actor.snapshot(), now, reason),
            publish=True,
        )

    def discard(self, historic_id: str, expected_version: int) -> None:
        """Remove a draft that was never published, with its files."""
        with self._transactions.transaction():
            current = self.get(historic_id)
            if current.version != expected_version:
                raise HistoricRequirementConflictError(
                    "It changed while you worked. Reload it and try again."
                )
            if current.status is not HistoricStatus.DRAFT:
                raise InvalidHistoricRequirementError(
                    "Only a draft is discarded; withdraw a published one instead."
                )
            self._records.remove(current.id, current.version)
            for brd in current.brds:
                self._storage.delete(DocumentVersionId(brd.id))
