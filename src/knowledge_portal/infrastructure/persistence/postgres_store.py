"""PostgreSQL connection ownership and explicit units of work."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

import psycopg
from smb_kernel.persistence.connector import PostgresConnector

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.infrastructure.persistence.migration_runner import (
    latest_packaged_migration,
)
from knowledge_portal.infrastructure.persistence.postgres_values import DbConnection


class PostgresStore:
    """Own connections and atomic commits, one unit of work per context."""

    def __init__(self, connector: PostgresConnector) -> None:
        self._connector = connector
        self._connection_var: ContextVar[DbConnection | None] = ContextVar(
            "postgres_connection", default=None
        )
        self._rollback_var: ContextVar[bool] = ContextVar("postgres_rollback_only", default=False)

    @contextmanager
    def transaction(self) -> Iterator[None]:
        if self._connection_var.get() is not None:
            try:
                yield
            except BaseException:
                self.mark_rollback_only()
                raise
            return
        try:
            connection = self._connector.acquire()
            connection_token = self._connection_var.set(connection)
            rollback_token = self._rollback_var.set(False)
            try:
                yield
                if self._rollback_var.get():
                    connection.rollback()
                else:
                    connection.commit()
            finally:
                # Releasing rolls back any uncommitted work after a rejected result.
                self._connector.release(connection)
                self._rollback_var.reset(rollback_token)
                self._connection_var.reset(connection_token)
        except psycopg.Error as exc:
            raise PersistenceError("PostgreSQL operation failed.") from exc

    def mark_rollback_only(self) -> None:
        self._rollback_var.set(True)

    def readiness(self) -> bool:
        """Bounded database checks, without schema changes or paid provider calls."""
        try:
            with self._connector.connection(timeout_seconds=2) as connection:
                connection.execute("SET LOCAL statement_timeout = '2000ms'")
                row = connection.execute(
                    "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=%s)",
                    (latest_packaged_migration(),),
                ).fetchone()
                return row is not None and bool(row[0])
        except psycopg.Error:
            return False

    @contextmanager
    def connection(self) -> Iterator[DbConnection]:
        """Share the active unit-of-work connection with sibling adapters."""
        active = self._connection_var.get()
        if active is not None:
            yield active
            return
        with self.transaction():
            connection = self._connection_var.get()
            if connection is None:  # pragma: no cover - transaction invariant
                raise PersistenceError("PostgreSQL transaction did not provide a connection.")
            yield connection
