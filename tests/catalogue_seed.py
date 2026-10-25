"""The test catalogue: the small SMB reference release, put in service for tests to start from.

The service starts with no catalogue; a knowledge maintainer publishes the first version.
Tests that need a version in service build one from `fixtures/smb_architecture.yaml`.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
    put_in_service,
)
from knowledge_portal.application.ports.architecture_rag import ArchitectureEvidenceIndexPort
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.knowledge_events import KnowledgeEventOutboxPort
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeReleaseStatus,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)

SEED_FILE = Path(__file__).with_name("fixtures") / "smb_architecture.yaml"
SEED_RELEASE_ID = "smb-source-reference-v1"
MAINTAINER = Actor("seed-maintainer", frozenset({"knowledge_maintainer"}))
OWNER = {"X-Fake-Actor-Id": "fake-owner"}


def seed_knowledge() -> ArchitectureKnowledge:
    """The reference release as published, with no evidence index."""
    draft = knowledge_from_yaml(SEED_FILE.read_text(encoding="utf-8"))
    return replace(
        draft,
        status=KnowledgeReleaseStatus.PUBLISHED,
        built_revision=1,
        published_at=datetime(2026, 1, 1, tzinfo=UTC),
        published_by="packaged-seed",
        name="Initial catalogue",
    )


def seeded[Repository: ArchitectureKnowledgeRepositoryPort](
    repository: Repository, release: ArchitectureKnowledge | None = None
) -> Repository:
    """`repository` with `release` (the reference release by default) in service."""
    put_in_service(repository, release if release is not None else seed_knowledge())
    return repository


def seeded_repository(
    release: ArchitectureKnowledge | None = None, events: KnowledgeEventOutboxPort | None = None
) -> InMemoryArchitectureKnowledgeRepository:
    """An in-memory repository with `release` (the reference release by default) in service."""
    repository = InMemoryArchitectureKnowledgeRepository(events)
    put_in_service(repository, release if release is not None else seed_knowledge())
    return repository


def seeded_once[Repository: ArchitectureKnowledgeRepositoryPort](
    repository: Repository,
) -> Repository:
    """`repository` on a database tests share: the reference release goes in service the first
    time only, as the service seeded it before it started empty."""
    if repository.get(SEED_RELEASE_ID) is None:
        put_in_service(repository, seed_knowledge())
    return repository


def indexed_repository(
    index: ArchitectureEvidenceIndexPort, release: ArchitectureKnowledge | None = None
) -> InMemoryArchitectureKnowledgeRepository:
    """`release` (the reference release by default) in service as a maintainer publishes it:
    built into `index`, which must tokenize with `FakeWordTokenizer`, so matching reads it."""
    repository = InMemoryArchitectureKnowledgeRepository()
    draft = replace(
        release if release is not None else seed_knowledge(),
        status=KnowledgeReleaseStatus.DRAFT,
        built_revision=None,
        published_at=None,
        published_by=None,
    )
    repository.save(draft, None, MAINTAINER.id, "create_draft")
    manage = ManageArchitectureKnowledge(
        repository, CatalogueFileAdapter(), index, 10_000_000, OfflineDocumentScanner()
    )
    built = BuildArchitectureIndex(
        manage,
        index,
        InMemoryDocumentStorage(),
        LocatedDocumentExtractor(SafeDocumentTextExtractor()),
        FakeWordTokenizer(),
    ).execute(draft.id, draft.revision, MAINTAINER.id, fence=lambda: None)
    manage.publish(built.id, built.revision, MAINTAINER, datetime(2026, 1, 1, tzinfo=UTC), "Seed")
    return repository


def publish_built_copy(client: TestClient, name: str = "Built catalogue") -> dict[str, Any]:
    """Through the API, as a maintainer: copy the version in service into a draft, build its
    evidence index and publish it, so matching through the API has an index to read."""
    releases = "/architecture-knowledge/releases"
    draft = client.post(releases, json={"name": name}, headers=OWNER)
    assert draft.status_code == 201, draft.text
    base = f"{releases}/{draft.json()['id']}"
    revision = draft.json()["revision"]
    built = client.post(f"{base}/build", json={"expected_revision": revision}, headers=OWNER)
    assert built.status_code in {200, 202}, built.text
    published = client.post(
        f"{base}/publish",
        json={"expected_revision": revision, "rationale": "Built for the test."},
        headers=OWNER,
    )
    assert published.status_code == 200, published.text
    return dict(published.json())
