"""A document owner's view of where its changes need review (requirement-portal ADR-0099)."""

from knowledge_portal.application.errors import DocumentNotFoundError
from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.application.ports.source_impact import (
    DependencyImpactPage,
    RequirementImpactPort,
)
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError


class DocumentSourceImpact:
    def __init__(
        self,
        documents: DocumentLibraryPort,
        impact: RequirementImpactPort,
        transactions: TransactionManagerPort,
    ) -> None:
        self._documents = documents
        self._impact = impact
        self._transactions = transactions

    def page(
        self,
        document_id: str,
        actor: ActorProfile,
        *,
        active_only: bool = False,
        query: str = "",
        offset: int = 0,
        limit: int = 20,
    ) -> DependencyImpactPage:
        # Ownership is checked here, on the live library, before requirement work
        # is asked; it checks again on its own copy, and filters by the actor's access.
        with self._transactions.transaction():
            document = self._documents.get(document_id)
            if document is None:
                raise DocumentNotFoundError("Library document was not found.")
            if document.owner.id != actor.id:
                raise AuthorizationDeniedError(
                    "Only the document owner can inspect where it is cited."
                )
        return self._impact.document_impact(
            actor.id,
            document_id,
            active_only=active_only,
            query=query.strip(),
            offset=offset,
            limit=limit,
        )
