"""Interfaces suggested from documents and reviewed like any suggestion (ADR-0123)."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_extractor import (
    ExtractionRequest,
    ExtractionSegment,
)
from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, SystemDefinition
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.llm.catalogue_extraction import (
    ChangeOutput,
    ExtractionOutput,
    LeanExtractionOutput,
    StructuredCatalogueExtractor,
)
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    INTERFACE_RULE,
    LEAN_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
)

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
ADAPTER = CatalogueFileAdapter()
ORDERS = SystemInterface("if-hub-orders", "Order API", "Order Hub", consumer_ids=("Billing",))


def _draft(*interfaces: SystemInterface) -> ArchitectureKnowledge:
    return ArchitectureKnowledge(
        "draft",
        1,
        (
            SystemDefinition("hub", "Order Hub"),
            SystemDefinition("billing", "Billing"),
            SystemDefinition("crm", "CRM"),
        ),
        (),
        interfaces=interfaces,
    )


def _suggested(interface: SystemInterface) -> CandidateContent:
    return CandidateContent(
        CandidateKind.INTERFACE, interface.id, name=interface.name, interface=interface
    )


# Domain -----------------------------------------------------------------------------------


def test_an_interface_is_new_then_present_with_its_systems_resolved() -> None:
    draft = _draft()

    assert classify(_suggested(ORDERS), draft) is CandidateMatch.NEW
    accepted = apply_candidate(_suggested(ORDERS), draft)

    (interface,) = accepted.interfaces
    assert (interface.system_id, interface.consumer_ids) == ("hub", ("billing",))
    assert classify(_suggested(ORDERS), accepted) is CandidateMatch.ALREADY_PRESENT


def test_another_reading_adds_its_consumers_and_fills_gaps_but_never_overrides() -> None:
    held = SystemInterface(
        "if-hub-orders", "Order API", "hub", style=InterfaceStyle.API, consumer_ids=("billing",)
    )
    draft = _draft(held)
    more = SystemInterface(
        "x",
        "order api",
        "Order Hub",
        style=InterfaceStyle.EVENT,
        consumer_ids=("CRM",),
        description="Orders and their status.",
    )

    assert classify(_suggested(more), draft) is CandidateMatch.UPDATES_EXISTING
    (interface,) = apply_candidate(_suggested(more), draft).interfaces

    assert interface.id == "if-hub-orders"
    assert interface.style is InterfaceStyle.API
    assert interface.consumer_ids == ("billing", "crm")
    assert interface.description == "Orders and their status."


def test_an_interface_waits_for_its_systems_and_the_interfaces_it_relays() -> None:
    unknown = SystemInterface("if-x", "Feed", "Mystery System")
    relaying = SystemInterface("if-relay", "Relay", "Billing", relays=("Order API",))

    assert classify(_suggested(unknown), _draft()) is CandidateMatch.NEEDS_SYSTEM
    assert classify(_suggested(relaying), _draft()) is CandidateMatch.NEEDS_INTERFACE
    with pytest.raises(CandidateDependencyError, match="interface 'Order API'"):
        apply_candidate(_suggested(relaying), _draft())
    held = _draft(SystemInterface("if-hub-orders", "Order API", "hub", consumer_ids=("billing",)))
    (_, relay) = apply_candidate(_suggested(relaying), held).interfaces
    assert relay.relays == ("if-hub-orders",)


# The model --------------------------------------------------------------------------------


class _Answer:
    model = "scripted"

    def __init__(self, output: ExtractionOutput) -> None:
        self.output = output

    def parse(self, **_: Any) -> ExtractionOutput:
        return self.output


def _change(**values: Any) -> ChangeOutput:
    base: dict[str, Any] = {
        "kind": "interface",
        "system": "Order Hub",
        "name": "Order API",
        "name_ar": None,
        "aliases": [],
        "triggers": [],
        "target_system": "Billing",
        "component": None,
        "technology": None,
        "domain": None,
        "parent_domain": None,
        "offering": None,
        "journey": None,
        "text": "Orders and their status.",
        "evidence_numbers": [1],
        "quote": "Billing reads orders from the Order Hub Order API",
        "basis": "stated",
        "reasoning": None,
        "relationship_kind": None,
        "channel_kind": None,
        "interface_style": "api",
        "portfolio_level": None,
        "realisation_layer": None,
        "realised_by": [],
        "source_level": None,
        "source_version": None,
        "conflict_sides": [],
        "affected_offerings": [],
    }
    return ChangeOutput(**(base | values))


def test_the_model_suggests_an_interface_per_consumer() -> None:
    passage = "Billing reads orders from the Order Hub Order API; CRM reads them too."
    output = ExtractionOutput(changes=[_change(), _change(target_system="CRM")])

    first, second = (
        StructuredCatalogueExtractor(_Answer(output), supports_images=False)  # type: ignore[arg-type]
        .propose(ExtractionRequest("Notes", (ExtractionSegment(1, "paragraph 1", passage),), ()))
        .changes
    )

    assert first.content.kind is CandidateKind.INTERFACE
    interface = first.content.interface
    assert interface is not None
    assert (interface.name, interface.style, interface.description) == (
        "Order API",
        InterfaceStyle.API,
        "Orders and their status.",
    )
    assert second.content.interface is not None and second.content.interface.id == interface.id


def test_only_the_full_reading_proposes_interfaces() -> None:
    assert INTERFACE_RULE in SYSTEM_PROMPT
    assert "- interface:" not in LEAN_SYSTEM_PROMPT
    assert "interface_style" not in json.dumps(LeanExtractionOutput.model_json_schema())


# End to end -------------------------------------------------------------------------------

DOCUMENT = b"""# Order Hub integration

System: Quokka Ledger

System: Wombat Desk

System: Order Hub
Interface: Order API [api] consumed by Quokka Ledger

Interface: Order API consumed by Wombat Desk
"""


def test_accepting_a_documents_interface_records_it_and_where_it_came_from(
    client: TestClient,
) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "Integration", "language": "en", "expected_revision": draft["revision"]},
        files={"file": ("integration.md", DOCUMENT, "text/markdown")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    (suggested,) = [
        item for item in listing["suggestions"] if item["content"]["kind"] == "interface"
    ]
    assert suggested["match"] == CandidateMatch.NEEDS_SYSTEM.value
    assert suggested["content"]["interface"]["consumer_ids"] == ["quokka-ledger", "wombat-desk"]
    assert len(suggested["citations"]) == 2

    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()

    (interface,) = accepted["release"]["interfaces"]
    assert (interface["name"], interface["system_id"], interface["style"]) == (
        "Order API",
        "order-hub",
        "api",
    )
    assert interface["consumer_ids"] == ["quokka-ledger", "wombat-desk"]
    assert interface["accepted"][0]["candidate_id"] == suggested["id"]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_file_format_keeps_where_an_interface_came_from(
    file_format: CatalogueFileFormat,
) -> None:
    stamp = AcceptedFrom("c1", "m", "v", "amina", datetime(2026, 10, 21, tzinfo=UTC))
    release = replace(
        seed_knowledge(),
        interfaces=(SystemInterface("if-x", "Order API", "cwom", accepted=(stamp,)),),
    )

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert read.interfaces[0].accepted == (stamp,)
