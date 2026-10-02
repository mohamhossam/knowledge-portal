"""Atomic transaction coordinator for the in-memory adapter graph."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Protocol


class MemoryTransactionParticipant(Protocol):
    def snapshot_state(self) -> object: ...

    def restore_state(self, state: object) -> None: ...


class InMemoryTransactionManager:
    """Coordinate all mutable memory stores with one reentrant lock.

    Participants remain simple repository adapters. Their collection-valued
    state is snapshotted only at the outer transaction boundary, and nested
    failures mark the entire logical mutation for rollback even when caught by
    an inner collaborator.
    """

    def __init__(self, lock: threading.RLock) -> None:
        self._lock = lock
        self._participants: list[MemoryTransactionParticipant] = []
        self._local = threading.local()

    def enroll(self, *participants: MemoryTransactionParticipant) -> None:
        with self._lock:
            for participant in participants:
                if participant not in self._participants:
                    self._participants.append(participant)

    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self._lock:
            depth = int(getattr(self._local, "depth", 0))
            outer = depth == 0
            if outer:
                self._local.snapshot = self._snapshot()
                self._local.rollback_only = False
            self._local.depth = depth + 1
            try:
                yield
            except BaseException:
                self._local.rollback_only = True
                raise
            finally:
                self._local.depth -= 1
                if outer:
                    try:
                        if bool(self._local.rollback_only):
                            self._restore(self._local.snapshot)
                    finally:
                        del self._local.snapshot
                        del self._local.rollback_only
                        del self._local.depth

    def mark_rollback_only(self) -> None:
        if int(getattr(self._local, "depth", 0)) == 0:
            raise RuntimeError("No in-memory transaction is active.")
        self._local.rollback_only = True

    def _snapshot(self) -> list[tuple[MemoryTransactionParticipant, object]]:
        return [(participant, participant.snapshot_state()) for participant in self._participants]

    @staticmethod
    def _restore(snapshots: list[tuple[MemoryTransactionParticipant, object]]) -> None:
        for participant, state in snapshots:
            participant.restore_state(state)
