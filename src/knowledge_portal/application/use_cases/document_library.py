"""Standalone uploads and content-bound review, independent of Requirement records."""

from __future__ import annotations

import base64
import hashlib
import re
import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timedelta

from smb_kernel.documents.ports import DocumentExtractorPort, DocumentStoragePort
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import (
    DocumentExtractionError,
    DocumentExtractionTimeoutError,
    DocumentNotFoundError,
    DocumentVersionConflictError,
    ServiceUnavailableError,
    UnsupportedDocumentError,
)
from knowledge_portal.application.ports.document_library import (
    DocumentLibraryPort,
    DocumentScannerPort,
)
from knowledge_portal.application.ports.library_admin import AdminGrant, LibraryAdminAction
from knowledge_portal.application.ports.requirement_citations import (
    RequirementCitationCountsPort,
)
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.use_cases.documents import (
    UploadDocumentInput,
    validate_ingested_upload,
)
from knowledge_portal.application.use_cases.identity_access import KNOWLEDGE_ADMIN
from knowledge_portal.application.use_cases.library_admin import LibraryStewardship
from knowledge_portal.domain.document.library import (
    AdminOverride,
    ExtractionRevision,
    IngestionStage,
    LibraryDocument,
    LibraryVersion,
    Publication,
    ReviewedPassage,
    require_submittable_passages,
)
from knowledge_portal.domain.document.value_objects import (
    DocumentVersionId,
    ExtractionWarningSeverity,
)
from knowledge_portal.domain.identity.entities import ActorProfile, ActorSnapshot
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError

CHUNKING_POLICY = "structure-512-768-v1"
TABLE_CHUNKING_POLICY = "table-fields-512-768-v2"


# A publication stops being picked up for indexing after this many attempts (the worker's
# `pending_publication`), until someone retries it.
INDEXING_ATTEMPTS = 3


def indexing_stopped(document: LibraryDocument) -> bool:
    """The latest approval has stopped indexing after repeated failures."""
    if not document.publications:
        return False
    publication = document.publications[-1]
    return (
        publication.withdrawn_at is None
        and publication.activated_at is None
        and publication.built_at is None
        and publication.indexing_attempts >= INDEXING_ATTEMPTS
    )


def indexing_retried(document: LibraryDocument) -> LibraryDocument:
    publication = document.publications[-1]
    return replace(
        document,
        version=document.version + 1,
        publications=(
            *document.publications[:-1],
            replace(publication, indexing_attempts=0, indexing_error=None, index_lease_until=None),
        ),
    )


def reading_retried(document: LibraryDocument, version: LibraryVersion) -> LibraryDocument:
    """Queue a version to be read again from the start; the worker picks it up."""
    return document.update_file(
        replace(
            version,
            stage=IngestionStage.QUEUED,
            attempt=0,
            lease_token=None,
            lease_until=None,
            error=None,
        )
    )


@dataclass(frozen=True)
class VersionOutline:
    """A version's place in the pipeline, without any of its content."""

    id: str
    number: int
    stage: IngestionStage
    uploaded_at: datetime
    uploaded_by: ActorSnapshot


@dataclass(frozen=True)
class LibraryView:
    id: str
    title: str
    owner: ActorSnapshot
    versions: tuple[LibraryVersion, ...]
    version: int
    publications: tuple[Publication, ...]
    published_id: str | None
    can_edit: bool
    review_fingerprint: str | None
    build_fingerprint: str | None = None
    # The owner's own view; False for an admin acting on the owner's behalf.
    is_owner: bool = False
    # The signed-in admin's live grant on a document they don't own (Knowledge Center C).
    acting_as_admin: AdminGrant | None = None
    # For an admin who neither owns it nor holds a grant: where its newest version stands.
    newest: VersionOutline | None = None
    # Requirements citing it now, across the portfolio; None when requirement work can't say.
    citations: int | None = None


@dataclass(frozen=True)
class OriginalPreview:
    location: str
    image_data: str | None
    explanation: str


class DocumentLibrary:
    def __init__(
        self,
        repository: DocumentLibraryPort,
        storage: DocumentStoragePort,
        extractor: DocumentExtractorPort,
        scanner: DocumentScannerPort,
        transactions: TransactionManagerPort,
        clock: ClockPort,
        max_file_bytes: int,
        stewardship: LibraryStewardship | None = None,
        citations: RequirementCitationCountsPort | None = None,
    ) -> None:
        self._citations = citations
        self._stewardship = stewardship or LibraryStewardship.owner_only(clock)
        self._repository = repository
        self._storage = storage
        self._extractor = extractor
        self._scanner = scanner
        self._transactions = transactions
        self._clock = clock
        self.max_file_bytes = max_file_bytes

    def _get(self, document_id: str) -> LibraryDocument:
        value = self._repository.get(document_id)
        if value is None:
            raise DocumentNotFoundError("Library document was not found.")
        return value

    def _owned(self, document_id: str, actor: ActorProfile, expected: int) -> LibraryDocument:
        document = self._get(document_id)
        if document.owner.id != actor.id:
            raise AuthorizationDeniedError("Only the document owner can change this document.")
        if document.version != expected:
            raise DocumentVersionConflictError("Document changed. Reload before retrying.")
        return document

    def _stewarded(
        self, document_id: str, actor: ActorProfile, expected: int
    ) -> tuple[LibraryDocument, AdminOverride | None]:
        """The owner, or an admin with a live grant acting on the owner's behalf."""
        document = self._get(document_id)
        override = self._stewardship.acting_for(
            document,
            actor,
            "Only the document owner, or an admin acting for them, can change this document.",
        )
        if document.version != expected:
            raise DocumentVersionConflictError("Document changed. Reload before retrying.")
        return document, override

    def _visible(self, document: LibraryDocument, actor: ActorProfile) -> LibraryView:
        grant = self._stewardship.grant(document, actor)
        if document.owner.id == actor.id or grant is not None:
            latest = document.versions[-1]
            return LibraryView(
                document.id,
                document.title,
                document.owner,
                tuple(
                    replace(v, blocking_warnings=v.unresolved_blocking_warnings)
                    for v in document.versions
                ),
                document.version,
                document.publications,
                document.published_id,
                True,
                latest.revisions[-1].fingerprint(latest.id, CHUNKING_POLICY)
                if latest.revisions
                else None,
                latest.revisions[-1].fingerprint(latest.id, TABLE_CHUNKING_POLICY)
                if latest.revisions
                else None,
                is_owner=grant is None,
                acting_as_admin=grant,
            )
        published = self._published(document)
        if KNOWLEDGE_ADMIN in actor.roles:
            # A knowledge admin who doesn't own it sees its state, not its content: enough to
            # find work waiting on someone else's document (reading failed, awaiting review,
            # indexing stopped) and act on it through a grant. Only what is published is read.
            newest = document.versions[-1]
            return LibraryView(
                document.id,
                document.title,
                document.owner,
                (published[0],) if published else (),
                document.version,
                document.publications,
                document.published_id,
                False,
                None,
                newest=VersionOutline(
                    newest.id, newest.number, newest.stage, newest.uploaded_at, newest.uploaded_by
                ),
            )
        if published is None:
            raise DocumentNotFoundError("Published library document was not found.")
        safe_source, publication = published
        return LibraryView(
            document.id,
            document.title,
            document.owner,
            (safe_source,),
            document.version,
            (publication,),
            document.published_id,
            False,
            None,
        )

    @staticmethod
    def _published(document: LibraryDocument) -> tuple[LibraryVersion, Publication] | None:
        """The version in service as anyone may read it, with the approval that published it."""
        publication = next(
            (
                p
                for p in document.publications
                if p.id == document.published_id and p.withdrawn_at is None
            ),
            None,
        )
        if publication is None:
            return None
        source = document.file_version(publication.version_id)
        revision = next(r for r in source.revisions if r.id == publication.revision_id)
        selected = {p.block_id: p for p in revision.passages if p.included}
        # A public response must not include unselected text, pending versions or prior extractions.
        safe_source = replace(
            source,
            idempotency_key="",
            warnings=(),
            warning_details=(),
            blocking_warnings=(),
            assets=(),
            blocks=tuple(
                replace(b, text=selected[b.id].text) for b in source.blocks if b.id in selected
            ),
            revisions=(replace(revision, passages=tuple(selected.values())),),
        )
        return safe_source, publication

    def get(self, document_id: str, actor: ActorProfile) -> LibraryView:
        return self._visible(self._get(document_id), actor)

    def list(
        self, actor: ActorProfile, offset: int = 0, limit: int = 50
    ) -> tuple[LibraryView, ...]:
        # A knowledge admin sees every document's state, so work waiting on anyone's shows.
        documents = (
            self._repository.list_all(offset, limit)
            if KNOWLEDGE_ADMIN in actor.roles
            else self._repository.list_visible(actor.id.value, offset, limit)
        )
        views = tuple(self._visible(d, actor) for d in documents)
        counts = self._citation_counts(tuple(view.id for view in views))
        return tuple(replace(view, citations=counts.get(view.id)) for view in views)

    def _citation_counts(self, document_ids: tuple[str, ...]) -> dict[str, int]:
        """Counts for the library list; the list still loads when requirement work is down."""
        if self._citations is None or not document_ids:
            return {}
        try:
            return self._citations.counts(document_ids)
        except ServiceUnavailableError:
            return {}

    def submit(
        self,
        title: str,
        data: UploadDocumentInput,
        key: str,
        actor: ActorProfile,
        document_id: str | None = None,
        expected: int | None = None,
    ) -> LibraryDocument:
        filename, mime = validate_ingested_upload(
            data.filename, data.mime_type, data.content, self.max_file_bytes
        )
        if not title.strip() or len(title) > 200 or not key.strip() or len(key) > 100:
            raise UnsupportedDocumentError(
                "A title (up to 200 characters) and submission key (up to 100) are required."
            )
        digest = hashlib.sha256(data.content).hexdigest()
        with self._transactions.transaction():
            existing = self._repository.find_submission(actor.id.value, key)
            if existing is not None:
                if existing.owner.id != actor.id:
                    raise AuthorizationDeniedError("This upload now belongs to another owner.")
                original = next(
                    v
                    for v in existing.versions
                    if v.idempotency_key == key and v.uploaded_by.id == actor.id
                )
                if (
                    (original.checksum, original.filename, original.mime_type)
                    != (
                        digest,
                        filename,
                        mime,
                    )
                    or existing.title != title.strip()
                    or (document_id is not None and existing.id != document_id)
                ):
                    raise DocumentVersionConflictError(
                        "Submission key was used for different content."
                    )
                return existing
            document = self._owned(document_id, actor, expected or 0) if document_id else None
            version = LibraryVersion(
                str(uuid.uuid4()),
                len(document.versions) + 1 if document else 1,
                filename,
                mime,
                len(data.content),
                digest,
                self._clock.now(),
                actor.snapshot(),
                key,
            )
            self._storage.put(DocumentVersionId(version.id), data.content)
            if document is None:
                document = LibraryDocument(
                    str(uuid.uuid4()),
                    title.strip(),
                    actor.snapshot(),
                    (version,),
                )
                self._repository.add(document)
            else:
                updated = replace(
                    document, versions=(*document.versions, version), version=document.version + 1
                )
                self._repository.save(updated, document.version)
                document = updated
            return document

    def original(
        self, document_id: str, version_id: str, actor: ActorProfile
    ) -> tuple[LibraryVersion, bytes]:
        document = self._get(document_id)
        if not self._stewardship.may_act(document, actor):
            raise AuthorizationDeniedError(
                "Original files may contain excluded material; only the owner, or an admin "
                "acting for them, can download them."
            )
        version = document.file_version(version_id)
        return version, self._storage.get(DocumentVersionId(version.id))

    def preview_original(
        self, document_id: str, version_id: str, block_id: str, actor: ActorProfile
    ) -> OriginalPreview:
        source, content = self.original(document_id, version_id, actor)
        if source.stage is not IngestionStage.READY:
            raise DocumentVersionConflictError(
                "Finish safe extraction before previewing the source."
            )
        block = next((b for b in source.blocks if b.id == block_id), None)
        if block is None:
            raise DocumentNotFoundError("Source passage was not found in this file version.")
        asset = next((a for a in source.assets if a.block_id == block_id), None)
        page = re.match(r"Page (\d+)(?:\D|$)", block.label)
        slide = re.match(r"Slide (\d+)(?:\D|$)", block.label)
        if asset:
            path, mime = asset.package_path, asset.mime_type
        elif source.mime_type == "application/pdf" and page:
            path, mime = f"pdf-page/{page[1]}", "image/jpeg"
        elif source.mime_type in {"image/png", "image/jpeg"}:
            path, mime = "image", source.mime_type
        elif source.mime_type.endswith("presentationml.presentation") and slide:
            path, mime = f"office-slide/{slide[1]}", "image/jpeg"
        else:
            return OriginalPreview(
                block.label,
                None,
                "A safe visual preview is unavailable for this source region. "
                "Download the original to compare its layout; "
                "extracted text is not a visual preview.",
            )
        try:
            raw = self._extractor.extract_asset(source.mime_type, content, path)
        except UnsupportedDocumentError as exc:
            return OriginalPreview(block.label, None, str(exc))
        if asset and hashlib.sha256(raw).hexdigest() != asset.checksum_sha256:
            raise DocumentExtractionError("Source preview no longer matches the extracted asset.")
        if raw.startswith(b"\xff\xd8"):
            mime = "image/jpeg"
        elif raw.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
        else:
            raise DocumentExtractionError("Source preview is not a safe raster image.")
        return OriginalPreview(
            block.label,
            f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}",
            "Original source rendered as a safe raster. Page previews may include excluded content "
            "and are visible only to the owner. "
            "Region coordinates are shown in the passage location.",
        )

    def review(
        self,
        document_id: str,
        version_id: str,
        expected: int,
        actor: ActorProfile,
        passages: tuple[ReviewedPassage, ...],
        explanation: str,
    ) -> LibraryDocument:
        require_submittable_passages(passages)
        with self._transactions.transaction():
            document, override = self._stewarded(document_id, actor, expected)
            if sum(len(p.text) for p in passages) > 2_000_000:
                raise UnsupportedDocumentError(
                    "Reviewed text exceeds the two-million-character limit."
                )
            updated = document.review(
                version_id,
                ExtractionRevision(
                    str(uuid.uuid4()),
                    self._clock.now(),
                    actor.snapshot(),
                    passages,
                    explanation,
                    override,
                ),
            )
            self._repository.save(updated, expected)
            self._stewardship.overridden(
                LibraryAdminAction.REVIEW, actor, override, document, updated
            )
            return updated

    def approve(
        self,
        document_id: str,
        version_id: str,
        revision_id: str,
        fingerprint: str,
        expected: int,
        actor: ActorProfile,
    ) -> LibraryDocument:
        with self._transactions.transaction():
            document, override = self._stewarded(document_id, actor, expected)
            if any(
                p.requires_activation and p.activated_at is None and p.withdrawn_at is None
                for p in document.publications
            ):
                raise DocumentVersionConflictError("Activate or discard the pending build first.")
            updated = document.approve(
                Publication(
                    str(uuid.uuid4()),
                    version_id,
                    revision_id,
                    fingerprint,
                    CHUNKING_POLICY,
                    actor.snapshot(),
                    self._clock.now(),
                    on_behalf=override,
                )
            )
            self._repository.save(updated, expected)
            self._stewardship.overridden(
                LibraryAdminAction.APPROVE, actor, override, document, updated
            )
            return updated

    def withdraw(
        self, document_id: str, expected: int, actor: ActorProfile, reason: str
    ) -> LibraryDocument:
        with self._transactions.transaction():
            document, override = self._stewarded(document_id, actor, expected)
            updated = document.withdraw(self._clock.now(), reason, actor.snapshot(), override)
            self._repository.save(updated, expected)
            self._stewardship.overridden(
                LibraryAdminAction.WITHDRAW, actor, override, document, updated
            )
            return updated

    def retry_index(self, document_id: str, expected: int, actor: ActorProfile) -> LibraryDocument:
        with self._transactions.transaction():
            document = self._owned(document_id, actor, expected)
            if not document.publications or document.publications[-1].withdrawn_at is not None:
                raise DocumentVersionConflictError("No eligible publication exists to retry.")
            if not indexing_stopped(document):
                raise DocumentVersionConflictError("Indexing has not reached a terminal failure.")
            updated = indexing_retried(document)
            self._repository.save(updated, expected)
            return updated

    def control(
        self, document_id: str, version_id: str, expected: int, actor: ActorProfile, retry: bool
    ) -> LibraryDocument:
        with self._transactions.transaction():
            document = self._owned(document_id, actor, expected)
            version = document.file_version(version_id)
            eligible = (
                {IngestionStage.FAILED, IngestionStage.CANCELLED}
                if retry
                else {IngestionStage.QUEUED, IngestionStage.SCANNING, IngestionStage.EXTRACTING}
            )
            if version.stage not in eligible:
                raise DocumentVersionConflictError(
                    "This processing state does not allow that action."
                )
            updated = (
                reading_retried(document, version)
                if retry
                else document.update_file(
                    replace(
                        version,
                        stage=IngestionStage.CANCELLED,
                        lease_token=None,
                        lease_until=None,
                        error=None,
                    )
                )
            )
            self._repository.save(updated, expected)
            return updated

    def process_next(self) -> bool:
        token = str(uuid.uuid4())
        now = self._clock.now()
        document = self._repository.claim(now, now + timedelta(seconds=660), token)
        if document is None:
            return False
        source = next((v for v in document.versions if v.lease_token == token), None)
        if source is None:
            return True  # Exhausted crashed attempt was made visible.
        try:
            content = self._storage.get(DocumentVersionId(source.id))
            if not self._scanner.scan(content):
                self._finish(
                    document.id,
                    replace(
                        source,
                        stage=IngestionStage.QUARANTINED,
                        error="Malware scan rejected this upload. Publication is prohibited.",
                    ),
                    token,
                )
                return True
            source = replace(source, stage=IngestionStage.EXTRACTING)
            if not self._finish(document.id, source, token, terminal=False):
                return True
            extraction = self._extractor.extract_structured(source.mime_type, content)
            if not extraction.evidence_blocks:
                raise DocumentExtractionError("Extraction produced no reviewable evidence.")
            ready = replace(
                source,
                stage=IngestionStage.READY,
                extraction_version=extraction.extraction_version,
                blocks=extraction.evidence_blocks,
                assets=extraction.assets,
                warning_details=extraction.warnings,
                warnings=tuple(w.message for w in extraction.warnings),
                blocking_warnings=tuple(
                    w.message
                    for w in extraction.warnings
                    if w.severity is ExtractionWarningSeverity.BLOCKING
                ),
            )
            self._finish(document.id, ready, token)
        except (
            DocumentExtractionError,
            DocumentExtractionTimeoutError,
            UnsupportedDocumentError,
        ) as exc:
            self._finish(
                document.id, replace(source, stage=IngestionStage.FAILED, error=str(exc)), token
            )
        return True

    def _finish(
        self, document_id: str, source: LibraryVersion, token: str, *, terminal: bool = True
    ) -> bool:
        with self._transactions.transaction():
            current = self._get(document_id)
            old = current.file_version(source.id)
            if (
                old.lease_token != token
                or old.lease_until is None
                or old.lease_until <= self._clock.now()
            ):
                return False
            updated = current.update_file(
                replace(
                    source,
                    lease_token=None if terminal else token,
                    lease_until=None if terminal else old.lease_until,
                )
            )
            self._repository.save(updated, current.version)
            return True
