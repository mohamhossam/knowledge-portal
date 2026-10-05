"""Where a catalogue fact comes from, and how sure its source is of it (ADR-0095).

Shared by offerings, journeys, channels and order tracking, so none of them imports
another to check a source.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Protocol

from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, optional


class SourceConfidence(StrEnum):
    """How sure the source document says it is of a fact."""

    CONFIRMED = "confirmed"
    INFERRED = "inferred"
    GAP = "gap"


class Sourced(Protocol):
    @property
    def confidence(self) -> SourceConfidence | str | None: ...

    @property
    def source(self) -> str | None: ...


def check_source(item: Sourced) -> None:
    """Checks where a fact comes from and how sure its source is; stored values arrive as text."""
    confidence = item.confidence
    if confidence is not None:
        try:
            confidence = SourceConfidence(str(confidence).strip().casefold())
        except ValueError as exc:
            raise InvalidKnowledgeError(
                f"Confidence must be confirmed, inferred or gap, not {confidence!r}."
            ) from exc
    object.__setattr__(item, "confidence", confidence)
    object.__setattr__(item, "source", optional(item.source, "Source"))
