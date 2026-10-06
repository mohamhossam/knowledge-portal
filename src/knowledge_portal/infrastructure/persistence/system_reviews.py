"""Catalogue systems' review confirmations, in memory and in PostgreSQL (Knowledge Center D)."""

from __future__ import annotations

import uuid
from datetime import datetime
from threading import RLock
from typing import cast

from knowledge_portal.domain.identity.entities import ActorId, ActorSnapshot
from knowledge_portal.domain.shared.review import AdminOverride, ReviewConfirmation
from knowledge_portal.infrastructure.persistence.postgres_session import PostgresSession


class InMemorySystemReviews:
    def __init__(self, lock: RLock) -> None:
        self._lock = lock
        self._rows: list[tuple[str, ReviewConfirmation]] = []

    def snapshot_state(self) -> object:
        return list(self._rows)

    def restore_state(self, state: object) -> None:
        self._rows = cast(list[tuple[str, ReviewConfirmation]], state)

    def latest(self, system_ids: tuple[str, ...]) -> dict[str, ReviewConfirmation]:
        wanted = set(system_ids)
        found: dict[str, ReviewConfirmation] = {}
        with self._lock:
            # Later rows win a tie, as they were made later.
            for system_id, confirmation in self._rows:
                current = found.get(system_id)
                if system_id in wanted and (
                    current is None or confirmation.reviewed_at >= current.reviewed_at
                ):
                    found[system_id] = confirmation
        return found

    def add(self, system_ids: tuple[str, ...], confirmation: ReviewConfirmation) -> None:
        with self._lock:
            self._rows.extend((system_id, confirmation) for system_id in system_ids)

    def history(self, system_id: str, limit: int) -> tuple[ReviewConfirmation, ...]:
        with self._lock:
            mine = [
                (confirmation.reviewed_at, n, confirmation)
                for n, (row_system, confirmation) in enumerate(self._rows)
                if row_system == system_id
            ]
        return tuple(item for *_, item in sorted(mine, reverse=True)[:limit])


_COLUMNS = (
    "reviewed_at, reviewer_id, reviewer_name, note, "
    "on_behalf_admin_id, on_behalf_admin_name, on_behalf_reason"
)


def _confirmation(row: tuple[object, ...]) -> ReviewConfirmation:
    reviewed_at, reviewer_id, reviewer_name, note, admin_id, admin_name, reason = row
    on_behalf = None
    if admin_id is not None:
        on_behalf = AdminOverride(
            ActorSnapshot(ActorId(str(admin_id)), str(admin_name)), str(reason)
        )
    return ReviewConfirmation(
        cast(datetime, reviewed_at),
        ActorSnapshot(ActorId(str(reviewer_id)), str(reviewer_name)),
        None if note is None else str(note),
        on_behalf,
    )


class PostgresSystemReviews:
    def __init__(self, store: PostgresSession) -> None:
        self._store = store

    def latest(self, system_ids: tuple[str, ...]) -> dict[str, ReviewConfirmation]:
        if not system_ids:
            return {}
        with self._store.connection() as connection:
            rows = connection.execute(
                f"""SELECT DISTINCT ON (system_id) system_id, {_COLUMNS} FROM system_reviews
                WHERE system_id = ANY(%s) ORDER BY system_id, reviewed_at DESC, seq DESC""",
                (list(system_ids),),
            ).fetchall()
        return {str(row[0]): _confirmation(tuple(row[1:])) for row in rows}

    def add(self, system_ids: tuple[str, ...], confirmation: ReviewConfirmation) -> None:
        on_behalf = confirmation.on_behalf
        with self._store.connection() as connection:
            for system_id in system_ids:
                connection.execute(
                    f"""INSERT INTO system_reviews (review_id, system_id, {_COLUMNS})
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        uuid.uuid4().hex,
                        system_id,
                        confirmation.reviewed_at,
                        confirmation.reviewer.id.value,
                        confirmation.reviewer.display_name,
                        confirmation.note,
                        None if on_behalf is None else on_behalf.admin.id.value,
                        None if on_behalf is None else on_behalf.admin.display_name,
                        None if on_behalf is None else on_behalf.reason,
                    ),
                )

    def history(self, system_id: str, limit: int) -> tuple[ReviewConfirmation, ...]:
        with self._store.connection() as connection:
            rows = connection.execute(
                f"""SELECT {_COLUMNS} FROM system_reviews WHERE system_id = %s
                ORDER BY reviewed_at DESC, seq DESC LIMIT %s""",
                (system_id, limit),
            ).fetchall()
        return tuple(_confirmation(tuple(row)) for row in rows)
