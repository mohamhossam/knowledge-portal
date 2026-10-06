"""Admin grants on library documents and the record of every override (Knowledge Center C)."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from threading import RLock
from typing import cast

from psycopg.types.json import Jsonb

from knowledge_portal.application.ports.library_admin import (
    AdminGrant,
    DocumentState,
    LibraryAdminAction,
    LibraryAdminRecord,
)
from knowledge_portal.domain.identity.entities import ActorId, ActorSnapshot
from knowledge_portal.infrastructure.persistence.postgres_session import PostgresSession


class InMemoryLibraryAdmin:
    """Both ports in memory, enrolled in the memory transaction like the library itself."""

    def __init__(self, lock: RLock) -> None:
        self._lock = lock
        self._grants: dict[str, AdminGrant] = {}
        self._records: list[LibraryAdminRecord] = []

    def snapshot_state(self) -> object:
        return self._grants.copy(), list(self._records)

    def restore_state(self, state: object) -> None:
        self._grants, self._records = cast(
            tuple[dict[str, AdminGrant], list[LibraryAdminRecord]], state
        )

    def open_grant(self, document_id: str, actor_id: str) -> AdminGrant | None:
        with self._lock:
            return next(
                (
                    grant
                    for grant in self._grants.values()
                    if grant.document_id == document_id
                    and grant.admin.id.value == actor_id
                    and grant.ended_at is None
                ),
                None,
            )

    def add(self, grant: AdminGrant) -> None:
        with self._lock:
            self._grants[grant.id] = grant

    def end(self, grant_id: str, at: datetime) -> None:
        with self._lock:
            grant = self._grants[grant_id]
            self._grants[grant_id] = replace(grant, ended_at=at)

    def add_record(self, record: LibraryAdminRecord) -> None:
        with self._lock:
            self._records.append(record)

    def for_document(self, document_id: str, limit: int) -> tuple[LibraryAdminRecord, ...]:
        with self._lock:
            # Newest first; records made in the same instant, latest made first.
            mine = [
                (record.acted_at, n, record)
                for n, record in enumerate(self._records)
                if document_id in record.document_ids
            ]
            return tuple(record for *_, record in sorted(mine, reverse=True)[:limit])


class InMemoryLibraryAdminRecord:
    """The record port over the shared memory store."""

    def __init__(self, store: InMemoryLibraryAdmin) -> None:
        self._store = store

    def add(self, record: LibraryAdminRecord) -> None:
        self._store.add_record(record)

    def for_document(self, document_id: str, limit: int) -> tuple[LibraryAdminRecord, ...]:
        return self._store.for_document(document_id, limit)


def _grant(row: tuple[object, ...]) -> AdminGrant:
    grant_id, document_id, actor_id, actor_name, reason, granted, expires, ended = row
    return AdminGrant(
        str(grant_id),
        str(document_id),
        ActorSnapshot(ActorId(str(actor_id)), str(actor_name)),
        str(reason),
        cast(datetime, granted),
        cast(datetime, expires),
        cast(datetime | None, ended),
    )


class PostgresLibraryAdminGrants:
    def __init__(self, store: PostgresSession) -> None:
        self._store = store

    def open_grant(self, document_id: str, actor_id: str) -> AdminGrant | None:
        with self._store.connection() as connection:
            row = connection.execute(
                """SELECT grant_id, document_id, actor_id, actor_name, reason, granted_at,
                expires_at, ended_at FROM library_admin_grants
                WHERE document_id=%s AND actor_id=%s AND ended_at IS NULL""",
                (document_id, actor_id),
            ).fetchone()
        return _grant(tuple(row)) if row else None

    def add(self, grant: AdminGrant) -> None:
        with self._store.connection() as connection:
            connection.execute(
                """INSERT INTO library_admin_grants (grant_id, document_id, actor_id,
                actor_name, reason, granted_at, expires_at, ended_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    grant.id,
                    grant.document_id,
                    grant.admin.id.value,
                    grant.admin.display_name,
                    grant.reason,
                    grant.granted_at,
                    grant.expires_at,
                    grant.ended_at,
                ),
            )

    def end(self, grant_id: str, at: datetime) -> None:
        with self._store.connection() as connection:
            connection.execute(
                "UPDATE library_admin_grants SET ended_at=%s "
                "WHERE grant_id=%s AND ended_at IS NULL",
                (at, grant_id),
            )


class PostgresLibraryAdminRecord:
    def __init__(self, store: PostgresSession) -> None:
        self._store = store

    def add(self, record: LibraryAdminRecord) -> None:
        with self._store.connection() as connection:
            connection.execute(
                """INSERT INTO library_admin_record (record_id, action, document_ids, actor_id,
                actor_name, reason, before, after, acted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    record.id,
                    record.action.value,
                    list(record.document_ids),
                    record.admin.id.value,
                    record.admin.display_name,
                    record.reason,
                    None if record.before is None else Jsonb(record.before),
                    None if record.after is None else Jsonb(record.after),
                    record.acted_at,
                ),
            )

    def for_document(self, document_id: str, limit: int) -> tuple[LibraryAdminRecord, ...]:
        with self._store.connection() as connection:
            rows = connection.execute(
                """SELECT record_id, action, document_ids, actor_id, actor_name, reason, before,
                after, acted_at FROM library_admin_record WHERE document_ids @> ARRAY[%s]
                ORDER BY acted_at DESC, seq DESC LIMIT %s""",
                (document_id, limit),
            ).fetchall()
        return tuple(_record(tuple(row)) for row in rows)


def _record(row: tuple[object, ...]) -> LibraryAdminRecord:
    record_id, action, document_ids, actor_id, actor_name, reason, before, after, acted_at = row
    return LibraryAdminRecord(
        str(record_id),
        LibraryAdminAction(str(action)),
        tuple(cast(list[str], document_ids)),
        ActorSnapshot(ActorId(str(actor_id)), str(actor_name)),
        None if reason is None else str(reason),
        cast(datetime, acted_at),
        cast(DocumentState | None, before),
        cast(DocumentState | None, after),
    )
