"""Preview cited impact candidates before knowledge publication."""

from dataclasses import dataclass

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    ArchitectureReasonerPort,
    EvidenceChunk,
)
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.use_cases.architecture_evidence import gather_evidence
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.entities import ArchitectureCitation
from knowledge_portal.domain.architecture.knowledge import (
    InvalidKnowledgeError,
    KnowledgeConflictError,
)


@dataclass(frozen=True)
class ArchitectureImpactPreview:
    release_id: str
    system_ids: tuple[str, ...]
    citation_ids: tuple[str, ...]
    uncertainty: str | None
    evidence: tuple[EvidenceChunk, ...]
    citations: tuple[ArchitectureCitation, ...]


class PreviewArchitectureImpact:
    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        index: ArchitectureEvidenceIndexPort,
        reasoner: ArchitectureReasonerPort,
    ) -> None:
        self._knowledge = knowledge
        self._index = index
        self._reasoner = reasoner

    def execute(
        self,
        release_id: str,
        query: str,
        actor: Actor,
    ) -> ArchitectureImpactPreview:
        require_maintainer(actor)
        if not query.strip():
            raise InvalidKnowledgeError("Retrieval query must not be blank.")
        release = self._knowledge.get(release_id)
        if release.built_revision != release.revision or not self._index.reads(
            release.index_profile
        ):
            raise KnowledgeConflictError("Build this release with the current embedding profile.")
        evidence = gather_evidence(self._index, release, release.index_id or release.id, query)
        selected = self._reasoner.select(
            ArchitectureQuery((query,), release_id=release_id), release, evidence
        )
        return ArchitectureImpactPreview(
            release_id,
            selected.system_ids,
            selected.citation_ids,
            selected.uncertainty,
            evidence,
            selected.citations,
        )
