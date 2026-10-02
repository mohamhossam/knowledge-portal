"""Connection contract shared by the PostgreSQL repositories."""

from contextlib import AbstractContextManager
from typing import Protocol

from knowledge_portal.infrastructure.persistence.postgres_values import DbConnection


class PostgresSession(Protocol):
    def connection(self) -> AbstractContextManager[DbConnection]: ...
    def transaction(self) -> AbstractContextManager[None]: ...
