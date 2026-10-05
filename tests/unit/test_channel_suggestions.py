"""Readings suggest channels, and the channels order types and steps name (ADR-0101, step 3b).

A channel is suggested whole and fills gaps when accepted. An offering or a journey that
names a channel waits for it, as it waits for the systems it names.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_extractor import (
    ExtractionRequest,
    ExtractionSegment,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.journeys import Activity, Journey
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, SystemDefinition
from knowledge_portal.domain.architecture.products import (
    OrderType,
    ProductOffering,
    SourceConfidence,
)
from knowledge_portal.infrastructure.architecture.catalogue_tables import CatalogueTableReader
from knowledge_portal.infrastructure.architecture.markdown_passages import markdown_passages
from knowledge_portal.infrastructure.llm.catalogue_extraction import (
    ChangeOutput,
    ExtractionOutput,
    JourneyOutput,
    LeanExtractionOutput,
    StepOutput,
    StructuredCatalogueExtractor,
)
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    CHANNEL_RULE,
    LEAN_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
)

FIXTURE = Path(__file__).parent.parent / "fixtures" / "catalogue" / "synthetic_channels.md"
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
WEB = Channel("business-web", "Business Web", kind="Digital", entry_system_id="Order Portal")


def _draft(*channels: Channel, products: tuple[ProductOffering, ...] = ()) -> Any:
    return ArchitectureKnowledge(
        "draft",
        1,
        (SystemDefinition("order-portal", "Order Portal"), SystemDefinition("flow", "Flow Engine")),
        (),
        channels=channels,
        products=products,
    )


def _channel(channel: Channel) -> CandidateContent:
    return CandidateContent(CandidateKind.CHANNEL, channel.id, name=channel.name, channel=channel)


def _offering(*channels: str) -> CandidateContent:
    offering = ProductOffering(
        "office", "Office Connect", order_types=(OrderType("NEW", "New", channels=channels),)
    )
    return CandidateContent(
        CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
    )


# Domain -----------------------------------------------------------------------------------


def test_a_channel_is_new_then_present_and_its_entry_system_resolves() -> None:
    draft = _draft()

    assert classify(_channel(WEB), draft) is CandidateMatch.NEW
    accepted = apply_candidate(_channel(WEB), draft)

    (channel,) = accepted.channels
    assert (channel.id, channel.entry_system_id) == ("business-web", "order-portal")
    assert classify(_channel(WEB), accepted) is CandidateMatch.ALREADY_PRESENT


def test_a_channel_waits_for_the_system_its_orders_enter_through() -> None:
    gone = Channel("shop", "Shop", entry_system_id="Shop Till")

    assert classify(_channel(gone), _draft()) is CandidateMatch.NEEDS_SYSTEM
    with pytest.raises(CandidateDependencyError, match="'Shop Till' before the channel Shop"):
        apply_candidate(_channel(gone), _draft())


def test_a_second_reading_fills_a_channel_but_never_overrides_what_is_set() -> None:
    known = Channel("business-web", "Business Web", kind="Self-service")
    draft = _draft(known)

    assert classify(_channel(WEB), draft) is CandidateMatch.UPDATES_EXISTING
    (channel,) = apply_candidate(_channel(WEB), draft).channels

    assert (channel.kind, channel.entry_system_id) == ("Self-service", "order-portal")


def test_an_offering_waits_for_the_channels_its_order_types_name() -> None:
    draft = _draft()

    assert classify(_offering("Business Web"), draft) is CandidateMatch.NEEDS_CHANNEL
    with pytest.raises(CandidateDependencyError, match="channel 'Business Web'"):
        apply_candidate(_offering("Business Web"), draft)

    with_channel = apply_candidate(_channel(WEB), draft)
    accepted = apply_candidate(_offering("Business Web"), with_channel)
    assert accepted.products[0].order_types[0].channels == ("business-web",)


def test_a_journey_waits_for_the_channels_its_steps_name() -> None:
    draft = apply_candidate(_offering(), _draft())
    journey = Journey(
        "office-new",
        "New",
        product_id="office",
        order_type_code="NEW",
        activities=(Activity("10", "Capture", channels=("Business Web",), channel_entry=True),),
    )
    content = CandidateContent(CandidateKind.JOURNEY, journey.id, name="New", journey=journey)

    assert classify(content, draft) is CandidateMatch.NEEDS_CHANNEL
    accepted = apply_candidate(content, apply_candidate(_channel(WEB), draft))
    assert accepted.journeys[0].activities[0].channels == ("business-web",)


# Tables -----------------------------------------------------------------------------------


def _request(text: str) -> ExtractionRequest:
    segments = tuple(
        ExtractionSegment(
            number, item.location, item.text, section=item.heading_path, cells=item.cells
        )
        for number, item in enumerate(markdown_passages(text), 1)
    )
    return ExtractionRequest("Channels", segments, ())


def test_tables_give_channels_order_type_channels_and_channel_steps() -> None:
    reading = CatalogueTableReader().read(_request(FIXTURE.read_text(encoding="utf-8")))

    channels = [
        item.content.channel for item in reading.changes if item.content.channel is not None
    ]
    assert [(item.id, item.kind, item.entry_system_id) for item in channels] == [
        ("business-web", "Digital", "order-portal"),
        ("sales-agent", "Assisted", "sales-desk"),
        ("partner-feed", "System", None),
    ]
    (offering,) = [item.content.product for item in reading.changes if item.content.product]
    assert [item.channels for item in offering.order_types] == [
        ("Business Web", "Sales Agent"),
        ("Sales Agent",),
    ]
    (journey,) = [item.content.journey for item in reading.changes if item.content.journey]
    capture, confirm, validate = journey.activities
    assert (capture.channel_entry, capture.performing_system_id) == (True, None)
    assert confirm.channels == ("Sales Agent",)
    assert (validate.channels, validate.channel_entry) == ((), False)
    # No channel is mistaken for a system.
    systems = {
        item.content.system_id for item in reading.changes if item.content.kind.value == "system"
    }
    assert systems == {"order-portal", "sales-desk", "flow-engine"}


# The model --------------------------------------------------------------------------------


class _Answer:
    model = "scripted"

    def __init__(self, output: ExtractionOutput) -> None:
        self.output = output

    def parse(self, **_: Any) -> ExtractionOutput:
        return self.output


def _change(**values: Any) -> ChangeOutput:
    base: dict[str, Any] = {
        "kind": "channel",
        "system": "",
        "name": "Business Web",
        "name_ar": None,
        "aliases": [],
        "triggers": [],
        "target_system": "Order Portal",
        "component": None,
        "technology": None,
        "domain": None,
        "parent_domain": None,
        "offering": None,
        "journey": None,
        "text": "Un-assisted web ordering.",
        "evidence_numbers": [1],
        "quote": "Business customers order through Business Web",
        "basis": "stated",
        "reasoning": None,
        "relationship_kind": None,
        "channel_kind": "Digital",
    }
    return ChangeOutput(**(base | values))


def _step(number: str, system: str | None, entry: bool | None, *channels: str) -> StepOutput:
    return StepOutput(
        number=number,
        name=f"Step {number}",
        track=None,
        system=system,
        supporting=[],
        function=None,
        channels=list(channels),
        channel_entry=entry,
    )


def test_the_model_suggests_channels_and_the_channels_steps_happen_in() -> None:
    passage = "Business customers order through Business Web, which the Order Portal serves."
    journey = JourneyOutput(
        product=None,
        order_type=None,
        steps=[
            _step("10", None, True),
            _step("20", "Flow Engine", True, "Business Web"),
        ],
        rules=[],
    )
    output = ExtractionOutput(
        changes=[
            _change(),
            _change(kind="journey", name="New Activation", target_system=None, journey=journey),
        ]
    )
    client: Any = _Answer(output)

    channel, read = (
        StructuredCatalogueExtractor(client, supports_images=False)
        .propose(ExtractionRequest("Notes", (ExtractionSegment(1, "paragraph 1", passage),), ()))
        .changes
    )

    suggested = channel.content.channel
    assert suggested is not None
    assert (suggested.id, suggested.kind, suggested.entry_system_id, suggested.description) == (
        "business-web",
        "Digital",
        "order-portal",
        "Un-assisted web ordering.",
    )
    assert suggested.confidence is SourceConfidence.CONFIRMED
    assert read.content.journey is not None
    first, second = read.content.journey.activities
    assert (first.channel_entry, first.performing_system_id) == (True, None)
    # A named performer wins over the channel's entry system.
    assert (second.channel_entry, second.performing_system_id, second.channels) == (
        False,
        "flow-engine",
        ("Business Web",),
    )


def test_only_the_full_reading_proposes_channels() -> None:
    assert CHANNEL_RULE in SYSTEM_PROMPT
    assert "- channel:" not in LEAN_SYSTEM_PROMPT
    lean = json.dumps(LeanExtractionOutput.model_json_schema())
    assert '"channel"' not in lean and "channel_kind" not in lean
    # Order types still say which channels they are ordered through, in either reading.
    assert "channels each is ordered through" in LEAN_SYSTEM_PROMPT


# End to end -------------------------------------------------------------------------------


def test_accepting_a_channels_document_fills_channels_order_types_and_steps(
    client: TestClient,
) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "Channels", "language": "en", "expected_revision": draft["revision"]},
        files={"file": ("channels.md", FIXTURE.read_bytes(), "text/markdown")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    channels = [item for item in listing["suggestions"] if item["content"]["kind"] == "channel"]
    assert [item["content"]["channel"]["name"] for item in channels] == [
        "Business Web",
        "Sales Agent",
        "Partner Feed",
    ]
    offering = next(item for item in listing["suggestions"] if item["content"]["kind"] == "product")
    assert offering["match"] == CandidateMatch.NEEDS_CHANNEL.value

    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()

    release = accepted["release"]
    assert {item["id"]: item.get("entry_system_id") for item in release["channels"]} == {
        "business-web": "order-portal",
        "sales-agent": "sales-desk",
        "partner-feed": None,
    }
    (product,) = release["products"]
    assert {item["code"]: item["channels"] for item in product["order_types"]} == {
        "NEW": ["business-web", "sales-agent"],
        "CEASE": ["sales-agent"],
    }
    (journey,) = release["journeys"]
    steps = {item["number"]: item for item in journey["activities"]}
    assert steps["10"]["channel_entry"] is True
    assert steps["15"]["channels"] == ["sales-agent"]
