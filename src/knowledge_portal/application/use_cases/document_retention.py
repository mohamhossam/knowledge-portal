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
        held = self._held()
        published = {item.id for item in self._repository.document_versions(False)}
        return tuple(
            version
            for version in self._repository.document_versions(True)
            if not version.file_collected
            and version.id not in held
            and version.id not in published
            and now - version.uploaded_at >= older_than
        )

    def collect(self, now: datetime, older_than: timedelta) -> tuple[KnowledgeDocumentVersion, ...]:
        """Delete the stored files of the unused versions; their registrations stay.

        Each version is marked collected before its file goes, so a draft can no longer take
        it; one a draft took before the mark is unmarked and kept. A file whose delete fails is
        unmarked too, so the next run tries it again. Run it while the portal is quiet: a draft
        that checks a version just before the mark and saves just after the delete can still
        name a version without a file (docs/operations/deployment.md, "Retention").
        """
        collected: list[KnowledgeDocumentVersion] = []
        for version in self.unused(now, older_than):
            self._repository.mark_file_collected(version.id)
            if version.id in self._held():
                self._repository.mark_file_collected(version.id, False)
                continue
            try:
                self._storage.delete(DocumentVersionId(version.storage_key))
            except Exception:
                self._repository.mark_file_collected(version.id, False)
                raise
            collected.append(version)
        return tuple(collected)

    def _held(self) -> set[str]:
        return {item.id for release in self._repository.list_all() for item in release.documents}
