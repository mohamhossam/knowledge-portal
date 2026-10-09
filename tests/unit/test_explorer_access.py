"""The explorer reads the version in service for anyone signed in (requirement-portal ADR-0101)."""

from __future__ import annotations

from collections.abc import Generator
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from smb_kernel.identity.ports import IdentityCredential

from knowledge_portal.application.use_cases.identity_access import ResolveSignedInActor
from knowledge_portal.domain.identity.entities import ActorId
from knowledge_portal.infrastructure.config.options import IdentityProvider
from knowledge_portal.infrastructure.identity.fake_identity import FakeIdentityProvider
from knowledge_portal.interfaces.api.container import Container
from knowledge_portal.interfaces.api.main import create_app

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
OBSERVER = {"X-Fake-Actor-Id": "fake-observer"}


def test_a_signed_in_reader_who_is_not_an_admin_reads_the_version_in_service(
    client: TestClient,
) -> None:
    in_service = client.get("/architecture-knowledge/releases/active", headers=OWNER).json()

    response = client.get("/explorer/release", headers=OBSERVER)

    assert response.status_code == 200
    release = response.json()
    assert release["id"] == in_service["id"]
    assert release["systems"] == in_service["systems"]
    assert release["journeys"] == in_service["journeys"]
    assert release["products"] == in_service["products"]


def test_the_explorer_never_shows_documents_index_or_who_curated(client: TestClient) -> None:
    release = client.get("/explorer/release", headers=OBSERVER).json()

    assert set(release) == {
        "id",
        "name",
        "published_at",
        "systems",
        "relationships",
        "landscape_domains",
        "products",
        "journeys",
        "channels",
        # Where the knowledge comes from, and where its sources disagree (ADR-0101, step 5).
        "sources",
        "conflicts",
        # The change requests applied to it, for the Solution Architecture document (step 7):
        # what was asked and who approved it in Requirement AI, never who accepted it here.
        "change_history",
        # Where its offerings sit in the product portfolio.
        "portfolio",
    }


def test_a_draft_is_never_what_the_explorer_reads(client: TestClient) -> None:
    in_service = client.get("/explorer/release", headers=OBSERVER).json()["id"]

    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()

    assert draft["id"] != in_service
    assert client.get("/explorer/release", headers=OBSERVER).json()["id"] == in_service


def test_the_reader_is_named_but_never_remembered_as_an_admin(
    client: TestClient, container: Container
) -> None:
    response = client.get("/explorer/me", headers=OBSERVER)

    assert response.status_code == 200
    assert response.json()["id"] == "fake-observer"
    assert response.json()["roles"] == []
    assert container.actor_directory.get(ActorId("fake-observer")) is None


def test_curation_stays_closed_to_the_reader(client: TestClient) -> None:
    for path in ("/architecture-knowledge/releases/active", "/identity/me"):
        assert client.get(path, headers=OBSERVER).status_code == 403


def test_an_unknown_caller_is_refused(client: TestClient) -> None:
    response = client.get("/explorer/release", headers={"X-Fake-Actor-Id": "nobody"})

    assert response.status_code == 401
    assert response.json()["code"] == "authentication_required"


@pytest.fixture
def oidc_client(container: Container) -> Generator[TestClient, None, None]:
    settings = replace(
        container.settings,
        identity_provider=IdentityProvider.OIDC,
        oidc_issuer_url="https://identity.example/tenant",
        oidc_audience="api://smb",
        oidc_client_id="browser",
    )
    application = create_app(lambda: replace(container, settings=settings))
    with TestClient(application) as client:
        yield client


def test_a_fake_actor_header_is_refused_with_real_sign_in(oidc_client: TestClient) -> None:
    response = oidc_client.get("/explorer/release", headers=OBSERVER)

    assert response.status_code == 401
    assert response.json()["code"] == "authentication_required"


def test_the_signed_in_resolver_admits_without_the_admin_role() -> None:
    reader = ResolveSignedInActor(FakeIdentityProvider())

    actor = reader.execute(IdentityCredential(None, "fake-observer"))

    assert actor.id == ActorId("fake-observer")
    assert "knowledge_admin" not in actor.roles
