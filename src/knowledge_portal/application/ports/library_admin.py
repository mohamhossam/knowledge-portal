"""Knowledge admins acting on library documents they don't own (Knowledge Center C)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from knowledge_portal.domain.identity.entities import ActorSnapshot


@dataclass(frozen=True)
class AdminGrant:
    """One admin may act as a document's owner until it expires or they end it."""

    id: str
    document_id: str
    admin: ActorSnapshot
    reason: str
    granted_at: datetime
    expires_at: datetime
    ended_at: datetime | None = None

    def live(self, now: datetime) -> bool:
        return self.ended_at is None and now < self.expires_at


class LibraryAdminAction(StrEnum):
    GRANT = "grant"
    END = "end"
    REASSIGN = "reassign"
    WITHDRAW = "withdraw"
    REVIEW = "review"
    APPROVE = "approve"
    RETRY_READING = "retry_reading"
    RETRY_INDEXING = "retry_indexing"
    # Confirmed still right on the owner's behalf (Knowledge Center D).
    CONFIRM_REVIEW = "confirm_review"


# What an override changed on one document: its owner, what is published, and its version.
DocumentState = dict[str, str | int | None]


@dataclass(frozen=True)
class LibraryAdminRecord:
    id: str
    action: LibraryAdminAction
    document_ids: tuple[str, ...]
    admin: ActorSnapshot
    reason: str | None
    acted_at: datetime
    before: DocumentState | None = None
    after: DocumentState | None = None


class LibraryAdminGrantsPort(Protocol):
    def open_grant(self, document_id: str, actor_id: str) -> AdminGrant | None:
        """The admin's grant on the document that has not been ended, expired or not."""
        ...

    def add(self, grant: AdminGrant) -> None: ...
    def end(self, grant_id: str, at: datetime) -> None: ...


class LibraryAdminRecordPort(Protocol):
    def add(self, record: LibraryAdminRecord) -> None: ...
    def for_document(self, document_id: str, limit: int) -> tuple[LibraryAdminRecord, ...]:
        """Newest first."""
        ...
