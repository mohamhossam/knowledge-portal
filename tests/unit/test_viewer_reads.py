"""What requirement work's read-only viewers read over /internal (requirement-portal ADR-0099).

A cited passage is served only while its publication is live, and architecture
evidence only from a published release: a viewer never shows a working
extraction or a draft.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.infrastructure.identity.fake_identity import FAKE_ACTORS
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS
from tests.unit.test_document_library import approve_fixture, owner

TOKEN = "r" * 40
REQUIREMENTS = {"Authorization": f"Bearer {TOKEN}"}
ADMIN = Actor(FAKE_ACTORS[0].id.value, FAKE_ACTORS[0].roles)


@pytest.fixture
def served() -> Iterator[tuple[Container, TestClient]]:
    container = build_container(
        replace(
            FAKE_PROVIDER_SETTINGS, requirement_service_token=TOKEN, library_scan_mode="offline"
        )
    )
    with TestClient(create_app(lambda: container)) as client:
        yield container, client


def _published_citation(container: Container) -> dict[str, str]:
    approve_fixture(container.document_library, b"XGPON coverage is required.")
    assert container.reference_knowledge.index_next()
    (evidence,) = container.reference_knowledge.search_evidence("XGPON coverage")
    citation = evidence.citation
    return {
        "document_id": citation.document_id,
        "publication_id": citation.publication_id,
        "version_id": citation.version_id,
        "revision_id": citation.revision_id,
        "block_id": citation.block_id,
    }


def test_a_live_citation_reads_its_exact_passage(served: tuple[Container, TestClient]) -> None:
    container, client = served
    params = _published_citation(container)

    response = client.get("/internal/library/passages", params=params, headers=REQUIREMENTS)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["text"] == "XGPON coverage is required."
    assert body["title"] == "Policy" and body["version_number"] == 1
    assert {key: body[key] for key in params} == params


def test_a_citation_that_is_no_longer_live_is_refused(
    served: tuple[Container, TestClient],
) -> None:
    container, client = served
    params = _published_citation(container)
    document = container.document_library.get(params["document_id"], owner())

    stale = client.get(
        "/internal/library/passages",
        params={**params, "revision_id": "an-older-revision"},
        headers=REQUIREMENTS,
    )
    container.document_library.withdraw(
        params["document_id"], document.version, owner(), "Superseded"
    )
    withdrawn = client.get("/internal/library/passages", params=params, headers=REQUIREMENTS)
    missing = client.get(
        "/internal/library/passages",
        params={**params, "document_id": "no-such-document"},
        headers=REQUIREMENTS,
    )

    assert stale.status_code == withdrawn.status_code == 409
    assert withdrawn.json()["code"] == "citation_not_current"
    assert missing.status_code == 404


def test_published_evidence_is_served_and_a_draft_s_is_not(
    served: tuple[Container, TestClient],
) -> None:
    container, client = served
    knowledge = container.manage_architecture_knowledge
    active = knowledge.active()
    draft = knowledge.create_draft(ADMIN, "Next")
    chunk = EvidenceChunk("chunk-1", "Landscape", "Section 2", "BCRM orders bundles.")
    for release in (active, draft):
        key = release.index_id or release.id
        knowledge._index.store(key, key, (chunk,))

    published = client.get(
        f"/internal/architecture/releases/{active.id}/evidence/chunk-1", headers=REQUIREMENTS
    )
    of_draft = client.get(
        f"/internal/architecture/releases/{draft.id}/evidence/chunk-1", headers=REQUIREMENTS
    )
    unknown = client.get(
        f"/internal/architecture/releases/{active.id}/evidence/no-such-chunk",
        headers=REQUIREMENTS,
    )

    assert published.status_code == 200, published.text
    assert published.json()["text"] == "BCRM orders bundles."
    assert of_draft.status_code == unknown.status_code == 404


def test_the_viewer_reads_need_requirement_work_s_token(
    served: tuple[Container, TestClient],
) -> None:
    _, client = served
    admin = {"X-Fake-Actor-Id": "fake-owner"}

    assert client.get("/internal/library/passages", headers=admin).status_code == 401
    assert (
        client.get("/internal/architecture/releases/r/evidence/c", headers=admin).status_code == 401
    )
