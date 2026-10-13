"""Who a data or contract change reaches: owners, readers and consumers (ontology plan
Phase 8, ADR-0114).

Only curated records are followed: a system's masters and reads, and the interfaces systems
expose with their consumers and the interfaces they relay. A change to data reaches its
systems of record, the systems that read it, and the consumers of every interface of a
system of record that carries it. A change to an interface reaches its consumers. The
ripple then goes on through relays, several interfaces away: an integration layer that
consumes the changed interface and relays it through one of its own reaches that
interface's consumers too, up to MAX_HOPS interfaces from the change.

Data is not followed past the first interface on its own: a consumer that receives an order
does not pass every order change on, so only a recorded relay carries the ripple further.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from knowledge_portal.domain.architecture.assessment import PathKind, PathStep
from knowledge_portal.domain.architecture.interfaces import SystemInterface
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.vocabularies import VocabularyScheme

# How many interfaces away from the change a consumer may be. Three covers a call through an
# integration layer to a system that publishes the result on.
MAX_HOPS = 3


@dataclass(frozen=True)
class Reach:
    """A system a change reaches, and the steps from the changed thing to it."""

    system_id: str
    steps: tuple[PathStep, ...]


def entity_family(release: ArchitectureKnowledge, entity_id: str) -> frozenset[str]:
    """The information entity and every entity narrower than it."""
    found = [entity_id]
    for current in found:
        found.extend(
            item.id
            for item in release.vocabulary
            if item.scheme is VocabularyScheme.INFORMATION_ENTITY and item.broader_id == current
        )
    return frozenset(found)


def _entity_step(release: ArchitectureKnowledge, entity_id: str) -> PathStep:
    term = next(item for item in release.vocabulary if item.id == entity_id)
    return PathStep(PathKind.ENTITY, term.id, term.pref_label)


def _system_step(release: ArchitectureKnowledge, system_id: str) -> PathStep:
    system = next(item for item in release.systems if item.id == system_id)
    return PathStep(PathKind.SYSTEM, system.id, system.name)


def _interface_step(interface: SystemInterface) -> PathStep:
    return PathStep(PathKind.INTERFACE, interface.id, interface.name)


def data_owners(release: ArchitectureKnowledge, entity_id: str) -> tuple[Reach, ...]:
    """The systems of record for the entity or a narrower one (entity, then system)."""
    family = entity_family(release, entity_id)
    return tuple(
        Reach(
            system.id,
            (_entity_step(release, entity_id), _system_step(release, system.id)),
        )
        for system in release.systems
        if family & set(system.masters)
    )


def data_readers(release: ArchitectureKnowledge, entity_id: str) -> tuple[Reach, ...]:
    """The systems that read the entity or a narrower one (entity, then system)."""
    family = entity_family(release, entity_id)
    return tuple(
        Reach(
            system.id,
            (_entity_step(release, entity_id), _system_step(release, system.id)),
        )
        for system in release.systems
        if family & set(system.reads)
    )


def interface_owner(release: ArchitectureKnowledge, interface_id: str) -> Reach | None:
    """The system that exposes the interface (interface, then system)."""
    interface = next((item for item in release.interfaces if item.id == interface_id), None)
    if interface is None:
        return None
    return Reach(
        interface.system_id,
        (_interface_step(interface), _system_step(release, interface.system_id)),
    )


def ripple(
    release: ArchitectureKnowledge,
    start: Iterable[Reach],
    entities: frozenset[str] | None,
    through: str | None = None,
) -> tuple[Reach, ...]:
    """The consumers a change at the start systems reaches, each by its shortest path.

    The first hop goes from each start system through the interface ``through`` names, when a
    named interface is what changes, else through every interface it exposes that carries the
    changed entities (every interface, when the change names none). Each later hop goes from
    a consumer through its own interfaces that relay the one it was reached by, up to
    MAX_HOPS interfaces away. A start system is never its own consumer, and a system is
    reached once.
    """
    seen: set[str] = set()
    frontier: list[tuple[Reach, SystemInterface | None]] = []
    for item in start:
        if item.system_id not in seen:
            seen.add(item.system_id)
            frontier.append((item, None))
    found: list[Reach] = []
    for _ in range(MAX_HOPS):
        following: list[tuple[Reach, SystemInterface | None]] = []
        for reach, came_by in frontier:
            for interface in release.interfaces:
                if interface.system_id != reach.system_id or not _passes(
                    interface, came_by, entities, through
                ):
                    continue
                for consumer in interface.consumer_ids:
                    if consumer in seen:
                        continue
                    seen.add(consumer)
                    steps = (
                        *reach.steps,
                        _interface_step(interface),
                        _system_step(release, consumer),
                    )
                    following.append((Reach(consumer, steps), interface))
        found.extend(reach for reach, _ in following)
        frontier = following
    return tuple(found)


def _passes(
    interface: SystemInterface,
    came_by: SystemInterface | None,
    entities: frozenset[str] | None,
    through: str | None,
) -> bool:
    """Whether the change travels through the interface: at the first hop the named
    interface, or one carrying the changed data; later, one relaying the interface the
    change arrived by."""
    if came_by is not None:
        return came_by.id in interface.relays
    if through is not None:
        return interface.id == through
    return entities is None or bool(entities & set(interface.entity_ids))
