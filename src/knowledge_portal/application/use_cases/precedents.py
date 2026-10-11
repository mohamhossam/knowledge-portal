"""Keeping decided verdicts, and counting them per release (ontology plan Phase 5).

requirement-portal sends each verdict decision to `POST /internal/architecture/precedents`.
`RecordPrecedent` checks it against the release it was assessed on, embeds its text with
the model the evidence index searches with, and keeps it; a later decision on the same
analysis replaces it. `ReadPrecedentSummaries` counts, per release, how often reviewers
accepted, overrode or left unknown the suggested verdict, and for which concepts.
"""

from __future__ import annotations

from dataclasses import dataclass

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.architecture_rag import ArchitectureEvidenceIndexPort
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.ports.precedents import (
    PrecedentReceipt,
    PrecedentRequest,
    PrecedentStorePort,
)
from knowledge_portal.application.use_cases.architecture_knowledge import KnowledgeNotFoundError
from knowledge_portal.domain.architecture.knowledge import KnowledgeReleaseStatus
from knowledge_portal.domain.architecture.precedents import (
    TEXT_LIMIT,
    Precedent,
    PrecedentSummary,
    PrecedentSystem,
)


class RecordPrecedent:
    def __init__(
        self,
        repository: ArchitectureKnowledgeRepositoryPort,
        index: ArchitectureEvidenceIndexPort,
        store: PrecedentStorePort,
        clock: ClockPort,
    ) -> None:
        self._repository = repository
        self._index = index
        self._store = store
        self._clock = clock

    def execute(self, request: PrecedentRequest) -> PrecedentReceipt:
        release = self._repository.get(request.release_id)
        if release is None or release.status is not KnowledgeReleaseStatus.PUBLISHED:
            raise KnowledgeNotFoundError(f"No published release {request.release_id}.")
        systems = {item.id for item in release.systems}
        concepts = {item.id for item in release.business_capabilities}
        kept = tuple(
            PrecedentSystem(item.id, item.role, item.change_type)
            for item in dict((item.id.strip(), item) for item in request.systems).values()
            if item.id.strip() in systems
        )
        dropped = tuple(
            sorted({item.id for item in request.systems if item.id.strip() not in systems})
        )
        # The text is what the lane compares; what lies past the limit says little more.
        text = "\n".join(part.strip() for part in request.text if part.strip())[:TEXT_LIMIT]
        precedent = Precedent(
            id=request.precedent_id,
            requirement_id=request.requirement_id,
            version=request.version,
            release_id=release.id,
            text=text,
            suggested_verdict=request.suggested_verdict,
            verdict=request.verdict,
            decision=request.decision,
            offering_id=request.offering_id
            if request.offering_id in {item.id for item in release.products}
            else None,
            concept_ids=tuple(item for item in request.concept_ids if item in concepts),
            systems=kept,
            decided_at=request.decided_at,
            received_at=self._clock.now(),
        )
        vector = self._index.vectors((precedent.text,))[0]
        recorded = self._store.record(precedent, self._index.embedding_model, vector)
        return PrecedentReceipt(precedent.id, recorded, dropped)


@dataclass(frozen=True)
class ConceptOverrideView:
    concept_id: str
    label: str
    decided: int
    overridden: int


@dataclass(frozen=True)
class ReleasePrecedents:
    """One release's decided verdicts, with names a reader knows them by."""

    summary: PrecedentSummary
    release_name: str | None
    concepts: tuple[ConceptOverrideView, ...]


class ReadPrecedentSummaries:
    def __init__(
        self, repository: ArchitectureKnowledgeRepositoryPort, store: PrecedentStorePort
    ) -> None:
        self._repository = repository
        self._store = store

    def execute(self, actor: Actor) -> tuple[ReleasePrecedents, ...]:
        """Per release, newest decision first; counts and concepts only, never the text."""
        require_maintainer(actor)
        found: list[ReleasePrecedents] = []
        for summary in self._store.summaries():
            release = self._repository.get(summary.release_id)
            labels = (
                {item.id: item.pref_label for item in release.business_capabilities}
                if release
                else {}
            )
            found.append(
                ReleasePrecedents(
                    summary,
                    release.name if release else None,
                    tuple(
                        ConceptOverrideView(
                            item.concept_id,
                            labels.get(item.concept_id, item.concept_id),
                            item.decided,
                            item.overridden,
                        )
                        for item in summary.concepts
                    ),
                )
            )
        return tuple(found)
