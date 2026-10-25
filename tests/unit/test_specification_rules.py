"""A CFSS or RFSS keeps its own rules; none of them is an offering's (ADR-0127)."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.diff import diff_releases
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.products import (
    LAYER_LABEL,
    RealisationLayer,
    realisation_layer,
)
from knowledge_portal.domain.architecture.realisations import RealisationRecord
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
RULE = "One Service Order should include from one to two Uplink uCPE Services."
UPLINK = RealisationRecord("cfs-cfss-uplink-ucpe", RealisationLayer.CFS, "CFSS_UPLINK_UCPE")
DRAFT = ArchitectureKnowledge("draft", 1, (), (), realisations=(UPLINK,))


def test_the_layers_are_named_cfss_and_rfss_and_read_either_way() -> None:
    assert LAYER_LABEL == {
        RealisationLayer.CFS: "CFSS",
        RealisationLayer.RFS: "RFSS",
        RealisationLayer.RESOURCE: "resource",
    }
    assert realisation_layer("CFSS") is RealisationLayer.CFS
    assert realisation_layer("Resource Facing Service Specification") is RealisationLayer.RFS
    assert realisation_layer("cfs") is RealisationLayer.CFS
    with pytest.raises(InvalidKnowledgeError, match="CFSS, RFSS or resource"):
        realisation_layer("product")


def test_a_specification_holds_its_rules_and_a_resource_none() -> None:
    record = RealisationRecord("rfs-x", RealisationLayer.RFS, "RFS_X", rules=("Refers to a Place",))
    assert record.rules == ("Refers to a Place",)
    with pytest.raises(InvalidKnowledgeError, match="rules belong to a CFSS or an RFSS"):
        RealisationRecord("res-x", RealisationLayer.RESOURCE, "Box", rules=("Mounted in a rack",))
    with pytest.raises(InvalidKnowledgeError, match="more than once"):
        RealisationRecord("rfs-x", RealisationLayer.RFS, "RFS_X", rules=("A rule", "a  RULE"))


def test_a_specification_rule_waits_for_its_record_then_joins_its_rules() -> None:
    rule = CandidateContent(CandidateKind.SPECIFICATION_RULE, "cfss-uplink-ucpe", text=RULE)
    stray = CandidateContent(CandidateKind.SPECIFICATION_RULE, "cfss-nothing", text=RULE)

    assert classify(rule, DRAFT) is CandidateMatch.NEW
    assert classify(stray, DRAFT) is CandidateMatch.NEEDS_REALISATION
    with pytest.raises(CandidateDependencyError, match="CFSS or RFSS"):
        apply_candidate(stray, DRAFT)
    ruled = apply_candidate(rule, DRAFT)
    assert ruled.realisations[0].rules == (RULE,)
    assert classify(rule, ruled) is CandidateMatch.ALREADY_PRESENT
    changes = diff_releases(DRAFT, ruled).changes
    assert [(item.key, item.fields) for item in changes] == [("cfs-cfss-uplink-ucpe", ("rules",))]


def test_catalogue_files_carry_a_specifications_rules() -> None:
    ruled = ArchitectureKnowledge(
        "draft",
        1,
        (),
        (),
        realisations=(
            RealisationRecord(UPLINK.id, RealisationLayer.CFS, UPLINK.name, rules=(RULE,)),
        ),
    )
    adapter = CatalogueFileAdapter()
    for format in (CatalogueFileFormat.YAML, CatalogueFileFormat.XLSX):
        read = adapter.read(format, adapter.write(format, ruled))
        assert read.realisations[0].rules == (RULE,), format


def _draft_with_reading(client: TestClient, body: bytes) -> tuple[str, list[dict[str, Any]]]:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "First version"}, headers=OWNER
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    uploaded = client.post(
        f"{base}/documents",
        data={"title": "uCPE design", "expected_revision": draft["revision"]},
        files={"file": ("design.txt", body, "text/plain")},
        headers=OWNER,
    ).json()
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    return base, client.get(f"{base}/suggestions", headers=OWNER).json()["suggestions"]


SOURCE = f"System: CFSS_UPLINK_UCPE\nConstraint: {RULE}\n".encode()


def _add_uplink(client: TestClient, base: str) -> None:
    release = client.get(base, headers=OWNER).json()
    saved = client.put(
        base,
        json={
            "expected_revision": release["revision"],
            "systems": release["systems"],
            "relationships": release["relationships"],
            "realisations": [{"id": UPLINK.id, "layer": "cfs", "name": UPLINK.name}],
        },
        headers=OWNER,
    )
    assert saved.status_code == 200, saved.text


def test_a_rule_read_of_a_specification_the_draft_has_is_its_rule(client: TestClient) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    _add_uplink(client, base)
    revision = client.get(base, headers=OWNER).json()["revision"]
    uploaded = client.post(
        f"{base}/documents",
        data={"title": "uCPE design", "expected_revision": revision},
        files={"file": ("design.txt", SOURCE, "text/plain")},
        headers=OWNER,
    ).json()
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    suggestions = client.get(f"{base}/suggestions", headers=OWNER).json()["suggestions"]

    # Neither a system nor an offering: one rule of the CFSS, ready to accept.
    assert [(item["content"]["kind"], item["content"]["system_id"]) for item in suggestions] == [
        ("specification_rule", UPLINK.id)
    ]
    assert suggestions[0]["match"] == "new"


def test_rules_waiting_as_an_offering_s_are_settled_as_the_specification_s(
    client: TestClient,
) -> None:
    base, suggestions = _draft_with_reading(client, SOURCE)
    assert {item["content"]["kind"] for item in suggestions} == {"system", "constraint"}
    _add_uplink(client, base)
    subject = {"system_id": "cfss-uplink-ucpe", "name": "CFSS_UPLINK_UCPE", "kind": "specification"}

    unnamed = client.post(f"{base}/suggestions/subject", json=subject, headers=OWNER)
    assert unnamed.status_code == 422
    missing = client.post(
        f"{base}/suggestions/subject", json=subject | {"specification_id": "nope"}, headers=OWNER
    )
    assert missing.status_code == 404

    settled = client.post(
        f"{base}/suggestions/subject",
        json=subject | {"specification_id": UPLINK.id},
        headers=OWNER,
    )

    assert settled.status_code == 200, settled.text
    assert settled.json() == {"retyped": 1, "added": 0}
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    by_kind = {item["content"]["kind"]: item for item in listing["suggestions"]}
    assert by_kind["system"]["status"] == "rejected"
    assert by_kind["specification_rule"]["content"]["system_id"] == UPLINK.id
    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()
    assert accepted["remaining"] == 0
    (record,) = accepted["release"]["realisations"]
    assert record["rules"] == [RULE]
    assert all(item["name"] != "CFSS_UPLINK_UCPE" for item in accepted["release"]["systems"])
