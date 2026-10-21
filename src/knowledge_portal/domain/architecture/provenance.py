"""What generated a catalogue fact and who approved it, kept with the fact (ADR-0120).

A leaf module, so every entity that an accepted suggestion can create or extend may
carry its record without importing the candidates that produced it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, required


@dataclass(frozen=True)
class AcceptedFrom:
    """One accepted suggestion that created or extended an entity.

    It records that the suggestion contributed, not which fields it touched: the
    candidate's citations are the detail while the draft keeps them.
    """

    candidate_id: str
    model: str
    prompt_version: str
    decided_by: str
    decided_at: datetime

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
