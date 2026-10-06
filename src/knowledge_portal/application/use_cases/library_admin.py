"""Knowledge admins acting on library documents they don't own (Knowledge Center C).

An admin who is not a document's owner opens a grant, giving a reason. While it lasts they
see the owner's view and may review, approve, reassign or withdraw it on the owner's behalf;
each change carries the grant's reason and is recorded with the state before and after.
Builds, activation and discard stay with the owner.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import DocumentNotFoundError
from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.application.ports.library_admin import (
    AdminGrant,
    DocumentState,
    LibraryAdminAction,
    LibraryAdminGrantsPort,
    LibraryAdminRecord,
    LibraryAdminRecordPort,
)
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.use_cases.identity_access import KNOWLEDGE_ADMIN
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.library import AdminOverride, LibraryDocument
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError

GRANT_LENGTH = timedelta(hours=8)
RECORD_LIMIT = 200


def document_state(document: LibraryDocument) -> DocumentState:
    return {
        "owner_id": document.owner.id.value,
        "owner_name": document.owner.display_name,
        "published_id": document.published_id,
        "version": document.version,
    }


class LibraryStewardship:
    """Who may act as a document's owner: the owner, or an admin holding a live grant."""

    def __init__(
        self,
        grants: LibraryAdminGrantsPort | None,
        record: LibraryAdminRecordPort | None,
        clock: ClockPort,
    ) -> None:
        self._grants, self._record, self._clock = grants, record, clock

    @classmethod
    def owner_only(cls, clock: ClockPort) -> LibraryStewardship:
        """Without grants, only owners act: the library as it was before Knowledge Center C."""
        return cls(None, None, clock)

    def grant(self, document: LibraryDocument, actor: ActorProfile) -> AdminGrant | None:
        """The actor's live grant on a document they don't own, if they still hold the role."""
        if self._grants is None or document.owner.id == actor.id:
            return None
        if KNOWLEDGE_ADMIN not in actor.roles:
            return None
        grant = self._grants.open_grant(document.id, actor.id.value)
        return grant if grant is not None and grant.live(self._clock.now()) else None

    def may_act(self, document: LibraryDocument, actor: ActorProfile) -> bool:
        return document.owner.id == actor.id or self.grant(document, actor) is not None

    def acting_for(
        self, document: LibraryDocument, actor: ActorProfile, refusal: str
    ) -> AdminOverride | None:
        """None for the owner; the override for an admin with a live grant; refused otherwise."""
        if document.owner.id == actor.id:
            return None
        grant = self.grant(document, actor)
        if grant is None:
            raise AuthorizationDeniedError(refusal)
        return AdminOverride(actor.snapshot(), grant.reason)

    def record(
        self,
        action: LibraryAdminAction,
        actor: ActorProfile,
        reason: str | None,
        document_ids: tuple[str, ...],
        before: LibraryDocument | None = None,
        after: LibraryDocument | None = None,
    ) -> None:
        if self._record is None:
            return
        self._record.add(
            LibraryAdminRecord(
                str(uuid.uuid4()),
                action,
                document_ids,
                actor.snapshot(),
                reason,
                self._clock.now(),
                None if before is None else document_state(before),
                None if after is None else document_state(after),
            )
        )

    def overridden(
        self,
        action: LibraryAdminAction,
        actor: ActorProfile,
        override: AdminOverride | None,
        before: LibraryDocument,
        after: LibraryDocument,
    ) -> None:
        """Record a change an admin made on the owner's behalf; an owner's own is not recorded."""
        if override is not None:
            self.record(action, actor, override.reason, (before.id,), before, after)


class AdministerLibraryDocument:
    """Open and end an admin's grant on a document, and read its admin record."""

    def __init__(
        self,
        documents: DocumentLibraryPort,
        grants: LibraryAdminGrantsPort,
        record: LibraryAdminRecordPort,
        stewardship: LibraryStewardship,
        transactions: TransactionManagerPort,
        clock: ClockPort,
    ) -> None:
        self._documents, self._grants, self._record = documents, grants, record
        self._stewardship, self._transactions, self._clock = stewardship, transactions, clock

    def _document(self, document_id: str) -> LibraryDocument:
        document = self._documents.get(document_id)
        if document is None:
            raise DocumentNotFoundError("Library document was not found.")
        return document

    def open(self, document_id: str, actor: ActorProfile, reason: str) -> AdminGrant:
        if KNOWLEDGE_ADMIN not in actor.roles:
            raise AuthorizationDeniedError("Only a knowledge admin can act for a document's owner.")
        now = self._clock.now()
        with self._transactions.transaction():
            document = self._document(document_id)
            if document.owner.id == actor.id:
                raise InvalidDocumentError("You own this document; act on it as its owner.")
            override = AdminOverride(actor.snapshot(), reason.strip())
            current = self._grants.open_grant(document_id, actor.id.value)
            if current is not None:
                self._grants.end(current.id, now)
            grant = AdminGrant(
                str(uuid.uuid4()),
                document_id,
                override.admin,
                override.reason,
                now,
                now + GRANT_LENGTH,
            )
            self._grants.add(grant)
            self._stewardship.record(
                LibraryAdminAction.GRANT, actor, override.reason, (document_id,)
            )
            return grant

    def end(self, document_id: str, actor: ActorProfile) -> None:
        now = self._clock.now()
        with self._transactions.transaction():
            self._document(document_id)
            current = self._grants.open_grant(document_id, actor.id.value)
            if current is None:
                return
            self._grants.end(current.id, now)
            # An expired grant ends quietly; only one that was still live is worth recording.
            if current.live(now):
                self._stewardship.record(
                    LibraryAdminAction.END, actor, current.reason, (document_id,)
                )

    def history(self, document_id: str, actor: ActorProfile) -> tuple[LibraryAdminRecord, ...]:
        if KNOWLEDGE_ADMIN not in actor.roles:
            raise AuthorizationDeniedError("Only a knowledge admin can read the admin record.")
        with self._transactions.transaction():
            self._document(document_id)
            return self._record.for_document(document_id, RECORD_LIMIT)
