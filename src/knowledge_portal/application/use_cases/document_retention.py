"""Stored catalogue documents no version will read again.

A document version is registered for good: its title and lineage still answer the questions
asked of it (where a fact came from, what an earlier version said it was). Its stored file is
read only while a version holds it. A version that no release holds, that was never
published and that is older than the retention period is unused: its file can go, its
registration stays. Nothing is deleted on its own; an operator lists the unused files and
collects them (`scripts/collect_unused_documents.py`), as the retention policy decides.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from smb_kernel.documents.ports import DocumentStoragePort

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.domain.architecture.knowledge import KnowledgeDocumentVersion
from knowledge_portal.domain.document.value_objects import DocumentVersionId


class DocumentRetention:
    def __init__(
        self, repository: ArchitectureKnowledgeRepositoryPort, storage: DocumentStoragePort
    ) -> None:
        self._repository = repository
        self._storage = storage

    def unused(self, now: datetime, older_than: timedelta) -> tuple[KnowledgeDocumentVersion, ...]:
        """Versions no release holds, never published, uploaded at least `older_than` ago."""
        if older_than < timedelta(0):
            raise ValueError("The retention period cannot be negative.")
        held = {item.id for release in self._repository.list_all() for item in release.documents}
        published = {item.id for item in self._repository.document_versions(False)}
        return tuple(
            version
            for version in self._repository.document_versions(True)
            if version.id not in held
            and version.id not in published
            and now - version.uploaded_at >= older_than
        )

    def collect(self, now: datetime, older_than: timedelta) -> tuple[KnowledgeDocumentVersion, ...]:
        """Delete the stored files of the unused versions; their registrations stay."""
        unused = self.unused(now, older_than)
        for version in unused:
            self._storage.delete(DocumentVersionId(version.storage_key))
        return unused
