"""Audited document handover and access-filtered reference dependency queries."""

from dataclasses import dataclass

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import (
    ActorNotFoundError,
    DocumentNotFoundError,
    DocumentVersionConflictError,
)
from knowledge_portal.application.ports.actor_directory import ActorLookupPort
from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.application.ports.requirement_dependents import (
    ProposalStatus,
    RequirementDependentsPort,
)
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.domain.document.library import LibraryDocument, OwnershipTransfer
from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError


@dataclass(frozen=True)
class LibraryDependency:
    requirement_id: str
    requirement_title: str
    analysis_id: str | None
    round_number: int | None
    current_analysis: bool
    proposal_id: str
    statement: str
    status: ProposalStatus
    citation: PublishedReference
    publication_current: bool


@dataclass(frozen=True)
class LibraryDependencyPage:
    items: tuple[LibraryDependency, ...]
    next_offset: int | None


class LibraryGovernance:
    def __init__(
        self,
        documents: DocumentLibraryPort,
        actors: ActorLookupPort,
        transactions: TransactionManagerPort,
        clock: ClockPort,
        dependents: RequirementDependentsPort,
    ) -> None:
        self._dependents = dependents
        self._documents, self._actors = documents, actors
        self._transactions, self._clock = transactions, clock

    def _owned(self, document_id: str, actor: ActorProfile) -> LibraryDocument:
        document = self._documents.get(document_id)
        if document is None:
            raise DocumentNotFoundError("Library document was not found.")
        if document.owner.id != actor.id:
            raise AuthorizationDeniedError("Only the document owner can manage its governance.")
        return document

    def history(self, document_id: str, actor: ActorProfile) -> tuple[OwnershipTransfer, ...]:
        return self._owned(document_id, actor).ownership_history

    def transfer(
        self, document_id: str, actor: ActorProfile, target_id: ActorId, expected: int, reason: str
    ) -> OwnershipTransfer:
        with self._transactions.transaction():
            document = self._owned(document_id, actor)
            if document.version != expected:
                raise DocumentVersionConflictError("Document changed. Reload before transferring.")
            target = self._actors.get(target_id)
            if target is None:
                raise ActorNotFoundError("Choose a known workspace user as the new owner.")
            change = OwnershipTransfer(
                document.owner,
                target.snapshot(),
                actor.snapshot(),
                self._clock.now(),
                reason.strip(),
            )
            self._documents.save(document.transfer(change), document.version)
            return change

    def dependencies(
        self, document_id: str, actor: ActorProfile, offset: int = 0, limit: int = 50
    ) -> LibraryDependencyPage:
        # A document owner's rights never confer access to another user's Requirement:
        # requirement work filters the rows by the actor's own access (ADR-0099).
        with self._transactions.transaction():
            document = self._owned(document_id, actor)
        page = self._dependents.proposals(actor.id, document_id, offset, limit)
        return LibraryDependencyPage(
            tuple(
                LibraryDependency(
                    item.requirement_id,
                    item.requirement_title,
                    item.analysis_id,
                    item.round_number,
                    item.current,
                    item.proposal_id,
                    item.statement,
                    item.status,
                    item.citation,
                    document.published_id == item.citation.publication_id,
                )
                for item in page.items
            ),
            page.next_offset,
        )
