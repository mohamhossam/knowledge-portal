"""Data and interfaces (ontology plan Phase 8, ADR-0114).

Information entities systems master or read, the interfaces systems expose and consume,
and the layers that relay them: checked by the domain, carried by every catalogue file
format, the draft API and the diff, and followed by an assessment from a data or interface
change to its owners and consumers.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.requirement_assessment import (
    CatalogueTerm,
    CatalogueTerms,
    LinkedFacet,
)
from knowledge_portal.application.use_cases.assessment_lanes import catalogue_terms, graph_lane
from knowledge_portal.domain.architecture.assessment import FacetKind, PathKind, SystemRole
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.ripple import (
    data_owners,
    data_readers,
    entity_family,
    interface_owner,
    ripple,
)
from knowledge_portal.domain.architecture.vocabularies import VocabularyScheme, VocabularyTerm
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.requirement_reading import (
    FakeRequirementReader,
)

ADAPTER = CatalogueFileAdapter()
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
BASE = "/architecture-knowledge/releases"
ENTITY = VocabularyScheme.INFORMATION_ENTITY

VOCABULARY = (
    VocabularyTerm("entity-customer", ENTITY, "Customer"),
    VocabularyTerm("entity-resource", ENTITY, "Resource"),
    VocabularyTerm(
        "entity-telephone-number", ENTITY, "Telephone number", broader_id="entity-resource"
    ),
    VocabularyTerm(
        "api-tmf629", VocabularyScheme.OPEN_API, "Customer Management", notation="TMF629"
    ),
)

# CRM masters the customer and exposes it to the ESB and billing; the ESB relays it to the
# web channel; the web channel's own API reaches the app, but relays nothing.
INTERFACES = (
    SystemInterface(
        "if-crm-customer",
        "Customer API",
        "crm",
        InterfaceStyle.API,
        consumer_ids=("esb", "billing"),
        open_api_ids=("api-tmf629",),
        entity_ids=("entity-customer",),
    ),
    SystemInterface(
        "if-esb-customer",
        "getCustomer",
        "esb",
        InterfaceStyle.API,
        consumer_ids=("web",),
        entity_ids=("entity-customer",),
        relays=("if-crm-customer",),
    ),
    SystemInterface(
        "if-web-session", "Session event", "web", InterfaceStyle.EVENT, consumer_ids=("app",)
    ),
)


def _release(**changes: Any) -> ArchitectureKnowledge:
    systems = (
        SystemDefinition("crm", "CRM", masters=("entity-customer",)),
        SystemDefinition("billing", "Billing", reads=("entity-customer",)),
        SystemDefinition("esb", "ESB"),
        SystemDefinition("web", "Web"),
        SystemDefinition("app", "App"),
        SystemDefinition("inventory", "Inventory", masters=("entity-telephone-number",)),
    )
    base = ArchitectureKnowledge(
        "data", 1, systems, (), vocabulary=VOCABULARY, interfaces=INTERFACES
    )
    return replace(base, **changes)


def test_an_interface_keeps_its_own_rules() -> None:
    with pytest.raises(InvalidKnowledgeError, match="does not consume its own"):
        SystemInterface("if-a", "A", "crm", consumer_ids=("crm",))
    with pytest.raises(InvalidKnowledgeError, match="more than once"):
        SystemInterface("if-a", "A", "crm", consumer_ids=("esb", "esb"))
    with pytest.raises(InvalidKnowledgeError, match="relays itself"):
        SystemInterface("if-a", "A", "crm", relays=("if-a",))
    with pytest.raises(InvalidKnowledgeError, match="interface style is one of"):
        SystemInterface("if-a", "A", "crm", style="fax")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("interface", "message"),
    [
        (SystemInterface("if-crm-customer", "Other", "crm"), "ids must be unique"),
        (SystemInterface("if-x", "customer api", "crm"), "are named"),
        (SystemInterface("if-x", "X", "crm", consumer_ids=("erp",)), "system 'erp'"),
        (
            SystemInterface("if-x", "X", "crm", entity_ids=("api-tmf629",)),
            "not in the information entity vocabulary",
        ),
        (SystemInterface("if-x", "X", "app", relays=("if-nowhere",)), "not in the catalogue"),
        (
            SystemInterface("if-x", "X", "app", relays=("if-crm-customer",)),
            "which its system does not consume",
        ),
    ],
)
def test_a_release_checks_its_interfaces(interface: SystemInterface, message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        _release(interfaces=(*INTERFACES, interface))


def test_a_system_masters_or_reads_known_entities_never_both() -> None:
    crm = SystemDefinition("crm", "CRM", masters=("entity-customer",), reads=("entity-customer",))
    with pytest.raises(InvalidKnowledgeError, match="both masters and reads"):
        _release(systems=(crm, *_release().systems[1:]))
    stray = SystemDefinition("crm", "CRM", masters=("entity-order",))
    with pytest.raises(InvalidKnowledgeError, match="not in the information entity"):
        _release(systems=(stray, *_release().systems[1:]))


def test_a_data_change_reaches_owners_readers_and_relayed_consumers() -> None:
    release = _release()
    family = entity_family(release, "entity-customer")

    owners = data_owners(release, "entity-customer")
    reached = ripple(release, owners, family)

    assert [item.system_id for item in owners] == ["crm"]
    assert [item.system_id for item in data_readers(release, "entity-customer")] == ["billing"]
    # The ESB and billing consume CRM's API; the web channel gets it through the ESB's relay;
    # the app consumes only the web channel's own event, which relays nothing.
    assert {item.system_id: [step.id for step in item.steps] for item in reached} == {
        "esb": ["entity-customer", "crm", "if-crm-customer", "esb"],
        "billing": ["entity-customer", "crm", "if-crm-customer", "billing"],
        "web": ["entity-customer", "crm", "if-crm-customer", "esb", "if-esb-customer", "web"],
    }


def test_a_broader_entity_reaches_the_owners_of_narrower_ones() -> None:
    release = _release()

    assert entity_family(release, "entity-resource") == {
        "entity-resource",
        "entity-telephone-number",
    }
    assert [item.system_id for item in data_owners(release, "entity-resource")] == ["inventory"]


def test_an_interface_change_reaches_its_owner_and_consumers_only_through_it() -> None:
    release = _release()
    owner = interface_owner(release, "if-esb-customer")

    assert owner is not None and owner.system_id == "esb"
    assert owner.steps[0].kind is PathKind.INTERFACE
    assert [item.system_id for item in ripple(release, (owner,), None, "if-esb-customer")] == [
        "web"
    ]
    assert interface_owner(release, "if-nowhere") is None


def test_the_lanes_name_owners_and_consumers_with_their_paths() -> None:
    release = _release()
    facets = (
        LinkedFacet(FacetKind.DATA, "Customer", "customer record", "entity-customer"),
        LinkedFacet(FacetKind.INTERFACE, "Session event", "Session event", "if-web-session"),
    )

    found = {item.system_id: item for item in graph_lane(release, facets, None, "")}

    assert {key: item.role for key, item in found.items()} == {
        "crm": SystemRole.OWNER,
        "billing": SystemRole.CONSUMER,
        "esb": SystemRole.CONSUMER,
        "web": SystemRole.OWNER,
        "app": SystemRole.CONSUMER,
    }
    assert found["web"].paths[0][-1].id == "web"
    terms = catalogue_terms(release)
    assert CatalogueTerm("entity-customer", ("Customer",)) in terms.entities
    assert ("Customer API", "CRM Customer API") in [item.labels for item in terms.interfaces]


@pytest.mark.parametrize(
    ("text", "kinds"),
    [
        ("Add the VAT number to the Customer record.", {FacetKind.DATA: "entity-customer"}),
        ("Return the tier from getCustomer.", {FacetKind.INTERFACE: "if-esb-customer"}),
        ("Add a field to the Customer API.", {FacetKind.INTERFACE: "if-crm-customer"}),
        ("Send the Session event callback twice.", {FacetKind.INTERFACE: "if-web-session"}),
        # A word that is only a label, with no data or call word after it, names nothing.
        ("Every customer calls support.", {}),
    ],
)
def test_the_fake_reader_names_data_and_interfaces_only_as_written(
    text: str, kinds: dict[FacetKind, str]
) -> None:
    terms = catalogue_terms(_release())

    facets = FakeRequirementReader().facets(text, terms)

    assert {
        item.kind: item.ref_id
        for item in facets
        if item.kind in (FacetKind.DATA, FacetKind.INTERFACE)
    } == kinds


def test_a_name_inside_a_longer_one_names_no_interface() -> None:
    terms = CatalogueTerms(
        interfaces=(
            CatalogueTerm("if-order", ("Order",)),
            CatalogueTerm("if-service-order", ("Service order API",)),
        )
    )

    facets = FakeRequirementReader().facets("Change the Service order API.", terms)

    assert [item.ref_id for item in facets if item.kind is FacetKind.INTERFACE] == [
        "if-service-order"
    ]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_carries_data_and_interfaces(
    file_format: CatalogueFileFormat,
) -> None:
    release = _release()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.interfaces == release.interfaces
    assert content.systems == release.systems
    assert content.vocabulary == release.vocabulary


def test_the_diff_reports_interfaces_and_data_roles() -> None:
    base = _release()
    crm = replace(base.systems[0], masters=())
    changed = replace(INTERFACES[2], consumer_ids=("app", "esb"))
    draft = _release(
        systems=(crm, *base.systems[1:]),
        interfaces=(*INTERFACES[:2], changed),
    )

    changes = diff_releases(base, draft).changes

    assert any(
        item.item is ChangedItem.SYSTEM and item.key == "crm" and "masters" in item.fields
        for item in changes
    )
    assert any(
        item.item is ChangedItem.INTERFACE
        and item.change is ChangeKind.CHANGED
        and item.fields == ("consumer_ids",)
        for item in changes
    )
    removed = diff_releases(base, _release(interfaces=INTERFACES[:2])).changes
    assert [(item.item, item.change, item.key) for item in removed] == [
        (ChangedItem.INTERFACE, ChangeKind.REMOVED, "if-web-session")
    ]


def test_the_draft_api_stores_and_returns_data_and_interfaces(client: TestClient) -> None:
    draft = client.post(BASE, json={"name": "Data"}, headers=OWNER).json()
    body: dict[str, Any] = {
        "expected_revision": draft["revision"],
        "systems": [
            {"id": "crm", "name": "CRM", "masters": ["entity-customer"]},
            {"id": "esb", "name": "ESB", "reads": ["entity-customer"]},
            {"id": "web", "name": "Web"},
        ],
        "relationships": [],
        "vocabulary": [
            {"id": "entity-customer", "scheme": "information_entity", "pref_label": "Customer"}
        ],
        "interfaces": [
            {
                "id": "if-crm-customer",
                "name": "Customer API",
                "system_id": "crm",
                "style": "api",
                "consumer_ids": ["esb"],
                "entity_ids": ["entity-customer"],
            },
            {
                "id": "if-esb-customer",
                "name": "getCustomer",
                "system_id": "esb",
                "consumer_ids": ["web"],
                "relays": ["if-crm-customer"],
            },
        ],
    }

    saved = client.put(f"{BASE}/{draft['id']}", json=body, headers=OWNER)

    assert saved.status_code == 200, saved.text
    stored = client.get(f"{BASE}/{draft['id']}", headers=OWNER).json()
    assert stored["systems"][0]["masters"] == ["entity-customer"]
    assert stored["systems"][1]["reads"] == ["entity-customer"]
    assert [item["id"] for item in stored["interfaces"]] == ["if-crm-customer", "if-esb-customer"]
    assert stored["interfaces"][1]["relays"] == ["if-crm-customer"]
    assert stored["interfaces"][1]["style"] == "unspecified"

    # A client that predates interfaces leaves them as they are.
    kept = client.put(
        f"{BASE}/{draft['id']}",
        json={k: v for k, v in body.items() if k != "interfaces"}
        | {"expected_revision": stored["revision"]},
        headers=OWNER,
    )
    assert kept.status_code == 200, kept.text
    assert len(kept.json()["interfaces"]) == 2

    # A relay its system does not consume is the caller's mistake.
    body["expected_revision"] = kept.json()["revision"]
    body["interfaces"][1]["system_id"] = "web"
    body["interfaces"][1]["consumer_ids"] = []
    refused = client.put(f"{BASE}/{draft['id']}", json=body, headers=OWNER)
    assert refused.status_code == 422
    assert "which its system does not consume" in refused.text
