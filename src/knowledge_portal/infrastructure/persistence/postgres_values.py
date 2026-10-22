"""PostgreSQL value decoding shared by the adapters."""

from __future__ import annotations

from datetime import datetime

from smb_kernel.persistence.connector import DbConnection as DbConnection

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.infrastructure.json_reading import UnreadableValue, integer


def _integer(value: object) -> int:
    try:
        return integer(value)
    except UnreadableValue as exc:
        raise PersistenceError("Stored revision number must be an integer.") from exc


def _datetime(value: object) -> datetime:
    if not isinstance(value, datetime):
        raise PersistenceError("Stored revision timestamp must be a datetime.")
    return value
