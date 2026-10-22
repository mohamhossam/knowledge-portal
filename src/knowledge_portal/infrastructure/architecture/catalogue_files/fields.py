"""Reading one field of a catalogue entry or workbook row, and saying where it failed.

Every reader names the entry or row (``where``) and the field, so a maintainer can find
the value in the file.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from knowledge_portal.domain.architecture.journeys import CallTiming, call_timing
from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError, RelationshipKind
from knowledge_portal.domain.architecture.products import SourceConfidence

_KINDS = ", ".join(kind.value for kind in RelationshipKind)
_LIST_SEPARATOR = ";"


def _text(value: object, where: str, field: str) -> str:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise InvalidKnowledgeError(f"{where}: {field} is required.")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if not isinstance(value, str | int | float):
        raise InvalidKnowledgeError(f"{where}: {field} must be text.")
    return str(value).strip()


def _optional_text(value: object, where: str, field: str) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return _text(value, where, field)


def _timing(value: object, where: str) -> CallTiming | None:
    """A call's timing as a file writes it: "Sync", "synchronous", "Sync (callback)"."""
    try:
        return call_timing(_optional_text(value, where, "timing"))
    except InvalidKnowledgeError as exc:
        raise InvalidKnowledgeError(f"{where}: {exc}") from exc


def _kind(value: object, where: str) -> RelationshipKind:
    """An optional relationship kind; "Calls API" and "calls_api" both read as calls_api."""
    text = _optional_text(value, where, "kind")
    if text is None:
        return RelationshipKind.UNSPECIFIED
    try:
        return RelationshipKind(text.strip().casefold().replace(" ", "_"))
    except ValueError as exc:
        raise InvalidKnowledgeError(f"{where}: kind must be one of {_KINDS}.") from exc


def _text_list(value: object, where: str, field: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, list):
        return tuple(_text(item, where, field) for item in value)
    raise InvalidKnowledgeError(f"{where}: {field} must be a list.")


def _entries(raw: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = raw.get(key, [])
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise InvalidKnowledgeError(f"'{key}' must be a list of entries.")
    return value


class _LocatedError(InvalidKnowledgeError):
    """An error that already says which row or entry it is about."""


def _part[T](place: str, build: Callable[[], T]) -> T:
    try:
        return build()
    except _LocatedError:
        raise
    except InvalidKnowledgeError as exc:
        raise _LocatedError(str(_located(place, exc))) from exc


_YES = frozenset({"yes", "y", "true", "1"})
_NO = frozenset({"no", "n", "false", "0"})


def _flag(value: object, where: str, field: str, default: bool | None) -> bool | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().casefold()
    if text in _YES:
        return True
    if text in _NO:
        return False
    raise InvalidKnowledgeError(f"{where}: {field} must be yes or no.")


def _trust(value: object, where: str) -> SourceConfidence | None:
    """How sure the source is: confirmed, inferred or gap, in any case."""
    text = _optional_text(value, where, "confidence")
    if text is None:
        return None
    try:
        return SourceConfidence(text.casefold())
    except ValueError as exc:
        raise InvalidKnowledgeError(
            f"{where}: confidence must be confirmed, inferred or gap."
        ) from exc


def _where(item: dict[str, Any], fallback: str) -> str:
    return str(item.get("_where") or fallback)


def _sub_entries(item: dict[str, Any], key: str, where: str) -> list[dict[str, Any]]:
    try:
        return _entries(item, key)
    except InvalidKnowledgeError as exc:
        raise _located(where, exc) from exc


def _retirement(item: dict[str, Any], where: str) -> dict[str, Any]:
    return {
        "deprecated": bool(_flag(item.get("deprecated"), where, "deprecated", False)),
        "replaced_by": _optional_text(item.get("replaced_by"), where, "replaced_by"),
    }


def _split(value: object, where: str, field: str) -> tuple[str, ...]:
    text = _optional_text(value, where, field)
    if text is None:
        return ()
    return tuple(part.strip() for part in text.split(_LIST_SEPARATOR) if part.strip())


def _located(where: str, exc: InvalidKnowledgeError) -> InvalidKnowledgeError:
    message = str(exc)
    return exc if message.startswith(where) else InvalidKnowledgeError(f"{where}: {message}")


def _moment(value: object, where: str, field: str) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    text = _text(value, where, field)
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidKnowledgeError(f"{where}: {field} must be a date and time.") from exc
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)
