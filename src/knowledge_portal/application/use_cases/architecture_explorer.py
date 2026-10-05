"""The product architecture explorer: the catalogue in service, read by anyone signed in.

The explorer is a reading of the published catalogue (requirement-portal ADR-0101).
Curating stays with knowledge admins; the version in service is open to every signed-in
person, so the people who order and deliver products read the same architecture that
impact mapping uses. Drafts, documents and history stay closed.
"""

from __future__ import annotations

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge


class ExploreArchitecture:
    def __init__(self, repository: ArchitectureKnowledgeRepositoryPort) -> None:
        self._repository = repository

    def in_service(self) -> ArchitectureKnowledge:
        """The published version in service; never a draft."""
        return self._repository.active()
