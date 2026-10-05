"""The inbox of change requests requirement-portal sends (requirement-portal ADR-0101, step 7)."""

from __future__ import annotations

from typing import Protocol

from knowledge_portal.domain.architecture.change_requests import (
    IncomingChangeRequest,
    IncomingStatus,
)


class ChangeRequestConflictError(Exception):
    """The same approval was sent again with different content, or the request moved on."""


class ChangeRequestInboxPort(Protocol):
    def receive(self, item: IncomingChangeRequest) -> tuple[IncomingChangeRequest, bool]:
        """Keep a delivered change request once per approval; returns it and whether it is new.

        A second delivery of the same approval returns the first one. Raises
        ChangeRequestConflictError when it attests a different subject.
        """
        ...

    def ids(self) -> tuple[str, ...]:
        """Every change request id taken, so a new one is not given twice."""
        ...

    def list(self) -> tuple[IncomingChangeRequest, ...]:
        """Newest first."""
        ...

    def get(self, change_request_id: str) -> IncomingChangeRequest | None: ...

    def save(self, item: IncomingChangeRequest, expected: IncomingStatus) -> None:
        """Store a read or a dismissal; raises ChangeRequestConflictError if it moved on."""
        ...
