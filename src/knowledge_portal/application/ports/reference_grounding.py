"""What the library offers requirement work's grounding (ADR-0099).

These are the values the internal API returns: an exact citable passage with its
bounded, non-authoritative context. Whether requirement work still relies on a
citation is answered on its side, from the events this service publishes.
"""

from dataclasses import dataclass
from typing import Protocol

from knowledge_portal.domain.document.reference import PublishedReference


@dataclass(frozen=True)
class ReferenceEvidence:
    """Exact citable passage plus bounded, non-authoritative retrieval context."""

    citation: PublishedReference
    context_text: str
    context_locations: tuple[str, ...]


class ReferenceKnowledgePort(Protocol):
    def retrieve(self, query: str) -> tuple[ReferenceEvidence, ...]: ...

    def has_published(self) -> bool: ...

    def search_evidence(self, query: str) -> tuple[ReferenceEvidence, ...]:
        """Every ranked hit for `query`, unbudgeted, each with its citation and context."""
        ...
