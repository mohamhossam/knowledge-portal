"""PostgreSQL value decoding and aggregate identity lookups."""

from __future__ import annotations

from datetime import datetime
from typing import cast

from smb_kernel.persistence.connector import DbConnection as DbConnection

from knowledge_portal.application.errors import (
    PersistenceError,
)
from knowledge_portal.infrastructure.persistence.payload_fields import JsonObject


def _payload(value: object) -> JsonObject:
    if not isinstance(value, dict):
        raise PersistenceError("Stored snapshot payload must be a JSON object.")
    return cast(JsonObject, value)


def _integer(value: object) -> int:
    if not isinstance(value, int):
        raise PersistenceError("Stored revision number must be an integer.")
    return value


def _datetime(value: object) -> datetime:
    if not isinstance(value, datetime):
        raise PersistenceError("Stored revision timestamp must be a datetime.")
    return value


def _string(value: object) -> str:
    if not isinstance(value, str):
        raise PersistenceError("Stored identifier must be text.")
    return value
