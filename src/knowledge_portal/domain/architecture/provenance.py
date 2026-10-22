"""What generated a catalogue fact and who approved it, kept with the fact (ADR-0120).

A leaf module, so every entity that an accepted suggestion can create or extend may
carry its record without importing the candidates that produced it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)

# How many of a suggestion's citations its acceptance keeps: enough to find the passage
# again, without copying every repeat of it into each version (review recommendation 6).
MAX_ACCEPTED_CITATIONS = 3


@dataclass(frozen=True)
class AcceptedCitation:
    """Where an accepted suggestion was read, kept with the fact it produced.

    ``location`` is where in the source the passage is, as the reading named it ("§4.1 ›
    Table 2, row 3"), and ``quote`` its words. For a document reading, ``document_version_id``
    and ``document`` name the uploaded version and its title, so the passage can be found
    again after the suggestion itself is gone; a suggestion read from the catalogue or from
    a change request names none.
    """

    location: str
    quote: str
    document_version_id: str | None = None
    document: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "location", required(self.location, "Cited location"))
        object.__setattr__(self, "quote", required(self.quote, "Cited quote"))
        object.__setattr__(
            self,
            "document_version_id",
            optional(self.document_version_id, "Cited document version"),
        )
        object.__setattr__(self, "document", optional(self.document, "Cited document"))


@dataclass(frozen=True)
class AcceptedFrom:
    """One accepted suggestion that created or extended an entity.

    It records that the suggestion contributed, not which fields it touched, and where the
    suggestion was read (its first citations), so the fact still leads to its passage once
    the draft's suggestions are replaced by a later reading (review recommendation 6).
    """

    candidate_id: str
    model: str
    prompt_version: str
    decided_by: str
    decided_at: datetime
    citations: tuple[AcceptedCitation, ...] = ()

    def __post_init__(self) -> None:
        for field, label in (
            ("candidate_id", "Accepted suggestion"),
            ("model", "Model"),
            ("prompt_version", "Prompt version"),
            ("decided_by", "Decided by"),
        ):
            object.__setattr__(self, field, required(getattr(self, field), label))
        if self.decided_at.tzinfo is None:
            raise InvalidKnowledgeError("An acceptance time must have a timezone.")
        if len(self.citations) > MAX_ACCEPTED_CITATIONS:
            raise InvalidKnowledgeError(
                f"An acceptance keeps at most {MAX_ACCEPTED_CITATIONS} citations."
            )
