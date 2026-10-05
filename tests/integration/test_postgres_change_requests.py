"""Change requests from Requirement AI are kept once per approval and decided once."""

from __future__ import annotations

import os
from dataclasses import replace
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.application.ports.change_requests import ChangeRequestConflictError
from knowledge_portal.domain.architecture.change_requests import (
    IncomingChangeRequest,
    IncomingContext,
    IncomingFeature,
    IncomingStatus,
    RequirementTrace,
)
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_change_requests import (
    PostgresChangeRequests,
)

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")
NOW = datetime(2026, 10, 5, 9, 0, tzinfo=UTC)


def _incoming() -> IncomingChangeRequest:
    approval = f"APR-{uuid4().hex}"
    return IncomingChangeRequest(
        id=f"CR-20261005-{uuid4().hex}",
        approval_id=approval,
        subject_fingerprint="sha256:abc",
        title="Microsoft 365",
        trace=RequirementTrace("REQ-1", 3, approval, "EP-1", "Microsoft 365", "Layla Haddad", NOW),
        features=(
            IncomingFeature(
                "FT-1", 1, "Offer it", None, (IncomingContext("PO-BPP", "Business Pro Plus"),)
            ),
        ),
        received_at=NOW,
    )


def test_a_change_request_is_kept_once_per_approval_and_read_or_dismissed_once() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    inbox = PostgresChangeRequests(DirectPostgresConnector(DATABASE_URL))
    item = _incoming()

    kept, created = inbox.receive(item)
    assert created and kept == item
    again, created = inbox.receive(replace(item, id=f"{item.id}-2"))
    assert not created and again == item
    with pytest.raises(ChangeRequestConflictError, match="another subject"):
        inbox.receive(replace(item, subject_fingerprint="sha256:other"))
    assert item.id in inbox.ids() and inbox.get(item.id) == item
    assert item.id in [each.id for each in inbox.list()]

    read = item.read("draft-1", "amina", NOW)
    inbox.save(read, IncomingStatus.WAITING)
    assert inbox.get(item.id) == read
    with pytest.raises(ChangeRequestConflictError, match="changed"):
        inbox.save(read.dismiss("Done.", "amina", NOW), IncomingStatus.WAITING)
