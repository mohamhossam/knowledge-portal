"""What a version holds that nothing links to, and offerings and journeys that a reading
would take for one another (review recommendation 17)."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.domain.architecture.coverage import Orphan, coverage
from knowledge_portal.domain.architecture.interface_links import call_systems
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.vocabularies import VocabularyScheme, VocabularyTerm
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
RELEASES = "/architecture-knowledge/releases"


def _smb() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def test_the_committed_catalogue_leaves_nothing_unlinked() -> None:
    found = coverage(_smb())

    # Its document types are named by the library, not by the version, so none is unused.
    assert found.total == 0


def test_a_capability_with_no_concept_and_no_reason_is_unlinked() -> None:
    release = _smb()
    system = next(item for item in release.systems if len(item.capabilities) >= 2)
    first, second, *rest = system.capabilities
    changed = replace(
        system,
        capabilities=(
            replace(first, concept_id=None, unlinked_reason=None),
            replace(second, concept_id=None, unlinked_reason="A vendor feature, no business one"),
            *rest,
        ),
    )
    release = replace(
        release,
        systems=tuple(changed if item.id == system.id else item for item in release.systems),
    )

    assert coverage(release).unlinked_capabilities == (
        Orphan(first.id, first.name, system.id, system.name),
    )


def test_a_term_nothing_names_is_unused_unless_a_narrower_one_is_used() -> None:
    release = _smb()
    entity = next(
        term
        for term in release.vocabulary
        if term.scheme == VocabularyScheme.INFORMATION_ENTITY
        and any(term.id in system.masters for system in release.systems)
    )
    heading = VocabularyTerm("entity-held", VocabularyScheme.INFORMATION_ENTITY, "Held data")
    loyalty = VocabularyTerm("entity-loyalty", VocabularyScheme.INFORMATION_ENTITY, "Loyalty")
    gone = VocabularyTerm(
        "entity-voucher", VocabularyScheme.INFORMATION_ENTITY, "Voucher", deprecated=True
    )
    vocabulary = tuple(
        replace(term, broader_id=heading.id) if term.id == entity.id else term
        for term in release.vocabulary
    )
    release = replace(release, vocabulary=(heading, *vocabulary, loyalty, gone))

    assert coverage(release).unused_terms == (
        Orphan(loyalty.id, "Loyalty", "information_entity", "information entity"),
    )


def test_an_interface_nobody_consumes_or_goes_through_is_unconsumed() -> None:
    release = _smb()
    relayed = {relayed for item in release.interfaces for relayed in item.relays}
    # A journey step that goes through an interface record shows that someone calls it.
    journey, position, through = next(
        (journey, position, item)
        for journey in release.journeys
        for position, link in enumerate(journey.integrations)
        for item in release.interfaces
        if item.system_id in call_systems(journey, link) and item.id not in relayed
    )
    lonely = next(
        item for item in release.interfaces if item.id not in relayed and item.id != through.id
    )
    steps = list(journey.integrations)
    steps[position] = replace(steps[position], interface_id=through.id)
    release = replace(
        release,
        interfaces=tuple(
            replace(item, consumer_ids=()) if item.id in {lonely.id, through.id} else item
            for item in release.interfaces
        ),
        journeys=tuple(
            replace(item, integrations=tuple(steps)) if item.id == journey.id else item
            for item in release.journeys
        ),
    )
    exposer = next(item.name for item in release.systems if item.id == lonely.system_id)

    assert coverage(release).unconsumed_interfaces == (
        Orphan(lonely.id, lonely.name, lonely.system_id, exposer),
    )


def test_a_system_outside_the_landscape_is_unplaced_unless_retired() -> None:
    release = _smb()
    first, second, *rest = release.systems
    release = replace(
        release,
        systems=(
            replace(first, landscape_domain_id=None),
            replace(second, landscape_domain_id=None, deprecated=True),
            *rest,
        ),
    )

    assert coverage(release).unplaced_systems == (Orphan(first.id, first.name),)


# Offerings and journeys a reading would take for one another --------------------------------


def test_two_offerings_cannot_share_a_name_or_code() -> None:
    release = _smb()
    (offering,) = release.products
    twin = replace(
        offering,
        id="business-pro-plus-2027",
        name="Business Pro-Plus",
        code="BPP27",
        former_ids=(),
        accepted=(),
    )
    with pytest.raises(InvalidKnowledgeError, match="already names Business Pro Plus"):
        replace(release, products=(offering, twin))

    # A code is a label too: "B. Pro+" reads as another offering's code.
    coded = replace(twin, name="Business Pro 2027", code="B Pro")
    with pytest.raises(InvalidKnowledgeError, match="'B Pro' already names Business Pro Plus"):
        replace(release, products=(offering, coded))

    distinct = replace(twin, name="Business Pro 2027", code="BP27")
    assert len(replace(release, products=(offering, distinct)).products) == 2


def test_two_journeys_of_one_offering_cannot_share_a_name() -> None:
    release = _smb()
    journey = next(item for item in release.journeys if item.product_id)
    twin = replace(journey, id=f"{journey.id}-copy", name=journey.name.upper(), former_ids=())

    with pytest.raises(InvalidKnowledgeError, match="for the same offering"):
        replace(release, journeys=(*release.journeys, twin))
    with pytest.raises(InvalidKnowledgeError, match="one names no offering"):
        replace(
            release,
            journeys=(*release.journeys, replace(twin, product_id=None, order_type_code=None)),
        )


def test_journeys_of_different_offerings_may_share_a_name() -> None:
    release = _smb()
    (offering,) = release.products
    other = replace(
        offering, id="business-lite", name="Business Lite", code="B. Lite", former_ids=()
    )
    journey = next(item for item in release.journeys if item.product_id == offering.id)
    twin = replace(
        journey,
        id=f"{journey.id}-lite",
        product_id=other.id,
        order_type_code=None,
        former_ids=(),
    )

    built = replace(release, products=(offering, other), journeys=(*release.journeys, twin))
    assert twin in built.journeys


# The endpoint ---------------------------------------------------------------------------------


def test_the_endpoint_lists_them_for_maintainers_only(client: TestClient) -> None:
    draft = client.post(RELEASES, json={"name": "Next"}).json()
    root = f"{RELEASES}/{draft['id']}"
    imported = client.post(
        f"{root}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": (CATALOGUE.name, CATALOGUE.read_bytes(), "application/yaml")},
    )
    assert imported.status_code == 200, imported.text

    listed = client.get(f"{root}/coverage")
    assert listed.status_code == 200
    assert listed.json() == {
        "unlinked_capabilities": [],
        "unused_terms": [],
        "unconsumed_interfaces": [],
        "unplaced_systems": [],
    }

    refused = client.get(f"{root}/coverage", headers={"X-Fake-Actor-Id": "fake-reviewer"})
    assert refused.status_code == 403
    assert client.get(f"{RELEASES}/nowhere/coverage").status_code == 404
