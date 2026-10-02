"""The /internal routes answer requirement work only (requirement-portal ADR-0099)."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from knowledge_portal.application.ports.architecture_knowledge import (
    ArchitectureKnowledgeMatch,
    ArchitectureQuery,
)
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

TOKEN = "r" * 40
REQUIREMENTS = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def served() -> Iterator[tuple[Container, TestClient]]:
    container = build_container(replace(FAKE_PROVIDER_SETTINGS, requirement_service_token=TOKEN))
    with TestClient(create_app(lambda: container)) as client:
        yield container, client


def test_without_a_configured_token_the_internal_api_does_not_exist(client: TestClient) -> None:
    assert client.get("/internal/events", headers=REQUIREMENTS).status_code == 404


def test_only_requirement_work_s_token_is_admitted(served: tuple[Container, TestClient]) -> None:
    _, client = served
    assert client.get("/internal/events").status_code == 401
    wrong = {"Authorization": f"Bearer {'w' * 40}"}
    assert client.get("/internal/events", headers=wrong).status_code == 401
    # A signed-in admin is not a service: the browser path never reaches /internal.
    admin = {"X-Fake-Actor-Id": "fake-owner"}
    assert client.get("/internal/events", headers=admin).status_code == 401
    assert client.get("/internal/events", headers=REQUIREMENTS).status_code == 200


def test_internal_answers_come_from_this_service_s_own_state(
    served: tuple[Container, TestClient],
) -> None:
    container, client = served
    published = client.get("/internal/library/published", headers=REQUIREMENTS)
    assert published.json() == {"has_published": container.reference_knowledge.has_published()}
    search = client.post("/internal/library/search", json={"query": "q"}, headers=REQUIREMENTS)
    assert search.status_code == 200 and search.json() == []
    query = ArchitectureQuery(("Order a bundle through the assisted channel.",), ("BCRM",))
    match = client.post(
        "/internal/architecture/match",
        json=TypeAdapter(ArchitectureQuery).dump_python(query, mode="json"),
        headers=REQUIREMENTS,
    )
    assert match.status_code == 200, match.text
    expected = container.architecture_knowledge.match(query)
    assert match.json() == TypeAdapter(ArchitectureKnowledgeMatch).dump_python(
        expected, mode="json"
    )


def test_the_event_feed_pages_the_outbox_in_order(served: tuple[Container, TestClient]) -> None:
    container, client = served
    expected = container.knowledge_events.after(0, 500)
    feed = client.get("/internal/events?after=0&limit=500", headers=REQUIREMENTS).json()
    assert [item["seq"] for item in feed] == [event.seq for event in expected]
    assert client.get("/internal/events?limit=501", headers=REQUIREMENTS).status_code == 422
