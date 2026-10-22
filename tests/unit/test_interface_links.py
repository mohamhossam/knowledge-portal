"""Journey steps and tracking flows linked to the interface records they go through.

Review recommendation 8: an integration or a tracking flow names its interface record by id
beside the text its source writes; the link is checked against the version, survives a
journey read again, and dependencies derived from a linked step take the record's kind and
direction (ADR-0119), as the interface itself would.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.derived_dependencies import (
    derive_dependencies,
    interface_dependency,
)
from knowledge_portal.domain.architecture.interface_links import (
    call_systems,
    interface_of,
    kept_interface_links,
)
from knowledge_portal.domain.architecture.interfaces import SystemInterface
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.journeys import ActivityIntegration, Journey
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.tracking import OrderTracking, TrackingFlow
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    ActivityIntegrationSchema,
    TrackingFlowSchema,
)

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()


def _catalogue() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def _named_step(
    release: ArchitectureKnowledge,
) -> tuple[Journey, int, ActivityIntegration, SystemInterface]:
    """A step of the committed catalogue whose written interface names exactly one record
    of a system it touches."""
    for journey in release.journeys:
        for index, integration in enumerate(journey.integrations):
            record, linked = interface_of(release.interfaces, journey, integration)
            if record is not None and not linked:
                return journey, index, integration, record
    raise AssertionError("the committed catalogue has a step named like an interface record")


def _with_link(
    release: ArchitectureKnowledge, journey: Journey, index: int, integration: ActivityIntegration
) -> ArchitectureKnowledge:
    steps = tuple(
        integration if at == index else item for at, item in enumerate(journey.integrations)
    )
    return release.updated(
        journeys=tuple(
            replace(item, integrations=steps) if item.id == journey.id else item
            for item in release.journeys
        )
    )


def test_a_link_names_a_record_a_system_of_the_call_exposes() -> None:
    release = _catalogue()
    journey, index, integration, record = _named_step(release)

    linked = _with_link(release, journey, index, replace(integration, interface_id=record.id))
    found, is_linked = interface_of(
        linked.interfaces,
        next(item for item in linked.journeys if item.id == journey.id),
        replace(integration, interface_id=record.id),
    )
    assert (found, is_linked) == (record, True)

    with pytest.raises(InvalidKnowledgeError, match="not in the catalogue"):
        _with_link(release, journey, index, replace(integration, interface_id="if-missing"))
    elsewhere = next(
        item
        for item in release.interfaces
        if item.system_id not in call_systems(journey, integration)
    )
    with pytest.raises(InvalidKnowledgeError, match="no system of the call is that one"):
        _with_link(release, journey, index, replace(integration, interface_id=elsewhere.id))


def test_a_tracking_flow_links_a_record_one_of_its_systems_exposes() -> None:
    release = _catalogue()
    (bpp,) = release.products
    record = release.interfaces[0]
    consumer = record.consumer_ids[0]

    def tracked(interface_id: str) -> ArchitectureKnowledge:
        flow = TrackingFlow(consumer, record.system_id, "Order status", interface_id=interface_id)
        return release.updated(products=(replace(bpp, tracking=OrderTracking(flows=(flow,))),))

    assert tracked(record.id).products[0].tracking.flows[0].interface_id == record.id  # type: ignore[union-attr]
    elsewhere = next(
        item for item in release.interfaces if item.system_id not in (consumer, record.system_id)
    )
    with pytest.raises(InvalidKnowledgeError, match="neither of its systems exposes"):
        tracked(elsewhere.id)


def test_a_linked_step_depends_as_its_record_says_whatever_its_style_reads() -> None:
    release = _catalogue()
    journey, index, integration, record, consumer = next(
        (journey, index, integration, record, other)
        for journey in release.journeys
        for index, integration in enumerate(journey.integrations)
        if integration.via_system_id is None
        for record in release.interfaces
        if record.system_id in call_systems(journey, integration)
        for other in call_systems(journey, integration)
        if other != record.system_id
    )
    # Written as an event, but the record a maintainer linked is what the step goes through.
    step = replace(integration, interface_id=record.id, style="Event / message")

    derived = {
        (item.source_system_id, item.target_system_id, item.kind): item
        for item in derive_dependencies(_with_link(release, journey, index, step))
    }

    expected = interface_dependency(record, consumer)
    assert expected in derived
    assert any(
        place.location.startswith(f"Catalogue › journey {journey.name}")
        for place in derived[expected].evidence
    )


def test_a_journey_read_again_keeps_the_links_a_maintainer_made() -> None:
    release = _catalogue()
    journey, index, integration, record = _named_step(release)
    linked = next(
        item
        for item in _with_link(
            release, journey, index, replace(integration, interface_id=record.id)
        ).journeys
        if item.id == journey.id
    )

    # The same journey as a reading would suggest it again: written alike, links unset.
    read_again = replace(
        linked,
        integrations=tuple(replace(item, interface_id=None) for item in linked.integrations),
    )

    assert kept_interface_links(read_again, linked).integrations[index].interface_id == record.id


@pytest.mark.parametrize(
    "file_format", [CatalogueFileFormat.YAML, CatalogueFileFormat.JSON, CatalogueFileFormat.XLSX]
)
def test_every_catalogue_file_format_keeps_a_link(file_format: CatalogueFileFormat) -> None:
    release = _catalogue()
    journey, index, integration, record = _named_step(release)
    release = _with_link(release, journey, index, replace(integration, interface_id=record.id))

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    read = next(item for item in content.journeys if item.id == journey.id)
    assert read.integrations[index].interface_id == record.id


def test_the_api_carries_a_link_both_ways() -> None:
    step = ActivityIntegration("10", "20", interface="evaluateOrder", interface_id="if-x")
    flow = TrackingFlow("a", "b", "Status", interface_id="if-y")

    assert ActivityIntegrationSchema.from_domain(step).to_domain() == step
    assert TrackingFlowSchema.from_domain(flow).to_domain() == flow
