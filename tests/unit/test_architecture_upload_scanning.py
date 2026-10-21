"""Architecture uploads pass the malware scan before anything parses or stores them, and
are refused, never taken unscanned, when the scanner gives no verdict."""

from __future__ import annotations

import socket
from collections.abc import Generator
from dataclasses import replace
from datetime import UTC, datetime
from threading import RLock

import pytest
from fastapi.testclient import TestClient
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor

from knowledge_portal.application.errors import DocumentExtractionError
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_documents import (
    NOT_SCANNED,
    IncomingFile,
    UploadArchitectureDocuments,
    UploadKnowledgeDocument,
    UploadOutcome,
)
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
RELEASES = "/architecture-knowledge/releases"
EICAR = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE"
NOW = datetime(2026, 10, 21, 9, 0, tzinfo=UTC)
MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))


def _draft(client: TestClient) -> dict[str, object]:
    response = client.post(RELEASES, json={"name": "Scan checks"}, headers=OWNER)
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_a_flagged_document_upload_is_refused_and_not_stored(client: TestClient) -> None:
    draft = _draft(client)
    base = f"{RELEASES}/{draft['id']}"

    refused = client.post(
        f"{base}/documents",
        data={"title": "Design", "language": "en", "expected_revision": str(draft["revision"])},
        files={"file": ("design.txt", EICAR, "text/plain")},
        headers=OWNER,
    )

    assert refused.status_code == 422, refused.text
    assert refused.json()["code"] == "malware_rejected"
    release = client.get(base, headers=OWNER).json()
    assert release["documents"] == []
    assert release["revision"] == draft["revision"]


def test_a_flagged_file_in_a_batch_is_refused_while_the_rest_are_added(
    client: TestClient,
) -> None:
    draft = _draft(client)
    base = f"{RELEASES}/{draft['id']}"

    response = client.post(
        f"{base}/documents/batch",
        data={"language": "en", "expected_revision": str(draft["revision"])},
        files=[
            ("files", ("clean.txt", b"System: Order Hub\n", "text/plain")),
            ("files", ("flagged.txt", EICAR, "text/plain")),
        ],
        headers=OWNER,
    )

    assert response.status_code == 201, response.text
    outcomes = {item["filename"]: item for item in response.json()["results"]}
    assert outcomes["clean.txt"]["outcome"] == "added"
    assert outcomes["flagged.txt"]["outcome"] == "refused"
    assert "Malware scan rejected" in outcomes["flagged.txt"]["reason"]
    release = client.get(base, headers=OWNER).json()
    assert [item["filename"] for item in release["documents"]] == ["clean.txt"]


def test_a_flagged_catalogue_file_is_refused_by_preview_and_import(client: TestClient) -> None:
    draft = _draft(client)
    base = f"{RELEASES}/{draft['id']}"

    preview = client.post(
        f"{base}/catalogue-file/preview",
        files={"file": ("catalogue.yaml", EICAR, "application/yaml")},
        headers=OWNER,
    )
    assert preview.status_code == 422, preview.text
    assert preview.json()["code"] == "malware_rejected"

    imported = client.post(
        f"{base}/catalogue-file",
        data={"expected_revision": str(draft["revision"])},
        files={"file": ("catalogue.yaml", EICAR, "application/yaml")},
        headers=OWNER,
    )
    assert imported.status_code == 422, imported.text
    assert imported.json()["code"] == "malware_rejected"
    assert client.get(base, headers=OWNER).json()["revision"] == draft["revision"]


# A scanner that gives no verdict: the real ClamAV adapter pointed at a port nobody listens on.


def _closed_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port: int = probe.getsockname()[1]
        return port


@pytest.fixture
def scanner_down() -> Generator[TestClient, None, None]:
    settings = replace(
        FAKE_PROVIDER_SETTINGS,
        library_scan_mode="clamav",
        library_scanner_host="127.0.0.1",
        library_scanner_port=_closed_port(),
    )
    with TestClient(create_app(lambda: build_container(settings))) as client:
        yield client


def test_a_document_upload_is_refused_with_503_when_the_scanner_gives_no_verdict(
    scanner_down: TestClient,
) -> None:
    draft = _draft(scanner_down)
    base = f"{RELEASES}/{draft['id']}"

    refused = scanner_down.post(
        f"{base}/documents",
        data={"title": "Design", "language": "en", "expected_revision": str(draft["revision"])},
        files={"file": ("design.txt", b"System: Order Hub\n", "text/plain")},
        headers=OWNER,
    )

    assert refused.status_code == 503, refused.text
    assert refused.json()["code"] == "malware_scanner_unavailable"
    release = scanner_down.get(base, headers=OWNER).json()
    assert release["documents"] == []
    assert release["revision"] == draft["revision"]


def test_a_batch_stops_at_a_silent_scanner_and_still_reports_each_file(
    scanner_down: TestClient,
) -> None:
    draft = _draft(scanner_down)
    base = f"{RELEASES}/{draft['id']}"

    response = scanner_down.post(
        f"{base}/documents/batch",
        data={"language": "en", "expected_revision": str(draft["revision"])},
        files=[
            ("files", ("first.txt", b"System: Order Hub\n", "text/plain")),
            ("files", ("second.txt", b"System: Billing\n", "text/plain")),
        ],
        headers=OWNER,
    )

    assert response.status_code == 201, response.text
    first, second = response.json()["results"]
    assert first["outcome"] == "refused" and "gave no verdict" in first["reason"]
    assert second["outcome"] == "refused" and second["reason"] == NOT_SCANNED
    release = scanner_down.get(base, headers=OWNER).json()
    assert release["documents"] == []
    assert release["revision"] == draft["revision"]


def test_a_catalogue_file_is_refused_with_503_when_the_scanner_gives_no_verdict(
    scanner_down: TestClient,
) -> None:
    draft = _draft(scanner_down)
    base = f"{RELEASES}/{draft['id']}"
    file = {"file": ("catalogue.yaml", b"systems: []\n", "application/yaml")}

    preview = scanner_down.post(f"{base}/catalogue-file/preview", files=file, headers=OWNER)
    assert preview.status_code == 503, preview.text
    assert preview.json()["code"] == "malware_scanner_unavailable"

    imported = scanner_down.post(
        f"{base}/catalogue-file",
        data={"expected_revision": str(draft["revision"])},
        files=file,
        headers=OWNER,
    )
    assert imported.status_code == 503, imported.text
    assert imported.json()["code"] == "malware_scanner_unavailable"
    assert scanner_down.get(base, headers=OWNER).json()["revision"] == draft["revision"]


class _ScannerThatStops:
    """Clean verdicts for the first ``answers`` files, then no verdict, as a scanner that
    goes down partway through a batch."""

    def __init__(self, answers: int) -> None:
        self._answers = answers

    def scan(self, content: bytes) -> bool:
        if self._answers == 0:
            raise DocumentExtractionError("Malware scanner unavailable.")
        self._answers -= 1
        return True


def test_a_scanner_that_stops_mid_batch_keeps_the_files_already_added() -> None:
    scanner = _ScannerThatStops(answers=1)
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    manage = ManageArchitectureKnowledge(
        repository,
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
        scanner,
    )
    batch = UploadArchitectureDocuments(
        UploadKnowledgeDocument(
            manage,
            repository,
            InMemoryDocumentStorage(),
            SafeDocumentTextExtractor(),
            scanner,
            InMemoryTransactionManager(RLock()),
            10_000_000,
        ),
        manage,
    )
    draft = manage.create_draft(MAINTAINER, "Scanner outage")

    result = batch.execute(
        draft.id,
        draft.revision,
        (
            IncomingFile("first.txt", "text/plain", b"System: Order Hub"),
            IncomingFile("second.txt", "text/plain", b"System: Billing"),
            IncomingFile("third.txt", "text/plain", b"System: Inventory"),
        ),
        "en",
        MAINTAINER,
        NOW,
    )

    first, second, third = result.results
    assert first.outcome is UploadOutcome.ADDED
    assert second.outcome is UploadOutcome.REFUSED
    assert second.reason is not None and "gave no verdict" in second.reason
    assert third.outcome is UploadOutcome.REFUSED and third.reason == NOT_SCANNED
    assert [item.filename for item in result.release.documents] == ["first.txt"]
    assert result.release.revision == draft.revision + 1
