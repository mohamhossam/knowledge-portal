"""Multi-repository flows commit once or not at all (one unit of work).

Each test induces a failure midway through a flow that touches more than one
repository and proves PostgreSQL keeps no partial state: before the shared
unit of work, the earlier repositories had already committed on their own.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.persistence.connector import DirectPostgresConnector
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.catalogue_candidates import ExtractionRun
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_documents import UploadKnowledgeDocument
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.catalogue_candidates import DecideCatalogueCandidate
from knowledge_portal.application.use_cases.change_requests import ReadChangeRequestIntoDraft
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CandidateStatus,
    CatalogueCandidate,
)
from knowledge_portal.domain.architecture.change_requests import (
    IncomingChangeRequest,
    IncomingContext,
    IncomingFeature,
    IncomingStatus,
    RequirementTrace,
)
from knowledge_portal.domain.architecture.knowledge import KnowledgeReleaseStatus
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.document_storage import PostgresDocumentStorage
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_architecture_knowledge import (
    PostgresArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.postgres_catalogue_candidates import (
    PostgresCatalogueCandidates,
)
from knowledge_portal.infrastructure.persistence.postgres_change_requests import (
    PostgresChangeRequests,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore
from tests.catalogue_seed import seeded_once

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")
NOW = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)
MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))


class _FailingOn:
    """The wrapped repository, with one method replaced by an induced failure."""

    def __init__(self, inner: object, method: str) -> None:
        self._inner = inner
        self._method = method

    def __getattr__(self, name: str) -> Any:
        if name == self._method:

            def boom(*args: object, **kwargs: object) -> None:
                raise PersistenceError("induced failure")

            return boom
        return getattr(self._inner, name)


def _world() -> tuple[PostgresStore, PostgresArchitectureKnowledgeRepository, Any]:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    store = PostgresStore(DirectPostgresConnector(DATABASE_URL))
    repository = seeded_once(PostgresArchitectureKnowledgeRepository(store))
    manage = ManageArchitectureKnowledge(
        repository,
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
        OfflineDocumentScanner(),
    )
    return store, repository, manage


def _fresh_draft(manage: Any) -> Any:
    """Only one draft may exist; the shared test database may keep one."""
    for release in manage.list_releases(MAINTAINER):
        if release.status is KnowledgeReleaseStatus.DRAFT:
            manage.discard_draft(release.id, release.revision, MAINTAINER)
    return manage.create_draft(MAINTAINER, "Atomicity checks")


def _incoming() -> IncomingChangeRequest:
    approval = f"APR-{uuid4().hex}"
    return IncomingChangeRequest(
        id=f"CR-20261019-{uuid4().hex}",
        approval_id=approval,
        subject_fingerprint="sha256:atomic",
        title="Microsoft 365",
        trace=RequirementTrace("REQ-9", 3, approval, "EP-9", "Microsoft 365", "Layla", NOW),
        features=(
            IncomingFeature(
                "FT-1", 1, "Offer it", None, (IncomingContext("PO-BPP", "Business Pro Plus"),)
            ),
        ),
        received_at=NOW,
    )


def test_reading_a_change_request_rolls_back_whole() -> None:
    store, repository, manage = _world()
    inbox = PostgresChangeRequests(store)
    for release in manage.list_releases(MAINTAINER):
        if release.status is KnowledgeReleaseStatus.DRAFT:
            manage.discard_draft(release.id, release.revision, MAINTAINER)
    incoming, _ = inbox.receive(_incoming())
    failing_candidates: Any = _FailingOn(PostgresCatalogueCandidates(store), "replace_proposals")
    read = ReadChangeRequestIntoDraft(
        inbox, manage, repository, failing_candidates, store, FixedClock(NOW)
    )

    with pytest.raises(PersistenceError, match="induced failure"):
        read.execute(incoming.id, MAINTAINER)

    # The draft the flow created mid-way rolled back with the failure...
    drafts = [
        item
        for item in manage.list_releases(MAINTAINER)
        if item.status is KnowledgeReleaseStatus.DRAFT
    ]
    assert drafts == []
    # ...and the inbox row still waits to be read.
    stored = inbox.get(incoming.id)
    assert stored is not None and stored.status is IncomingStatus.WAITING


def test_deciding_a_candidate_rolls_its_marks_back_with_the_lost_save() -> None:
    store, repository, manage = _world()
    candidates = PostgresCatalogueCandidates(store)
    draft = _fresh_draft(manage)
    candidate = CatalogueCandidate(
        uuid4().hex,
        draft.id,
        "doc-1",
        CandidateContent(CandidateKind.SYSTEM, "atomic-hub", name="Atomic Hub"),
        (CandidateCitation("paragraph 1", "Atomic Hub is a system"),),
        "model",
        "catalogue-extraction-v1",
        NOW,
    )
    candidates.replace_proposals(
        ExtractionRun(uuid4().hex, draft.id, "doc-1", "model", "v1", 1, (), NOW), (candidate,)
    )
    failing_repository: Any = _FailingOn(repository, "save")
    decide = DecideCatalogueCandidate(manage, failing_repository, candidates, store)

    with pytest.raises(PersistenceError, match="induced failure"):
        decide.decide(draft.id, candidate.id, draft.revision, True, MAINTAINER, NOW)

    stored = candidates.get(candidate.id)
    assert stored is not None and stored.status is CandidateStatus.PROPOSED


def _blob_count(store: PostgresStore) -> int:
    with store.connection() as connection:
        row = connection.execute("SELECT count(*) FROM knowledge_document_blobs").fetchone()
        assert row is not None
        count = row[0]
        assert isinstance(count, int)
        return count


def test_a_lost_upload_rolls_its_blob_back() -> None:
    store, repository, manage = _world()
    storage = PostgresDocumentStorage(store)
    draft = _fresh_draft(manage)
    failing_repository: Any = _FailingOn(repository, "save")
    upload = UploadKnowledgeDocument(
        manage,
        failing_repository,
        storage,
        SafeDocumentTextExtractor(),
        OfflineDocumentScanner(),
        store,
        10_000_000,
    )
    before = _blob_count(store)

    with pytest.raises(PersistenceError, match="induced failure"):
        upload.execute(
            draft.id,
            draft.revision,
            "Atomic design notes",
            "notes.txt",
            "text/plain",
            b"System: Atomic Hub",
            MAINTAINER,
            NOW,
        )

    # The blob stored before the lost save rolled back with it: no orphan.
    assert _blob_count(store) == before
    assert manage.get(draft.id).documents == ()
