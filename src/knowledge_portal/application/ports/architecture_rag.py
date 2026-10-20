"""Replaceable evidence index and reasoning boundaries for architecture mapping."""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from typing import Protocol

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.domain.architecture.entities import ArchitectureCitation
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge


class IndexVersion(StrEnum):
    """How a release's evidence is cut into chunks; the last part of an index profile."""

    # One chunk per packed section or record window, both searched and read.
    SECTION_V3 = "section-v3"
    # Documents as parents (read) and children (searched) (ADR section-v4).
    SECTION_V4 = "section-v4"


class ChunkRole(StrEnum):
    # Searched, and read as it is: a catalogue record, or a passage of a section-v3 index.
    WHOLE = "whole"
    # Searched only; a hit is read as its parent.
    CHILD = "child"
    # Read only: the section or table its children were cut from.
    PARENT = "parent"


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
    role: ChunkRole = ChunkRole.WHOLE
    # A child's parent, by chunk id.
    parent_id: str | None = None
    # Other places in the same document with exactly this text, indexed once.
    aliases: tuple[str, ...] = ()
    # For a parent read because a child matched: where in it the match is.
    focus: str | None = None


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
    # A document passage names it, by the catalogue's own names and aliases (ADR section-v4).
    MENTIONS = "mentions"


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

    @property
    def version(self) -> IndexVersion:
        """How this index cuts evidence into chunks; the last part of its profile."""
        ...

    def store(
        self,
        release_id: str,
        index_id: str,
        chunks: tuple[EvidenceChunk, ...],
        members: tuple[str, ...] = (),
        outdated: tuple[str, ...] = (),
    ) -> None:
        """Store an index: its own chunks, the chunk sets it reads (`members`), and the
        chunks it never searches (`outdated`; a child is left out with its parent)."""
        ...

    def passages(self, index_id: str) -> tuple[EvidenceChunk, ...]:
        """Every document passage as it is read (whole chunks and parents), in stored order."""
        ...

    def chunk_set(self, key: str) -> tuple[EvidenceChunk, ...] | None:
        """A stored chunk set's chunks, in the order stored; None when none has that key."""
        ...

    def store_set(self, key: str, chunks: tuple[EvidenceChunk, ...]) -> None:
        """Store a chunk set once, whole or not at all; storing a key again does nothing."""
        ...

    def prune(self, release_id: str, keep: str) -> None:
        """Delete every index of the release but `keep`: a draft's earlier builds, which
        nothing reads again once a newer build is recorded."""
        ...

    def collect(self) -> int:
        """Delete the chunk sets no index reads any more; how many were deleted."""
        ...

    def retrieve(self, release_id: str, query: str, limit: int) -> tuple[EvidenceChunk, ...]:
        """The best searchable chunks (whole and child, never parent), best first."""
        ...

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
