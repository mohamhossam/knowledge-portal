"""Replaceable evidence index and reasoning boundaries for architecture mapping."""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from typing import Protocol

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.domain.architecture.entities import ArchitectureCitation
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge


@dataclass(frozen=True)
class EvidenceChunk:
    id: str
    source_label: str
    location: str
    text: str
    document_version_id: str | None = None
    # For a catalogue system's own record: when the system falls due for review again
    # (Knowledge Center D). None for passages of documents.
    system_review_due_on: date | None = None


@dataclass(frozen=True)
class EvidenceSelection:
    system_ids: tuple[str, ...]
    citation_ids: tuple[str, ...]
    uncertainty: str | None = None
    citations: tuple[ArchitectureCitation, ...] = ()


class LinkedEntity(StrEnum):
    SYSTEM = "system"
    OFFERING = "offering"
    JOURNEY = "journey"


class EntityRole(StrEnum):
    # The chunk is that entity's own catalogue record.
    RECORD = "record"
    # The record names it: a system delivering a component, or performing a step.
    NAMES = "names"


@dataclass(frozen=True)
class ChunkEntityLink:
    """A chunk tied to a catalogue entity, exactly, from the catalogue's own structure."""

    chunk_id: str
    entity: LinkedEntity
    entity_id: str
    role: EntityRole


class ConceptBasis(StrEnum):
    # The catalogue links the record's capability or component to the concept.
    CATALOGUE = "catalogue"
    # A label of the concept is in the text, and the embedding check agrees.
    LABEL = "label"


@dataclass(frozen=True)
class ChunkConceptLink:
    chunk_id: str
    concept_id: str
    basis: ConceptBasis
    # 1.0 for a catalogue link; the text's similarity to the concept for a label link.
    score: float


@dataclass(frozen=True)
class IndexedConcept:
    """A concept as the concept index holds it: what a requirement is matched against."""

    concept_id: str
    pref_label: str
    labels: tuple[str, ...]
    # "Service › Managed Wi-Fi access points": the domain, then the concepts down to it.
    path: str
    domain_id: str | None
    # Its labels, path and definition, as searched and embedded.
    text: str


@dataclass(frozen=True)
class IndexLinks:
    entities: tuple[ChunkEntityLink, ...] = ()
    concepts: tuple[ChunkConceptLink, ...] = ()
    scheme: tuple[IndexedConcept, ...] = ()


@dataclass(frozen=True)
class ConceptMatch:
    concept_id: str
    score: float


@dataclass(frozen=True)
class IndexCoverage:
    """How much of an index the links reach, for the curators to close the gaps."""

    chunks: int
    chunks_without_concept: int
    concepts: int
    # Concepts no chunk links to, sorted by id: nothing in the evidence speaks of them yet.
    concepts_without_chunk: tuple[str, ...]


class ArchitectureEvidenceIndexPort(Protocol):
    @property
    def embedding_model(self) -> str: ...

    @property
    def profile(self) -> str: ...

    def store(self, release_id: str, index_id: str, chunks: tuple[EvidenceChunk, ...]) -> None: ...

    def retrieve(self, release_id: str, query: str, limit: int) -> tuple[EvidenceChunk, ...]: ...

    def get(self, release_id: str, chunk_id: str) -> EvidenceChunk | None: ...

    def system_chunk(self, index_id: str, system_id: str) -> EvidenceChunk | None:
        """The first indexed chunk of one catalogue system's own record."""
        ...

    def reads(self, profile: str | None) -> bool:
        """Whether an index built under `profile` can still be searched: the current
        profile, or the one before it, whose indexes simply have no links."""
        ...

    def vectors(self, texts: tuple[str, ...]) -> tuple[tuple[float, ...], ...]:
        """The texts' embeddings, through the same cache `store` uses, so a text
        embedded here is not embedded again when it is stored."""
        ...

    def link(self, index_id: str, links: IndexLinks) -> None:
        """Record a stored index's entity and concept links and its concept scheme."""
        ...

    def links(
        self, index_id: str, chunk_ids: tuple[str, ...]
    ) -> tuple[tuple[ChunkEntityLink, ...], tuple[ChunkConceptLink, ...]]: ...

    def match_concepts(self, index_id: str, query: str, limit: int) -> tuple[ConceptMatch, ...]:
        """The concepts of the index's scheme closest to the text, best first."""
        ...

    def concept_chunks(
        self, index_id: str, query: str, concept_ids: tuple[str, ...], limit: int
    ) -> tuple[EvidenceChunk, ...]:
        """The best search results among the chunks linked to any of the concepts."""
        ...

    def coverage(self, index_id: str) -> IndexCoverage | None:
        """None for an index built before links existed."""
        ...


class ArchitectureReasonerPort(Protocol):
    @property
    def model(self) -> str: ...

    def select(
        self,
        query: ArchitectureQuery,
        release: ArchitectureKnowledge,
        evidence: tuple[EvidenceChunk, ...],
    ) -> EvidenceSelection: ...


class EmbeddingPort(Protocol):
    @property
    def model(self) -> str: ...

    def embed(self, texts: tuple[str, ...]) -> tuple[tuple[float, ...], ...]: ...


class ArchitectureEvidenceError(Exception):
    """A local embedding or reasoning provider returned unusable evidence."""
