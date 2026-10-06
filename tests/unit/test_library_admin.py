"""A knowledge admin acting on a library document they don't own (Knowledge Center C).

Without a grant an admin sees where someone else's document stands, never its content. With
one, given with a reason, they may review, approve, reassign or withdraw it on the owner's
behalf for eight hours; each change names them and the reason, and is recorded with the
state before and after. Builds stay with the owner.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import RLock

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.library_admin import LibraryAdminAction
from knowledge_portal.application.ports.requirement_dependents import RequirementDependentsPage
from knowledge_portal.application.use_cases.document_library import (
    CHUNKING_POLICY,
    DocumentLibrary,
)
from knowledge_portal.application.use_cases.documents import UploadDocumentInput
from knowledge_portal.application.use_cases.library_admin import (
    AdministerLibraryDocument,
    LibraryStewardship,
)
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.application.use_cases.reference_knowledge import (
    ReferenceKnowledge,
    StructureAwareChunks,
)
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.library import (
    AdminOverride,
    IngestionStage,
    LibraryDocument,
    OwnershipTransfer,
    ReviewedPassage,
)
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.actor_directory import InMemoryActorDirectory
from knowledge_portal.infrastructure.persistence.document_library import InMemoryDocumentLibrary
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from knowledge_portal.infrastructure.persistence.library_admin import (
    InMemoryLibraryAdmin,
    InMemoryLibraryAdminRecord,
)
from knowledge_portal.infrastructure.persistence.reference_index import (
    InMemoryReferenceIndex,
    Utf8BudgetCounter,
)
from tests.unit.test_document_library import Embeddings, owner

NOW = datetime(2026, 10, 6, 9, tzinfo=UTC)
ADMIN = ActorProfile(ActorId("ada-admin"), "Ada Admin", roles=frozenset({"knowledge_admin"}))
NOT_ADMIN = ActorProfile(ActorId("nils-reader"), "Nils Reader")
NEW_OWNER = ActorProfile(ActorId("nadia-new"), "Nadia New")


@dataclass
class Library:
    clock: FixedClock
    documents: DocumentLibrary
    knowledge: ReferenceKnowledge
    governance: LibraryGovernance
    admin: AdministerLibraryDocument
    store: InMemoryLibraryAdmin


@pytest.fixture
def library() -> Library:
    lock = RLock()
    repository = InMemoryDocumentLibrary(lock)
    storage = InMemoryDocumentStorage()
    index = InMemoryReferenceIndex(lock, repository)
    store = InMemoryLibraryAdmin(lock)
    transactions = InMemoryTransactionManager(lock)
    transactions.enroll(repository, storage, index, store)
    clock = FixedClock(NOW)
    record = InMemoryLibraryAdminRecord(store)
    stewardship = LibraryStewardship(store, record, clock)
    documents = DocumentLibrary(
        repository,
        storage,
        SafeDocumentTextExtractor(),
        OfflineDocumentScanner(),
        transactions,
        clock,
        100000,
        stewardship,
    )
    knowledge = ReferenceKnowledge(
        repository,
        index,
        Embeddings(),
        StructureAwareChunks(Utf8BudgetCounter()),
        transactions,
        clock,
        "test-model",
        stewardship,
    )
    governance = LibraryGovernance(
        repository,
        InMemoryActorDirectory((NEW_OWNER,)),
        transactions,
        clock,
        _NoDependents(),
        stewardship,
    )
    admin = AdministerLibraryDocument(repository, store, record, stewardship, transactions, clock)
    return Library(clock, documents, knowledge, governance, admin, store)


class _NoDependents:
    def proposals(
        self, actor_id: ActorId, document_id: str, offset: int, limit: int
    ) -> RequirementDependentsPage:
        raise AssertionError("Not asked in these tests.")


def _awaiting_review(library: Library) -> LibraryDocument:
    """The owner's document, read and waiting for their review."""
    document = library.documents.submit(
        "Coverage policy",
        UploadDocumentInput("p.txt", "text/plain", b"Coverage required.\nPrivate appendix."),
        "awaiting-review",
        owner(),
    )
    assert library.documents.process_next()
    return document


def _review_and_approve(library: Library, document_id: str, actor: ActorProfile) -> LibraryDocument:
    # The owner's view gives the passages; `actor` is who reviews and approves them.
    view = library.documents.get(document_id, owner())
    version = view.versions[-1]
    reviewed = library.documents.review(
        document_id,
        version.id,
        view.version,
        actor,
        tuple(ReviewedPassage(b.id, b.text or "", True) for b in version.blocks),
        "Checked against the source",
    )
    revision = reviewed.versions[-1].revisions[-1]
    return library.documents.approve(
        document_id,
        version.id,
        revision.id,
        revision.fingerprint(version.id, CHUNKING_POLICY),
        reviewed.version,
        actor,
    )


def test_without_a_grant_an_admin_sees_where_it_stands_but_none_of_its_content(
    library: Library,
) -> None:
    document = _awaiting_review(library)
    view = library.documents.get(document.id, ADMIN)
    assert not view.can_edit and view.acting_as_admin is None
    # Nothing is published yet, so no version and no text leaves; only where it stands.
    assert view.versions == ()
    assert view.newest is not None and view.newest.stage is IngestionStage.READY
    # The admin's list shows someone else's unpublished work; a non-admin's does not.
    assert [item.id for item in library.documents.list(ADMIN)] == [document.id]
    assert library.documents.list(NOT_ADMIN) == ()
    with pytest.raises(AuthorizationDeniedError):
        _review_and_approve(library, document.id, ADMIN)
    with pytest.raises(AuthorizationDeniedError):
        library.documents.original(document.id, document.versions[0].id, ADMIN)
    with pytest.raises(AuthorizationDeniedError):
        library.knowledge.preview_review(document.id, ADMIN)


def test_with_a_grant_an_admin_reviews_and_approves_on_the_owners_behalf(
    library: Library,
) -> None:
    document = _awaiting_review(library)
    grant = library.admin.open(document.id, ADMIN, "  Owner on leave; policy due today.  ")
    assert grant.reason == "Owner on leave; policy due today."
    assert grant.expires_at == NOW + timedelta(hours=8)

    view = library.documents.get(document.id, ADMIN)
    assert view.can_edit and not view.is_owner and view.acting_as_admin == grant
    assert view.versions[-1].blocks, "the owner's view, to review from"
    approved = _review_and_approve(library, document.id, ADMIN)

    override = AdminOverride(ADMIN.snapshot(), grant.reason)
    assert approved.versions[-1].revisions[-1].on_behalf == override
    assert approved.publications[-1].approved_by == ADMIN.snapshot()
    assert approved.publications[-1].on_behalf == override
    assert approved.owner == owner().snapshot(), "the owner keeps the document"

    record = library.admin.history(document.id, ADMIN)
    assert [r.action for r in record] == [
        LibraryAdminAction.APPROVE,
        LibraryAdminAction.REVIEW,
        LibraryAdminAction.GRANT,
    ]
    assert all(r.admin == ADMIN.snapshot() and r.reason == grant.reason for r in record)
    approval = record[0]
    assert approval.before is not None and approval.after is not None
    assert approval.after["version"] == approved.version
    assert approval.before["owner_id"] == approval.after["owner_id"] == "library-owner"


def test_builds_stay_with_the_owner_even_under_a_grant(library: Library) -> None:
    document = _awaiting_review(library)
    library.admin.open(document.id, ADMIN, "Owner on leave.")
    with pytest.raises(AuthorizationDeniedError, match="corpus builds"):
        library.knowledge.preview_build(document.id, ADMIN)
    # Reading the original to review it is allowed.
    library.documents.original(document.id, document.versions[0].id, ADMIN)


def test_an_admin_withdraws_and_hands_over_on_the_owners_behalf(library: Library) -> None:
    document = _awaiting_review(library)
    _review_and_approve(library, document.id, owner())
    grant = library.admin.open(document.id, ADMIN, "Superseded by the 2027 policy.")
    current = library.documents.get(document.id, ADMIN)
    withdrawn = library.documents.withdraw(document.id, current.version, ADMIN, "Superseded.")
    publication = withdrawn.publications[-1]
    assert publication.withdrawn_by == ADMIN.snapshot()
    assert publication.withdrawn_on_behalf == AdminOverride(ADMIN.snapshot(), grant.reason)

    change = library.governance.transfer(
        document.id, ADMIN, NEW_OWNER.id, withdrawn.version, "Nadia runs policy now."
    )
    assert change.performed_by == ADMIN.snapshot()
    assert change.previous_owner == owner().snapshot()
    assert change.new_owner == NEW_OWNER.snapshot()
    assert change.on_behalf == AdminOverride(ADMIN.snapshot(), grant.reason)

    record = library.admin.history(document.id, ADMIN)
    assert [r.action for r in record[:2]] == [
        LibraryAdminAction.REASSIGN,
        LibraryAdminAction.WITHDRAW,
    ]
    handover = record[0]
    assert handover.before and handover.after
    assert (handover.before["owner_id"], handover.after["owner_id"]) == (
        "library-owner",
        "nadia-new",
    )
    # Anyone acting on a document they own is not an override, and is not recorded as one.
    assert library.governance.history(document.id, ADMIN) == (change,)


def test_an_owners_own_withdrawal_names_them_and_is_not_an_override(library: Library) -> None:
    document = _awaiting_review(library)
    approved = _review_and_approve(library, document.id, owner())
    withdrawn = library.documents.withdraw(document.id, approved.version, owner(), "Retired.")
    assert withdrawn.publications[-1].withdrawn_by == owner().snapshot()
    assert withdrawn.publications[-1].withdrawn_on_behalf is None
    assert library.admin.history(document.id, ADMIN) == ()


def test_a_grant_lasts_eight_hours_and_ends_when_asked(library: Library) -> None:
    document = _awaiting_review(library)
    library.admin.open(document.id, ADMIN, "Owner on leave.")
    library.clock.set(NOW + timedelta(hours=8))
    assert library.documents.get(document.id, ADMIN).acting_as_admin is None
    with pytest.raises(AuthorizationDeniedError):
        _review_and_approve(library, document.id, ADMIN)
    # An expired grant ends quietly; a live one is recorded as ended.
    library.admin.end(document.id, ADMIN)
    again = library.admin.open(document.id, ADMIN, "Still on leave.")
    assert library.documents.get(document.id, ADMIN).acting_as_admin == again
    library.admin.end(document.id, ADMIN)
    assert library.documents.get(document.id, ADMIN).acting_as_admin is None
    assert [r.action for r in library.admin.history(document.id, ADMIN)] == [
        LibraryAdminAction.END,
        LibraryAdminAction.GRANT,
        LibraryAdminAction.GRANT,
    ]


def test_opening_again_replaces_the_grant(library: Library) -> None:
    document = _awaiting_review(library)
    first = library.admin.open(document.id, ADMIN, "First reason.")
    library.clock.set(NOW + timedelta(hours=1))
    second = library.admin.open(document.id, ADMIN, "Second reason.")
    assert second.id != first.id
    assert library.documents.get(document.id, ADMIN).acting_as_admin == second


def test_only_an_admin_who_does_not_own_it_opens_a_grant(library: Library) -> None:
    document = _awaiting_review(library)
    with pytest.raises(AuthorizationDeniedError):
        library.admin.open(document.id, NOT_ADMIN, "Curious.")
    owner_admin = ActorProfile(owner().id, "Owner", roles=frozenset({"knowledge_admin"}))
    with pytest.raises(InvalidDocumentError, match="You own this document"):
        library.admin.open(document.id, owner_admin, "Mine.")
    with pytest.raises(InvalidDocumentError, match="reason"):
        library.admin.open(document.id, ADMIN, "   ")
    with pytest.raises(AuthorizationDeniedError):
        library.admin.history(document.id, NOT_ADMIN)


def test_a_non_owner_transfer_or_approval_needs_an_override_in_the_domain() -> None:
    previous, admin = owner().snapshot(), ADMIN.snapshot()
    with pytest.raises(InvalidDocumentError, match="admin on their behalf"):
        OwnershipTransfer(previous, NEW_OWNER.snapshot(), admin, NOW, "Handover")
    OwnershipTransfer(
        previous,
        NEW_OWNER.snapshot(),
        admin,
        NOW,
        "Handover",
        AdminOverride(admin, "Owner on leave."),
    )
    # The override must name the admin who acted.
    with pytest.raises(InvalidDocumentError):
        OwnershipTransfer(
            previous,
            NEW_OWNER.snapshot(),
            admin,
            NOW,
            "Handover",
            AdminOverride(NEW_OWNER.snapshot(), "Not them."),
        )
