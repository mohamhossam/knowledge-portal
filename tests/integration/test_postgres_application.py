"""The whole service on PostgreSQL: composition, sign-in records and the actor directory."""

from __future__ import annotations

import os
import uuid
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.infrastructure.config.options import PersistenceProvider
from knowledge_portal.infrastructure.persistence.actor_directory import PostgresActorDirectory
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")


@pytest.fixture
def store() -> PostgresStore:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    return PostgresStore(DirectPostgresConnector(DATABASE_URL))


def test_the_directory_remembers_admins_and_finds_them_by_name_or_email(
    store: PostgresStore,
) -> None:
    marker = uuid.uuid4().hex
    directory = PostgresActorDirectory(store)
    first = ActorProfile(ActorId(f"a-{marker}"), f"Amina {marker}", f"amina.{marker}@example.test")
    directory.record(first)
    # Signing in again refreshes the profile instead of adding another.
    renamed = replace(first, display_name=f"Amina Owner {marker}")
    directory.record(renamed)
    directory.record(ActorProfile(ActorId(f"b-{marker}"), f"Ravi {marker}", None))

    restarted = PostgresActorDirectory(store)
    assert restarted.get(first.id) == ActorProfile(first.id, renamed.display_name, first.email)
    assert [a.id for a in restarted.search(f"amina.{marker}", 10)] == [first.id]
    assert [a.display_name for a in restarted.search(marker, 10)] == [
        f"Amina Owner {marker}",
        f"Ravi {marker}",
    ]
    assert restarted.get(ActorId(f"missing-{marker}")) is None


def test_a_corrupt_stored_profile_is_a_persistence_failure(store: PostgresStore) -> None:
    actor_id = f"corrupt-{uuid.uuid4().hex}"
    with store.transaction(), store.connection() as connection:
        connection.execute(
            "INSERT INTO actor_profiles (actor_id, payload) VALUES (%s, %s)",
            (actor_id, '{"id": 7}'),
        )

    with pytest.raises(PersistenceError):
        PostgresActorDirectory(store).get(ActorId(actor_id))


def test_the_service_runs_on_postgresql() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    settings = replace(
        FAKE_PROVIDER_SETTINGS,
        persistence_provider=PersistenceProvider.POSTGRES,
        database_url=DATABASE_URL,
    )
    container = build_container(settings)
    with TestClient(create_app(lambda: container)) as client:
        assert client.get("/ready").json()["checks"]["persistence"] is True
        assert client.get("/identity/me").status_code == 200
        assert client.get("/library/documents").status_code == 200
        assert client.get("/architecture-knowledge/releases/active").status_code == 200
        assert client.get("/organisation").status_code == 200
        observer = {"X-Fake-Actor-Id": "fake-observer"}
        assert client.get("/identity/me", headers=observer).status_code == 403
        # The admin who signed in is remembered in the database; the refused caller is not.
        assert container.actor_directory.get(ActorId("fake-owner")) is not None
        assert container.actor_directory.get(ActorId("fake-observer")) is None
