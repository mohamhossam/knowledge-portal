"""What a draft's sources and its catalogue say about each other, before it is published.

Two checks, both read-only:

- **Provenance.** The catalogue holds facts accepted from document versions. A fact whose
  every source has left the draft (no version of that document remains) is listed, so a
  curator re-confirms it, keeps it on purpose, or removes it.
- **Drift.** When the draft changes or removes a system, offering or journey, the document
  passages that name it may now describe what the catalogue no longer holds. They are
  listed with the entity, so a curator can mark a passage outdated: it stays readable but
  is no longer searched as evidence.
"""

from __future__ import annotations

from dataclasses import dataclass

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    EvidenceChunk,
)
from knowledge_portal.application.ports.catalogue_candidates import (
    CatalogueCandidateRepositoryPort,
)
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.use_cases.architecture_evidence import (
    named_offerings,
    named_systems,
)
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateKind,
    CandidateMatch,
    classify,
    fact_key,
    fact_label,
)
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge

# Each changed entity lists at most this many passages; the rest are counted.
PASSAGES_PER_ENTITY = 12


@dataclass(frozen=True)
class SourceOfFact:
    version_id: str
    title: str


@dataclass(frozen=True)
class OrphanedFact:
    """A fact the catalogue holds whose every source document has left the draft."""

    kind: CandidateKind
    subject: str
    label: str
    sources: tuple[SourceOfFact, ...]


@dataclass(frozen=True)
class DriftedPassage:
    passage: EvidenceChunk
    outdated: bool


@dataclass(frozen=True)
class DriftItem:
    """A system, offering or journey the draft changes or removes, and the passages of its
    documents that name it."""

    item: ChangedItem
    key: str
    label: str
    change: ChangeKind
    fields: tuple[str, ...]
    passages: tuple[DriftedPassage, ...]
    more: int


class ReviewSources:
    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        candidates: CatalogueCandidateRepositoryPort,
        index: ArchitectureEvidenceIndexPort,
    ) -> None:
        self._knowledge = knowledge
        self._candidates = candidates
        self._index = index

    def provenance(self, release_id: str, actor: Actor) -> tuple[OrphanedFact, ...]:
        require_maintainer(actor)
        release = self._knowledge.get(release_id)
        versions = self._knowledge.known_versions()
        present = {item.lineage for item in release.documents}
        sources: dict[tuple[str, ...], list[str]] = {}
        stated: dict[tuple[str, ...], tuple[CandidateKind, str, str]] = {}
        for candidate in self._candidates.accepted():
            version = versions.get(candidate.document_version_id)
            if version is None:
                # A change request's suggestion: its source is not a document.
                continue
            if classify(candidate.content, release) is not CandidateMatch.ALREADY_PRESENT:
                continue
            key = fact_key(candidate.content)
            sources.setdefault(key, []).append(version.id)
            stated.setdefault(
                key,
                (
                    candidate.content.kind,
                    candidate.content.system_id,
                    fact_label(candidate.content),
                ),
            )
        orphaned: list[OrphanedFact] = []
        for key, held in sources.items():
            if any(versions[item].lineage in present for item in held):
                continue
            kind, subject, label = stated[key]
            orphaned.append(
                OrphanedFact(
                    kind,
                    subject,
                    label,
                    tuple(SourceOfFact(item, versions[item].title) for item in dict.fromkeys(held)),
                )
            )
        return tuple(sorted(orphaned, key=lambda item: (item.kind.value, item.label.casefold())))

    def drift(self, release_id: str, actor: Actor) -> tuple[DriftItem, ...]:
        require_maintainer(actor)
        release = self._knowledge.get(release_id)
        base = self._knowledge.active()
        index_id = release.index_id or base.index_id
        if index_id is None or base.id == release.id:
            return ()
        held = {item.id for item in release.documents}
        passages = tuple(
            item for item in self._index.passages(index_id) if item.document_version_id in held
        )
        marked = {(item.version_id, item.location) for item in release.outdated_passages}
        items: list[DriftItem] = []
        for change in diff_releases(base, release).changes:
            if change.change is ChangeKind.ADDED or change.item not in _NAMED:
                continue
            naming = tuple(item for item in passages if _names(base, change.item, change.key, item))
            items.append(
                DriftItem(
                    change.item,
                    change.key,
                    change.label,
                    change.change,
                    change.fields,
                    tuple(
                        DriftedPassage(
                            item, (item.document_version_id or "", item.location) in marked
                        )
                        for item in naming[:PASSAGES_PER_ENTITY]
                    ),
                    max(0, len(naming) - PASSAGES_PER_ENTITY),
                )
            )
        return tuple(item for item in items if item.passages)


_NAMED = frozenset({ChangedItem.SYSTEM, ChangedItem.PRODUCT, ChangedItem.JOURNEY})


def _names(
    base: ArchitectureKnowledge, item: ChangedItem, key: str, passage: EvidenceChunk
) -> bool:
    """Whether the passage names the entity as the version in service calls it: what the
    passage was written against."""
    text = passage.text
    if item is ChangedItem.SYSTEM:
        return any(system.id == key for system in named_systems(base, text))
    if item is ChangedItem.PRODUCT:
        return any(offering.id == key for offering in named_offerings(base, text))
    journey = next((each for each in base.journeys if each.id == key), None)
    return journey is not None and journey.name.casefold() in text.casefold()
