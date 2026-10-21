"""Dependencies a release's interfaces and journeys say, suggested for review (ADR-0119)."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.domain.architecture.derived_dependencies import (
    MAX_EVIDENCE,
    DerivedDependency,
    derive_dependencies,
    written_kind,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    RelationshipKind,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.neighbours import adjacent, interface_edges
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
READER = {"X-Fake-Actor-Id": "fake-reviewer"}
BASE = "/architecture-knowledge/releases"
CALLS, EVENTS = RelationshipKind.CALLS_API, RelationshipKind.PUBLISHES_EVENTS_TO


def _catalogue() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def _by_key(
    release: ArchitectureKnowledge,
) -> dict[tuple[str, str, RelationshipKind], DerivedDependency]:
    return {
        (item.source_system_id, item.target_system_id, item.kind): item
        for item in derive_dependencies(release)
    }


def test_an_apis_consumer_calls_it_and_an_events_system_sends_to_its_consumers() -> None:
    derived = _by_key(_catalogue())

    crm = derived[("b2b-web", "cbcm", CALLS)]
    assert crm.description == "CRM GW API"
    assert crm.evidence[0].location == "Catalogue › interface CRM GW API of CBCM"
    milestones = derived[("tibco", "cwom", EVENTS)]
    assert milestones.description == "Milestone (per sub-order)"
    assert ("cwom", "tibco", EVENTS) in derived


def test_a_journey_hand_over_through_an_integration_layer_is_two_dependencies() -> None:
    # Port in, step 40: CWOM asks NPS for the port request through RTF.
    derived = _by_key(_catalogue())

    relayed = [key for key in derived if key[:2] in {("cwom", "rtf"), ("rtf", "nps")}]

    assert {key[:2] for key in relayed} == {("cwom", "rtf"), ("rtf", "nps")}
    assert any(
        place.location == "Catalogue › journey Port in › step 40"
        for key in relayed
        for place in derived[key].evidence
    )
    assert ("cwom", "nps", RelationshipKind.UNSPECIFIED) not in derived


def test_one_suggestion_per_kind_with_unsaid_kinds_joining_the_pairs_only_stated_one() -> None:
    derived = _by_key(_catalogue())

    rtf_cbcm = [key for key in derived if key[:2] == ("rtf", "cbcm")]

    # "Load registry basket" says no kind; RTF calls CBCM's APIs, so it joins that one.
    assert rtf_cbcm == [("rtf", "cbcm", CALLS)]
    assert "Load registry basket" in derived[rtf_cbcm[0]].description


def test_a_dependency_said_many_times_stays_readable_and_counts_every_saying() -> None:
    busiest = max(derive_dependencies(_catalogue()), key=lambda item: len(item.evidence))

    assert len(busiest.evidence) == MAX_EVIDENCE
    assert len(busiest.description.split(";")) <= 5
    assert busiest.rationale.endswith(f"the first {MAX_EVIDENCE} of 12 places are cited.")


def test_retired_systems_and_unnamed_ends_are_left_out() -> None:
    catalogue = _catalogue()
    retired = replace(
        catalogue,
        systems=tuple(
            replace(item, deprecated=True) if item.id == "cwom" else item
            for item in catalogue.systems
        ),
    )

    derived = derive_dependencies(retired)

    assert derived
    assert all("cwom" not in (item.source_system_id, item.target_system_id) for item in derived)
    assert all(item.source_system_id != item.target_system_id for item in derived)


@pytest.mark.parametrize(
    ("style", "kind"),
    [
        ("API", CALLS),
        ("XML request", CALLS),
        ("Callback", CALLS),
        ("Event / message", EVENTS),
        ("File", RelationshipKind.TRANSFERS_DATA_TO),
        ("Database", RelationshipKind.UNSPECIFIED),
        (None, RelationshipKind.UNSPECIFIED),
    ],
)
def test_how_an_integration_is_made_says_its_kind(
    style: str | None, kind: RelationshipKind
) -> None:
    assert written_kind(style) is kind


def test_the_adjacency_fallback_reads_interfaces_the_same_way() -> None:
    catalogue = _catalogue()
    edges = interface_edges(catalogue.interfaces)

    assert SystemRelationship("tibco", "cwom", "Milestone (per sub-order)", EVENTS) in edges
    assert "cbcm" in adjacent({"b2b-web"}, edges).system_ids


def _smb_draft(client: TestClient) -> dict[str, object]:
    draft = client.post(BASE, json={"name": "Dependencies"}, headers=OWNER).json()
    imported = client.post(
        f"{BASE}/{draft['id']}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": ("catalogue.yaml", CATALOGUE.read_bytes(), "application/yaml")},
        headers=OWNER,
    )
    assert imported.status_code == 200, imported.text
    return dict(imported.json())


def test_a_maintainer_reviews_derived_dependencies_and_a_new_reading_respects_the_decisions(
    client: TestClient,
) -> None:
    draft = _smb_draft(client)
    base = f"{BASE}/{draft['id']}"
    assert client.post(f"{base}/derived-dependencies", headers=READER).status_code == 403

    run = client.post(f"{base}/derived-dependencies", headers=OWNER)

    assert run.status_code == 201, run.text
    expected = len(derive_dependencies(_catalogue()))
    assert (run.json()["reading"], run.json()["candidate_count"]) == (
        "derived_dependencies",
        expected,
    )
    suggestions = [
        item
        for item in client.get(f"{base}/suggestions", headers=OWNER).json()["suggestions"]
        if item["document_version_id"] == "derived_dependencies"
    ]
    assert len(suggestions) == expected
    assert {item["content"]["kind"] for item in suggestions} == {"relationship"}
    assert {item["basis"] for item in suggestions} == {"inferred"}
    assert all(item["rationale"].startswith("Said by ") for item in suggestions)
    assert all(item["citations"] for item in suggestions)

    def suggestion(source: str, target: str) -> dict[str, object]:
        return next(
            item
            for item in suggestions
            if (item["content"]["system_id"], item["content"]["target_system_id"])
            == (source, target)
        )

    accepted = client.post(
        f"{base}/suggestions/{suggestion('b2b-web', 'cbcm')['id']}/decision",
        json={"expected_revision": draft["revision"], "accept": True},
        headers=OWNER,
    )
    assert accepted.status_code == 200, accepted.text
    (dependency,) = accepted.json()["relationships"]
    assert (dependency["source_system_id"], dependency["kind"]) == ("b2b-web", "calls_api")
    assert dependency["accepted"][0]["model"] == "dependency-derivation"
    rejected = client.post(
        f"{base}/suggestions/{suggestion('tibco', 'cwom')['id']}/decision",
        json={"expected_revision": accepted.json()["revision"], "accept": False},
        headers=OWNER,
    )
    assert rejected.status_code == 200, rejected.text

    again = client.post(f"{base}/derived-dependencies", headers=OWNER).json()

    assert again["candidate_count"] == expected - 2
    assert again["warnings"] == [
        "1 dependency is in the draft already, so left out.",
        "1 dependency rejected before was left out.",
    ]
