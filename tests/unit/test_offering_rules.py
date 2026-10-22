"""A product is not a system: offering rules, and saying what a waited-for name is."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_extractor import ProposedChange
from knowledge_portal.application.use_cases.catalogue_candidates import _canonical
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, SystemDefinition
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    DETAILED_SYSTEM_PROMPT,
    LEAN_SYSTEM_PROMPT,
)

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
OFFERING = ProductOffering("bpp", "Business Pro Plus", rules=("Up to 300 users",))
DRAFT = ArchitectureKnowledge(
    "draft", 1, (SystemDefinition("bcrm", "BCRM"),), (), products=(OFFERING,)
)
RULE = "Bundles get only Fortinet 90G or 120G CPE models"


def test_an_offering_rule_waits_for_its_offering_and_joins_its_rules() -> None:
    rule = CandidateContent(CandidateKind.OFFERING_RULE, "business-pro-plus", text=RULE)
    stray = CandidateContent(CandidateKind.OFFERING_RULE, "business-pro", text=RULE)

    assert classify(rule, DRAFT) is CandidateMatch.NEW
    assert classify(stray, DRAFT) is CandidateMatch.NEEDS_OFFERING
    with pytest.raises(CandidateDependencyError):
        apply_candidate(stray, DRAFT)
    ruled = apply_candidate(rule, DRAFT)
    assert ruled.products[0].rules == ("Up to 300 users", RULE)
    assert classify(rule, ruled) is CandidateMatch.ALREADY_PRESENT


def _change(content: CandidateContent, source: str = "") -> ProposedChange:
    return ProposedChange(content, ("table 17, row 3",), "quote", source_name=source)


def test_a_reading_never_suggests_an_offering_as_a_system() -> None:
    changes = (
        _change(
            CandidateContent(CandidateKind.SYSTEM, "business-pro-plus", name="Business Pro Plus")
        ),
        _change(
            CandidateContent(CandidateKind.CONSTRAINT, "business-pro-plus", text=RULE),
            "Business Pro Plus",
        ),
        _change(CandidateContent(CandidateKind.CONSTRAINT, "bcrm", text="Read-only at night")),
        _change(CandidateContent(CandidateKind.SYSTEM, "order-hub", name="Order Hub")),
    )

    kept = _canonical(changes, DRAFT)

    assert [(item.content.kind, item.content.system_id) for item in kept] == [
        (CandidateKind.OFFERING_RULE, "bpp"),
        (CandidateKind.CONSTRAINT, "bcrm"),
        (CandidateKind.SYSTEM, "order-hub"),
    ]
    assert kept[0].content.text == RULE


def test_an_offering_suggested_beside_it_takes_the_rules_too() -> None:
    offering = ProductOffering("b-pro-plus", "Business Pro Plus")
    changes = (
        _change(
            CandidateContent(
                CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
            )
        ),
        _change(
            CandidateContent(CandidateKind.CONSTRAINT, "business-pro-plus", text=RULE),
            "Business Pro Plus",
        ),
    )
    draft = ArchitectureKnowledge("draft", 1, (), ())

    kept = _canonical(changes, draft)

    assert kept[1].content == CandidateContent(CandidateKind.OFFERING_RULE, "b-pro-plus", text=RULE)


def test_the_prompt_keeps_products_out_of_systems() -> None:
    for prompt in (DETAILED_SYSTEM_PROMPT, LEAN_SYSTEM_PROMPT):
        assert "product_offering, never a system" in prompt
        assert "- offering_rule: a stated limitation or rule for one product offering" in prompt


def _read(client: TestClient, body: bytes) -> tuple[str, list[dict[str, Any]]]:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "B.Pro+", "expected_revision": draft["revision"]},
        files={"file": ("design.txt", body, "text/plain")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    return base, client.get(f"{base}/suggestions", headers=OWNER).json()["suggestions"]


SOURCE = f"System: Business Pro Plus\nConstraint: {RULE}\n".encode()


def test_a_system_said_to_be_an_offering_takes_its_constraints_along(client: TestClient) -> None:
    base, suggestions = _read(client, SOURCE)
    assert {item["content"]["kind"] for item in suggestions} == {"system", "constraint"}

    settled = client.post(
        f"{base}/suggestions/subject",
        json={"system_id": "business-pro-plus", "name": "Business Pro Plus", "kind": "offering"},
        headers=OWNER,
    )

    assert settled.status_code == 200, settled.text
    assert settled.json() == {"retyped": 2, "added": 0}
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    kinds = {item["content"]["kind"]: item for item in listing["suggestions"]}
    assert set(kinds) == {"product", "offering_rule"}
    assert kinds["offering_rule"]["match"] == "needs_offering"
    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()
    assert accepted["remaining"] == 0
    offering = next(
        item for item in accepted["release"]["products"] if item["name"] == "Business Pro Plus"
    )
    assert offering["rules"] == [RULE]
    assert all(item["name"] != "Business Pro Plus" for item in accepted["release"]["systems"])


def test_a_name_nothing_suggests_can_be_suggested_as_either(client: TestClient) -> None:
    base, suggestions = _read(client, SOURCE)
    system = next(item for item in suggestions if item["content"]["kind"] == "system")
    revision = client.get(f"{base}/suggestions", headers=OWNER).json()["release_revision"]
    client.post(
        f"{base}/suggestions/{system['id']}/decision",
        json={"expected_revision": revision, "accept": False},
        headers=OWNER,
    )
    subject = {"system_id": "business-pro-plus", "name": "Business Pro Plus"}

    as_system = client.post(
        f"{base}/suggestions/subject", json=subject | {"kind": "system"}, headers=OWNER
    )
    assert as_system.json() == {"retyped": 0, "added": 1}
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()["suggestions"]
    added = next(
        item
        for item in listing
        if item["content"]["kind"] == "system" and item["status"] == "proposed"
    )
    assert added["citations"][0]["quote"] == f"Constraint: {RULE}"

    as_offering = client.post(
        f"{base}/suggestions/subject", json=subject | {"kind": "offering"}, headers=OWNER
    )
    assert as_offering.json() == {"retyped": 2, "added": 0}
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()["suggestions"]
    assert sorted(item["content"]["kind"] for item in listing if item["status"] == "proposed") == [
        "offering_rule",
        "product",
    ]

    unknown = client.post(
        f"{base}/suggestions/subject",
        json={"system_id": "nothing", "kind": "offering"},
        headers=OWNER,
    )
    assert unknown.status_code == 404
