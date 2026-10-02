"""Immutable document bytes, in memory or in PostgreSQL (`knowledge_document_blobs`)."""

from __future__ import annotations

import hashlib
from copy import deepcopy
from threading import RLock
from typing import Any

from smb_kernel.documents.ports import DocumentStoragePort

from knowledge_portal.application.errors import DocumentNotFoundError, DocumentStorageError
from knowledge_portal.domain.document.value_objects import DocumentVersionId
from knowledge_portal.infrastructure.persistence.postgres_session import PostgresSession
from knowledge_portal.infrastructure.persistence.postgres_values import _integer


class InMemoryDocumentStorage(DocumentStoragePort):
    """Blobs, some written outside any unit of work, so the store takes the shared graph lock.

    An architecture upload stores its blob before its own save. Without the lock
    that write could land inside a transaction another thread owns, which would
    count it as its own write and roll the blob back.
    """

    def __init__(self, *, lock: RLock | None = None) -> None:
        self._blobs: dict[str, bytes] = {}
        self._lock = lock or RLock()

    def snapshot_state(self) -> Any:
        return deepcopy((self._blobs,))

    def restore_state(self, state: Any) -> None:
        (self._blobs,) = deepcopy(state)

    def put(self, version_id: DocumentVersionId, content: bytes) -> None:
        immutable = bytes(content)
        with self._lock:
            stored = self._blobs.get(version_id.value)
            if stored is not None and stored != immutable:
                raise DocumentStorageError(
                    f"Document content {version_id.value!r} is immutable and cannot be replaced."
                )
            self._blobs[version_id.value] = immutable

    def get(self, version_id: DocumentVersionId) -> bytes:
        with self._lock:
            content = self._blobs.get(version_id.value)
        if content is None:
            raise DocumentNotFoundError(f"Document content {version_id.value!r} was not found.")
        return content

    def delete(self, version_id: DocumentVersionId) -> None:
        with self._lock:
            self._blobs.pop(version_id.value, None)


class PostgresDocumentStorage(DocumentStoragePort):
    """Store immutable document bytes in the caller's PostgreSQL unit of work."""

    def __init__(self, store: PostgresSession) -> None:
        self._store = store

    def put(self, version_id: DocumentVersionId, content: bytes) -> None:
        checksum = hashlib.sha256(content).hexdigest()
        with self._store.connection() as connection:
            connection.execute(
                """
                INSERT INTO knowledge_document_blobs
                    (document_version_id, checksum_sha256, size_bytes, content)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (document_version_id) DO NOTHING
                """,
                (version_id.value, checksum, len(content), content),
            )
            row = connection.execute(
                """
                SELECT checksum_sha256, size_bytes, content FROM knowledge_document_blobs
                WHERE document_version_id=%s
                """,
                (version_id.value,),
            ).fetchone()
            stored_content = _stored_bytes(row[2]) if row is not None else b""
            if (
                row is None
                or str(row[0]) != checksum
                or _integer(row[1]) != len(content)
                or hashlib.sha256(stored_content).hexdigest() != checksum
            ):
                raise DocumentStorageError(
                    "Document version ID already refers to different immutable bytes."
                )

    def get(self, version_id: DocumentVersionId) -> bytes:
        with self._store.connection() as connection:
            row = connection.execute(
                """
                SELECT content, checksum_sha256, size_bytes FROM knowledge_document_blobs
                WHERE document_version_id=%s
                """,
                (version_id.value,),
            ).fetchone()
        if row is None:
            raise DocumentNotFoundError(f"Document content {version_id.value!r} was not found.")
        content = _stored_bytes(row[0])
        if len(content) != _integer(row[2]) or hashlib.sha256(content).hexdigest() != str(row[1]):
            raise DocumentStorageError("Stored document bytes failed their integrity check.")
        return content

    def delete(self, version_id: DocumentVersionId) -> None:
        """Remove a blob only when its surrounding application action is rolling back."""
        with self._store.connection() as connection:
            connection.execute(
                "DELETE FROM knowledge_document_blobs WHERE document_version_id=%s",
                (version_id.value,),
            )


def _stored_bytes(value: object) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, (bytearray, memoryview)):
        return bytes(value)
    raise DocumentStorageError("Stored document content is not binary data.")
