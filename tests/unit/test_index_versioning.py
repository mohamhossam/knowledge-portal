"""Document versions and reusable chunk sets: a new version replaces the old in the draft,
and a rebuild cuts and embeds only what changed."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import pytest
from smb_kernel.documents.scanner import OfflineDocumentScanner
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.located_document_extractor import LocatedText
from knowledge_portal.application.use_cases.architecture_documents import UploadKnowledgeDocument
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
    ProposeCatalogueChanges,
)
from knowledge_portal.application.use_cases.document_retention import DocumentRetention
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    SystemDefinition,
)
from knowledge_portal.domain.document.value_objects import DocumentVersionId
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

MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))
NOW = datetime(2026, 10, 20, tzinfo=UTC)


class CountingExtractor(LocatedDocumentExtractor):
    """Counts how often a document is parsed."""

    def __init__(self) -> None:
        super().__init__(SafeDocumentTextExtractor())
        self.parsed = 0

    def extract(self, mime_type: str, content: bytes) -> tuple[LocatedText, ...]:
        self.parsed += 1
        return super().extract(mime_type, content)


class CountingEmbeddings(FakeEmbeddings):
    def __init__(self) -> None:
        self.embedded: list[str] = []

    def embed(self, texts: tuple[str, ...]) -> tuple[tuple[float, ...], ...]:
        self.embedded.extend(texts)
        return super().embed(texts)


class Catalogue:
    def __init__(self) -> None:
        self.repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
        self.embeddings = CountingEmbeddings()
        self.index = InMemoryEvidenceIndex(self.embeddings, FakeWordTokenizer())
        self.manage = ManageArchitectureKnowledge(
            self.repository, CatalogueFileAdapter(), self.index, 10_000_000
        )
        self.storage = InMemoryDocumentStorage()
        self.extractor = CountingExtractor()
        self.upload = UploadKnowledgeDocument(
            self.manage,
            self.repository,
            self.storage,
            SafeDocumentTextExtractor(),
            10_000_000,
            OfflineDocumentScanner(),
        )
        self.builder = BuildArchitectureIndex(
            self.manage, self.index, self.storage, self.extractor, FakeWordTokenizer()
        )

    def add(
        self, draft: ArchitectureKnowledge, text: str, replaces: str | None = None
    ) -> ArchitectureKnowledge:
        return self.upload.execute(
            draft.id,
            draft.revision,
            "Order notes",
            "notes.txt",
            "text/plain",
            "en",
            text.encode(),
            MAINTAINER,
            NOW,
            replaces=replaces,
        )

    def build(self, draft: ArchitectureKnowledge) -> ArchitectureKnowledge:
        return self.builder.execute(draft.id, draft.revision, MAINTAINER.id, fence=lambda: None)


def test_a_new_version_takes_the_old_ones_place_and_keeps_its_document() -> None:
    catalogue = Catalogue()
    draft = catalogue.add(catalogue.manage.create_draft(MAINTAINER, "Next"), "CWOM orders v1")
    first = draft.documents[0]
    assert first.lineage == first.id and first.supersedes is None
    draft = catalogue.add(draft, "CWOM orders v2", replaces=first.id)
    (second,) = draft.documents
    assert second.id != first.id
    assert second.lineage == first.id and second.supersedes == first.id
    with pytest.raises(InvalidKnowledgeError, match="not in this draft"):
        catalogue.add(draft, "CWOM orders v3", replaces="missing")


def test_a_rebuild_reuses_the_chunks_of_unchanged_documents() -> None:
    catalogue = Catalogue()
    draft = catalogue.add(catalogue.manage.create_draft(MAINTAINER, "Next"), "CWOM orders")
    first = catalogue.build(draft)
    assert catalogue.extractor.parsed == 1
    embedded = len(catalogue.embeddings.embedded)

    # A catalogue edit: the document is neither parsed nor embedded again.
    edited = catalogue.manage.upsert_system(
        first.id, first.revision, SystemDefinition("new-system", "New system"), MAINTAINER
    )
    second = catalogue.build(edited)
    assert catalogue.extractor.parsed == 1
    assert not any("CWOM orders" in text for text in catalogue.embeddings.embedded[embedded:])
    assert second.index_id is not None and second.index_id != first.index_id
    found = catalogue.index.retrieve(second.index_id, "CWOM orders", 20)
    assert any(item.document_version_id and item.text.endswith("CWOM orders") for item in found)
    # The earlier build of the draft is gone; nothing reads it again.
    assert first.index_id is not None
    assert catalogue.index.retrieve(first.index_id, "CWOM orders", 3) == ()


def test_a_new_document_version_is_cut_and_the_unread_set_collected() -> None:
    catalogue = Catalogue()
    draft = catalogue.add(catalogue.manage.create_draft(MAINTAINER, "Next"), "CWOM orders v1")
    built = catalogue.build(draft)
    replaced = catalogue.add(built, "CWOM orders v2", replaces=built.documents[0].id)
    rebuilt = catalogue.build(replaced)
    assert catalogue.extractor.parsed == 2
    assert rebuilt.index_id is not None
    found = catalogue.index.retrieve(rebuilt.index_id, "CWOM orders", 10)
    texts = [item.text for item in found if item.document_version_id]
    assert any(text.endswith("CWOM orders v2") for text in texts)
    assert not any(text.endswith("CWOM orders v1") for text in texts)
    # The first version's set is read by no index once its build is pruned.
    assert catalogue.index.collect() == 0  # already collected by the rebuild


def test_discarding_a_draft_collects_the_sets_only_it_read() -> None:
    catalogue = Catalogue()
    draft = catalogue.add(catalogue.manage.create_draft(MAINTAINER, "Next"), "A passing note")
    built = catalogue.build(draft)
    assert built.index_id is not None
    catalogue.manage.discard_draft(built.id, built.revision, MAINTAINER)
    assert catalogue.index.retrieve(built.index_id, "passing note", 3) == ()
    assert catalogue.index.collect() == 0


def test_reading_a_new_version_lists_what_the_catalogue_took_from_the_old_one_and_lost() -> None:
    catalogue = Catalogue()
    candidates = InMemoryCatalogueCandidates()
    documents = SafeDocumentTextExtractor()
    proposer = ProposeCatalogueChanges(
        catalogue.manage,
        catalogue.storage,
        LocatedDocumentExtractor(documents),
        documents,
        FakeCatalogueExtractor(),
        FakeSystemMatcher(),
        candidates,
        FixedClock(NOW),
    )
    decide = DecideCatalogueCandidate(catalogue.manage, catalogue.repository, candidates)
    draft = catalogue.add(
        catalogue.manage.create_draft(MAINTAINER, "Next"),
        "System: Order Hub\nConstraint: Orders close at midnight\n",
    )
    first = draft.documents[0]
    proposer.execute(draft.id, first.id, fence=lambda: None)
    # Accept the system, then its constraint, as a curator would.
    for kind in ("system", "constraint"):
        candidate = next(item for item in candidates.list(draft.id) if item.content.kind == kind)
        draft = decide.decide(draft.id, candidate.id, draft.revision, True, MAINTAINER, NOW)
    draft = catalogue.add(draft, "System: Order Hub\n", replaces=first.id)
    run = proposer.execute(draft.id, draft.documents[0].id, fence=lambda: None)
    (dropped,) = run.no_longer_stated
    assert dropped.kind.value == "constraint"
    assert "Orders close at midnight" in dropped.label
    assert dropped.quote and "midnight" in dropped.quote
    assert any("no longer stated" in warning for warning in run.warnings)


def test_a_document_the_malware_scanner_holds_back_is_never_added() -> None:
    catalogue = Catalogue()
    draft = catalogue.manage.create_draft(MAINTAINER, "Next")
    with pytest.raises(InvalidKnowledgeError, match="malware scanner held"):
        catalogue.add(draft, "Notes X5O!P%@AP EICAR-STANDARD-ANTIVIRUS-TEST-FILE end")
    assert catalogue.manage.get(draft.id).documents == ()


def test_a_build_says_what_it_reused_and_cut(caplog: pytest.LogCaptureFixture) -> None:
    catalogue = Catalogue()
    draft = catalogue.add(catalogue.manage.create_draft(MAINTAINER, "Next"), "CWOM orders")
    first = catalogue.build(draft)
    edited = catalogue.manage.upsert_system(
        first.id, first.revision, SystemDefinition("new-system", "New system"), MAINTAINER
    )
    with caplog.at_level(
        logging.INFO, logger="knowledge_portal.application.use_cases.architecture_index"
    ):
        catalogue.build(edited)
    assert "documents reused 1, cut 0" in caplog.text


def test_unused_document_files_are_listed_then_collected_and_registrations_kept() -> None:
    catalogue = Catalogue()
    draft = catalogue.add(catalogue.manage.create_draft(MAINTAINER, "Next"), "CWOM orders v1")
    first = draft.documents[0]
    draft = catalogue.add(draft, "CWOM orders v2", replaces=first.id)
    retention = DocumentRetention(catalogue.repository, catalogue.storage)
    later = NOW + timedelta(days=91)
    # Too recent for a 90-day period, and the draft still holds the second version.
    assert retention.unused(NOW, timedelta(days=90)) == ()
    assert [item.id for item in retention.unused(later, timedelta(days=90))] == [first.id]
    retention.collect(later, timedelta(days=90))
    with pytest.raises(Exception):  # noqa: B017 - the store's own not-found error
        catalogue.storage.get(DocumentVersionId(first.storage_key))
    assert first.id in catalogue.manage.known_versions()
    assert catalogue.storage.get(DocumentVersionId(draft.documents[0].storage_key))
