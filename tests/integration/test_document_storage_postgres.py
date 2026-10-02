"""Library and catalogue file bytes in `knowledge_document_blobs`: immutable and checked."""

from __future__ import annotations

import os
import uuid

import pytest
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.application.errors import DocumentNotFoundError, DocumentStorageError
from knowledge_portal.domain.document.value_objects import DocumentVersionId
from knowledge_portal.infrastructure.persistence.document_storage import PostgresDocumentStorage
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")


@pytest.fixture
def store() -> PostgresStore:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    return PostgresStore(DirectPostgresConnector(DATABASE_URL))


def test_bytes_round_trip_and_never_change(store: PostgresStore) -> None:
    storage = PostgresDocumentStorage(store)
    key = DocumentVersionId(str(uuid.uuid4()))

    storage.put(key, b"XGPON coverage")
    storage.put(key, b"XGPON coverage")  # The same bytes again are accepted.

    assert PostgresDocumentStorage(store).get(key) == b"XGPON coverage"
    with pytest.raises(DocumentStorageError, match="different immutable bytes"):
        storage.put(key, b"other bytes")


def test_tampered_bytes_fail_their_integrity_check(store: PostgresStore) -> None:
    storage = PostgresDocumentStorage(store)
    key = DocumentVersionId(str(uuid.uuid4()))
    storage.put(key, b"original")
    with store.connection() as connection:
        connection.execute(
            "UPDATE knowledge_document_blobs SET content=%s WHERE document_version_id=%s",
            (b"tampered", key.value),
        )

    with pytest.raises(DocumentStorageError, match="integrity"):
        storage.get(key)


def test_a_rolled_back_upload_leaves_no_bytes(store: PostgresStore) -> None:
    storage = PostgresDocumentStorage(store)
    key = DocumentVersionId(str(uuid.uuid4()))
    storage.put(key, b"draft")

    storage.delete(key)

    with pytest.raises(DocumentNotFoundError):
        storage.get(key)
