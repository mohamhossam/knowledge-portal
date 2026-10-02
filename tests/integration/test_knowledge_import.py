"""Copying the knowledge tables out of a requirements database (requirement-portal ADR-0099).

The source is a schema built by this repository's baseline, which equals the
knowledge tables of a requirements database at `202610021400`, marked with
that migration, and filled through the real service on PostgreSQL.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from dataclasses import replace
from urllib.parse import quote

import psycopg
import pytest

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.domain.organisation.catalogue import Person
from knowledge_portal.infrastructure.config.options import PersistenceProvider
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.identity.fake_identity import FAKE_ACTORS
from knowledge_portal.infrastructure.persistence.knowledge_import import (
    IMPORTED_TABLES,
    SOURCE_MIGRATION,
    import_knowledge,
    verify_knowledge,
)
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.interfaces.api.container import Container, build_container
from tests.conftest import FAKE_PROVIDER_SETTINGS
from tests.unit.test_document_library import approve_fixture

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")
OWNER = FAKE_ACTORS[0]
ADMIN = Actor(OWNER.id.value, OWNER.roles)


def _schema_url(schema: str, *, extensions: bool = True) -> str:
    """A URL whose tables are `schema`'s; `public` only for the vector type."""
    assert DATABASE_URL is not None
    separator = "&" if "?" in DATABASE_URL else "?"
    path = f"{schema},public" if extensions else schema
    return f"{DATABASE_URL}{separator}options={quote(f'-csearch_path={path}')}"


@pytest.fixture
def schemas() -> Iterator[tuple[str, str, str]]:
    """Source and target URLs, plus an unmigrated schema's URL."""
    assert DATABASE_URL is not None
    names = [f"{role}_{uuid.uuid4().hex}" for role in ("source", "target", "empty")]
    with psycopg.connect(DATABASE_URL, autocommit=True) as connection:
        for name in names:
            connection.execute(f'CREATE SCHEMA "{name}"')
    source, target = (_schema_url(name) for name in names[:2])
    # Nothing migrated here, and not even the shared database's public schema in view.
    empty = _schema_url(names[2], extensions=False)
    run_migrations(source)
    run_migrations(target)
    with psycopg.connect(source) as connection:
        connection.execute(
            "INSERT INTO schema_migrations (version) VALUES (%s)", (SOURCE_MIGRATION,)
        )
    yield source, target, empty
    with psycopg.connect(DATABASE_URL, autocommit=True) as connection:
        for name in names:
            connection.execute(f'DROP SCHEMA "{name}" CASCADE')


def _service(url: str) -> Container:
    settings = replace(
        FAKE_PROVIDER_SETTINGS,
        persistence_provider=PersistenceProvider.POSTGRES,
        database_url=url,
    )
    container = build_container(settings)
    # No ClamAV here: an offline verdict stands in for the scanner, for this seeding only.
    container.document_library._scanner = OfflineDocumentScanner()
    return container


def _seed(url: str) -> None:
    """Every kind of knowledge: a published, indexed document, catalogue and squad changes."""
    container = _service(url)
    try:
        approve_fixture(container.document_library, b"XGPON coverage is required.")
        assert container.reference_knowledge.index_next()
        container.manage_architecture_knowledge.view_active(ADMIN)
        container.manage_architecture_knowledge.create_draft(ADMIN, "Next release")
        container.manage_organisation_catalogue.save_person(Person("p-1", "Amina"), None, ADMIN)
    finally:
        container.close_resources()


def _count(url: str, table: str) -> int:
    with psycopg.connect(url) as connection:
        row = connection.execute(f"SELECT count(*) FROM {table}").fetchone()
    assert row is not None and isinstance(row[0], int)
    return row[0]


def test_every_table_arrives_unchanged_and_verifies(schemas: tuple[str, str, str]) -> None:
    source, target, _ = schemas
    _seed(source)

    results = {item.table: item for item in import_knowledge(source, target)}

    assert set(results) == set(IMPORTED_TABLES)
    for table in (
        "library_documents",
        "library_chunks",
        "knowledge_document_blobs",
        "architecture_knowledge_releases",
        "architecture_knowledge_audit",
        "organisation_catalogue",
        "organisation_audit",
        "knowledge_events",
    ):
        assert results[table].inserted == _count(source, table) > 0, table
    assert all(check.matches for check in verify_knowledge(source, target))
    # Admins are remembered as they sign in to the portal, never copied in.
    assert "actor_profiles" not in results


def test_counters_continue_after_the_copied_ids(schemas: tuple[str, str, str]) -> None:
    source, target, _ = schemas
    _seed(source)
    import_knowledge(source, target)

    with psycopg.connect(target) as connection:
        for table, column in (
            ("knowledge_events", "seq"),
            ("architecture_knowledge_audit", "audit_id"),
            ("organisation_audit", "audit_id"),
        ):
            row = connection.execute(
                f"SELECT nextval(pg_get_serial_sequence('{table}', '{column}')) "
                f"> (SELECT max({column}) FROM {table})"
            ).fetchone()
            assert row is not None and row[0] is True, table


def test_running_again_changes_nothing_and_later_source_changes_arrive(
    schemas: tuple[str, str, str],
) -> None:
    source, target, _ = schemas
    _seed(source)
    import_knowledge(source, target)

    again = import_knowledge(source, target)
    assert all(item.inserted == item.updated == 0 for item in again)

    later = _service(source)
    try:
        later.manage_organisation_catalogue.save_person(Person("p-2", "Ravi"), None, ADMIN)
    finally:
        later.close_resources()
    caught_up = {item.table: item for item in import_knowledge(source, target)}

    assert caught_up["organisation_catalogue"].updated == 1
    assert caught_up["organisation_audit"].inserted == 1
    assert all(check.matches for check in verify_knowledge(source, target))


def test_verification_names_a_table_that_drifted(schemas: tuple[str, str, str]) -> None:
    source, target, _ = schemas
    _seed(source)
    import_knowledge(source, target)
    with psycopg.connect(target) as connection:
        connection.execute("UPDATE library_documents SET payload = payload || '{\"x\": 1}'")

    drifted = [check.table for check in verify_knowledge(source, target) if not check.matches]

    assert drifted == ["library_documents"]


def test_the_import_refuses_databases_it_cannot_trust(schemas: tuple[str, str, str]) -> None:
    source, target, empty = schemas

    with pytest.raises(PersistenceError, match="not migrated"):
        import_knowledge(source, empty)
    with psycopg.connect(source) as connection:
        connection.execute("DELETE FROM schema_migrations WHERE version=%s", (SOURCE_MIGRATION,))
    with pytest.raises(PersistenceError, match="not a requirements database"):
        import_knowledge(source, target)
