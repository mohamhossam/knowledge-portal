"""Historic Requirements, in memory and in PostgreSQL (Knowledge Center E)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Collection
from threading import RLock
from typing import cast

from psycopg.types.json import Jsonb
from pydantic import TypeAdapter, ValidationError

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.historic_requirements import (
    HistoricRequirementConflictError,
)
from knowledge_portal.domain.historic.historic_requirement import (
    HistoricRequirement,
    HistoricStatus,
)
from knowledge_portal.infrastructure.persistence.postgres_session import PostgresSession

_CODEC: TypeAdapter[HistoricRequirement] = TypeAdapter(HistoricRequirement)


def _matches(item: HistoricRequirement, status: HistoricStatus | None, query: str) -> bool:
    return (status is None or item.status is status) and query.casefold() in item.title.casefold()


def _check_advance(item: HistoricRequirement, expected_version: int) -> None:
    if item.version != expected_version + 1:
        raise HistoricRequirementConflictError("A change must advance the version exactly once.")


class InMemoryHistoricRequirements:
    def __init__(self, lock: RLock) -> None:
        self._lock = lock
        self._items: dict[str, HistoricRequirement] = {}

    def snapshot_state(self) -> object:
        return dict(self._items)

    def restore_state(self, state: object) -> None:
        self._items = cast(dict[str, HistoricRequirement], state)

    def add(self, item: HistoricRequirement) -> None:
        with self._lock:
            if item.id in self._items:
                raise HistoricRequirementConflictError("That historic requirement already exists.")
            self._items[item.id] = item

    def get(self, historic_id: str) -> HistoricRequirement | None:
        with self._lock:
            return self._items.get(historic_id)

    def save(self, item: HistoricRequirement, expected_version: int) -> None:
        _check_advance(item, expected_version)
        with self._lock:
            current = self._items.get(item.id)
            if current is None or current.version != expected_version:
                raise HistoricRequirementConflictError(
                    "It changed while you worked. Reload it and try again."
                )
            self._items[item.id] = item

    def remove(self, historic_id: str, expected_version: int) -> None:
        with self._lock:
            current = self._items.get(historic_id)
            if current is None or current.version != expected_version:
                raise HistoricRequirementConflictError(
                    "It changed while you worked. Reload it and try again."
                )
            del self._items[historic_id]

    def list(
        self, status: HistoricStatus | None, query: str, offset: int, limit: int
    ) -> tuple[HistoricRequirement, ...]:
        with self._lock:
            found = sorted(
                (item for item in self._items.values() if _matches(item, status, query)),
                key=lambda item: (item.created_at, item.id),
                reverse=True,
            )
        return tuple(found[offset : offset + limit])

    def holding(self, checksum: str) -> HistoricRequirement | None:
        with self._lock:
            return next(
                (
                    item
                    for item in self._items.values()
                    if any(brd.checksum == checksum for brd in item.brds)
                ),
                None,
            )

    def counts(self) -> dict[HistoricStatus, int]:
        with self._lock:
            tally = Counter(item.status for item in self._items.values())
        return {status: tally.get(status, 0) for status in HistoricStatus}

    def refresh_waiting(self) -> int:
        with self._lock:
            return sum(
                1
                for item in self._items.values()
                if item.status is HistoricStatus.PUBLISHED and item.pending_refresh is not None
            )

    def rooted_in(
        self, work_item_ids: Collection[int], limit: int
    ) -> tuple[HistoricRequirement, ...]:
        wanted = set(work_item_ids)
        with self._lock:
            found = sorted(
                (item for item in self._items.values() if wanted.intersection(item.root_ids)),
                key=lambda item: (item.created_at, item.id),
                reverse=True,
            )
        return tuple(found[:limit])


def _decode(raw: object) -> HistoricRequirement:
    try:
        return _CODEC.validate_python(raw)
    except ValidationError as exc:
        raise PersistenceError("A stored historic requirement is invalid.") from exc


class PostgresHistoricRequirements:
    """Session-aware, so a publication's event commits with it (ADR-0102)."""

    def __init__(self, store: PostgresSession) -> None:
        self._store = store

    def add(self, item: HistoricRequirement) -> None:
        with self._store.connection() as connection:
            result = connection.execute(
                "INSERT INTO historic_requirements (historic_requirement_id, version, status, "
                "title, created_at, payload) VALUES (%s, %s, %s, %s, %s, %s) "
                "ON CONFLICT DO NOTHING",
                (
                    item.id,
                    item.version,
                    item.status.value,
                    item.title,
                    item.created_at,
                    Jsonb(_CODEC.dump_python(item, mode="json")),
                ),
            )
            if result.rowcount != 1:
                raise HistoricRequirementConflictError("That historic requirement already exists.")

    def get(self, historic_id: str) -> HistoricRequirement | None:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM historic_requirements WHERE historic_requirement_id = %s",
                (historic_id,),
            ).fetchone()
        return None if row is None else _decode(row[0])

    def save(self, item: HistoricRequirement, expected_version: int) -> None:
        _check_advance(item, expected_version)
        with self._store.connection() as connection:
            result = connection.execute(
                "UPDATE historic_requirements SET version = %s, status = %s, title = %s, "
                "payload = %s, updated_at = now() "
                "WHERE historic_requirement_id = %s AND version = %s",
                (
                    item.version,
                    item.status.value,
                    item.title,
                    Jsonb(_CODEC.dump_python(item, mode="json")),
                    item.id,
                    expected_version,
                ),
            )
            if result.rowcount != 1:
                raise HistoricRequirementConflictError(
                    "It changed while you worked. Reload it and try again."
                )

    def remove(self, historic_id: str, expected_version: int) -> None:
        with self._store.connection() as connection:
            result = connection.execute(
                "DELETE FROM historic_requirements "
                "WHERE historic_requirement_id = %s AND version = %s",
                (historic_id, expected_version),
            )
            if result.rowcount != 1:
                raise HistoricRequirementConflictError(
                    "It changed while you worked. Reload it and try again."
                )

    def list(
        self, status: HistoricStatus | None, query: str, offset: int, limit: int
    ) -> tuple[HistoricRequirement, ...]:
        pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM historic_requirements "
                "WHERE (%s::text IS NULL OR status = %s) AND title ILIKE %s "
                "ORDER BY created_at DESC, historic_requirement_id DESC OFFSET %s LIMIT %s",
                (
                    None if status is None else status.value,
                    None if status is None else status.value,
                    pattern,
                    offset,
                    limit,
                ),
            ).fetchall()
        return tuple(_decode(row[0]) for row in rows)

    def holding(self, checksum: str) -> HistoricRequirement | None:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM historic_requirements WHERE payload->'brds' @> %s LIMIT 1",
                (Jsonb([{"checksum": checksum}]),),
            ).fetchone()
        return None if row is None else _decode(row[0])

    def counts(self) -> dict[HistoricStatus, int]:
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT status, count(*) FROM historic_requirements GROUP BY status"
            ).fetchall()
        found = {str(row[0]): int(cast(int, row[1])) for row in rows}
        return {status: found.get(status.value, 0) for status in HistoricStatus}

    def refresh_waiting(self) -> int:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT count(*) FROM historic_requirements WHERE status = %s "
                "AND jsonb_typeof(payload->'pending_refresh') = 'object'",
                (HistoricStatus.PUBLISHED.value,),
            ).fetchone()
        return 0 if row is None else int(cast(int, row[0]))

    def rooted_in(
        self, work_item_ids: Collection[int], limit: int
    ) -> tuple[HistoricRequirement, ...]:
        if not work_item_ids:
            return ()
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM historic_requirements WHERE EXISTS ("
                "SELECT 1 FROM jsonb_array_elements_text(payload->'root_ids') AS root(id) "
                "WHERE root.id::bigint = ANY(%s)) "
                "ORDER BY created_at DESC, historic_requirement_id DESC LIMIT %s",
                (sorted(set(work_item_ids)), limit),
            ).fetchall()
        return tuple(_decode(row[0]) for row in rows)
