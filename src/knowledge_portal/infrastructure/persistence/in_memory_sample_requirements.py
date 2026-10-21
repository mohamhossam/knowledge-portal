"""Process-local sample requirement list for offline development and tests."""

from __future__ import annotations

from copy import deepcopy
from threading import RLock
from typing import Any

from knowledge_portal.domain.architecture.knowledge import KnowledgeConflictError
from knowledge_portal.domain.architecture.samples import SampleRequirementSet


class InMemorySampleRequirements:
    def __init__(self) -> None:
        self._lock = RLock()
        self._current = SampleRequirementSet()

    def snapshot_state(self) -> Any:
        return deepcopy((self._current,))

    def restore_state(self, state: Any) -> None:
        (self._current,) = deepcopy(state)

    def load(self) -> SampleRequirementSet:
        with self._lock:
            return self._current

    def save(self, updated: SampleRequirementSet, expected_revision: int) -> None:
        with self._lock:
            if self._current.revision != expected_revision:
                raise KnowledgeConflictError("The sample list changed; reload before saving.")
            self._current = updated
