"""PostgreSQL value decoding shared by the adapters."""

from __future__ import annotations

from datetime import datetime

from smb_kernel.persistence.connector import DbConnection as DbConnection

from knowledge_portal.application.errors import PersistenceError


def _integer(value: object) -> int:
    if not isinstance(value, int):
        raise PersistenceError("Stored revision number must be an integer.")
    return value


def _datetime(value: object) -> datetime:
    if not isinstance(value, datetime):
        raise PersistenceError("Stored revision timestamp must be a datetime.")
    return value
