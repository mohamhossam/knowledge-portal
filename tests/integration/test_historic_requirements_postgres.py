"""Historic Requirements and their import queue in PostgreSQL (Knowledge Center E)."""

import os
import uuid
from dataclasses import replace
from datetime import UTC, datetime

import pytest
from smb_kernel.documents.model import DocumentEvidenceBlock, EvidenceBlockKind
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.application.ports.architecture_jobs import (
    ArchitectureJob,
    ArchitectureJobKind,
    ArchitectureJobStatus,
)
from knowledge_portal.application.ports.historic_requirements import (
    HistoricRequirementConflictError,
)
from knowledge_portal.application.ports.knowledge_events import HISTORIC_REQUIREMENT_CHANGED
from knowledge_portal.domain.historic.historic_requirement import (
    HistoricBrd,
    HistoricRequirement,
    HistoricStatus,
    ImportRun,
    RunKind,
)
from knowledge_portal.domain.historic.work_items import Breakdown, WorkItem, WorkItemType
from knowledge_portal.domain.identity.entities import ActorId, ActorSnapshot
from knowledge_portal.infrastructure.persistence.historic_requirements import (
    PostgresHistoricRequirements,
)
from knowledge_portal.infrastructure.persistence.knowledge_events import PostgresKnowledgeEvents
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_architecture_jobs import (
    PostgresArchitectureJobs,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not configured"
)

NOW = datetime(2026, 10, 6, 9, tzinfo=UTC)
ADA = ActorSnapshot(ActorId("ada"), "Ada Admin")


def _record(unique: str) -> HistoricRequirement:
    brd = HistoricBrd(
        f"brd-{unique}", f"BRD {unique}.docx", "application/pdf", 10, unique * 2, NOW, ADA
    )
    record = HistoricRequirement.start(f"h-{unique}", brd, ADA, NOW)
    block = DocumentEvidenceBlock(
        "b1", EvidenceBlockKind.PARAGRAPH, 1, ("Scope",), "paragraph 1", "a" * 64, "Epic 48213."
    )
    record = record.brd_read(brd.id, (block,), (), "test-v1")
    run = ImportRun(f"run-{unique}", RunKind.FETCH, (), NOW, ADA)
    record = record.link((48213,), run)
    epic = WorkItem(48213, WorkItemType.EPIC, "XGPON bundles", "Closed", 3, "u/48213")
    return record.breakdown_read(run.id, Breakdown((48213,), (epic,), NOW), NOW)


def test_a_record_round_trips_its_publication_commits_with_its_event_and_versions_hold() -> None:
    run_migrations(os.environ["TEST_DATABASE_URL"])
    store = PostgresStore(DirectPostgresConnector(os.environ["TEST_DATABASE_URL"]))
    records = PostgresHistoricRequirements(store)
    events = PostgresKnowledgeEvents(store)
    unique = uuid.uuid4().hex
    draft = _record(unique)
    with store.transaction():
        records.add(draft)
    assert records.get(draft.id) == draft
    assert records.holding(draft.brds[0].checksum) == draft
    published = draft.publish(ADA, NOW)
    with store.transaction():
        records.save(published, draft.version)
        seq = events.append(HISTORIC_REQUIREMENT_CHANGED, draft.id, published.citable_state())
    assert PostgresHistoricRequirements(store).get(draft.id) == published
    (event,) = [e for e in events.after(seq - 1, 1) if e.seq == seq]
    assert event.payload["published"]["items"][0]["id"] == 48213  # type: ignore[index]
    with pytest.raises(HistoricRequirementConflictError):
        with store.transaction():
            records.save(replace(published, version=published.version + 1), draft.version)
    found = records.list(HistoricStatus.PUBLISHED, unique[:8], 0, 10)
    assert draft.id in {item.id for item in found}
    assert records.counts()[HistoricStatus.PUBLISHED] >= 1
    # A draft is removed only at its version.
    other = _record(uuid.uuid4().hex)
    with store.transaction():
        records.add(other)
    with pytest.raises(HistoricRequirementConflictError):
        with store.transaction():
            records.remove(other.id, other.version - 1)
    with store.transaction():
        records.remove(other.id, other.version)
    assert records.get(other.id) is None


def test_the_import_queue_has_its_own_table() -> None:
    run_migrations(os.environ["TEST_DATABASE_URL"])
    connector = DirectPostgresConnector(os.environ["TEST_DATABASE_URL"])
    historic = PostgresArchitectureJobs(connector, "historic_import_jobs")
    catalogue = PostgresArchitectureJobs(connector)
    unique = uuid.uuid4().hex
    job = historic.enqueue(
        ArchitectureJob(
            unique,
            ArchitectureJobKind.HISTORIC_READ_BRD,
            f"h-{unique}",
            f"brd-{unique}",
            "ada",
            ArchitectureJobStatus.QUEUED,
        )
    )
    assert catalogue.get(job.id) is None
    assert historic.get(job.id) == job
    with pytest.raises(ValueError, match="not a job queue"):
        PostgresArchitectureJobs(connector, "library_documents")
