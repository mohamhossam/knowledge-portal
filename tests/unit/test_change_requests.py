"""Change requests from Requirement AI (requirement-portal ADR-0101, step 7)."""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.use_cases.change_requests import read_change_request
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    accept_from_change_request,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.change_requests import (
    ChangeItem,
    ChangeOrigin,
    ChangeRequestRecord,
    ChangeRequestStateError,
    IncomingChangeRequest,
    IncomingContext,
    IncomingFeature,
    IncomingSystem,
    RequirementTrace,
    TracedFeature,
    change_request_id,
)
from knowledge_portal.domain.architecture.diff import ChangedItem, diff_releases
from knowledge_portal.domain.architecture.governance import OpenQuestion
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    KnowledgeReleaseStatus,
)
from knowledge_portal.domain.architecture.products import OrderType, ProductOffering
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

EXPORT = Path(__file__).resolve().parents[1] / "fixtures" / "requirement_ai_backlog_export.json"
TOKEN = "r" * 40
REQUIREMENTS = {"Authorization": f"Bearer {TOKEN}"}
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
AT = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
OFFERING = ProductOffering(
    "BUSINESS_PRO_PLUS",
    "Business Pro Plus",
    order_types=(OrderType("NEW", "New Activation"), OrderType("UPDOWN", "Up / Downgrade")),
)
TRACE = RequirementTrace(
    requirement_id="REQ-2026-0412",
    breakdown_revision=3,
    approval_id="APR-77",
    epic_id="EP-1",
    epic_name="Microsoft 365 for Business Pro Plus",
    approved_by="Layla Haddad",
    approved_at=datetime(2026, 10, 3, 8, 5, tzinfo=UTC),
    features=(TracedFeature("FT-1", "Offer Microsoft 365"),),
    knowledge_version="smb-source-reference-v1",
)


def _incoming(**changes: Any) -> IncomingChangeRequest:
    fields: dict[str, Any] = {
        "id": "CR-20261003-Business_Pro_Plus",
        "approval_id": "APR-77",
        "subject_fingerprint": "sha256:abc",
        "title": "Microsoft 365 for Business Pro Plus",
        "trace": TRACE,
        "features": (
            IncomingFeature(
                "FT-1",
                1,
                "Offer Microsoft 365",
                "Customers add Microsoft 365 at activation.",
                (
                    IncomingContext("PO-BPP", "Business Pro Plus", "New Activation"),
                    IncomingContext("PO-BPP", "Business Pro Plus", "Change plan"),
                ),
                (IncomingSystem("B2B Web", "b2b-web"), IncomingSystem("Licence Hub", "APP-9")),
            ),
            IncomingFeature("FT-2", 2, "Welcome email", None, (), ()),
            IncomingFeature(
                "FT-3",
                3,
                "Office bundle",
                None,
                (IncomingContext(None, "Office Presence", None),),
                (),
            ),
        ),
        "received_at": AT,
    }
    return IncomingChangeRequest(**{**fields, **changes})


def _draft(**changes: Any) -> ArchitectureKnowledge:
    fields: dict[str, Any] = {"status": KnowledgeReleaseStatus.DRAFT, "products": (OFFERING,)}
    return replace(seed_knowledge(), **{**fields, **changes})


def test_a_change_request_is_named_as_the_original_explorer_named_it() -> None:
    day = date(2026, 10, 4)
    assert change_request_id(day, "Business Pro Plus") == "CR-20261004-Business_Pro_Plus"
    assert (
        change_request_id(day, "Business Pro Plus", ("cr-20261004-business_pro_plus",))
        == "CR-20261004-Business_Pro_Plus-2"
    )
    assert TRACE.sentence() == (
        "Requirement AI requirement REQ-2026-0412, revision 3, approved by Layla Haddad on "
        "3 October 2026"
    )


def test_an_incoming_change_request_is_read_or_dismissed_and_a_dismissal_stays() -> None:
    incoming = _incoming()
    read = incoming.read("draft-1", "fake-owner", AT)
    assert (read.status.value, read.read_into) == ("read", "draft-1")

    dismissed = incoming.dismiss("Already in the catalogue.", "fake-owner", AT)
    with pytest.raises(ChangeRequestStateError, match="dismissed"):
        dismissed.read("draft-1", "fake-owner", AT)
    with pytest.raises(ChangeRequestStateError, match="a dismissal stays"):
        dismissed.dismiss("Again.", "fake-owner", AT)
    with pytest.raises(InvalidKnowledgeError, match="Why it is dismissed"):
        incoming.dismiss(" ", "fake-owner", AT)
    with pytest.raises(InvalidKnowledgeError, match="at least one approved feature"):
        _incoming(features=())


def test_each_approved_feature_asks_the_offering_it_names_and_says_what_it_could_not_match() -> (
    None
):
    candidates, warnings = read_change_request(_incoming(), _draft(), AT, "smb-source-reference-v1")

    (asked, waits) = candidates
    question = asked.content.question
    assert asked.content.kind is CandidateKind.QUESTION
    assert asked.content.system_id == "BUSINESS_PRO_PLUS"
    assert question is not None
    assert question.id == "REQ-2026-0412/FT-1"
    assert question.text == "Offer Microsoft 365: Customers add Microsoft 365 at activation."
    assert question.order_types == ("NEW",)
    assert question.impact == "Systems the mapping names: B2B Web, Licence Hub."
    assert question.source == "CR-20261003-Business_Pro_Plus Feature FT-1"
    assert asked.citations[0].location == "Feature FT-1"
    assert asked.change_request is not None and asked.change_request.feature_id == "FT-1"
    assert asked.document_version_id == "CR-20261003-Business_Pro_Plus"
    # An offering the draft does not have is kept as written; its question waits for it.
    assert waits.content.system_id == "Office Presence"
    assert classify(waits.content, _draft()) is CandidateMatch.NEEDS_OFFERING
    assert warnings == (
        "FT-1: Licence Hub is not in the draft, so the question names it as the mapping wrote it.",
        "FT-1: Business Pro Plus has no order type 'Change plan', so the question is asked "
        "of the offering as a whole.",
        "FT-2: its mapping names no offering, so “Welcome email” asks nothing of the catalogue.",
        "FT-3: the offering 'Office Presence' is not in the draft; its question waits for it.",
    )


def test_a_question_already_asked_is_left_out_and_a_changed_one_updates_it() -> None:
    (asked, _), _ = read_change_request(_incoming(), _draft(), AT)
    assert asked.content.question is not None
    with_question = apply_candidate(asked.content, _draft())

    candidates, warnings = read_change_request(_incoming(), with_question, AT)
    assert [item.content.system_id for item in candidates] == ["Office Presence"]
    assert "1 question already in the draft was left out." in warnings

    reworded = replace(asked.content.question, text="Offer Microsoft 365 E3 instead.")
    updated = CandidateContent(CandidateKind.QUESTION, "BUSINESS_PRO_PLUS", question=reworded)
    assert classify(updated, with_question) is CandidateMatch.UPDATES_EXISTING
    (offering,) = apply_candidate(updated, with_question).products
    assert [item.text for item in offering.questions] == ["Offer Microsoft 365 E3 instead."]


def test_accepting_registers_the_change_request_as_a_source_and_records_it_in_the_history() -> None:
    (asked, waits), _ = read_change_request(_incoming(), _draft(), AT)

    accepted = accept_from_change_request(_draft(), asked.content, _incoming(), "FT-1", AT)

    (source,) = accepted.sources
    assert (source.id, source.level.value, source.version) == (
        "CR-20261003-Business_Pro_Plus",
        "L2",
        "3",
    )
    assert source.authority == (
        "Requirement AI requirement REQ-2026-0412, revision 3, approved by Layla Haddad on "
        "3 October 2026."
    )
    (offering,) = accepted.products
    assert offering.sources == ("CR-20261003-Business_Pro_Plus",)
    (record,) = accepted.change_history
    assert (record.id, record.product_id, record.requester, record.applied_at) == (
        "CR-20261003-Business_Pro_Plus",
        "BUSINESS_PRO_PLUS",
        "Layla Haddad",
        AT,
    )
    assert [(item.feature_id, item.summary) for item in record.items] == [
        (
            "FT-1",
            "Asks of Business Pro Plus (New Activation): Offer Microsoft 365: Customers add "
            "Microsoft 365 at activation.",
        )
    ]
    # Accepting the same feature again replaces its item rather than adding a second.
    again = accept_from_change_request(accepted, asked.content, _incoming(), "FT-1", AT)
    assert len(again.change_history[0].items) == 1
    with pytest.raises(CandidateDependencyError, match="Office Presence"):
        accept_from_change_request(_draft(), waits.content, _incoming(), "FT-3", AT)


def test_a_question_asked_for_an_order_type_the_offering_lacks_is_refused() -> None:
    question = OpenQuestion("Q-1", "Is it in scope?", order_types=("CEASE",))
    with pytest.raises(InvalidKnowledgeError, match="order type 'CEASE'"):
        replace(OFFERING, questions=(question,))


def test_change_history_is_compared_and_round_trips_in_every_catalogue_file() -> None:
    accepted = accept_from_change_request(
        _draft(),
        read_change_request(_incoming(), _draft(), AT)[0][0].content,
        _incoming(),
        "FT-1",
        AT,
    )
    explorer = ChangeRequestRecord(
        "CR-20261004-Business_Pro_Plus",
        "Optional Microsoft 365 add-on",
        ChangeOrigin.EXPLORER,
        product_id="BUSINESS_PRO_PLUS",
        requester="SMB Product Management",
        priority="High",
        target_date="2027-01-31",
        applied_at=datetime(2026, 10, 4, tzinfo=UTC),
        items=(ChangeItem("rule", "A rule"),),
        gaps=("Not mappable.",),
    )
    release = replace(accepted, change_history=(*accepted.change_history, explorer))

    changes = diff_releases(_draft(), release).changes
    assert {(item.item, item.key) for item in changes} >= {
        (ChangedItem.CHANGE_REQUEST, "CR-20261003-Business_Pro_Plus"),
        (ChangedItem.CHANGE_REQUEST, "CR-20261004-Business_Pro_Plus"),
    }
    adapter = CatalogueFileAdapter()
    for file_format in CatalogueFileFormat:
        content = adapter.read(file_format, adapter.write(file_format, release))
        assert content.change_history == release.change_history, file_format
        assert content.products == release.products, file_format
    # A file with no change history keeps the draft's own when imported.
    bare = adapter.read(CatalogueFileFormat.JSON, json.dumps({"systems": []}).encode())
    assert bare.change_history is None


# The routes: delivery, the inbox, reading into a draft, accepting.


@pytest.fixture
def served() -> Iterator[tuple[Container, TestClient]]:
    container = build_container(replace(FAKE_PROVIDER_SETTINGS, requirement_service_token=TOKEN))
    with TestClient(create_app(lambda: container)) as client:
        yield container, client


def _export(**manifest: Any) -> dict[str, Any]:
    raw: dict[str, Any] = json.loads(EXPORT.read_text(encoding="utf-8"))
    raw["manifest"]["final_approval"]["recorded_by"]["email"] = "layla.haddad@example.com"
    raw["manifest"].update(manifest)
    return raw


def test_requirement_portal_delivers_once_per_approval(
    served: tuple[Container, TestClient],
) -> None:
    _, client = served
    assert client.post("/internal/change-requests", json=_export()).status_code == 401

    first = client.post("/internal/change-requests", json=_export(), headers=REQUIREMENTS)
    assert first.status_code == 201, first.text
    assert first.json() == {
        "change_request_id": "CR-20261003-Business_Pro_Plus",
        "approval_id": "APR-77",
        "created": True,
    }
    again = client.post("/internal/change-requests", json=_export(), headers=REQUIREMENTS)
    assert (again.status_code, again.json()["created"]) == (200, False)

    other = _export()
    other["manifest"]["final_approval"]["subject_fingerprint"] = "sha256:other"
    assert (
        client.post("/internal/change-requests", json=other, headers=REQUIREMENTS).status_code
        == 409
    )
    newer = _export()
    newer["schema_version"] = "2.0"
    refused = client.post("/internal/change-requests", json=newer, headers=REQUIREMENTS)
    assert refused.status_code == 422 and "schema_version" in refused.text


def test_an_admin_reads_a_change_request_into_a_new_draft_and_accepts_its_question(
    served: tuple[Container, TestClient],
) -> None:
    _, client = served
    client.post("/internal/change-requests", json=_export(), headers=REQUIREMENTS)
    inbox = client.get("/architecture-knowledge/change-requests", headers=OWNER).json()
    (item,) = inbox["change_requests"]
    assert (item["status"], item["trace"]["approved_by"]) == ("waiting", "Layla Haddad")
    # Only the name of who approved it is kept, never their email.
    assert "layla.haddad@example.com" not in json.dumps(item)
    observer = {"X-Fake-Actor-Id": "fake-observer"}
    assert (
        client.get("/architecture-knowledge/change-requests", headers=observer).status_code == 403
    )

    reading = client.post(
        f"/architecture-knowledge/change-requests/{item['id']}/reading", headers=OWNER
    )
    assert reading.status_code == 200, reading.text
    draft = reading.json()["release"]
    assert draft["name"] == item["id"] and draft["status"] == "draft"
    assert reading.json()["change_request"]["read_into"] == draft["id"]
    # The fixture's offering is not in the seed: its questions wait for it, and say why.
    assert any("not in the draft" in warning for warning in reading.json()["run"]["warnings"])

    body = {
        "expected_revision": draft["revision"],
        "systems": draft["systems"],
        "relationships": draft["relationships"],
        "products": [
            {
                "id": "PO-BPP",
                "name": "Business Pro Plus",
                "order_types": [{"code": "NEW", "name": "New Activation"}],
            }
        ],
    }
    saved = client.put(f"/architecture-knowledge/releases/{draft['id']}", json=body, headers=OWNER)
    assert saved.status_code == 200, saved.text
    suggestions = client.get(
        f"/architecture-knowledge/releases/{draft['id']}/suggestions", headers=OWNER
    ).json()
    asked = next(
        each
        for each in suggestions["suggestions"]
        if each["change_request"] and each["change_request"]["feature_id"] == "FT-1"
    )
    assert asked["match"] == "new"
    accepted = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/suggestions/{asked['id']}/decision",
        json={"expected_revision": saved.json()["revision"], "accept": True},
        headers=OWNER,
    )
    assert accepted.status_code == 200, accepted.text
    release = accepted.json()
    assert [source["id"] for source in release["sources"]] == [item["id"]]
    assert release["products"][0]["sources"] == [item["id"]]
    assert release["products"][0]["questions"][0]["order_types"] == ["NEW"]
    (record,) = release["change_history"]
    assert (record["id"], record["requester"], record["items"][0]["feature_id"]) == (
        item["id"],
        "Layla Haddad",
        "FT-1",
    )


def test_a_dismissed_change_request_cannot_be_read(served: tuple[Container, TestClient]) -> None:
    _, client = served
    client.post("/internal/change-requests", json=_export(), headers=REQUIREMENTS)
    url = "/architecture-knowledge/change-requests/CR-20261003-Business_Pro_Plus"

    assert client.post(f"{url}/dismissal", json={"reason": ""}, headers=OWNER).status_code == 422
    dismissed = client.post(
        f"{url}/dismissal", json={"reason": "Covered by CR-20261004."}, headers=OWNER
    )
    assert dismissed.status_code == 200 and dismissed.json()["dismissed_by"] == "fake-owner"
    assert client.post(f"{url}/reading", headers=OWNER).status_code == 409
    assert client.post(f"{url}/dismissal", json={"reason": "x"}, headers=OWNER).status_code == 409
    assert (
        client.post(
            "/architecture-knowledge/change-requests/CR-none/reading", headers=OWNER
        ).status_code
        == 404
    )
