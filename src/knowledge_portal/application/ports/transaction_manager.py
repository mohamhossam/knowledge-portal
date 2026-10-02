"""Outbound transaction boundary used by delivery interfaces."""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Protocol


class TransactionManagerPort(Protocol):
    """Provide one atomic unit around an application action."""

    def transaction(self) -> AbstractContextManager[None]: ...

    def mark_rollback_only(self) -> None: ...
