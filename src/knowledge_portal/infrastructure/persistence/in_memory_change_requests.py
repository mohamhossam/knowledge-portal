"""Isolated offline inbox of change requests from Requirement AI."""

from __future__ import annotations

from threading import RLock

from knowledge_portal.application.ports.change_requests import ChangeRequestConflictError
from knowledge_portal.domain.architecture.change_requests import (
    IncomingChangeRequest,
    IncomingStatus,
)


class InMemoryChangeRequests:
    def __init__(self) -> None:
        self._lock = RLock()
        self._items: dict[str, IncomingChangeRequest] = {}

    def receive(self, item: IncomingChangeRequest) -> tuple[IncomingChangeRequest, bool]:
        with self._lock:
            known = next(
                (each for each in self._items.values() if each.approval_id == item.approval_id),
                None,
            )
            if known is not None:
                if known.subject_fingerprint != item.subject_fingerprint:
                    raise ChangeRequestConflictError(
                        f"Approval {item.approval_id} was already sent for another subject."
                    )
                return known, False
            if item.id in self._items:
                raise ChangeRequestConflictError(f"{item.id} is already taken.")
            self._items[item.id] = item
            return item, True

    def ids(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._items)

    def list(self) -> tuple[IncomingChangeRequest, ...]:
        with self._lock:
            return tuple(
                sorted(self._items.values(), key=lambda each: each.received_at, reverse=True)
            )

    def get(self, change_request_id: str) -> IncomingChangeRequest | None:
        with self._lock:
            return self._items.get(change_request_id)

    def save(self, item: IncomingChangeRequest, expected: IncomingStatus) -> None:
        with self._lock:
            current = self._items.get(item.id)
            if current is None or current.status is not expected:
                raise ChangeRequestConflictError(f"{item.id} changed; reload it.")
            self._items[item.id] = item
