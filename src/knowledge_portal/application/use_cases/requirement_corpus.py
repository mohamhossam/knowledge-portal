"""The Requirement corpus table on the Knowledge Center front page (A′)."""

from __future__ import annotations

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.requirement_corpus import (
    CorpusSummary,
    RequirementCorpusPort,
)


class ReadRequirementCorpus:
    """Counts only, read from requirement work; its route needs a knowledge admin."""

    def __init__(self, corpus: RequirementCorpusPort) -> None:
        self._corpus = corpus

    def execute(self, actor: Actor) -> CorpusSummary:
        del actor  # Admitted as a knowledge admin before any route runs.
        return self._corpus.summary()
