"""Connection contract shared by repositories and commit-time work."""

from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
from typing import Protocol

from knowledge_portal.infrastructure.persistence.postgres_values import DbConnection


class PostgresSession(Protocol):
    def connection(self) -> AbstractContextManager[DbConnection]: ...
    def transaction(self) -> AbstractContextManager[None]: ...


class PostgresCommitSession:
    """Borrow an active commit connection without owning its transaction."""

    def __init__(self, connection: DbConnection) -> None:
        self._active = connection

    @contextmanager
    def connection(self) -> Iterator[DbConnection]:
        yield self._active

    @contextmanager
    def transaction(self) -> Iterator[None]:
        yield
