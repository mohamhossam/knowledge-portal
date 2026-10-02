"""A document owner's view of the requirements that cite it (ADR-0099).

Requirement work answers which requirements depend on a document; the
knowledge service checks ownership first and judges currency against its own
publication.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from threading import RLock

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.errors import ActorNotFoundError
from knowledge_portal.application.ports.requirement_dependents import (
    ProposalStatus,
    RequirementDependent,
    RequirementDependentsPage,
)
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.application.use_cases.reference_knowledge import (
    ReferenceKnowledge,
    StructureAwareChunks,
)
from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.identity.fake_identity import FAKE_ACTORS
from knowledge_portal.infrastructure.persistence.actor_directory import InMemoryActorDirectory
from knowledge_portal.infrastructure.persistence.document_library import InMemoryDocumentLibrary
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from knowledge_portal.infrastructure.persistence.reference_index import (
    InMemoryReferenceIndex,
    Utf8BudgetCounter,
)
from tests.unit.test_document_library import Embeddings, approve_fixture, owner

NOW = datetime(2026, 10, 2, tzinfo=UTC)


class RecordingDependents:
    def __init__(self, citations: tuple[PublishedReference, ...]) -> None:
        self.calls: list[tuple[ActorId, str, int, int]] = []
        self._citations = citations

    def proposals(
        self, actor_id: ActorId, document_id: str, offset: int, limit: int
    ) -> RequirementDependentsPage:
        self.calls.append((actor_id, document_id, offset, limit))
        return RequirementDependentsPage(
            tuple(
                RequirementDependent(
                    "req-1",
                    "Fibre bundles",
                    "an-1",
                    1,
                    True,
                    f"prop-{n}",
                    "Bundles require coverage.",
                    ProposalStatus.ACCEPTED,
                    citation,
                )
                for n, citation in enumerate(self._citations)
            ),
            None,
        )


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
        StructureAwareChunks(Utf8BudgetCounter()),
        transactions,
        clock,
        "test-model",
    )
    document = approve_fixture(service)
    assert knowledge.index_next()
    (evidence,) = knowledge.search_evidence("Coverage required")
    return document.id, evidence.citation, service, repository


def _governance(
    repository: InMemoryDocumentLibrary, dependents: RecordingDependents
) -> LibraryGovernance:
    return LibraryGovernance(
        repository,
        InMemoryActorDirectory(FAKE_ACTORS),
        InMemoryTransactionManager(RLock()),
        FixedClock(NOW),
        dependents,
    )


def test_dependents_are_asked_for_the_owner_and_judged_against_the_live_publication() -> None:
    document_id, citation, _, repository = _published()
    stale = replace(citation, publication_id="an-earlier-publication")
    dependents = RecordingDependents((citation, stale))
    page = _governance(repository, dependents).dependencies(document_id, owner(), 0, 20)
    assert dependents.calls == [(owner().id, document_id, 0, 20)]
    assert [item.publication_current for item in page.items] == [True, False]
    assert page.items[0].status is ProposalStatus.ACCEPTED
    assert page.next_offset is None


def test_only_the_owner_reads_dependents_and_requirement_work_is_never_asked_otherwise() -> None:
    document_id, citation, _, repository = _published()
    dependents = RecordingDependents((citation,))
    stranger = ActorProfile(ActorId("someone-else"), "Someone")
    with pytest.raises(AuthorizationDeniedError):
        _governance(repository, dependents).dependencies(document_id, stranger)
    assert dependents.calls == []


def test_ownership_moves_only_to_a_known_actor() -> None:
    document_id, _, _, repository = _published()
    governance = _governance(repository, RecordingDependents(()))
    version = repository.get(document_id)
    assert version is not None
    with pytest.raises(ActorNotFoundError):
        governance.transfer(document_id, owner(), ActorId("nobody"), version.version, "Leaving")
    change = governance.transfer(
        document_id, owner(), FAKE_ACTORS[1].id, version.version, "Moving teams"
    )
    assert change.new_owner.id == FAKE_ACTORS[1].id
