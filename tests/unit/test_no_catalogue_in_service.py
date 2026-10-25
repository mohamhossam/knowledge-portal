"""The service starts with no catalogue; a maintainer publishes the first version (ADR-0126)."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.public_errors import describe_public_error
from knowledge_portal.domain.architecture.knowledge import NoReleaseInServiceError
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

TOKEN = "r" * 40
REQUIREMENTS = {"Authorization": f"Bearer {TOKEN}"}
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
READER = {"X-Fake-Actor-Id": "fake-reviewer"}
NOT_IN_SERVICE = "architecture_catalogue_not_in_service"


@pytest.fixture
def empty() -> Iterator[TestClient]:
    """The service as it first starts: nothing seeded."""
    container = build_container(replace(FAKE_PROVIDER_SETTINGS, requirement_service_token=TOKEN))
    with TestClient(create_app(lambda: container)) as client:
        yield client


def test_a_new_repository_has_nothing_in_service() -> None:
    repository = InMemoryArchitectureKnowledgeRepository()

    assert repository.active() is None
    assert repository.list_all() == ()


def test_nothing_in_service_is_a_conflict_with_its_own_code() -> None:
    described = describe_public_error(NoReleaseInServiceError())

    assert described.code == NOT_IN_SERVICE
    assert "No catalogue version is in service yet" in described.message


def test_the_portal_reads_null_for_the_version_in_service(empty: TestClient) -> None:
    active = empty.get("/architecture-knowledge/releases/active", headers=OWNER)
    explorer = empty.get("/explorer/release", headers=READER)

    assert (active.status_code, active.json()) == (200, None)
    assert (explorer.status_code, explorer.json()) == (200, None)
    assert empty.get("/architecture-knowledge/releases", headers=OWNER).json() == []


def test_requirement_work_is_told_nothing_is_in_service(empty: TestClient) -> None:
    body = {"text": ["Order a bundle through the assisted channel."], "declared_systems": []}
    for path in ("/internal/architecture/match", "/internal/architecture/assess"):
        answer = empty.post(path, json=body, headers=REQUIREMENTS)

        assert answer.status_code == 409, (path, answer.text)
        assert answer.json()["code"] == NOT_IN_SERVICE


def test_the_first_draft_starts_empty_and_its_review_lists_everything_as_added(
    empty: TestClient,
) -> None:
    created = empty.post(
        "/architecture-knowledge/releases", json={"name": "First version"}, headers=OWNER
    )
    assert created.status_code == 201, created.text
    draft = created.json()
    assert draft["systems"] == [] and draft["base_release_id"] is None
    saved = empty.put(
        f"/architecture-knowledge/releases/{draft['id']}",
        json={
            "expected_revision": draft["revision"],
            "systems": [{"id": "crm", "name": "CRM", "aliases": [], "capabilities": []}],
            "relationships": [],
        },
        headers=OWNER,
    )
    assert saved.status_code == 200, saved.text

    changes = empty.get(
        f"/architecture-knowledge/releases/{draft['id']}/changes", headers=OWNER
    ).json()

    assert changes["base_release_id"] is None
    assert [(item["item"], item["change"], item["key"]) for item in changes["changes"]] == [
        ("system", "added", "crm")
    ]


def test_lists_read_empty_before_the_first_version(empty: TestClient) -> None:
    impact = empty.get("/architecture-knowledge/mapping-impact", headers=OWNER)
    options = empty.get("/library/classification-options", headers=OWNER)

    assert impact.status_code == 200 and impact.json()["active_release_id"] is None
    assert options.status_code == 200
    assert options.json() == {"document_types": [], "topics": []}
