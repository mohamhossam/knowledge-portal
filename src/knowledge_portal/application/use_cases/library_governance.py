"""Audited document handover."""

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import (
    ActorNotFoundError,
    DocumentNotFoundError,
    DocumentVersionConflictError,
)
from knowledge_portal.application.ports.actor_directory import ActorLookupPort
from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.application.ports.library_admin import LibraryAdminAction
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.use_cases.identity_access import KNOWLEDGE_ADMIN
from knowledge_portal.application.use_cases.library_admin import LibraryStewardship
from knowledge_portal.domain.document.library import LibraryDocument, OwnershipTransfer
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError


class LibraryGovernance:
    def __init__(
        self,
        documents: DocumentLibraryPort,
        actors: ActorLookupPort,
        transactions: TransactionManagerPort,
        clock: ClockPort,
        stewardship: LibraryStewardship | None = None,
    ) -> None:
        self._stewardship = stewardship or LibraryStewardship.owner_only(clock)
        self._documents, self._actors = documents, actors
        self._transactions, self._clock = transactions, clock

    def _document(self, document_id: str) -> LibraryDocument:
        document = self._documents.get(document_id)
        if document is None:
            raise DocumentNotFoundError("Library document was not found.")
        return document

    def _owned(self, document_id: str, actor: ActorProfile) -> LibraryDocument:
        document = self._document(document_id)
        if not self._stewardship.may_act(document, actor):
            raise AuthorizationDeniedError(
                "Only the document owner, or an admin acting for them, can manage its governance."
            )
        return document

    def history(self, document_id: str, actor: ActorProfile) -> tuple[OwnershipTransfer, ...]:
        # Who owned it, and who handed it over, is no secret among knowledge admins.
        document = self._document(document_id)
        if KNOWLEDGE_ADMIN in actor.roles:
            return document.ownership_history
        return self._owned(document_id, actor).ownership_history

    def transfer(
        self, document_id: str, actor: ActorProfile, target_id: ActorId, expected: int, reason: str
    ) -> OwnershipTransfer:
        with self._transactions.transaction():
            document = self._document(document_id)
            override = self._stewardship.acting_for(
                document,
                actor,
                "Only the document owner, or an admin acting for them, can hand it over.",
            )
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
                override,
            )
            updated = document.transfer(change)
            self._documents.save(updated, document.version)
            self._stewardship.overridden(
                LibraryAdminAction.REASSIGN, actor, override, document, updated
            )
            return change
