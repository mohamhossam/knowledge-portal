"""Systems one catalogued relationship away from a mapped impact.

A mapped system rarely changes alone: what it calls and what calls it are the
first places a change can break. This walks the published relationships one hop
in both directions. It never selects a system; it lists what a reviewer should
check.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from knowledge_portal.domain.architecture.entities import ArchitectureDependency
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.knowledge import RelationshipKind, SystemRelationship

ADJACENT_LIMIT = 8

# How consuming an interface of each style reads as a one-hop edge. An API is
# called by its consumer; events and files flow from the exposing system.
_STYLE_EDGE = {
    InterfaceStyle.API: ("consumer_first", RelationshipKind.CALLS_API),
    InterfaceStyle.EVENT: ("exposer_first", RelationshipKind.PUBLISHES_EVENTS_TO),
    InterfaceStyle.FILE: ("exposer_first", RelationshipKind.TRANSFERS_DATA_TO),
    InterfaceStyle.UNSPECIFIED: ("consumer_first", RelationshipKind.UNSPECIFIED),
}


def interface_edges(interfaces: Iterable[SystemInterface]) -> tuple[SystemRelationship, ...]:
    """Curated interface consumption as one-hop edges.

    A release that records no system relationships (the seed catalogue does
    not) still knows who talks to whom through its interfaces; without this
    fallback the adjacent-systems view is always empty on such a release.
    Relays need no special walk here: a relaying system consumes the relayed
    interface itself, so each hop is already an edge.
    """
    edges: list[SystemRelationship] = []
    for item in interfaces:
        order, kind = _STYLE_EDGE[item.style]
        for consumer in item.consumer_ids:
            source, target = (
                (consumer, item.system_id)
                if order == "consumer_first"
                else (item.system_id, consumer)
            )
            edges.append(SystemRelationship(source, target, item.name, kind))
    return tuple(edges)


@dataclass(frozen=True)
class Adjacency:
    """Connected systems, the relationships that connect them, and how many were left out."""

    system_ids: tuple[str, ...]
    dependencies: tuple[ArchitectureDependency, ...]
    omitted: int


def adjacent(
    selected_ids: Iterable[str],
    relationships: Iterable[SystemRelationship],
    limit: int = ADJACENT_LIMIT,
) -> Adjacency:
    """Systems directly connected to ``selected_ids`` that were not selected themselves.

    Systems with more connections to the selection come first, then by id, so the
    result is the same on every call. Only the relationships of the kept systems
    are returned.
    """
    if limit < 0:
        raise ValueError("The adjacent-system limit must not be negative.")
    selected = set(selected_ids)
    edges: dict[str, list[SystemRelationship]] = {}
    for item in relationships:
        source_in = item.source_system_id in selected
        target_in = item.target_system_id in selected
        if source_in == target_in:
            continue
        other = item.target_system_id if source_in else item.source_system_id
        edges.setdefault(other, []).append(item)
    ranked = sorted(edges, key=lambda system_id: (-len(edges[system_id]), system_id))
    kept = ranked[:limit]
    dependencies = tuple(
        ArchitectureDependency(
            item.source_system_id, item.target_system_id, item.description, item.kind
        )
        for system_id in kept
        for item in sorted(
            edges[system_id],
            key=lambda rel: (rel.source_system_id, rel.target_system_id, rel.description),
        )
    )
    return Adjacency(tuple(kept), dependencies, len(ranked) - len(kept))
