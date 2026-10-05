"""Readings suggest an offering's details: realisation, NFRs, order tracking and lifecycle
notes (requirement-portal ADR-0101, step 4).

Tables give them exactly; the model reads them from prose when its context has ample room.
An offering whose tracking or notes name systems or channels the draft lacks waits for them.
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
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, SystemDefinition
from knowledge_portal.domain.architecture.lifecycle import LifecycleNote, NoteBlock, NoteBlockKind
from knowledge_portal.domain.architecture.products import (
    NfrCoverage,
    OrderType,
    ProductOffering,
    RealisationLayer,
    SourceConfidence,
)
from knowledge_portal.domain.architecture.tracking import (
    OrderTracking,
    TrackingChannel,
    TrackingEvent,
    TrackingFlow,
)
from knowledge_portal.infrastructure.architecture.catalogue_tables import CatalogueTableReader
from knowledge_portal.infrastructure.architecture.markdown_passages import markdown_passages
from knowledge_portal.infrastructure.llm.catalogue_extraction import (
    ChangeOutput,
    DetailedChangeOutput,
    DetailedExtractionOutput,
    DetailedOfferingOutput,
    ExtractionOutput,
    StructuredCatalogueExtractor,
)
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    DETAIL_RULE,
    DETAILED_SYSTEM_PROMPT,
    LEAN_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
)

FIXTURE = Path(__file__).parent.parent / "fixtures" / "catalogue" / "synthetic_offering_details.md"
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
WEB = Channel("business-web", "Business Web")


def _draft(*systems: SystemDefinition, channels: tuple[Channel, ...] = ()) -> Any:
    return ArchitectureKnowledge("draft", 1, systems, (), channels=channels)


def _suggestion(offering: ProductOffering) -> CandidateContent:
    return CandidateContent(
        CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
    )


TRACKED = ProductOffering(
    "office",
    "Office Connect",
    order_types=(OrderType("NEW", "New Activation"),),
    tracking=OrderTracking(
        flows=(TrackingFlow("Flow Engine", "Order Store", "Order status events"),),
        channels=(
            TrackingChannel("Business Web", ui_system_id="Order Portal"),
            # The same channel by its id: described once, the first description kept.
            TrackingChannel("business-web", correlation_key="Later key"),
        ),
        milestones=(TrackingEvent("Activated", system_id="Order Portal"),),
    ),
    lifecycle_notes=(
        LifecycleNote(
            "renewal",
            "Renewal",
            channels=("Business Web",),
            blocks=(NoteBlock(NoteBlockKind.TEXT, text="Renewed yearly."),),
        ),
    ),
)
SYSTEMS = (
    SystemDefinition("flow", "Flow Engine"),
    SystemDefinition("store", "Order Store"),
    SystemDefinition("portal", "Order Portal"),
)


# Domain -----------------------------------------------------------------------------------


def test_an_offering_waits_for_the_systems_its_order_tracking_names() -> None:
    assert classify(_suggestion(TRACKED), _draft(*SYSTEMS[:2])) is CandidateMatch.NEEDS_SYSTEM
    with pytest.raises(CandidateDependencyError, match="'Order Portal'"):
        apply_candidate(_suggestion(TRACKED), _draft(*SYSTEMS[:2], channels=(WEB,)))


def test_an_offering_waits_for_the_channels_its_tracking_and_notes_name() -> None:
    draft = _draft(*SYSTEMS)
    assert classify(_suggestion(TRACKED), draft) is CandidateMatch.NEEDS_CHANNEL

    (offering,) = apply_candidate(_suggestion(TRACKED), _draft(*SYSTEMS, channels=(WEB,))).products

    tracking = offering.tracking
    assert tracking is not None
    assert [(item.from_system_id, item.to_system_id) for item in tracking.flows] == [
        ("flow", "store")
    ]
    (channel,) = tracking.channels
    assert (channel.channel_id, channel.ui_system_id, channel.correlation_key) == (
        "business-web",
        "portal",
        None,
    )
    assert tracking.milestones[0].system_id == "portal"
    assert offering.lifecycle_notes[0].channels == ("business-web",)


# Tables -----------------------------------------------------------------------------------


def _request(text: str) -> ExtractionRequest:
    segments = tuple(
        ExtractionSegment(
            number, item.location, item.text, section=item.heading_path, cells=item.cells
        )
        for number, item in enumerate(markdown_passages(text), 1)
    )
    return ExtractionRequest("Details", segments, ())


def test_a_product_sections_tables_give_realisation_nfrs_tracking_and_notes() -> None:
    request = _request(FIXTURE.read_text(encoding="utf-8"))

    reading = CatalogueTableReader().read(request)

    assert reading.notes == []
    (offering,) = [item.content.product for item in reading.changes if item.content.product]
    fibre, router = offering.components
    assert [(item.layer, item.name, item.confidence) for item in fibre.realisation] == [
        (RealisationLayer.CFS, "Business Fibre Service", SourceConfidence.CONFIRMED),
        (RealisationLayer.RFS, "GPON Access", SourceConfidence.INFERRED),
    ]
    # A realisation of a component no table lists adds the component.
    assert (router.id, router.realisation[0].layer) == ("managed-router", RealisationLayer.RESOURCE)
    assert [(item.quality, item.coverage) for item in offering.nfrs] == [
        ("Availability", NfrCoverage.DEFINED),
        ("Performance", NfrCoverage.PARTIAL),
        ("Security", NfrCoverage.MISSING),
    ]

    tracking = offering.tracking
    assert tracking is not None
    assert tracking.order_types == ("NEW",)
    assert tracking.not_applicable_note == ("Up / Downgrade orders are not followed in the portal.")
    assert tracking.scope_note == "The customer follows a fibre order from capture to activation."
    assert (tracking.confidence, tracking.source) == (
        SourceConfidence.CONFIRMED,
        "Synthetic design §8",
    )
    assert [(item.from_system_id, item.to_system_id, item.is_log) for item in tracking.flows] == [
        ("flow-engine", "order-store", False),
        ("order-store", "order-store", True),
    ]
    web, agent = tracking.channels
    assert (web.channel_id, web.correlation_key, web.ui_system_id, web.read_system_id) == (
        "Business Web",
        "Portal order id",
        "order-portal",
        "order-store",
    )
    # A key the document says is not defined is no key.
    assert (agent.correlation_key, agent.confidence) == (None, SourceConfidence.GAP)
    assert [(item.label, item.system_id) for item in tracking.milestones] == [
        ("Order received", "order-portal"),
        ("Activated", None),
    ]
    assert [item.label for item in tracking.statuses] == ["AWAITING_SURVEY"]
    assert [(item.trigger, item.handling) for item in tracking.fallout] == [
        ("Survey failed", "A planner books the visit again.")
    ]

    matrix, renewal = offering.lifecycle_notes
    assert (matrix.id, matrix.kind, matrix.order_types, matrix.summary) == (
        "up-downgrade-scenario-matrix",
        "Change",
        ("UPDOWN",),
        "Which workflow each transition runs.",
    )
    assert (matrix.confidence, matrix.source) == (
        SourceConfidence.CONFIRMED,
        "Synthetic design §10",
    )
    table, text = matrix.blocks
    assert (table.columns, table.rows) == (
        ("From", "To", "Workflow"),
        (("Fibre 100", "Fibre 500", "WF-1"), ("Fibre 500", "Fibre 100", "WF-2")),
    )
    assert text.text == "Transitions run on the summary order path."
    (carried,) = renewal.blocks
    assert (carried.kind, carried.title, carried.to_verify, carried.items) == (
        NoteBlockKind.LIST,
        "v1 carry-over (to re-verify)",
        True,
        ("Inherit the remaining tenure", "Start a fresh 24-month commitment"),
    )
    assert (renewal.order_types, renewal.channels) == ((), ("Business Web",))

    # A tracking or note table is the offering's own: its "Channel" and "From" columns make
    # no channel and no dependency, and the model is not asked to read it again.
    channels = [item.content.channel.name for item in reading.changes if item.content.channel]
    assert channels == ["Business Web", "Sales Agent"]
    assert not [item for item in reading.changes if item.content.kind is CandidateKind.RELATIONSHIP]
    left = {item.text for item in request.segments if item.number not in reading.consumed}
    assert not any("Fibre 100" in text or "Survey failed" in text for text in left)


def test_a_detail_naming_an_order_type_the_offering_lacks_says_so() -> None:
    text = """## Product: Office Connect

| Order type | Code |
|---|---|
| New Activation | NEW |

### Order tracking

- **Applies to:** Cessation

| Milestone | Detail |
|---|---|
| Ceased | The line is off. |

### Lifecycle: Cessation

- **Order types:** New Activation; Cessation

Blocked while the order is activating.
"""

    reading = CatalogueTableReader().read(_request(text))

    (offering,) = [item.content.product for item in reading.changes if item.content.product]
    # Naming none of its order types would mean every one, so the tracking is left out; the
    # note keeps the one it has.
    assert offering.tracking is None
    (note,) = offering.lifecycle_notes
    assert note.order_types == ("NEW",)
    assert "order tracking was left out" in " ".join(reading.notes)
    assert "the lifecycle note Cessation names the order type 'Cessation'" in " ".join(
        reading.notes
    )


# The model --------------------------------------------------------------------------------


class _Answer:
    model = "scripted"

    def __init__(self, output: Any) -> None:
        self.output = output
        self.asked: list[tuple[str, Any]] = []

    def parse(self, *, system_prompt: str, schema_type: Any, **_: Any) -> Any:
        self.asked.append((system_prompt, schema_type))
        return self.output


def _offering(**details: Any) -> DetailedOfferingOutput:
    base: dict[str, Any] = {
        "code": None,
        "family": None,
        "version": None,
        "lifecycle": None,
        "proposition": None,
        "rules": [],
        "order_types": [
            {
                "name": "New Activation",
                "code": "NEW",
                "enabled": None,
                "description": None,
                "confidence": None,
                "channels": [],
            }
        ],
        "components": [],
        "values": [],
        "audiences": [],
        "confidence": None,
        "nfrs": [],
        "tracking": None,
        "lifecycle_notes": [],
    }
    return DetailedOfferingOutput.model_validate(base | details)


def _change(offering: DetailedOfferingOutput) -> DetailedChangeOutput:
    return DetailedChangeOutput(
        kind="product_offering",
        system="",
        name="Office Connect",
        name_ar=None,
        aliases=[],
        triggers=[],
        target_system=None,
        component=None,
        technology=None,
        domain=None,
        parent_domain=None,
        offering=offering,
        text=None,
        evidence_numbers=[1],
        quote="Order tracking for Office Connect runs from capture to activation",
        basis="stated",
        reasoning=None,
        relationship_kind=None,
        channel_kind=None,
        journey=None,
    )


PASSAGE = "Order tracking for Office Connect runs from capture to activation in the Order Portal."


def _propose(output: Any, max_input_tokens: int | None = None) -> tuple[Any, _Answer]:
    client = _Answer(output)
    proposal = StructuredCatalogueExtractor(
        client, supports_images=False, max_input_tokens=max_input_tokens
    ).propose(ExtractionRequest("Notes", (ExtractionSegment(1, "paragraph 1", PASSAGE),), ()))
    return proposal, client


def test_the_models_offering_details_are_made_valid_before_anyone_sees_them() -> None:
    def note(title: str, orders: list[str], *blocks: dict[str, Any]) -> dict[str, Any]:
        return {
            "title": title,
            "kind": None,
            "summary": None,
            "order_types": orders,
            "channels": ["Business Web"],
            "blocks": list(blocks),
            "confidence": None,
        }

    def block(kind: str, **values: Any) -> dict[str, Any]:
        empty: dict[str, Any] = {
            "title": None,
            "text": None,
            "items": [],
            "columns": [],
            "rows": [],
        }
        return {**empty, "kind": kind, "to_verify": False, **values}

    def event(label: str, system: str | None = None) -> dict[str, Any]:
        return {"label": label, "detail": None, "system": system}

    read = _offering(
        components=[
            {
                "name": "Fibre",
                "code": None,
                "type": None,
                "mandatory": None,
                "customer_visible": None,
                "description": None,
                "responsibilities": [],
                "confidence": None,
                "realisation": [
                    {"layer": "cfs", "name": "Fibre CFS", "confidence": "confirmed"},
                    {"layer": "cfs", "name": "fibre cfs", "confidence": None},
                ],
            }
        ],
        nfrs=[
            {
                "quality": "Availability",
                "coverage": "defined",
                "statement": "99.9%",
                "confidence": None,
            },
            {
                "quality": "availability",
                "coverage": "missing",
                "statement": None,
                "confidence": None,
            },
        ],
        tracking={
            "order_types": ["New Activation", "Migration"],
            "scope_note": None,
            "not_applicable_note": None,
            "flows": [
                {
                    "from_system": "📈 Flow Engine",
                    "to_system": "Order Store",
                    "what": "Events",
                    "interface": None,
                },
                {
                    "from_system": "",
                    "to_system": "Order Store",
                    "what": "Nowhere",
                    "interface": None,
                },
            ],
            "channels": [
                {
                    "channel": "Business Web",
                    "correlation_key": "Order id",
                    "tracked_in": "Order Portal",
                    "read_from": None,
                    "read_over": None,
                },
            ],
            "milestones": [event("Activated", "Order Portal"), event("activated")],
            "statuses": [event("WAITING", "Order Store")],
            "fallout": [{"trigger": "Survey failed", "handling": None}],
            "confidence": None,
        },
        lifecycle_notes=[
            note(
                "Up / Downgrade matrix",
                [],
                block("table", columns=["From", "To"], rows=[["A"], ["B", "C"]]),
                block("list"),
            ),
            note("Elsewhere", ["Cessation"], block("text", text="Not this offering's.")),
            note("Empty", [], block("list")),
        ],
    )

    proposal, client = _propose(DetailedExtractionOutput(changes=[_change(read)]))

    assert client.asked == [(DETAILED_SYSTEM_PROMPT, DetailedExtractionOutput)]
    (change,) = proposal.changes
    offering = change.content.product
    assert offering is not None
    assert [item.name for item in offering.components[0].realisation] == ["Fibre CFS"]
    assert [(item.quality, item.coverage) for item in offering.nfrs] == [
        ("Availability", NfrCoverage.DEFINED)
    ]
    tracking = offering.tracking
    assert tracking is not None
    # The order type it lacks is left out, a flow from nowhere too, and each event once.
    assert tracking.order_types == ("NEW",)
    assert [(item.from_system_id, item.to_system_id) for item in tracking.flows] == [
        ("flow-engine", "order-store")
    ]
    assert tracking.channels[0].ui_system_id == "order-portal"
    assert [(item.label, item.system_id) for item in tracking.milestones] == [
        ("Activated", "order-portal")
    ]
    assert [(item.label, item.system_id) for item in tracking.statuses] == [("WAITING", None)]
    # A note naming none of the offering's order types, or saying nothing usable, is left out.
    (matrix,) = offering.lifecycle_notes
    (table,) = matrix.blocks
    assert table.rows == (("A", ""), ("B", "C"))
    assert matrix.channels == ("Business Web",)


def test_only_a_context_with_ample_room_reads_an_offerings_details() -> None:
    assert DETAIL_RULE in DETAILED_SYSTEM_PROMPT
    assert DETAIL_RULE not in SYSTEM_PROMPT and DETAIL_RULE not in LEAN_SYSTEM_PROMPT
    plain = json.dumps(ExtractionOutput.model_json_schema())
    assert "lifecycle_notes" not in plain and "tracking" not in plain
    detailed = json.dumps(DetailedExtractionOutput.model_json_schema())
    assert "lifecycle_notes" in detailed and "realisation" in detailed

    proposal, client = _propose(ExtractionOutput(changes=[]), max_input_tokens=8192)

    assert client.asked == [(SYSTEM_PROMPT, ExtractionOutput)]
    assert proposal.warnings[0] == (
        "This model's context is too small to also read an offering's realisation, NFRs, "
        "order tracking and lifecycle notes from prose; those set out in tables are still read."
    )


def test_a_reading_without_details_still_gives_the_offering() -> None:
    lean = _offering().model_dump()
    for key in ("nfrs", "tracking", "lifecycle_notes"):
        lean.pop(key)
    change = ChangeOutput.model_validate({**_change(_offering()).model_dump(), "offering": lean})

    proposal, _ = _propose(ExtractionOutput(changes=[change]), max_input_tokens=8192)

    (suggested,) = proposal.changes
    offering = suggested.content.product
    assert offering is not None
    assert (offering.order_types[0].code, offering.tracking, offering.nfrs) == ("NEW", None, ())


# End to end -------------------------------------------------------------------------------


def test_accepting_a_details_document_lands_the_offering_with_ids_resolved(
    client: TestClient,
) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "Details", "language": "en", "expected_revision": draft["revision"]},
        files={"file": ("details.md", FIXTURE.read_bytes(), "text/markdown")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    offering = next(item for item in listing["suggestions"] if item["content"]["kind"] == "product")
    assert offering["match"] == CandidateMatch.NEEDS_SYSTEM.value

    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    )

    assert accepted.status_code == 200, accepted.text
    (product,) = accepted.json()["release"]["products"]
    tracking = product["tracking"]
    assert {item["channel_id"]: item.get("ui_system_id") for item in tracking["channels"]} == {
        "business-web": "order-portal",
        "sales-agent": None,
    }
    assert [item["from_system_id"] for item in tracking["flows"]] == ["flow-engine", "order-store"]
    assert [item["title"] for item in product["lifecycle_notes"]] == [
        "Up / Downgrade scenario matrix",
        "Renewal",
    ]
    assert product["lifecycle_notes"][1]["channels"] == ["business-web"]
    assert [item["quality"] for item in product["nfrs"]] == [
        "Availability",
        "Performance",
        "Security",
    ]
    assert {part["id"]: len(part["realisation"]) for part in product["components"]} == {
        "po-fibre": 2,
        "managed-router": 1,
    }
