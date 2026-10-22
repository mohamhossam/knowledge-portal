"""Reading values out of decoded JSON, which another system wrote and nothing has typed.

Each adapter reads its answers through these, so a value means the same thing whichever
adapter reads it: text is text, a whole number is never true or false, and blank text is
absent. What cannot be read raises UnreadableValue; the adapter turns that into the failure
it reports at its own boundary (AGENTS.md 4.3).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


class UnreadableValue(ValueError):
    """A value is not of the kind its reader expects."""

    def __init__(self, expected: str, value: object) -> None:
        super().__init__(f"expected {expected}, not {type(value).__name__}")


def text(value: object) -> str:
    """Text exactly as written; a number is not text."""
    if not isinstance(value, str):
        raise UnreadableValue("text", value)
    return value


def optional_text(value: object) -> str | None:
    return None if value is None else text(value)


def trimmed_text(value: object) -> str | None:
    """Text without its surrounding space, or None when absent or blank. A number reads as
    its text, since a code or an amount is often written as one; true or false does not."""
    if value is None:
        return None
    if not isinstance(value, str | int | float) or isinstance(value, bool):
        raise UnreadableValue("text", value)
    return str(value).strip() or None


def integer(value: object) -> int:
    """A whole number; true and false are not one, though Python counts them as ints."""
    if not isinstance(value, int) or isinstance(value, bool):
        raise UnreadableValue("a whole number", value)
    return value


def optional_integer(value: object) -> int | None:
    return None if value is None else integer(value)


def flag(value: object) -> bool:
    if not isinstance(value, bool):
        raise UnreadableValue("true or false", value)
    return value


def mapping(value: object) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise UnreadableValue("an object", value)
    return value


def bounded_list(value: object, limit: int) -> list[Any]:
    """At most `limit` items, so an answer cannot make a reader do unbounded work; an absent
    list is empty."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise UnreadableValue("a list", value)
    return value[:limit]
