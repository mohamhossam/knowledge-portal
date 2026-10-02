"""The portal admits knowledge admins only (requirement-portal ADR-0099)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.domain.identity.entities import ActorId
from knowledge_portal.interfaces.api.container import Container

OBSERVER = {"X-Fake-Actor-Id": "fake-observer"}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/identity/me"),
        ("GET", "/identity/actors"),
        ("GET", "/library/documents"),
        ("POST", "/knowledge/search"),
        ("GET", "/architecture-knowledge/releases/active"),
        ("GET", "/organisation"),
    ],
)
def test_anyone_without_knowledge_admin_is_refused(
    client: TestClient, method: str, path: str
) -> None:
    body = {"query": "coverage"} if method == "POST" else None
    response = client.request(method, path, json=body, headers=OBSERVER)

    assert response.status_code == 403
    assert response.json()["code"] == "authorization_denied"


def test_a_refused_caller_is_never_remembered(client: TestClient, container: Container) -> None:
    client.get("/identity/me", headers=OBSERVER)

    assert container.actor_directory.get(ActorId("fake-observer")) is None


def test_documents_can_be_handed_only_to_admins_who_signed_in(client: TestClient) -> None:
    client.get("/identity/me", headers={"X-Fake-Actor-Id": "fake-reviewer"})

    known = {item["id"] for item in client.get("/identity/actors").json()}

    assert known == {"fake-owner", "fake-reviewer"}


def test_sign_in_options_stay_public_and_offer_every_offline_persona(client: TestClient) -> None:
    config = client.get("/identity/config")

    assert config.status_code == 200
    personas = {item["id"]: item["roles"] for item in config.json()["fake_actors"]}
    assert "knowledge_admin" in personas["fake-owner"]
    assert personas["fake-observer"] == []
