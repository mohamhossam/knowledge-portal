"""Dependencies the draft's interfaces and journeys say, as suggestions (ADR-0119).

One reading of a draft's own catalogue. Each dependency an interface or a journey's
hand-over implies between two systems in service is suggested once, citing what says it.
Nothing becomes a dependency until a maintainer accepts it; a new reading replaces the
undecided suggestions of the last, and leaves out what is in the draft already or was
rejected before.
"""

from __future__ import annotations

from uuid import uuid4

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.catalogue_candidates import (
    CatalogueCandidateRepositoryPort,
    CatalogueReading,
    ExtractionRun,
)
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateBasis,
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CandidateMatch,
    CandidateStatus,
    CatalogueCandidate,
    classify,
)
from knowledge_portal.domain.architecture.derived_dependencies import (
    DerivedDependency,
    derive_dependencies,
)
from knowledge_portal.domain.architecture.knowledge import (
    KnowledgeConflictError,
    KnowledgeReleaseStatus,
    RelationshipKind,
)

DERIVATION_READER = "dependency-derivation"
DERIVATION_VERSION = "dependency-derivation-v1"

_Key = tuple[str, str | None, RelationshipKind | None]


def _key(content: CandidateContent) -> _Key:
    return content.system_id, content.target_system_id, content.relationship_kind


def _content(dependency: DerivedDependency) -> CandidateContent:
    return CandidateContent(
        CandidateKind.RELATIONSHIP,
        dependency.source_system_id,
        target_system_id=dependency.target_system_id,
        text=dependency.description,
        relationship_kind=dependency.kind,
    )


def _left_out(present: int, rejected: int) -> tuple[str, ...]:
    notes = []
    if present:
        notes.append(
            f"{present} {'dependency is' if present == 1 else 'dependencies are'} in the "
            "draft already, so left out."
        )
    if rejected:
        notes.append(
            f"{rejected} {'dependency' if rejected == 1 else 'dependencies'} rejected before "
            f"{'was' if rejected == 1 else 'were'} left out."
        )
    return tuple(notes)


class SuggestDerivedDependencies:
    """Suggests the dependencies the draft's interfaces and journeys already say."""

    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        candidates: CatalogueCandidateRepositoryPort,
        clock: ClockPort,
    ) -> None:
        self._knowledge = knowledge
        self._candidates = candidates
        self._clock = clock

    def execute(self, release_id: str, actor: Actor) -> ExtractionRun:
        require_maintainer(actor)
        release = self._knowledge.get(release_id)
        if release.status is not KnowledgeReleaseStatus.DRAFT:
            raise KnowledgeConflictError("Suggestions apply to drafts only.")
        now = self._clock.now()
        reading = CatalogueReading.DERIVED_DEPENDENCIES
        rejected_before = {
            _key(item.content)
            for item in self._candidates.list(release.id)
            if item.document_version_id == reading.value and item.status is CandidateStatus.REJECTED
        }
        found: list[CatalogueCandidate] = []
        present = rejected = 0
        for dependency in derive_dependencies(release):
            content = _content(dependency)
            if classify(content, release) is CandidateMatch.ALREADY_PRESENT:
                present += 1
                continue
            if _key(content) in rejected_before:
                rejected += 1
                continue
            found.append(
                CatalogueCandidate(
                    uuid4().hex,
                    release.id,
                    reading.value,
                    content,
                    tuple(
                        CandidateCitation(item.location, item.quote) for item in dependency.evidence
                    ),
                    DERIVATION_READER,
                    DERIVATION_VERSION,
                    now,
                    basis=CandidateBasis.INFERRED,
                    rationale=dependency.rationale,
                )
            )
        warnings = _left_out(present, rejected)
        if not found and not present and not rejected:
            warnings = ("No interface or journey of this draft names two systems in service.",)
        run = ExtractionRun(
            uuid4().hex,
            release.id,
            reading.value,
            DERIVATION_READER,
            DERIVATION_VERSION,
            len(found),
            warnings,
            now,
            reading=reading,
        )
        self._candidates.replace_proposals(run, tuple(found))
        return run
