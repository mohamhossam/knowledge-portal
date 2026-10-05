"""Channels: where orders are placed, and who takes them in (requirement-portal ADR-0101)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.journeys import Activity, Journey, merge_journeys
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.products import (
    OrderType,
    ProductOffering,
    SourceConfidence,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge

ADAPTER = CatalogueFileAdapter()
SEED = seed_knowledge()
WEB_SYSTEM, SHOP_SYSTEM = SEED.systems[0].id, SEED.systems[1].id
WEB = Channel(
    "web",
    "B2B Web",
    kind="Digital",
    entry_system_id=WEB_SYSTEM,
    confidence=SourceConfidence.CONFIRMED,
    source="SDD §11",
)
SHOP = Channel("shop", "Shop", kind="Assisted", entry_system_id=SHOP_SYSTEM)
OFFERING = ProductOffering(
    "pro",
    "Business Pro",
    order_types=(OrderType("NEW", "New Activation", channels=("web", "shop")),),
)
JOURNEY = Journey(
    "pro-new",
    "Business Pro new activation",
    product_id="pro",
    order_type_code="NEW",
    activities=(
        Activity("10", "Capture the order", channel_entry=True),
        Activity("20", "Check the shop's stock", channels=("shop",)),
        Activity("30", "Orchestrate", performing_system_id=SHOP_SYSTEM),
    ),
)


def _release(**changes: object) -> ArchitectureKnowledge:
    fields: dict[str, object] = {
        "channels": (WEB, SHOP),
        "products": (*SEED.products, OFFERING),
        "journeys": (*SEED.journeys, JOURNEY),
    }
    return replace(SEED, **{**fields, **changes})  # type: ignore[arg-type]


def test_a_release_holds_channels_named_by_order_types_and_steps() -> None:
    release = _release()

    assert [item.id for item in release.channels] == ["web", "shop"]
    assert release.products[-1].order_types[0].channels == ("web", "shop")
    assert release.journeys[-1].activities[0].channel_entry is True


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda: _release(channels=(WEB, WEB)), "Channel ids must be unique"),
        (
            lambda: _release(channels=(WEB, replace(SHOP, name="b2b web"))),
            "Channel names must be unique",
        ),
        (
            lambda: _release(channels=(replace(WEB, entry_system_id="gone"), SHOP)),
            "entered through system 'gone'",
        ),
        (lambda: _release(channels=(WEB,)), "names channel 'shop'"),
        (
            lambda: Activity("10", "Both", performing_system_id="x", channel_entry=True),
            "either by a named system or by the channel's entry system",
        ),
        (lambda: Channel("web", " "), "Channel name must not be blank"),
    ],
)
def test_what_a_channel_refuses(change: object, message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        change()  # type: ignore[operator]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_round_trips_channels(
    file_format: CatalogueFileFormat,
) -> None:
    release = _release()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.channels == release.channels
    assert content.products == release.products
    assert content.journeys == release.journeys


def test_the_diff_says_which_channel_changed_and_how() -> None:
    before = _release()
    after = _release(
        channels=(replace(WEB, kind="Self-service"),),
        products=SEED.products,
        journeys=SEED.journeys,
    )

    changes = {
        (item.item, item.change, item.key): item for item in diff_releases(before, after).changes
    }

    assert changes[(ChangedItem.CHANNEL, ChangeKind.CHANGED, "web")].fields == ("channel_kind",)
    assert (ChangedItem.CHANNEL, ChangeKind.REMOVED, "shop") in changes


def test_a_second_reading_fills_a_steps_channels_but_never_overrides_a_named_system() -> None:
    first = replace(JOURNEY, activities=(Activity("10", "Capture", performing_system_id="x"),))
    second = replace(
        JOURNEY, activities=(Activity("10", "Capture", channels=("web",), channel_entry=True),)
    )

    (step,) = merge_journeys(first, second).activities

    assert step.channels == ("web",)
    assert step.channel_entry is False
