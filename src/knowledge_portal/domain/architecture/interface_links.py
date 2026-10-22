"""Journey steps and tracking flows linked to the interface records they go through.

An integration on a journey and a tracking flow each write their interface as their source
does ("evaluateOrder"); ``interface_id`` names the record beside that text (review
recommendation 8), so the ripple, the journey view and the dependencies derived from both
(ADR-0119) speak of the same contract. A link is checked against the version: the record
exists, and it is exposed by a system at one end of the call or the layer it goes through.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import replace

from knowledge_portal.domain.architecture.interfaces import SystemInterface, find_interface_among
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.journeys import ActivityIntegration, Journey
from knowledge_portal.domain.architecture.products import ProductOffering


def call_systems(journey: Journey, integration: ActivityIntegration) -> tuple[str, ...]:
    """The systems a call is known to touch: as it names them, else the systems performing
    its activities, then the layer it goes through."""
    performers = {item.number: item.performing_system_id for item in journey.activities}
    named = (
        integration.from_system_id or performers.get(integration.from_activity),
        integration.to_system_id or performers.get(integration.to_activity),
        integration.via_system_id,
    )
    return tuple(dict.fromkeys(item for item in named if item))


def interface_of(
    interfaces: tuple[SystemInterface, ...], journey: Journey, integration: ActivityIntegration
) -> tuple[SystemInterface | None, bool]:
    """The record a call goes through, and whether it is linked (True) or only named alike.

    A linked record is the one ``interface_id`` names. Unlinked, the record whose name the
    written interface is, among those a system of the call exposes, when exactly one is;
    nothing otherwise. A name match is for readings a person reviews (derived dependencies),
    never a link of its own.
    """
    if integration.interface_id is not None:
        linked = next((item for item in interfaces if item.id == integration.interface_id), None)
        return linked, linked is not None
    if not integration.interface:
        return None, False
    found = {
        item.id: item
        for system_id in call_systems(journey, integration)
        if (item := find_interface_among(interfaces, integration.interface, system_id)) is not None
    }
    return (next(iter(found.values())), False) if len(found) == 1 else (None, False)


def check_interface_links(
    interfaces: Iterable[SystemInterface],
    journeys: Iterable[Journey],
    products: Iterable[ProductOffering],
) -> None:
    """Each link names a record of the version, exposed by a system the call touches."""
    by_id = {item.id: item for item in interfaces}

    def record(interface_id: str, where: str) -> SystemInterface:
        found = by_id.get(interface_id)
        if found is None:
            raise InvalidKnowledgeError(
                f"{where} goes through interface {interface_id!r}, which is not in the catalogue."
            )
        return found

    for journey in journeys:
        for integration in journey.integrations:
            if integration.interface_id is None:
                continue
            where = f"{journey.name}, step {integration.from_activity}"
            linked = record(integration.interface_id, where)
            touched = call_systems(journey, integration)
            if touched and linked.system_id not in touched:
                raise InvalidKnowledgeError(
                    f"{where} goes through {linked.name}, which {linked.system_id!r} exposes, "
                    "and no system of the call is that one."
                )
    for product in products:
        if product.tracking is None:
            continue
        for flow in product.tracking.flows:
            if flow.interface_id is None:
                continue
            where = f"{product.name}'s tracking flow {flow.label!r}"
            linked = record(flow.interface_id, where)
            if linked.system_id not in (flow.from_system_id, flow.to_system_id):
                raise InvalidKnowledgeError(
                    f"{where} goes through {linked.name}, which neither of its systems exposes."
                )


def kept_interface_links(journey: Journey, kept: Journey) -> Journey:
    """A journey read again keeping the interface record linked where an integration, by its
    activities and the interface it writes, still writes the same: a maintainer's link
    stands, as a term link does (``kept_journey_terms``)."""
    links = {
        (item.from_activity, item.to_activity, item.interface): item.interface_id
        for item in kept.integrations
        if item.interface_id is not None
    }
    return replace(
        journey,
        integrations=tuple(
            item
            if item.interface_id is not None
            else replace(
                item,
                interface_id=links.get((item.from_activity, item.to_activity, item.interface)),
            )
            for item in journey.integrations
        ),
    )
