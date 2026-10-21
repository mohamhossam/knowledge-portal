"""How systems connect, read from everything a version says about it.

A curator states a connection; an interface says its consumers depend on the system that
exposes it (or, for events and files, that the system sends to them); a journey's call says
one step's system calls the next one's. Each pair of systems is one link in the direction of
the dependency, whatever it is known from. A stated connection keeps its own words, and its
own kind unless it left the kind unsaid.

The map, the explorer and requirement mapping all read these links, so a catalogue that
records its interfaces and journeys but states no connection still connects its systems.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from knowledge_portal.domain.architecture.interfaces import InterfaceStyle
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    RelationshipKind,
    SystemRelationship,
)

# Of several kinds on one pair, the first here names the link.
_PRECEDENCE = (
    RelationshipKind.CALLS_API,
    RelationshipKind.PUBLISHES_EVENTS_TO,
    RelationshipKind.TRANSFERS_DATA_TO,
    RelationshipKind.ORCHESTRATES,
    RelationshipKind.UNSPECIFIED,
)
_INTERFACE_KIND = {
    InterfaceStyle.API: RelationshipKind.CALLS_API,
    InterfaceStyle.EVENT: RelationshipKind.PUBLISHES_EVENTS_TO,
    InterfaceStyle.FILE: RelationshipKind.TRANSFERS_DATA_TO,
    InterfaceStyle.UNSPECIFIED: RelationshipKind.UNSPECIFIED,
}
# Said when nothing names what a link carries.
UNNAMED = "Known from its interfaces and journeys"


def style_kind(style: str | None) -> RelationshipKind:
    """The kind a journey call's style reads as; anything else stays unspecified."""
    said = (style or "").casefold()
    if re.search(r"event|message", said):
        return RelationshipKind.PUBLISHES_EVENTS_TO
    if re.search(r"api|xml|callback|rest|soap|request", said):
        return RelationshipKind.CALLS_API
    if re.search(r"database|file|batch", said):
        return RelationshipKind.TRANSFERS_DATA_TO
    return RelationshipKind.UNSPECIFIED


@dataclass(frozen=True)
class InterfaceSource:
    id: str
    name: str
    # The system that exposes it.
    system_id: str


@dataclass(frozen=True)
class JourneySource:
    id: str
    name: str
    # How many of its calls go this way.
    steps: int


@dataclass(frozen=True)
class SystemLink:
    """One link between two systems, and what it is known from."""

    relationship: SystemRelationship
    # A curator stated it: only these are edited as connections.
    stated: bool
    interfaces: tuple[InterfaceSource, ...]
    journeys: tuple[JourneySource, ...]


@dataclass
class _Pair:
    # Every connection a curator stated for the pair: each stays a link of its own.
    stated: list[SystemRelationship] = field(default_factory=list)
    kinds: set[RelationshipKind] = field(default_factory=set)
    interfaces: dict[str, InterfaceSource] = field(default_factory=dict)
    journeys: dict[str, JourneySource] = field(default_factory=dict)
    said: dict[str, None] = field(default_factory=dict)
    purposes: list[str] = field(default_factory=list)


def _named(names: list[str]) -> str:
    """A few names in full, the rest counted: "A, B, C and 4 more"."""
    if len(names) > 3:
        return f"{', '.join(names[:3])} and {len(names) - 3} more"
    return ", ".join(names)


def system_links(release: ArchitectureKnowledge) -> tuple[SystemLink, ...]:
    """Every link between systems in a version: stated ones first in their own order, then
    the rest as the interfaces and journeys name them."""
    pairs: dict[tuple[str, str], _Pair] = {}

    def pair(source: str | None, target: str | None) -> _Pair | None:
        if not source or not target or source == target:
            return None
        return pairs.setdefault((source, target), _Pair())

    for relationship in release.relationships:
        found = pair(relationship.source_system_id, relationship.target_system_id)
        if found is not None:
            found.stated.append(relationship)

    for item in release.interfaces:
        # A consumer calls an API; events and files go out from the system that exposes them.
        outward = item.style in (InterfaceStyle.EVENT, InterfaceStyle.FILE)
        for consumer in item.consumer_ids:
            found = pair(item.system_id, consumer) if outward else pair(consumer, item.system_id)
            if found is None:
                continue
            found.kinds.add(_INTERFACE_KIND[item.style])
            found.interfaces[item.id] = InterfaceSource(item.id, item.name, item.system_id)
            found.said[item.name] = None

    for journey in release.journeys:
        performer = {step.number: step.performing_system_id for step in journey.activities}
        for call in journey.integrations:
            found = pair(
                call.from_system_id or performer.get(call.from_activity),
                call.to_system_id or performer.get(call.to_activity),
            )
            if found is None:
                continue
            found.kinds.add(style_kind(call.style))
            seen = found.journeys.get(journey.id)
            found.journeys[journey.id] = JourneySource(
                journey.id, journey.name, (seen.steps if seen else 0) + 1
            )
            if call.interface:
                found.said[call.interface] = None
            if call.purpose:
                found.purposes.append(call.purpose)

    links: list[SystemLink] = []
    for (source, target), found in pairs.items():
        derived = next(
            (kind for kind in _PRECEDENCE if kind in found.kinds), RelationshipKind.UNSPECIFIED
        )
        interfaces = tuple(found.interfaces.values())
        journeys = tuple(found.journeys.values())
        if found.stated:
            # Each stated connection keeps its own words; the first is also what the
            # interfaces and journeys add to, and takes their kind when it left its own unsaid.
            for at, stated in enumerate(found.stated):
                kind = stated.kind
                if at == 0 and kind is RelationshipKind.UNSPECIFIED:
                    kind = derived
                links.append(
                    SystemLink(
                        SystemRelationship(source, target, stated.description, kind),
                        True,
                        interfaces if at == 0 else (),
                        journeys if at == 0 else (),
                    )
                )
            continue
        description = (
            _named(list(found.said)) or (found.purposes[0] if found.purposes else None) or UNNAMED
        )
        links.append(
            SystemLink(
                SystemRelationship(source, target, description, derived),
                False,
                interfaces,
                journeys,
            )
        )
    return tuple(links)


def connections(release: ArchitectureKnowledge) -> tuple[SystemRelationship, ...]:
    """The links as relationships, for what reads relationships: mapping's neighbours and
    dependencies, and the records the evidence index cuts."""
    return tuple(link.relationship for link in system_links(release))
