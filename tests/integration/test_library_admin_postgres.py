"""Admin grants and the admin record in PostgreSQL (Knowledge Center C)."""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.persistence.connector import DirectPostgresConnector
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.library_admin import LibraryAdminAction
from knowledge_portal.application.ports.requirement_dependents import RequirementDependentsPage
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.documents import UploadDocumentInput
from knowledge_portal.application.use_cases.library_admin import (
    AdministerLibraryDocument,
    LibraryStewardship,
)
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.domain.document.library import AdminOverride
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.actor_directory import InMemoryActorDirectory
from knowledge_portal.infrastructure.persistence.document_library import PostgresDocumentLibrary
from knowledge_portal.infrastructure.persistence.document_storage import (
    PostgresDocumentStorage,
)
from knowledge_portal.infrastructure.persistence.library_admin import (
    PostgresLibraryAdminGrants,
    PostgresLibraryAdminRecord,
)
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not configured"
)


class _NoDependents:
    def proposals(
        self, actor_id: ActorId, document_id: str, offset: int, limit: int
    ) -> RequirementDependentsPage:
        raise AssertionError("Not asked.")


def test_grants_overrides_and_the_record_survive_a_restart() -> None:
    run_migrations(os.environ["TEST_DATABASE_URL"])
    store = PostgresStore(DirectPostgresConnector(os.environ["TEST_DATABASE_URL"]))
    now = datetime(2026, 10, 6, 9, tzinfo=UTC)
    clock = FixedClock(now)
    repository = PostgresDocumentLibrary(store)
    grants, record = PostgresLibraryAdminGrants(store), PostgresLibraryAdminRecord(store)
    stewardship = LibraryStewardship(grants, record, clock)
    library = DocumentLibrary(
        repository,
        PostgresDocumentStorage(store),
        SafeDocumentTextExtractor(),
        OfflineDocumentScanner(),
        store,
        clock,
        100000,
        stewardship,
    )
    unique = uuid.uuid4().hex
    owner = ActorProfile(ActorId(f"owner-{unique}"), "Original owner")
    target = ActorProfile(ActorId(f"target-{unique}"), "New owner")
    admin = ActorProfile(
        ActorId(f"admin-{unique}"), "Ada Admin", roles=frozenset({"knowledge_admin"})
    )
    governance = LibraryGovernance(
        repository,
        InMemoryActorDirectory((target,)),
        store,
        clock,
        _NoDependents(),
        stewardship,
    )
    service = AdministerLibraryDocument(repository, grants, record, stewardship, store, clock)
    document = library.submit(
        "Handover", UploadDocumentInput("policy.txt", "text/plain", b"Policy"), unique, owner
    )
    assert document.id in {d.id for d in repository.list_all(0, 10_000)}

    first = service.open(document.id, admin, "Owner on leave.")
    restarted = PostgresLibraryAdminGrants(store)
    assert restarted.open_grant(document.id, admin.id.value) == first
    # Opening again ends the first grant: one open grant per admin and document.
    clock.set(now + timedelta(minutes=5))
    second = service.open(document.id, admin, "Still on leave.")
    assert restarted.open_grant(document.id, admin.id.value) == second

    change = governance.transfer(document.id, admin, target.id, document.version, "Custodian")
    assert change.on_behalf == AdminOverride(admin.snapshot(), "Still on leave.")
    stored = PostgresDocumentLibrary(store).get(document.id)
    assert stored is not None and stored.ownership_history == (change,)

    service.end(document.id, admin)
    assert restarted.open_grant(document.id, admin.id.value) is None

    history = PostgresLibraryAdminRecord(store).for_document(document.id, 50)
    assert [item.action for item in history] == [
        LibraryAdminAction.END,
        LibraryAdminAction.REASSIGN,
        LibraryAdminAction.GRANT,
        LibraryAdminAction.GRANT,
    ]
    handover = history[1]
    assert handover.admin == admin.snapshot() and handover.reason == "Still on leave."
    assert handover.document_ids == (document.id,)
    assert handover.before == {
        "owner_id": owner.id.value,
        "owner_name": "Original owner",
        "published_id": None,
        "version": document.version,
    }
    assert handover.after is not None and handover.after["owner_id"] == target.id.value
