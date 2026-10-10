"""The concept-aware evidence index in PostgreSQL (ontology plan Phase 2).

The committed SMB catalogue is built once into pgvector and once in memory: both hold the
same links and report the same coverage, and the PostgreSQL index answers the concept
queries Phase 3 relies on.
"""

from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    EvidenceChunk,
)
from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeReleaseStatus,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.postgres_evidence_index import (
    PostgresEvidenceIndex,
)
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.persistence.document_storage import (
    InMemoryDocumentStorage,
)
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_architecture_knowledge import (
    PostgresArchitectureKnowledgeRepository,
)

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ACTOR = Actor("knowledge-editor", frozenset({"knowledge_maintainer"}))


class _Recording(InMemoryEvidenceIndex):
    def __init__(self) -> None:
        super().__init__(FakeEmbeddings(), FakeWordTokenizer())
        self.chunks: tuple[EvidenceChunk, ...] = ()

    def store(self, release_id: str, index_id: str, chunks: tuple[EvidenceChunk, ...]) -> None:
        self.chunks = chunks
        super().store(release_id, index_id, chunks)


def _build(
    repository: ArchitectureKnowledgeRepositoryPort, index: ArchitectureEvidenceIndexPort
) -> tuple[ManageArchitectureKnowledge, ArchitectureKnowledge]:
    """The committed SMB catalogue, in a fresh draft, built into the index."""
    knowledge = ManageArchitectureKnowledge(repository, CatalogueFileAdapter(), index, 10_000_000)
    for release in knowledge.list_releases(ACTOR):
        if release.status is KnowledgeReleaseStatus.DRAFT:
            knowledge.discard_draft(release.id, release.revision, ACTOR)
    draft = knowledge.create_draft(ACTOR, "Concept index")
    content = CatalogueFileAdapter().read(CatalogueFileFormat.YAML, CATALOGUE.read_bytes())
    draft = knowledge.update(
        draft.id,
        draft.revision,
        ACTOR,
        systems=content.systems,
        relationships=content.relationships,
        capability_domains=content.capability_domains,
        landscape_domains=content.landscape_domains,
        products=content.products,
        journeys=content.journeys,
        channels=content.channels,
        sources=content.sources,
        conflicts=content.conflicts,
        portfolio=content.portfolio,
        business_capabilities=content.business_capabilities,
    )
    built = BuildArchitectureIndex(
        knowledge,
        index,
        InMemoryDocumentStorage(),
        LocatedDocumentExtractor(SafeDocumentTextExtractor()),
        FakeWordTokenizer(),
    ).execute(draft.id, draft.revision, ACTOR.id, fence=lambda: None)
    return knowledge, built


def test_pgvector_holds_the_same_links_and_answers_concept_queries() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    index = PostgresEvidenceIndex(
        DirectPostgresConnector(DATABASE_URL), FakeEmbeddings(), FakeWordTokenizer()
    )
    repository = PostgresArchitectureKnowledgeRepository(
        DirectPostgresConnector(DATABASE_URL), seed_knowledge()
    )
    knowledge, built = _build(repository, index)
    memory = _Recording()
    _, expected = _build(InMemoryArchitectureKnowledgeRepository(seed_knowledge()), memory)
    assert built.index_id is not None and expected.index_id is not None
    chunk_ids = tuple(chunk.id for chunk in memory.chunks)

    stored, wanted = (
        index.links(built.index_id, chunk_ids),
        memory.links(expected.index_id, chunk_ids),
    )

    assert set(stored[0]) == set(wanted[0]) and stored[0]
    assert {(item.chunk_id, item.concept_id, item.basis) for item in stored[1]} == {
        (item.chunk_id, item.concept_id, item.basis) for item in wanted[1]
    }
    assert index.coverage(built.index_id) == memory.coverage(expected.index_id)

    (wifi, *_) = index.match_concepts(built.index_id, "Wi-Fi access point for the branch", 5)
    assert wifi.concept_id == "cap-wifi-access"
    linked = index.concept_chunks(built.index_id, "access point", ("cap-wifi-access",), 5)
    # Both windows of the offering whose access point component realises it.
    assert {item.location.split(",")[0] for item in linked} == {"product business-pro-plus"}
    assert index.concept_chunks(built.index_id, "access point", ("cap-unknown",), 5) == ()

    # Discarding the draft removes its index with every link.
    knowledge.discard_draft(built.id, built.revision, ACTOR)
    assert index.links(built.index_id, chunk_ids) == ((), ())
    assert index.coverage(built.index_id) is None


def test_an_index_stored_before_links_reports_no_coverage() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    index = PostgresEvidenceIndex(
        DirectPostgresConnector(DATABASE_URL), FakeEmbeddings(), FakeWordTokenizer()
    )
    repository = PostgresArchitectureKnowledgeRepository(
        DirectPostgresConnector(DATABASE_URL), seed_knowledge()
    )
    knowledge = ManageArchitectureKnowledge(repository, CatalogueFileAdapter(), index, 10_000_000)
    for release in knowledge.list_releases(ACTOR):
        if release.status is KnowledgeReleaseStatus.DRAFT:
            knowledge.discard_draft(release.id, release.revision, ACTOR)
    draft = knowledge.create_draft(ACTOR, "Old index")
    index_id = uuid4().hex
    index.store(draft.id, index_id, (EvidenceChunk("c1", "BSCS", "system bscs", "BSCS billing"),))

    assert index.coverage(index_id) is None
    assert index.match_concepts(index_id, "billing", 3) == ()
    assert [item.id for item in index.retrieve(index_id, "billing", 3)] == ["c1"]
    # pgvector keeps single precision.
    (vector,) = index.vectors(("BSCS billing",))
    assert vector == pytest.approx(FakeEmbeddings().embed(("BSCS billing",))[0], rel=1e-6)
    knowledge.discard_draft(draft.id, draft.revision, ACTOR)
