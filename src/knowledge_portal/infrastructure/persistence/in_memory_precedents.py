"""Isolated offline store of decided verdicts (ontology plan Phase 5)."""

from __future__ import annotations

import math
from collections.abc import Iterable
from threading import RLock

from knowledge_portal.application.ports.precedents import PrecedentMatch
from knowledge_portal.domain.architecture.precedents import (
    Precedent,
    PrecedentSummary,
    summarise,
)


def cosine(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    norm = math.sqrt(sum(item * item for item in left)) * math.sqrt(
        sum(item * item for item in right)
    )
    return sum(a * b for a, b in zip(left, right, strict=False)) / norm if norm else 0.0


class InMemoryPrecedents:
    def __init__(self) -> None:
        self._lock = RLock()
        self._items: dict[str, tuple[Precedent, str, tuple[float, ...]]] = {}

    def record(self, precedent: Precedent, embedding_model: str, vector: tuple[float, ...]) -> bool:
        with self._lock:
            known = self._items.get(precedent.id)
            if known is not None and not precedent.replaces(known[0]):
                return False
            self._items[precedent.id] = (precedent, embedding_model, vector)
            return True

    def get(self, precedent_id: str) -> Precedent | None:
        with self._lock:
            found = self._items.get(precedent_id)
        return None if found is None else found[0]

    def nearest(
        self,
        embedding_model: str,
        vector: tuple[float, ...],
        limit: int,
        *,
        exclude_requirement: str | None = None,
    ) -> tuple[PrecedentMatch, ...]:
        with self._lock:
            items = tuple(self._items.values())
        matches = [
            PrecedentMatch(precedent, cosine(vector, stored))
            for precedent, model, stored in items
            if model == embedding_model
            and precedent.decided
            and precedent.requirement_id != exclude_requirement
        ]
        matches.sort(key=lambda item: (-item.similarity, item.precedent.id))
        return tuple(matches[:limit])

    def summaries(self) -> tuple[PrecedentSummary, ...]:
        with self._lock:
            precedents = tuple(item[0] for item in self._items.values())
        return newest_first(
            summarise(release_id, precedents)
            for release_id in {item.release_id for item in precedents}
        )


def newest_first(summaries: Iterable[PrecedentSummary]) -> tuple[PrecedentSummary, ...]:
    return tuple(
        sorted(
            summaries,
            key=lambda item: (
                -(item.last_decided_at.timestamp() if item.last_decided_at else 0.0),
                item.release_id,
            ),
        )
    )
