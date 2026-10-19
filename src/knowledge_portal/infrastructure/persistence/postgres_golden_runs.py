"""PostgreSQL stored golden set runs: one row each, its result as one JSON document."""

from __future__ import annotations

from psycopg.types.json import Jsonb
from pydantic import TypeAdapter, ValidationError

from knowledge_portal.application.errors import (
    GoldenRunNotFoundError,
    InvalidGoldenRunError,
    PersistenceError,
)
from knowledge_portal.application.ports.golden_runs import (
    GoldenRun,
    GoldenRunOptions,
    GoldenRunResult,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore
from knowledge_portal.infrastructure.persistence.postgres_values import _datetime

_RESULT: TypeAdapter[GoldenRunResult] = TypeAdapter(GoldenRunResult)
_COLUMNS = "run_id, actor_id, requested_at, options, result"


def _run(row: tuple[object, ...]) -> GoldenRun:
    try:
        options = GoldenRunOptions.from_key(str(row[3]))
        result = None if row[4] is None else _RESULT.validate_python(row[4])
    except (InvalidGoldenRunError, ValidationError) as exc:
        raise PersistenceError("Stored golden set run is invalid.") from exc
    return GoldenRun(str(row[0]), str(row[1]), _datetime(row[2]), options, result)


class PostgresGoldenRuns:
    def __init__(self, store: PostgresStore) -> None:
        self._store = store

    def add(self, run: GoldenRun) -> None:
        with self._store.connection() as connection:
            connection.execute(
                "INSERT INTO golden_runs (run_id, actor_id, requested_at, options) "
                "VALUES (%s, %s, %s, %s)",
                (run.id, run.actor_id, run.requested_at, run.options.key),
            )

    def get(self, run_id: str) -> GoldenRun | None:
        with self._store.connection() as connection:
            row = connection.execute(
                f"SELECT {_COLUMNS} FROM golden_runs WHERE run_id = %s", (run_id,)
            ).fetchone()
        return None if row is None else _run(row)

    def save_result(self, run_id: str, result: GoldenRunResult) -> None:
        with self._store.connection() as connection:
            saved = connection.execute(
                "UPDATE golden_runs SET result = %s WHERE run_id = %s",
                (Jsonb(_RESULT.dump_python(result, mode="json")), run_id),
            )
        if saved.rowcount != 1:
            raise GoldenRunNotFoundError("Golden set run not found.")

    def newest(self, limit: int) -> tuple[GoldenRun, ...]:
        return self._select("ORDER BY requested_at DESC LIMIT %s", (limit,))

    def unfinished(self) -> tuple[GoldenRun, ...]:
        return self._select("WHERE result IS NULL ORDER BY requested_at", ())

    def _select(self, clause: str, parameters: tuple[object, ...]) -> tuple[GoldenRun, ...]:
        with self._store.connection() as connection:
            rows = connection.execute(
                f"SELECT {_COLUMNS} FROM golden_runs {clause}", parameters
            ).fetchall()
        return tuple(_run(row) for row in rows)
