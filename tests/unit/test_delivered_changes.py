"""What a closed Epic delivered, sent back as a catalogue change (ontology plan Phase 7)."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.use_cases.change_requests import (
    DeliveredEpic,
    ReceiveDelivery,
    capability_id,
    read_change_request,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.change_requests import (
    WITHDRAWN_BY,
    ChangeRequestKind,
    DeliveredChange,
    DeliveredChangeKind,
    DeliveryTrace,
    IncomingChangeRequest,
    IncomingFeature,
    IncomingStatus,
    IncomingSystem,
    PredictedSystem,
    RequirementTrace,
    TracedFeature,
    UndeliveredFeature,
    delivery_summaries,
)
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    KnowledgeCapability,
    KnowledgeReleaseStatus,
)
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.persistence.in_memory_change_requests import (
    InMemoryChangeRequests,
)
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

TOKEN = "r" * 40
REQUIREMENTS = {"Authorization": f"Bearer {TOKEN}"}
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
CLOSED_AT = datetime(2026, 10, 20, 15, 30, tzinfo=UTC)
STATIC_IP = BusinessCapability("cap:static-ip", "Static IP", ("Fixed IP",))
OFFERING = ProductOffering("offering:business-fiber", "Business Fiber")
TRACE = RequirementTrace(
    requirement_id="REQ-42",
    breakdown_revision=2,
    approval_id="APR-9",
    epic_id="EP-1",
    epic_name="Static IP quota",
    features=(TracedFeature("FT-1", "Order a static IP"),),
    knowledge_version="smb-source-reference-v1",
)


def _delivery(**changes: Any) -> DeliveryTrace:
    fields: dict[str, Any] = {
        "delivery_id": "REQ-42:4711:evt-1",
        "epic_external_id": "4711",
        "closed_at": CLOSED_AT,
        "release_id": "smb-source-reference-v1",
        "impact_version": "ANA-1@7",
        "decision": "accepted",
        "suggested_verdict": "change_existing_offering",
        "verdict": "change_existing_offering",
        "offering_id": OFFERING.id,
        "offering_name": OFFERING.name,
        "predicted": (
            PredictedSystem("bcrm", "BCRM", "primary", "modify"),
            PredictedSystem("cim", "CIM", "supporting", "configure"),
        ),
        "not_delivered": (UndeliveredFeature("FT-2", "Show the IP on the bill", "Removed"),),
        "changes": (
            DeliveredChange(
                DeliveredChangeKind.REALISE_CONCEPT,
                STATIC_IP.id,
                STATIC_IP.pref_label,
                ("FT-1",),
                system_id="bcrm",
                system_name="BCRM",
            ),
            DeliveredChange(
                DeliveredChangeKind.OFFER_CONCEPT,
                STATIC_IP.id,
                STATIC_IP.pref_label,
                ("FT-1",),
                offering_id=OFFERING.id,
                offering_name=OFFERING.name,
            ),
        ),
    }
    return DeliveryTrace(**{**fields, **changes})


def _closure(**changes: Any) -> IncomingChangeRequest:
    fields: dict[str, Any] = {
        "id": "CR-20261020-Business_Fiber",
        "approval_id": "delivery:REQ-42:4711:evt-1",
        "subject_fingerprint": "sha256:abc",
        "title": "Static IP quota",
        "trace": TRACE,
        "features": (
            IncomingFeature(
                "FT-1",
                1,
                "Order a static IP",
                "Customers order up to 4 static IPs.",
                systems=(IncomingSystem("BCRM", "bcrm"), IncomingSystem("Provisioning", "prov")),
            ),
        ),
        "received_at": CLOSED_AT,
        "kind": ChangeRequestKind.CATALOGUE_CHANGE,
        "delivery": _delivery(),
    }
    return IncomingChangeRequest(**{**fields, **changes})


def _draft(**changes: Any) -> ArchitectureKnowledge:
    fields: dict[str, Any] = {
        "status": KnowledgeReleaseStatus.DRAFT,
        "products": (OFFERING,),
        "business_capabilities": (STATIC_IP,),
    }
    return replace(seed_knowledge(), **{**fields, **changes})


def _capability(**changes: Any) -> CandidateContent:
    fields: dict[str, Any] = {
        "kind": CandidateKind.CAPABILITY,
        "system_id": "bcrm",
        "capability_id": "static-ip",
        "name": "Static IP",
        "triggers": ("Static IP", "Fixed IP"),
        "concept_ids": (STATIC_IP.id,),
    }
    return CandidateContent(**{**fields, **changes})


def _system_capabilities(release: ArchitectureKnowledge, system_id: str) -> dict[str, Any]:
    system = next(item for item in release.systems if item.id == system_id)
    return {item.id: item for item in system.capabilities}


# The domain: what a closure carries, and how it is counted.


def test_a_closure_compares_the_systems_delivered_with_those_predicted() -> None:
    hits = _closure().hits()

    assert hits is not None
    assert (hits.predicted, hits.unpredicted, hits.undelivered) == (("bcrm",), ("prov",), ("cim",))
    assert hits.delivered == 2
    # An approved backlog is not a delivery.
    assert (
        replace(_closure(), kind=ChangeRequestKind.APPROVED_BACKLOG, delivery=None).hits() is None
    )


def test_a_closure_is_consistent_with_what_it_says_was_delivered() -> None:
    with pytest.raises(InvalidKnowledgeError, match="Only a catalogue change"):
        _closure(kind=ChangeRequestKind.APPROVED_BACKLOG)
    with pytest.raises(InvalidKnowledgeError, match="Only a catalogue change"):
        _closure(delivery=None)
    stray = DeliveredChange(
        DeliveredChangeKind.REALISE_CONCEPT, "cap:x", "X", ("FT-9",), system_id="bcrm"
    )
    with pytest.raises(InvalidKnowledgeError, match="from a delivered Feature"):
        _closure(delivery=_delivery(changes=(stray,)))
    with pytest.raises(InvalidKnowledgeError, match="realised by a named system"):
        DeliveredChange(DeliveredChangeKind.REALISE_CONCEPT, "cap:x", "X", ("FT-1",))
    with pytest.raises(InvalidKnowledgeError, match="offered by a named offering"):
        DeliveredChange(DeliveredChangeKind.OFFER_CONCEPT, "cap:x", "X", ("FT-1",))
    with pytest.raises(InvalidKnowledgeError, match="names the Features"):
        DeliveredChange(DeliveredChangeKind.OFFER_CONCEPT, "cap:x", "X", (), offering_id="o")
    twice = PredictedSystem("bcrm", "BCRM")
    with pytest.raises(InvalidKnowledgeError, match="named once"):
        _delivery(predicted=(twice, twice))


def test_the_hit_rate_counts_each_epic_once_by_its_latest_closure_and_not_dismissed_ones() -> None:
    first = _closure()
    later = _closure(
        id="CR-2",
        approval_id="delivery:REQ-42:4711:evt-2",
        delivery=_delivery(delivery_id="REQ-42:4711:evt-2", closed_at=CLOSED_AT + timedelta(1)),
        features=(
            IncomingFeature(
                "FT-1", 1, "Order a static IP", systems=(IncomingSystem("BCRM", "bcrm"),)
            ),
        ),
    )
    other_release = _closure(
        id="CR-3",
        approval_id="delivery:REQ-43:4800:evt-1",
        trace=replace(TRACE, requirement_id="REQ-43"),
        delivery=_delivery(
            delivery_id="REQ-43:4800:evt-1", epic_external_id="4800", release_id="older"
        ),
    )
    dismissed = _closure(
        id="CR-4",
        approval_id="delivery:REQ-44:4900:evt-1",
        trace=replace(TRACE, requirement_id="REQ-44"),
        delivery=_delivery(delivery_id="REQ-44:4900:evt-1", epic_external_id="4900"),
    ).dismiss("Not a delivery.", "fake-owner", CLOSED_AT)

    current, older = delivery_summaries((first, later, other_release, dismissed))

    assert (current.release_id, current.deliveries) == ("smb-source-reference-v1", 1)
    assert (current.predicted, current.unpredicted, current.undelivered) == (1, 0, 1)
    assert current.last_closed_at == CLOSED_AT + timedelta(1)
    assert (older.release_id, older.delivered, older.undelivered) == ("older", 2, 1)


def test_a_withdrawn_closure_is_dismissed_by_the_app_that_sent_it() -> None:
    withdrawn = replace(_closure(), sent_by="reporting").withdraw(CLOSED_AT)

    assert withdrawn.status is IncomingStatus.DISMISSED
    assert withdrawn.dismissed_by == "reporting"
    assert "removed" in (withdrawn.dismissal_reason or "")
    # One kept before apps were named says so, rather than naming an app.
    assert _closure().withdraw(CLOSED_AT).dismissed_by == WITHDRAWN_BY


# A capability suggestion that realises a concept.


def test_a_capability_suggestion_links_the_concept_it_realises() -> None:
    draft = _draft()
    assert classify(_capability(), draft) is CandidateMatch.NEW

    applied = apply_candidate(_capability(), draft)

    added = _system_capabilities(applied, "bcrm")["static-ip"]
    assert (added.concept_id, added.triggers) == (STATIC_IP.id, ("Static IP", "Fixed IP"))
    # The system realising the concept already is all such a suggestion says.
    assert classify(_capability(capability_id="other"), applied) is CandidateMatch.ALREADY_PRESENT
    assert (
        classify(_capability(concept_ids=("cap:missing",)), draft) is CandidateMatch.NEEDS_CONCEPT
    )
    with pytest.raises(CandidateDependencyError, match="cap:missing"):
        apply_candidate(_capability(concept_ids=("cap:missing",)), draft)
    with pytest.raises(InvalidKnowledgeError, match="one concept"):
        _capability(concept_ids=(STATIC_IP.id, "cap:other"))
    with pytest.raises(InvalidKnowledgeError, match="component link or a capability"):
        CandidateContent(
            kind=CandidateKind.CONSTRAINT, system_id="bcrm", text="x", concept_ids=("c",)
        )


def test_a_capability_suggestion_keeps_the_links_a_capability_has() -> None:
    bcrm = next(item for item in seed_knowledge().systems if item.id == "bcrm")
    unlinked = KnowledgeCapability(
        "static-ip", "Static IP", ("Static IP",), unlinked_reason="Not decided by product."
    )
    linked = KnowledgeCapability("static-ip", "Static IP", ("Static IP",), concept_id="cap:old")
    old = BusinessCapability("cap:old", "Old static IP")

    def holding(capability: KnowledgeCapability) -> ArchitectureKnowledge:
        system = replace(bcrm, capabilities=(*bcrm.capabilities, capability))
        return _draft(
            systems=tuple(
                system if item.id == "bcrm" else item for item in seed_knowledge().systems
            ),
            business_capabilities=(STATIC_IP, old),
        )

    # Linking a capability marked as having no concept says a concept fits after all.
    assert classify(_capability(), holding(unlinked)) is CandidateMatch.UPDATES_EXISTING
    relinked = _system_capabilities(apply_candidate(_capability(), holding(unlinked)), "bcrm")
    assert (relinked["static-ip"].concept_id, relinked["static-ip"].unlinked_reason) == (
        STATIC_IP.id,
        None,
    )
    # A capability already linked keeps its concept: a suggestion never relinks one.
    kept = _system_capabilities(apply_candidate(_capability(), holding(linked)), "bcrm")
    assert kept["static-ip"].concept_id == "cap:old"
    assert kept["static-ip"].triggers == ("Static IP", "Fixed IP")
    # A plain capability suggestion no longer drops the link it had.
    plain = _capability(concept_ids=(), triggers=("Static IPs",))
    kept = _system_capabilities(apply_candidate(plain, holding(linked)), "bcrm")
    assert kept["static-ip"].concept_id == "cap:old"
    reason = _system_capabilities(apply_candidate(plain, holding(unlinked)), "bcrm")
    assert reason["static-ip"].unlinked_reason == "Not decided by product."


# Reading a closure into a draft.


def test_a_closure_suggests_the_capability_delivered_and_asks_the_offering_about_it() -> None:
    candidates, warnings = read_change_request(
        _closure(), _draft(), CLOSED_AT, active_id="smb-source-reference-v1"
    )

    realised, asked = candidates
    assert realised.content == _capability(capability_id=capability_id(STATIC_IP.id))
    assert classify(realised.content, _draft()) is CandidateMatch.NEW
    assert realised.change_request is not None
    assert (realised.change_request.change_request_id, realised.change_request.feature_id) == (
        "CR-20261020-Business_Fiber",
        "FT-1",
    )
    assert realised.citations[0].location == "Feature FT-1"
    question = asked.content.question
    assert asked.content.system_id == OFFERING.id and question is not None
    assert question.text == "Which component of Business Fiber now delivers Static IP?"
    assert question.impact == "Delivered by Epic 4711, Static IP quota: Order a static IP."
    assert question.source == "CR-20261020-Business_Fiber Epic 4711"
    assert warnings == (
        "Not delivered, so nothing is suggested from it: FT-2 Show the IP on the bill (Removed).",
    )


def test_reading_a_closure_says_what_it_could_not_match() -> None:
    draft = _draft(business_capabilities=(), products=())
    gone = DeliveredChange(
        DeliveredChangeKind.REALISE_CONCEPT, "cap:x", "X", ("FT-1",), system_id="gone"
    )
    closure = _closure(delivery=_delivery(changes=(*_delivery().changes, gone)))

    candidates, warnings = read_change_request(closure, draft, CLOSED_AT, active_id="v9")

    assert len(candidates) == 3
    assert [classify(item.content, draft) for item in candidates] == [
        CandidateMatch.NEEDS_CONCEPT,
        CandidateMatch.NEEDS_OFFERING,
        CandidateMatch.NEEDS_SYSTEM,
    ]
    assert any("not the version in service" in item for item in warnings)
    assert any("The concept Static IP is not in the draft" in item for item in warnings)
    assert any("'Business Fiber' is not in the draft" in item for item in warnings)
    assert any(item.startswith("gone is not in the draft") for item in warnings)

    nothing, said = read_change_request(_closure(delivery=_delivery(changes=())), draft, CLOSED_AT)
    assert nothing == () and any("nothing to suggest" in item for item in said)


def test_a_suggestion_already_in_the_draft_is_left_out() -> None:
    applied = apply_candidate(_capability(), _draft())

    candidates, warnings = read_change_request(_closure(), applied, CLOSED_AT)

    assert [item.content.kind for item in candidates] == [CandidateKind.QUESTION]
    assert "1 suggestion already in the draft was left out." in warnings


# Receiving closures and removals.


def test_a_later_closure_replaces_one_waiting_and_a_removal_withdraws_it() -> None:
    inbox = InMemoryChangeRequests()
    receive = ReceiveDelivery(inbox, FixedClock(CLOSED_AT))

    def delivered(event: str) -> DeliveredEpic:
        delivery = _delivery(delivery_id=f"REQ-42:4711:{event}")
        return DeliveredEpic(
            delivery_id=delivery.delivery_id,
            subject_fingerprint=f"sha256:{event}",
            title="Static IP quota",
            trace=TRACE,
            features=_closure().features,
            delivery=delivery,
        )

    first, created = receive.closed(delivered("evt-1"))
    assert created and first.id == "CR-20261020-Business_Fiber"
    assert receive.closed(delivered("evt-1")) == (first, False)
    second, _ = receive.closed(delivered("evt-2"))
    assert second.id == "CR-20261020-Business_Fiber-2"
    replaced = inbox.get(first.id)
    assert replaced is not None and replaced.status is IncomingStatus.DISMISSED
    assert replaced.dismissal_reason == "A later closure of its Epic replaced it."

    assert receive.removed("REQ-42", "4711") == (second.id,)
    assert receive.removed("REQ-42", "4711") == ()


def test_an_app_takes_back_only_what_it_sent() -> None:
    inbox = InMemoryChangeRequests()
    receive = ReceiveDelivery(inbox, FixedClock(CLOSED_AT))
    delivery = _delivery(delivery_id="REQ-42:4711:evt-1")
    kept, _ = receive.closed(
        DeliveredEpic(
            delivery_id=delivery.delivery_id,
            subject_fingerprint="sha256:evt-1",
            title="Static IP quota",
            trace=TRACE,
            features=_closure().features,
            delivery=delivery,
        ),
        "reporting",
    )
    assert kept.sent_by == "reporting"

    assert receive.removed("REQ-42", "4711", "another-app") == ()
    assert receive.removed("REQ-42", "4711", "reporting") == (kept.id,)


# The routes.


@pytest.fixture
def served() -> Iterator[tuple[Container, TestClient]]:
    container = build_container(replace(FAKE_PROVIDER_SETTINGS, app_tokens={"requirements": TOKEN}))
    with TestClient(create_app(lambda: container)) as client:
        yield container, client


ROUTE = "/apps/v2/change-requests/deliveries"


def _body(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "delivery_id": "REQ-42:4711:evt-1",
        "state": "closed",
        "requirement_id": "REQ-42",
        "breakdown_revision": 2,
        "approval_id": "APR-9",
        "epic": {
            "id": "EP-1",
            "name": "Static IP quota",
            "external_id": "4711",
            "url": "https://dev.azure.com/acme/smb/_workitems/edit/4711",
        },
        "occurred_at": "2026-10-20T15:30:00+00:00",
        "release_id": "smb-source-reference-v1",
        "impact_version": "ANA-1@7",
        "decision": "accepted",
        "suggested_verdict": "change_existing_offering",
        "verdict": "change_existing_offering",
        "offering_id": OFFERING.id,
        "offering_name": OFFERING.name,
        "predicted_systems": [
            {"id": "bcrm", "name": "BCRM", "role": "primary", "change_type": "modify"},
            {"id": "cim", "name": "CIM", "role": "supporting", "change_type": "configure"},
        ],
        "features": [
            {
                "id": "FT-1",
                "sequence": 1,
                "name": "Order a static IP",
                "external_id": "4712",
                "state": "Closed",
                "delivered": True,
                "systems": [{"id": "bcrm", "name": "BCRM"}],
            },
            {
                "id": "FT-2",
                "sequence": 2,
                "name": "Show the IP on the bill",
                "external_id": "4713",
                "state": "Removed",
                "delivered": False,
                "systems": [{"id": "cim", "name": "CIM"}],
            },
        ],
        "changes": [
            {
                "op": "realise_concept",
                "concept_id": STATIC_IP.id,
                "concept_label": "Static IP",
                "system_id": "bcrm",
                "system_name": "BCRM",
                "feature_ids": ["FT-1"],
            }
        ],
    }
    return {**body, **changes}


def test_requirement_work_sends_a_closed_epic_once(served: tuple[Container, TestClient]) -> None:
    _, client = served
    assert client.post(ROUTE, json=_body()).status_code == 401

    first = client.post(ROUTE, json=_body(), headers=REQUIREMENTS)
    again = client.post(ROUTE, json=_body(), headers=REQUIREMENTS)

    assert first.status_code == 201, first.text
    assert first.json() == {
        "change_request_id": "CR-20261020-Business_Fiber",
        "created": True,
        "withdrawn": [],
    }
    assert (again.status_code, again.json()["created"]) == (200, False)
    changed = client.post(ROUTE, json=_body(verdict="new_plan"), headers=REQUIREMENTS)
    assert changed.status_code == 409


@pytest.mark.parametrize(
    "changes",
    [
        {"decision": None},
        {"features": [{**_body()["features"][1]}]},
        {"state": "reopened"},
        {"changes": [{**_body()["changes"][0], "feature_ids": []}]},
        {"changes": [{**_body()["changes"][0], "feature_ids": ["FT-2"]}]},
        {"changes": [{**_body()["changes"][0], "system_id": None}]},
    ],
)
def test_a_closure_that_does_not_hold_together_is_refused(
    served: tuple[Container, TestClient], changes: dict[str, Any]
) -> None:
    _, client = served
    assert client.post(ROUTE, json=_body(**changes), headers=REQUIREMENTS).status_code == 422


def test_an_admin_sees_the_closure_and_the_hit_rate_and_reads_it_into_a_draft(
    served: tuple[Container, TestClient],
) -> None:
    _, client = served
    client.post(ROUTE, json=_body(), headers=REQUIREMENTS)

    (item,) = client.get("/architecture-knowledge/change-requests", headers=OWNER).json()[
        "change_requests"
    ]
    assert item["kind"] == "catalogue_change"
    delivery = item["delivery"]
    assert delivery["hits"] == {"predicted": ["bcrm"], "unpredicted": [], "undelivered": ["cim"]}
    assert delivery["not_delivered"] == [
        {"id": "FT-2", "name": "Show the IP on the bill", "state": "Removed"}
    ]
    assert [feature["id"] for feature in item["features"]] == ["FT-1"]

    summary = client.get("/architecture-knowledge/deliveries/summary", headers=OWNER)
    assert summary.status_code == 200, summary.text
    assert summary.json()["releases"] == [
        {
            "release_id": "smb-source-reference-v1",
            "deliveries": 1,
            "delivered": 1,
            "predicted": 1,
            "unpredicted": 0,
            "undelivered": 1,
            "last_closed_at": "2026-10-20T15:30:00Z",
        }
    ]
    observer = {"X-Fake-Actor-Id": "fake-observer"}
    denied = client.get("/architecture-knowledge/deliveries/summary", headers=observer)
    assert denied.status_code == 403

    reading = client.post(
        f"/architecture-knowledge/change-requests/{item['id']}/reading", headers=OWNER
    )
    assert reading.status_code == 200, reading.text
    run = reading.json()["run"]
    assert run["candidate_count"] == 1
    # The seed holds no concepts, so the capability waits for its concept.
    assert any("The concept Static IP is not in the draft" in each for each in run["warnings"])


def test_a_removed_epic_withdraws_its_waiting_closure(served: tuple[Container, TestClient]) -> None:
    _, client = served
    client.post(ROUTE, json=_body(), headers=REQUIREMENTS)
    removed = {
        "delivery_id": "REQ-42:4711:evt-2",
        "state": "removed",
        "requirement_id": "REQ-42",
        "breakdown_revision": 2,
        "approval_id": "APR-9",
        "epic": {"id": "EP-1", "name": "Static IP quota", "external_id": "4711"},
        "occurred_at": "2026-10-21T09:00:00+00:00",
    }

    answer = client.post(ROUTE, json=removed, headers=REQUIREMENTS)

    assert answer.status_code == 200, answer.text
    assert answer.json() == {
        "change_request_id": None,
        "created": False,
        "withdrawn": ["CR-20261020-Business_Fiber"],
    }
    (item,) = client.get("/architecture-knowledge/change-requests", headers=OWNER).json()[
        "change_requests"
    ]
    # The app that sent it took it back, by the name it is registered under.
    assert (item["status"], item["sent_by"], item["dismissed_by"]) == (
        "dismissed",
        "requirements",
        "requirements",
    )
    summary = client.get("/architecture-knowledge/deliveries/summary", headers=OWNER).json()
    assert summary["releases"] == []
