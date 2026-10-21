"""The durable inbox of change requests from Requirement AI, one row per final approval."""

from __future__ import annotations

from datetime import UTC, datetime

import psycopg
from psycopg.types.json import Jsonb
from pydantic import TypeAdapter, ValidationError

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.change_requests import ChangeRequestConflictError
from knowledge_portal.domain.architecture.change_requests import (
    IncomingChangeRequest,
    IncomingStatus,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore
from knowledge_portal.infrastructure.persistence.stored_timings import stored_timings

_ITEM: TypeAdapter[IncomingChangeRequest] = TypeAdapter(IncomingChangeRequest)


def _item(raw: object) -> IncomingChangeRequest:
    try:
        return _ITEM.validate_python(stored_timings(raw))
    except ValidationError as exc:
        raise PersistenceError("A stored change request is invalid.") from exc


class PostgresChangeRequests:
    def __init__(self, store: PostgresStore) -> None:
        self._store = store

    def receive(self, item: IncomingChangeRequest) -> tuple[IncomingChangeRequest, bool]:
        with self._store.connection() as connection:
            try:
                inserted = connection.execute(
                    "INSERT INTO incoming_change_requests (change_request_id, approval_id, "
                    "subject_fingerprint, status, payload, received_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (approval_id) DO NOTHING "
                    "RETURNING change_request_id",
                    (
                        item.id,
                        item.approval_id,
                        item.subject_fingerprint,
                        item.status.value,
                        Jsonb(_ITEM.dump_python(item, mode="json")),
                        item.received_at,
                    ),
                ).fetchone()
            except psycopg.errors.UniqueViolation as exc:
                raise ChangeRequestConflictError(f"{item.id} is already taken.") from exc
            if inserted is not None:
                return item, True
            row = connection.execute(
                "SELECT payload FROM incoming_change_requests WHERE approval_id = %s",
                (item.approval_id,),
            ).fetchone()
        if row is None:
            raise PersistenceError("The change request could not be kept.")
        known = _item(row[0])
        if known.subject_fingerprint != item.subject_fingerprint:
            raise ChangeRequestConflictError(
                f"Approval {item.approval_id} was already sent for another subject."
            )
        return known, False

    def ids(self) -> tuple[str, ...]:
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT change_request_id FROM incoming_change_requests"
            ).fetchall()
        return tuple(str(row[0]) for row in rows)

    def list(self) -> tuple[IncomingChangeRequest, ...]:
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM incoming_change_requests "
                "ORDER BY received_at DESC, change_request_id"
            ).fetchall()
        return tuple(_item(row[0]) for row in rows)

    def get(self, change_request_id: str) -> IncomingChangeRequest | None:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM incoming_change_requests WHERE change_request_id = %s",
                (change_request_id,),
            ).fetchone()
        return None if row is None else _item(row[0])

    def save(self, item: IncomingChangeRequest, expected: IncomingStatus) -> None:
        with self._store.connection() as connection:
            row = connection.execute(
                "UPDATE incoming_change_requests SET status = %s, payload = %s, "
                "updated_at = %s WHERE change_request_id = %s AND status = %s "
                "RETURNING change_request_id",
                (
                    item.status.value,
                    Jsonb(_ITEM.dump_python(item, mode="json")),
                    datetime.now(UTC),
                    item.id,
                    expected.value,
                ),
            ).fetchone()
        if row is None:
            raise ChangeRequestConflictError(f"{item.id} changed; reload it.")
