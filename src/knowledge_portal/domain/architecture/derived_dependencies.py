"""Dependencies a release's interfaces and journeys already say, as suggestions (ADR-0119).

An interface's consumers depend on the system that exposes it: an API's consumer calls
it, and an event's or a file's system sends to its consumers. A journey that hands over
from one system to another, through an integration layer or not, says the same of each
hop. A hop that goes through an interface record, linked or named alike, takes its kind and
direction from the record first, as the interface itself would; only a hop with no record
is read from its written style (review recommendation 8). Neither is a dependency until a
maintainer accepts it: this only finds them, one per source, target and kind, each citing
what says it.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

from knowledge_portal.domain.architecture.deprecation import in_service
from knowledge_portal.domain.architecture.interface_links import interface_of
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.journeys import ActivityIntegration, Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    RelationshipKind,
    with_purpose,
)

# A dependency said many times keeps a readable description and a reviewable citation list;
# its rationale still counts everything that says it.
MAX_PURPOSES = 5
MAX_EVIDENCE = 10

# How consuming an interface of each style reads as a dependency: an API is called by its
# consumer; events and files flow from the exposing system.
_STYLE_EDGE = {
    InterfaceStyle.API: (False, RelationshipKind.CALLS_API),
    InterfaceStyle.EVENT: (True, RelationshipKind.PUBLISHES_EVENTS_TO),
    InterfaceStyle.FILE: (True, RelationshipKind.TRANSFERS_DATA_TO),
    InterfaceStyle.UNSPECIFIED: (False, RelationshipKind.UNSPECIFIED),
}

# How a journey's integration is made, as its source writes it ("API", "XML request",
# "Event / message"); anything else says nothing of the kind.
_WRITTEN_KIND = (
    (re.compile(r"(?i)\b(?:events?|messages?)\b"), RelationshipKind.PUBLISHES_EVENTS_TO),
    (re.compile(r"(?i)\bfiles?\b"), RelationshipKind.TRANSFERS_DATA_TO),
    (re.compile(r"(?i)\b(?:api|request|callback)s?\b"), RelationshipKind.CALLS_API),
)


def interface_dependency(
    interface: SystemInterface, consumer_id: str
) -> tuple[str, str, RelationshipKind]:
    """The source, target and kind one consumer of ``interface`` implies."""
    exposer_first, kind = _STYLE_EDGE[interface.style]
    if exposer_first:
        return interface.system_id, consumer_id, kind
    return consumer_id, interface.system_id, kind


def written_kind(style: str | None) -> RelationshipKind:
    for pattern, kind in _WRITTEN_KIND:
        if style and pattern.search(style):
            return kind
    return RelationshipKind.UNSPECIFIED


@dataclass(frozen=True)
class DependencyEvidence:
    """One place in the catalogue that says a dependency: where, and what it says."""

    location: str
    quote: str


@dataclass(frozen=True)
class DerivedDependency:
    source_system_id: str
    target_system_id: str
    kind: RelationshipKind
    # What it is for: the purposes its sayings give, joined, interfaces first.
    description: str
    evidence: tuple[DependencyEvidence, ...]
    # How many interfaces and journey steps say it, and how many of their places are cited.
    rationale: str


def _count(number: int, noun: str) -> str:
    return "" if not number else f"1 {noun}" if number == 1 else f"{number} {noun}s"


def _rationale(interfaces: int, steps: int, places: int) -> str:
    said = " and ".join(
        part for part in (_count(interfaces, "interface"), _count(steps, "journey step")) if part
    )
    cited = (
        f"; the first {MAX_EVIDENCE} of {places} places are cited" if places > MAX_EVIDENCE else ""
    )
    return f"Said by {said} of this catalogue{cited}."


@dataclass
class _Sayings:
    purposes: list[str]
    evidence: list[DependencyEvidence]
    interfaces: int = 0
    steps: int = 0


def _names(release: ArchitectureKnowledge) -> dict[str, str]:
    return {item.id: item.name for item in release.systems}


def _from_interfaces(
    interfaces: Iterable[SystemInterface], names: dict[str, str]
) -> Iterable[tuple[str, str, RelationshipKind, str, DependencyEvidence]]:
    for interface in interfaces:
        exposer = names.get(interface.system_id, interface.system_id)
        for consumer in interface.consumer_ids:
            source, target, kind = interface_dependency(interface, consumer)
            yield (
                source,
                target,
                kind,
                interface.name,
                DependencyEvidence(
                    f"Catalogue › interface {interface.name} of {exposer}",
                    interface.description
                    or f"{names.get(consumer, consumer)} consumes {interface.name} of {exposer}.",
                ),
            )


def _ends(journey: Journey, integration: ActivityIntegration) -> tuple[str | None, str | None]:
    """The calling and called systems: as the integration names them, else the systems
    that perform its activities."""
    performers = {item.number: item.performing_system_id for item in journey.activities}
    return (
        integration.from_system_id or performers.get(integration.from_activity),
        integration.to_system_id or performers.get(integration.to_activity),
    )


def _record_edge(
    record: SystemInterface | None, linked: bool, source: str, target: str
) -> tuple[str, str, RelationshipKind] | None:
    """How a hop depends, as the interface record it goes through says: a linked record
    always (a maintainer chose it); one only named alike when it agrees with the hop's
    direction, since a relay of the same name may run the other way."""
    if record is None or record.system_id not in (source, target):
        return None
    consumer = target if record.system_id == source else source
    edge = interface_dependency(record, consumer)
    return edge if linked or edge[:2] == (source, target) else None


def _from_journeys(
    journeys: Iterable[Journey], interfaces: tuple[SystemInterface, ...]
) -> Iterable[tuple[str, str, RelationshipKind, str, DependencyEvidence]]:
    for journey in journeys:
        for integration in journey.integrations:
            calling, called = _ends(journey, integration)
            if calling is None or called is None or calling == called:
                continue
            via = integration.via_system_id
            hops = (
                ((calling, via), (via, called))
                if via is not None and via not in (calling, called)
                else ((calling, called),)
            )
            steps = (
                integration.from_activity
                if integration.from_activity == integration.to_activity
                else f"{integration.from_activity} to {integration.to_activity}"
            )
            record, linked = interface_of(interfaces, journey, integration)
            purpose = (
                record.name
                if record
                else integration.interface or integration.purpose or journey.name
            )
            said = integration.purpose or integration.interface or journey.name
            evidence = DependencyEvidence(
                f"Catalogue › journey {journey.name} › step {steps}",
                f"{said} (through the interface {record.name})"
                if record and record.name != said
                else said,
            )
            for source, target in hops:
                edge = _record_edge(record, linked, source, target)
                if edge is not None:
                    yield (*edge, purpose, evidence)
                else:
                    yield source, target, written_kind(integration.style), purpose, evidence


def _folded(
    found: dict[tuple[str, str, RelationshipKind], _Sayings],
) -> dict[tuple[str, str, RelationshipKind], _Sayings]:
    """An unspecified saying joins the pair's dependency of a stated kind when there is
    exactly one, as an unspecified suggestion means the pair's only one (ADR-0119)."""
    stated: dict[tuple[str, str], list[RelationshipKind]] = {}
    for source, target, kind in found:
        if kind is not RelationshipKind.UNSPECIFIED:
            stated.setdefault((source, target), []).append(kind)
    folded: dict[tuple[str, str, RelationshipKind], _Sayings] = {}
    for (source, target, kind), sayings in found.items():
        kinds = stated.get((source, target), [])
        if kind is RelationshipKind.UNSPECIFIED and len(kinds) == 1:
            kind = kinds[0]
        held = folded.setdefault((source, target, kind), _Sayings([], []))
        held.purposes.extend(sayings.purposes)
        held.evidence.extend(item for item in sayings.evidence if item not in held.evidence)
        held.interfaces += sayings.interfaces
        held.steps += sayings.steps
    return folded


def derive_dependencies(release: ArchitectureKnowledge) -> tuple[DerivedDependency, ...]:
    """Every dependency the release's interfaces and journeys say between two catalogued
    systems in service, ordered by source, target and kind."""
    serving = {item.id for item in in_service(release.systems)}
    found: dict[tuple[str, str, RelationshipKind], _Sayings] = {}
    for origin, said in (
        ("interface", _from_interfaces(release.interfaces, _names(release))),
        ("step", _from_journeys(release.journeys, release.interfaces)),
    ):
        for source, target, kind, purpose, evidence in said:
            if source not in serving or target not in serving or source == target:
                continue
            held = found.setdefault((source, target, kind), _Sayings([], []))
            held.purposes.append(purpose)
            if evidence not in held.evidence:
                held.evidence.append(evidence)
            if origin == "interface":
                held.interfaces += 1
            else:
                held.steps += 1
    derived: list[DerivedDependency] = []
    for (source, target, kind), sayings in sorted(
        _folded(found).items(), key=lambda item: (item[0][0], item[0][1], item[0][2].value)
    ):
        description = ""
        for purpose in sayings.purposes:
            if not description:
                description = purpose.strip()
            elif len(description.split(";")) < MAX_PURPOSES:
                description = with_purpose(description, purpose)
        derived.append(
            DerivedDependency(
                source,
                target,
                kind,
                description,
                tuple(sayings.evidence[:MAX_EVIDENCE]),
                _rationale(sayings.interfaces, sayings.steps, len(sayings.evidence)),
            )
        )
    return tuple(derived)
