"""Provenance and drift: what a draft's sources and its catalogue say about each other."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from threading import RLock

from fastapi.testclient import TestClient
from smb_kernel.documents.scanner import OfflineDocumentScanner
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_documents import UploadKnowledgeDocument
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
    ProposeCatalogueChanges,
)
from knowledge_portal.application.use_cases.source_review import ReviewSources
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.diff import ChangedItem
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, OutdatedPassage
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.llm.catalogue_extraction import FakeCatalogueExtractor
from knowledge_portal.infrastructure.llm.catalogue_matching import FakeSystemMatcher
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_catalogue_candidates import (
    InMemoryCatalogueCandidates,
)
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)

MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))
NOW = datetime(2026, 10, 20, tzinfo=UTC)


class Portal:
    def __init__(self) -> None:
        self.repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
        self.index = InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer())
        self.manage = ManageArchitectureKnowledge(
            self.repository,
            CatalogueFileAdapter(),
            self.index,
            10_000_000,
            OfflineDocumentScanner(),
        )
        self.storage = InMemoryDocumentStorage()
        self.candidates = InMemoryCatalogueCandidates()
        documents = SafeDocumentTextExtractor()
        self.upload = UploadKnowledgeDocument(
            self.manage,
            self.repository,
            self.storage,
            documents,
            OfflineDocumentScanner(),
            InMemoryTransactionManager(RLock()),
            10_000_000,
        )
        self.builder = BuildArchitectureIndex(
            self.manage,
            self.index,
            self.storage,
            LocatedDocumentExtractor(documents),
            FakeWordTokenizer(),
        )
        self.proposer = ProposeCatalogueChanges(
            self.manage,
            self.storage,
            LocatedDocumentExtractor(documents),
            documents,
            FakeCatalogueExtractor(),
            FakeSystemMatcher(),
            self.candidates,
            FixedClock(NOW),
        )
        self.decide = DecideCatalogueCandidate(
            self.manage, self.repository, self.candidates, InMemoryTransactionManager(RLock())
        )
        self.review = ReviewSources(self.manage, self.candidates, self.index)

    def add(
        self, draft: ArchitectureKnowledge, text: str, replaces: str | None = None
    ) -> ArchitectureKnowledge:
        return self.upload.execute(
            draft.id,
            draft.revision,
            "Design",
            "design.txt",
            "text/plain",
            "en",
            text.encode(),
            MAINTAINER,
            NOW,
            replaces=replaces,
        )

    def accept_all(self, draft: ArchitectureKnowledge, version_id: str) -> ArchitectureKnowledge:
        self.proposer.execute(draft.id, version_id, fence=lambda: None)
        for kind in ("system", "constraint"):
            for candidate in self.candidates.list(draft.id):
                if candidate.content.kind == kind and candidate.status.value == "proposed":
                    draft = self.decide.decide(
                        draft.id, candidate.id, draft.revision, True, MAINTAINER, NOW
                    )
        return draft

    def publish(self, draft: ArchitectureKnowledge) -> ArchitectureKnowledge:
        built = self.builder.execute(draft.id, draft.revision, MAINTAINER.id, fence=lambda: None)
        return self.manage.publish(built.id, built.revision, MAINTAINER, NOW, "Reviewed")


def test_a_fact_whose_only_source_left_the_draft_is_listed() -> None:
    portal = Portal()
    draft = portal.add(
        portal.manage.create_draft(MAINTAINER, "Next"),
        "System: Order Hub\nConstraint: Orders close at midnight\n",
    )
    draft = portal.accept_all(draft, draft.documents[0].id)
    assert portal.review.provenance(draft.id, MAINTAINER) == ()
    without = portal.manage.select_documents(draft.id, draft.revision, MAINTAINER, ())
    orphaned = portal.review.provenance(without.id, MAINTAINER)
    labels = {item.label for item in orphaned}
    assert "System Order Hub" in labels
    assert any("Orders close at midnight" in label for label in labels)
    assert all(item.sources[0].title == "Design" for item in orphaned)


def test_a_newer_version_of_the_same_document_still_sources_the_fact() -> None:
    portal = Portal()
    draft = portal.add(portal.manage.create_draft(MAINTAINER, "Next"), "System: Order Hub\n")
    draft = portal.accept_all(draft, draft.documents[0].id)
    replaced = portal.add(draft, "System: Order Hub, renamed doc\n", replaces=draft.documents[0].id)
    assert portal.review.provenance(replaced.id, MAINTAINER) == ()


def test_drift_lists_passages_naming_a_changed_system_and_marks_keep_them_out_of_search() -> None:
    portal = Portal()
    first = portal.add(
        portal.manage.create_draft(MAINTAINER, "First"),
        "BCRM captures assisted sales orders for the business customer.",
    )
    portal.publish(first)
    draft = portal.manage.create_draft(MAINTAINER, "Second")
    bcrm = next(item for item in draft.systems if item.id == "bcrm")
    draft = portal.manage.upsert_system(
        draft.id, draft.revision, replace(bcrm, description="Retired for sales"), MAINTAINER
    )
    (item,) = portal.review.drift(draft.id, MAINTAINER)
    assert (item.item, item.key) == (ChangedItem.SYSTEM, "bcrm")
    (passage,) = item.passages
    assert "BCRM captures" in passage.passage.text and not passage.outdated

    marked = portal.manage.mark_outdated(
        draft.id,
        draft.revision,
        (OutdatedPassage(passage.passage.document_version_id or "", passage.passage.location),),
        MAINTAINER,
    )
    built = portal.builder.execute(marked.id, marked.revision, MAINTAINER.id, fence=lambda: None)
    assert built.index_id is not None
    found = portal.index.retrieve(built.index_id, "BCRM assisted sales orders", 20)
    assert not any(chunk.document_version_id for chunk in found)
    # Still readable by its id, for the citations that name it.
    assert portal.index.get(built.index_id, passage.passage.id) is not None
    (again,) = portal.review.drift(built.id, MAINTAINER)
    assert again.passages[0].outdated


def test_drift_lists_passages_naming_a_changed_channel_as_a_whole_word() -> None:
    portal = Portal()
    first = portal.manage.create_draft(MAINTAINER, "First")
    first = portal.manage.update(
        first.id, first.revision, MAINTAINER, channels=(Channel("shop", "Retail Shop"),)
    )
    first = portal.add(
        first, "Orders from the Retail Shop are captured in BCRM. Retail Shops close."
    )
    portal.publish(first)
    draft = portal.manage.create_draft(MAINTAINER, "Second")
    draft = portal.manage.update(
        draft.id,
        draft.revision,
        MAINTAINER,
        channels=(Channel("shop", "Retail Shop", description="Retired"),),
    )
    found = [item for item in portal.review.drift(draft.id, MAINTAINER) if item.key == "shop"]
    (item,) = found
    assert item.item is ChangedItem.CHANNEL
    assert "Retail Shop" in item.passages[0].passage.text


def test_the_review_endpoints_answer(client: TestClient) -> None:
    draft = client.post("/architecture-knowledge/releases", json={"name": "Next"}).json()
    root = f"/architecture-knowledge/releases/{draft['id']}"
    assert client.get(f"{root}/provenance").json() == []
    assert client.get(f"{root}/drift").status_code == 200
    refused = client.put(
        f"{root}/outdated-passages",
        json={
            "expected_revision": draft["revision"],
            "passages": [{"version_id": "missing", "location": "paragraph 1"}],
        },
    )
    assert refused.status_code == 422
    cleared = client.put(
        f"{root}/outdated-passages",
        json={"expected_revision": draft["revision"], "passages": []},
    )
    assert cleared.status_code == 200 and cleared.json()["outdated_passages"] == []
