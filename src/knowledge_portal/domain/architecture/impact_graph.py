"""The catalogue walk from capability concepts to offerings and systems (ADR-0114).

Only curated links are followed: a system capability linked to a concept, and an offering
component that requires a concept, with the systems its responsibilities name and the
systems that deliver the CFSs, RFSs and resources it is realised as (ontology plan Phase 8).
A concept also reaches what its narrower concepts reach. Domains, landscape areas and component
names select nothing.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from knowledge_portal.domain.architecture.assessment import PathKind, PathStep
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.realisations import realisation_chains


@dataclass(frozen=True)
class Realiser:
    """A system that realises a concept, and the steps from the concept to it."""

    system_id: str
    steps: tuple[PathStep, ...]


def concept_family(release: ArchitectureKnowledge, concept_id: str) -> tuple[str, ...]:
    """The concept and every concept narrower than it, the concept first."""
    found = [concept_id]
    for current in found:
        found.extend(
            item.id for item in release.business_capabilities if item.broader_id == current
        )
    return tuple(dict.fromkeys(found))


def _concept_step(release: ArchitectureKnowledge, concept_id: str) -> PathStep:
    concept = next(item for item in release.business_capabilities if item.id == concept_id)
    return PathStep(PathKind.CONCEPT, concept.id, concept.pref_label)


def realisers(release: ArchitectureKnowledge, concept_id: str) -> tuple[Realiser, ...]:
    """Every system that realises the concept or a narrower one, each path once.

    A system's own capability comes first (concept, then system); then each offering
    component that requires the concept, with its responsible systems (concept, offering,
    component, then system), then the systems delivering each record it is realised as,
    down through what realises that record (concept, offering, component, each record,
    then system).
    """
    found: dict[tuple[PathStep, ...], Realiser] = {}
    names = {item.id: item.name for item in release.systems}
    records = {item.id: item for item in release.realisations}
    for concept in concept_family(release, concept_id):
        first = _concept_step(release, concept)
        for system in release.systems:
            if any(item.concept_id == concept for item in system.capabilities):
                own: tuple[PathStep, ...] = (
                    first,
                    PathStep(PathKind.SYSTEM, system.id, system.name),
                )
                found.setdefault(own, Realiser(system.id, own))
        for offering in release.products:
            for part in offering.components:
                if concept not in part.capability_ids:
                    continue
                for duty in part.responsibilities:
                    if duty.system_id not in names:
                        continue
                    steps = (
                        first,
                        PathStep(PathKind.OFFERING, offering.id, offering.name),
                        PathStep(PathKind.COMPONENT, part.id, part.name),
                        PathStep(PathKind.SYSTEM, duty.system_id, names[duty.system_id]),
                    )
                    found.setdefault(steps, Realiser(duty.system_id, steps))
                for layer in part.realisation:
                    if layer.record_id not in records:
                        continue
                    for chain in realisation_chains(records, layer.record_id):
                        for depth, record in enumerate(chain, start=1):
                            for system_id in record.system_ids:
                                via: tuple[PathStep, ...] = (
                                    first,
                                    PathStep(PathKind.OFFERING, offering.id, offering.name),
                                    PathStep(PathKind.COMPONENT, part.id, part.name),
                                    *(
                                        PathStep(PathKind.REALISATION, item.id, item.name)
                                        for item in chain[:depth]
                                    ),
                                    PathStep(PathKind.SYSTEM, system_id, names[system_id]),
                                )
                                found.setdefault(via, Realiser(system_id, via))
    return tuple(found.values())


def composes(offering: ProductOffering, concepts: Iterable[str]) -> frozenset[str]:
    """Which of the concepts the offering's components require."""
    required = {concept for part in offering.components for concept in part.capability_ids}
    return frozenset(item for item in concepts if item in required)


def delivering_systems(release: ArchitectureKnowledge, offering: ProductOffering) -> frozenset[str]:
    """The systems the offering's delivery already uses: its components' responsible systems,
    the systems on its journeys, and the entry systems of the channels its orders come in by."""
    systems = {duty.system_id for part in offering.components for duty in part.responsibilities}
    for journey in release.journeys:
        if journey.product_id == offering.id:
            systems.update(journey.systems)
    channels = {channel for order in offering.order_types for channel in order.channels}
    systems.update(
        item.entry_system_id
        for item in release.channels
        if item.id in channels and item.entry_system_id is not None
    )
    return frozenset(systems)


def serves(
    release: ArchitectureKnowledge, offering: ProductOffering, concepts: Iterable[str]
) -> frozenset[str]:
    """Which of the concepts a system the offering's delivery uses realises."""
    used = delivering_systems(release, offering)
    return frozenset(
        concept
        for concept in concepts
        if any(item.system_id in used for item in realisers(release, concept))
    )


def realised_nowhere(release: ArchitectureKnowledge, concepts: Iterable[str]) -> frozenset[str]:
    """The concepts no system realises: capability gaps."""
    return frozenset(item for item in concepts if not realisers(release, item))
