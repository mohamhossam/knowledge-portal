"""How an offering's orders are tracked once placed (requirement-portal ADR-0101, step 4)."""

from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.diff import ChangedItem, diff_releases
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.products import (
    OrderType,
    ProductOffering,
    SourceConfidence,
    merge_offerings,
)
from knowledge_portal.domain.architecture.tracking import (
    FalloutCase,
    OrderTracking,
    TrackingChannel,
    TrackingEvent,
    TrackingFlow,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge

ADAPTER = CatalogueFileAdapter()
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
SEED = seed_knowledge()
WEB_SYSTEM, ORDERS, NOTIFY = SEED.systems[0].id, SEED.systems[1].id, SEED.systems[2].id
WEB = Channel("web", "B2B Web", entry_system_id=WEB_SYSTEM)
SHOP = Channel("shop", "Shop")
TRACKING = OrderTracking(
    order_types=("NEW",),
    not_applicable_note="Not specified for a cease.",
    flows=(
        TrackingFlow(
            ORDERS,
            NOTIFY,
            "Order milestones",
            "notifyMilestone",
            SourceConfidence.CONFIRMED,
            "SDD §12",
        ),
        TrackingFlow(ORDERS, ORDERS, "Timestamps"),
    ),
    channels=(
        TrackingChannel(
            "web",
            correlation_key="Digital Order ID ↔ Fulfilment Order ID",
            ui_system_id=WEB_SYSTEM,
            story="US#1 — track by customer",
            read_system_id=ORDERS,
            read_interface="getRealTimeOrderDetails",
        ),
        TrackingChannel(
            "shop",
            ui_note="The shop's tracking screen is not named.",
            confidence=SourceConfidence.GAP,
        ),
    ),
    milestones=(TrackingEvent("Request received", "Email to the customer", ORDERS),),
    statuses=(TrackingEvent("VALIDATED"),),
    fallout=(FalloutCase("Rejected by business rules", "Back to the channel"),),
)
OFFERING = ProductOffering(
    "pro",
    "Business Pro",
    order_types=(OrderType("NEW", "New Activation"), OrderType("CEASE", "Cease")),
    tracking=TRACKING,
)


def _release(*offerings: ProductOffering, **changes: object) -> ArchitectureKnowledge:
    fields: dict[str, object] = {"channels": (WEB, SHOP), "products": offerings or (OFFERING,)}
    return replace(SEED, **{**fields, **changes})  # type: ignore[arg-type]


def test_tracking_applies_to_the_order_types_it_names_or_to_every_one() -> None:
    assert TRACKING.applies_to("new") and not TRACKING.applies_to("CEASE")
    assert OrderTracking().applies_to("CEASE")
    assert TRACKING.systems == (ORDERS, NOTIFY, WEB_SYSTEM)
    assert TRACKING.flows[1].is_log


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (
            lambda: replace(OFFERING, tracking=replace(TRACKING, order_types=("UPGRADE",))),
            "order type 'UPGRADE' is not one of the offering's order types",
        ),
        (
            lambda: replace(TRACKING, channels=(TRACKING.channels[0], TrackingChannel("web"))),
            "a channel is described once",
        ),
        (
            lambda: replace(TRACKING, milestones=(TrackingEvent("Done"), TrackingEvent("done"))),
            "each milestone is named once",
        ),
        (lambda: TrackingFlow(ORDERS, NOTIFY, " "), "What the flow carries must not be blank"),
        (
            lambda: _release(
                replace(
                    OFFERING,
                    tracking=replace(TRACKING, flows=(TrackingFlow(ORDERS, "gone", "Lost"),)),
                )
            ),
            "Business Pro › order tracking names system 'gone'",
        ),
        (lambda: _release(channels=(WEB,)), "order tracking names channel 'shop'"),
    ],
)
def test_what_tracking_refuses(change: object, message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        change()  # type: ignore[operator]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_round_trips_tracking(
    file_format: CatalogueFileFormat,
) -> None:
    release = _release()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.products == release.products


def test_a_workbook_refuses_an_unknown_kind_of_tracking_event() -> None:
    import io

    from openpyxl import load_workbook

    book = load_workbook(io.BytesIO(ADAPTER.write(CatalogueFileFormat.XLSX, _release())))
    book["TrackingEvents"].append(("pro", "rumour", "Heard", None, None, None, None))
    changed = io.BytesIO()
    book.save(changed)

    with pytest.raises(InvalidKnowledgeError, match="kind must be milestone, status or fallout"):
        ADAPTER.read(CatalogueFileFormat.XLSX, changed.getvalue())


def test_a_second_reading_never_replaces_tracking_it_only_fills_none() -> None:
    other = replace(TRACKING, scope_note="Another reading")

    assert merge_offerings(OFFERING, replace(OFFERING, tracking=other)).tracking == TRACKING
    assert merge_offerings(replace(OFFERING, tracking=None), OFFERING).tracking == TRACKING


def test_the_diff_names_tracking() -> None:
    after = replace(OFFERING, tracking=replace(TRACKING, fallout=()))

    (change,) = [
        item
        for item in diff_releases(_release(), _release(after)).changes
        if item.item is ChangedItem.PRODUCT
    ]

    assert change.fields == ("tracking",)


def test_a_draft_saves_tracking_through_the_api(client: TestClient) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    url = f"/architecture-knowledge/releases/{draft['id']}"
    body = {
        "systems": draft["systems"],
        "relationships": draft["relationships"],
        "channels": [{"id": "web", "name": "B2B Web"}],
    }
    offering = {
        "id": "pro",
        "name": "Business Pro",
        "order_types": [{"code": "NEW", "name": "New Activation"}],
        "tracking": {
            "order_types": ["NEW"],
            "flows": [{"from_system_id": ORDERS, "to_system_id": NOTIFY, "label": "Milestones"}],
            "channels": [{"channel_id": "web", "ui_system_id": WEB_SYSTEM}],
            "fallout": [{"trigger": "Rejected"}],
        },
    }

    saved = client.put(
        url,
        json={**body, "expected_revision": draft["revision"], "products": [offering]},
        headers=OWNER,
    )

    assert saved.status_code == 200, saved.text
    tracking = saved.json()["products"][0]["tracking"]
    assert tracking["channels"][0]["ui_system_id"] == WEB_SYSTEM
    assert tracking["fallout"] == [
        {"trigger": "Rejected", "handling": None, "confidence": None, "source": None}
    ]

    refused = client.put(
        url,
        json={
            **body,
            "expected_revision": saved.json()["revision"],
            "products": [
                {
                    **offering,
                    "tracking": {"channels": [{"channel_id": "phone"}]},
                }
            ],
        },
        headers=OWNER,
    )
    assert refused.status_code == 422
    assert "order tracking names channel 'phone'" in refused.text
