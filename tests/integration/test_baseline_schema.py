"""The baseline migration builds exactly the knowledge-owned schema (requirement-portal ADR-0099).

Its tables are requirement-portal's knowledge tables at 202610021400, so the
data import can copy rows unchanged. A fresh, empty schema is migrated here.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from urllib.parse import quote

import psycopg
import pytest
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.infrastructure.persistence.migration_runner import (
    MIGRATIONS,
    latest_packaged_migration,
    run_migrations,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")

KNOWLEDGE_TABLES = {
    "actor_profiles",
    "architecture_catalogue_candidates",
    "architecture_embedding_cache",
    "architecture_extraction_runs",
    "architecture_jobs",
    "architecture_knowledge_audit",
    "architecture_knowledge_chunks",
    "architecture_knowledge_documents",
    "architecture_knowledge_indexes",
    "architecture_knowledge_releases",
    # Decided verdicts, the precedent lane's examples (ontology plan Phase 5).
    "architecture_precedents",
    "architecture_sample_requirements",
    # Change requests from Requirement AI (requirement-portal ADR-0101, step 7).
    "incoming_change_requests",
    "knowledge_document_blobs",
    "knowledge_events",
    # Knowledge admins acting on library documents they don't own (Knowledge Center C).
    "library_admin_grants",
    "library_admin_record",
    "library_chunks",
    "library_documents",
    "library_embedding_cache",
    "library_submissions",
    "organisation_audit",
    "organisation_catalogue",
    # Confirmations that catalogue systems are still right (Knowledge Center D).
    "system_reviews",
    # Historic Requirements and their own import queue (Knowledge Center E).
    "historic_requirements",
    "historic_import_jobs",
    # The concept-aware evidence index (ontology plan Phase 2).
    "architecture_chunk_entities",
    "architecture_chunk_concepts",
    "architecture_concepts",
}


@pytest.fixture
def fresh_schema() -> Iterator[tuple[str, str]]:
    assert DATABASE_URL is not None
    schema = f"baseline_{uuid.uuid4().hex}"
    with psycopg.connect(DATABASE_URL, autocommit=True) as connection:
        connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
        connection.execute(f'CREATE SCHEMA "{schema}"')
    separator = "&" if "?" in DATABASE_URL else "?"
    yield schema, f"{DATABASE_URL}{separator}options={quote(f'-csearch_path={schema},public')}"
    with psycopg.connect(DATABASE_URL, autocommit=True) as connection:
        connection.execute(f'DROP SCHEMA "{schema}" CASCADE')


def _tables(url: str, schema: str) -> set[str]:
    with psycopg.connect(url) as connection:
        rows = connection.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname=%s", (schema,)
        ).fetchall()
    return {str(row[0]) for row in rows}


def test_the_baseline_builds_exactly_the_knowledge_tables(fresh_schema: tuple[str, str]) -> None:
    schema, url = fresh_schema
    run_migrations(url)

    assert _tables(url, schema) == KNOWLEDGE_TABLES | {"schema_migrations"}


def test_a_migrated_database_is_ready_and_migrating_again_changes_nothing(
    fresh_schema: tuple[str, str],
) -> None:
    schema, url = fresh_schema
    assert "schema_migrations" not in _tables(url, schema)

    run_migrations(url)
    run_migrations(url)

    assert PostgresStore(DirectPostgresConnector(url)).readiness() is True
    with psycopg.connect(url) as connection:
        applied = [
            str(row[0])
            for row in connection.execute(
                f'SELECT version FROM "{schema}".schema_migrations'
            ).fetchall()
        ]
    assert sorted(applied) == sorted(path.name for path in MIGRATIONS.glob("*.sql"))
    assert max(applied) == latest_packaged_migration()


def test_every_foreign_key_stays_inside_the_knowledge_schema(
    fresh_schema: tuple[str, str],
) -> None:
    schema, url = fresh_schema
    run_migrations(url)
    with psycopg.connect(url) as connection:
        rows = connection.execute(
            """
            SELECT confrelid::regclass::text FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.contype = 'f' AND n.nspname = %s
            """,
            (schema,),
        ).fetchall()
    referenced = {str(row[0]).split(".")[-1].strip('"') for row in rows}
    assert referenced and referenced <= KNOWLEDGE_TABLES
