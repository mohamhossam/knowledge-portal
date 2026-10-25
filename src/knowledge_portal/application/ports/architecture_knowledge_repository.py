"""Persistence boundary for administered architecture releases."""

from dataclasses import replace
from typing import Protocol

from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeAuditEvent,
    KnowledgeDocumentVersion,
    KnowledgeReleaseStatus,
    NoReleaseInServiceError,
)


class ArchitectureKnowledgeRepositoryPort(Protocol):
    def get(self, release_id: str) -> ArchitectureKnowledge | None: ...

    def list_all(self) -> tuple[ArchitectureKnowledge, ...]: ...

    def document_versions(self, include_drafts: bool) -> tuple[KnowledgeDocumentVersion, ...]: ...

    def active(self) -> ArchitectureKnowledge | None:
        """The release in service; None until a maintainer publishes the first one."""
        ...

    def save(
        self,
        release: ArchitectureKnowledge,
        expected_revision: int | None,
        actor_id: str,
        action: str,
    ) -> None: ...

    def audit(self, release_id: str) -> tuple[KnowledgeAuditEvent, ...]: ...

    def activate(self, release_id: str, actor_id: str, rationale: str) -> None: ...

    def publish(
        self, release: ArchitectureKnowledge, expected_revision: int, rationale: str
    ) -> None: ...

    def delete_draft(self, release_id: str, expected_revision: int, actor_id: str) -> None:
        """Delete a draft still at ``expected_revision`` with its indexes and suggestions.

        Raises ``KnowledgeConflictError`` when it changed, was published or is gone.
        """
        ...


def release_in_service(repository: ArchitectureKnowledgeRepositoryPort) -> ArchitectureKnowledge:
    """The release in service, for work that cannot go on without one."""
    release = repository.active()
    if release is None:
        raise NoReleaseInServiceError()
    return release


def put_in_service(
    repository: ArchitectureKnowledgeRepositoryPort, release: ArchitectureKnowledge
) -> None:
    """Record a published ``release`` as the version in service, for tests to start from.

    Production never seeds: the first version in service is one a maintainer publishes.
    """
    draft = replace(
        release,
        status=KnowledgeReleaseStatus.DRAFT,
        published_at=None,
        published_by=None,
    )
    repository.save(draft, None, release.published_by or "test-seed", "create_draft")
    repository.publish(release, draft.revision, "Test seed")
