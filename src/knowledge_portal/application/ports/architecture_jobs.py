"""Durable work queue for catalogue indexing and extraction."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from knowledge_portal.application.errors import PersistenceError

_KEY_SEPARATOR = "|"


class ArchitectureJobKind(StrEnum):
    INDEX = "index"
    EXTRACTION = "extraction"


class ArchitectureJobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class IndexJobInput:
    """What an index build was queued against."""

    revision: int
    embedding_profile: str

    @property
    def key(self) -> str:
        return f"{self.revision}{_KEY_SEPARATOR}{self.embedding_profile}"

    @classmethod
    def from_key(cls, key: str) -> IndexJobInput:
        revision, separator, profile = key.partition(_KEY_SEPARATOR)
        if not separator or not revision.isdigit() or not profile:
            raise PersistenceError("Stored architecture index job input is malformed.")
        return cls(int(revision), profile)


@dataclass(frozen=True)
class ExtractionJobInput:
    """Which draft document is read, and by which model and prompt."""

    document_version_id: str
    extraction_profile: str

    @property
    def key(self) -> str:
        return f"{self.document_version_id}{_KEY_SEPARATOR}{self.extraction_profile}"

    @classmethod
    def from_key(cls, key: str) -> ExtractionJobInput:
        version_id, separator, profile = key.partition(_KEY_SEPARATOR)
        if not separator or not version_id or not profile:
            raise PersistenceError("Stored catalogue extraction job input is malformed.")
        return cls(version_id, profile)


@dataclass(frozen=True)
class ArchitectureJob:
    id: str
    kind: ArchitectureJobKind
    subject_id: str
    # The job input's key: jobs with the same kind, subject and key are one job.
    fingerprint: str
    actor_id: str
    status: ArchitectureJobStatus
    attempts: int = 0
    error_category: str | None = None
    lease_until: datetime | None = None


class ArchitectureJobRepositoryPort(Protocol):
    def enqueue(self, job: ArchitectureJob) -> ArchitectureJob: ...

    def get(self, job_id: str) -> ArchitectureJob | None: ...

    def for_subject(
        self, kind: ArchitectureJobKind, subject_id: str
    ) -> tuple[ArchitectureJob, ...]:
        """Jobs of one kind for one subject, least recently changed first."""
        ...

    def claim(self, now: datetime) -> ArchitectureJob | None: ...

    def heartbeat(self, job_id: str, attempt: int, now: datetime) -> bool: ...

    def finish(
        self,
        job_id: str,
        attempt: int,
        status: ArchitectureJobStatus,
        error_category: str | None,
    ) -> None: ...

    def cancel(self, job_id: str) -> ArchitectureJob: ...

    def retry(self, job_id: str) -> ArchitectureJob: ...
