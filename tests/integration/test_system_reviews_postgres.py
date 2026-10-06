"""Catalogue systems' review confirmations in PostgreSQL (Knowledge Center D)."""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.application.ports.library_admin import (
    LibraryAdminAction,
    LibraryAdminRecord,
)
from knowledge_portal.domain.identity.entities import ActorId, ActorSnapshot
from knowledge_portal.domain.shared.review import AdminOverride, ReviewConfirmation
from knowledge_portal.infrastructure.persistence.library_admin import PostgresLibraryAdminRecord
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore
from knowledge_portal.infrastructure.persistence.system_reviews import PostgresSystemReviews

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not configured"
)


def test_confirmations_round_trip_newest_wins_and_the_record_takes_confirm_review() -> None:
    run_migrations(os.environ["TEST_DATABASE_URL"])
    store = PostgresStore(DirectPostgresConnector(os.environ["TEST_DATABASE_URL"]))
    reviews = PostgresSystemReviews(store)
    unique = uuid.uuid4().hex
    first, second = f"bcrm-{unique}", f"brm-{unique}"
    when = datetime(2026, 10, 6, 9, tzinfo=UTC)
    maintainer = ActorSnapshot(ActorId("max"), "Max Maintainer")
    admin = ActorSnapshot(ActorId("ada"), "Ada Admin")
    with store.transaction():
        reviews.add((first, second), ReviewConfirmation(when, maintainer, "Checked."))
        reviews.add(
            (first,),
            ReviewConfirmation(
                when + timedelta(days=1), admin, None, AdminOverride(admin, "Annual sign-off.")
            ),
        )
    restarted = PostgresSystemReviews(store)
    latest = restarted.latest((first, second, f"none-{unique}"))
    assert set(latest) == {first, second}
    assert latest[first].reviewer == admin
    assert latest[first].on_behalf == AdminOverride(admin, "Annual sign-off.")
    assert latest[second] == ReviewConfirmation(when, maintainer, "Checked.")
    assert [item.reviewer for item in restarted.history(first, 10)] == [admin, maintainer]
    assert restarted.latest(()) == {}
    with store.transaction():
        PostgresLibraryAdminRecord(store).add(
            LibraryAdminRecord(
                uuid.uuid4().hex,
                LibraryAdminAction.CONFIRM_REVIEW,
                (f"doc-{unique}",),
                admin,
                "Owner away.",
                when,
            )
        )
