"""Reordering an assessment's passages by how well each answers one facet (ontology plan Phase 5).

The evidence index finds passages by fusing a keyword and a vector search over the whole
query. A reranker reads the facet and each passage together, as a cross-encoder does, and
orders the passages by that score; the passage lane then keeps the best few per facet.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from knowledge_portal.application.ports.architecture_rag import EvidenceChunk


@dataclass(frozen=True)
class RankedPassage:
    chunk: EvidenceChunk
    # Higher is better; comparable only within one call.
    score: float


class PassageRerankerPort(Protocol):
    @property
    def model(self) -> str: ...

    def rerank(self, query: str, passages: tuple[EvidenceChunk, ...]) -> tuple[RankedPassage, ...]:
        """Every passage once, best first. A reranker that cannot answer keeps the order it
        was given, so a failing reranker never fails an assessment."""
        ...
