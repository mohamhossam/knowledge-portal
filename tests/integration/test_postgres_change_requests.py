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
    ChangeRequestKind,
    DeliveredChange,
    DeliveredChangeKind,
    DeliveryTrace,
    IncomingChangeRequest,
    IncomingContext,
    IncomingFeature,
    IncomingStatus,
    PredictedSystem,
    RequirementTrace,
    UndeliveredFeature,
)
from knowledge_portal.domain.architecture.drafts import OfferingDraft
from knowledge_portal.domain.architecture.governance import OpenQuestion
from knowledge_portal.domain.architecture.journeys import Activity, Journey
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
    OfferingComponent,
    OrderType,
    ProductOffering,
    SourceConfidence,
)
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_change_requests import (
    PostgresChangeRequests,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

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
    inbox = PostgresChangeRequests(PostgresStore(DirectPostgresConnector(DATABASE_URL)))
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


def test_a_catalogue_change_round_trips_with_what_was_delivered() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    inbox = PostgresChangeRequests(PostgresStore(DirectPostgresConnector(DATABASE_URL)))
    delivery_id = f"REQ-1:4711:{uuid4().hex}"
    item = replace(
        _incoming(),
        approval_id=f"delivery:{delivery_id}",
        kind=ChangeRequestKind.CATALOGUE_CHANGE,
        delivery=DeliveryTrace(
            delivery_id=delivery_id,
            epic_external_id="4711",
            closed_at=NOW,
            release_id="smb-source-reference-v1",
            impact_version="ANA-1@7",
            decision="accepted",
            verdict="change_existing_offering",
            offering_id="PO-BPP",
            predicted=(PredictedSystem("bcrm", "BCRM", "primary", "modify"),),
            not_delivered=(UndeliveredFeature("FT-2", "Bill it", "Removed"),),
            changes=(
                DeliveredChange(
                    DeliveredChangeKind.REALISE_CONCEPT,
                    "cap:static-ip",
                    "Static IP",
                    ("FT-1",),
                    system_id="bcrm",
                ),
            ),
        ),
    )

    kept, created = inbox.receive(item)

    assert created and inbox.get(item.id) == kept == item
    withdrawn = item.withdraw(NOW)
    inbox.save(withdrawn, IncomingStatus.WAITING)
    assert inbox.get(item.id) == withdrawn


def test_an_approved_backlog_round_trips_with_its_drafted_offering() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    inbox = PostgresChangeRequests(PostgresStore(DirectPostgresConnector(DATABASE_URL)))
    offering = ProductOffering(
        "cloud-voice",
        "Cloud Voice",
        order_types=(OrderType("NEW", "New Activation"),),
        components=(
            OfferingComponent(
                "sip",
                "SIP trunk",
                responsibilities=(ComponentResponsibility("cwom", "Delivers", "Trunks calls."),),
                capability_ids=("cap-voice",),
                confidence=SourceConfidence.INFERRED,
            ),
        ),
        questions=(OpenQuestion("realise-recording", "Which system will record calls?"),),
    )
    journey = Journey(
        "cloud-voice-new",
        "New activation",
        "cloud-voice",
        "NEW",
        activities=(
            Activity("10", "SIP trunk", performing_system_id="cwom", component_ids=("sip",)),
        ),
    )
    item = replace(_incoming(), draft=OfferingDraft(offering, journey, "business-pro-plus"))

    kept, created = inbox.receive(item)

    assert created and inbox.get(item.id) == kept == item
