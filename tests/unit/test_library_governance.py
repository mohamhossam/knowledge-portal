"""Handing a library document over to another owner, audited."""

from __future__ import annotations

from datetime import UTC, datetime
from threading import RLock

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.errors import ActorNotFoundError
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.application.use_cases.reference_knowledge import (
    ReferenceKnowledge,
    StructureAwareChunks,
)
from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.identity.fake_identity import FAKE_ACTORS
from knowledge_portal.infrastructure.persistence.actor_directory import InMemoryActorDirectory
from knowledge_portal.infrastructure.persistence.document_library import InMemoryDocumentLibrary
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from knowledge_portal.infrastructure.persistence.reference_index import (
    ApproximateTokenCounter,
    InMemoryReferenceIndex,
)
from tests.unit.test_document_library import Embeddings, approve_fixture, owner

NOW = datetime(2026, 10, 2, tzinfo=UTC)


def _published() -> tuple[str, PublishedReference, DocumentLibrary, InMemoryDocumentLibrary]:
    lock = RLock()
    repository = InMemoryDocumentLibrary(lock)
    storage = InMemoryDocumentStorage()
    index = InMemoryReferenceIndex(lock, repository)
    transactions = InMemoryTransactionManager(lock)
    transactions.enroll(repository, storage, index)
    clock = FixedClock(NOW)
    service = DocumentLibrary(
        repository,
        storage,
        SafeDocumentTextExtractor(),
        OfflineDocumentScanner(),
        transactions,
        clock,
        100000,
    )
    knowledge = ReferenceKnowledge(
        repository,
        index,
        Embeddings(),
        StructureAwareChunks(ApproximateTokenCounter()),
        transactions,
        clock,
        "test-model",
    )
    document = approve_fixture(service)
    assert knowledge.index_next()
    (evidence,) = knowledge.search_evidence("Coverage required")
    return document.id, evidence.citation, service, repository


def _governance(repository: InMemoryDocumentLibrary) -> LibraryGovernance:
    return LibraryGovernance(
        repository,
        InMemoryActorDirectory(FAKE_ACTORS),
        InMemoryTransactionManager(RLock()),
        FixedClock(NOW),
    )


def test_ownership_moves_only_to_a_known_actor() -> None:
    document_id, _, _, repository = _published()
    governance = _governance(repository)
    version = repository.get(document_id)
    assert version is not None
    with pytest.raises(ActorNotFoundError):
        governance.transfer(document_id, owner(), ActorId("nobody"), version.version, "Leaving")
    change = governance.transfer(
        document_id, owner(), FAKE_ACTORS[1].id, version.version, "Moving teams"
    )
    assert change.new_owner.id == FAKE_ACTORS[1].id
