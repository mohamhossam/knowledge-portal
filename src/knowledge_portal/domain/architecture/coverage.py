"""What a version holds that nothing links to (review recommendation 17).

A capability with no concept, a term nothing names, an interface nobody consumes and a
system outside the landscape each read as complete on their own page, yet each is a
fact no one can reach by following the catalogue. They were tolerated silently; the
Check step now lists them, and the publish checklist says how many are worth a look before
publishing. They do not hold it: an orphan may be work still to come. Retired items are
left out: they are kept to be read, not to be linked.
"""

from __future__ import annotations

from dataclasses import dataclass

from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.vocabularies import (
    VocabularyScheme,
    VocabularyTerm,
    check_schemes,
    scheme_name,
)
from knowledge_portal.domain.architecture.vocabulary_links import written_values

# Vocabularies used outside the version: the shared library classifies its documents by
# the document types of the version in service (ADR-0123), so nothing in it names them.
_USED_ELSEWHERE = frozenset({VocabularyScheme.DOCUMENT_TYPE.value})


@dataclass(frozen=True)
class Orphan:
    """One item nothing links to, by id and name, with what it belongs to by id and name:
    the system of a capability or an interface, the vocabulary of a term; None for a system."""

    id: str
    name: str
    owner_id: str | None = None
    owner: str | None = None


@dataclass(frozen=True)
class CatalogueCoverage:
    """The version's orphans by kind, each in catalogue order."""

    unlinked_capabilities: tuple[Orphan, ...]
    unused_terms: tuple[Orphan, ...]
    unconsumed_interfaces: tuple[Orphan, ...]
    unplaced_systems: tuple[Orphan, ...]

    @property
    def total(self) -> int:
        return (
            len(self.unlinked_capabilities)
            + len(self.unused_terms)
            + len(self.unconsumed_interfaces)
            + len(self.unplaced_systems)
        )


def coverage(release: ArchitectureKnowledge) -> CatalogueCoverage:
    systems = tuple(item for item in release.systems if not item.deprecated)
    names = {item.id: item.name for item in release.systems}
    return CatalogueCoverage(
        unlinked_capabilities=tuple(
            Orphan(capability.id, capability.name, system.id, system.name)
            for system in systems
            for capability in system.capabilities
            # A maintainer's reason why no concept fits is a decision, not a gap.
            if capability.concept_id is None and capability.unlinked_reason is None
        ),
        unused_terms=_unused_terms(release),
        unconsumed_interfaces=_unconsumed_interfaces(release, {item.id for item in systems}, names),
        unplaced_systems=tuple(
            Orphan(system.id, system.name)
            for system in systems
            if system.landscape_domain_id is None
        ),
    )


def _unused_terms(release: ArchitectureKnowledge) -> tuple[Orphan, ...]:
    """Terms no field, system or interface names. A term counts as used when a narrower
    term is, so a heading such as an eTOM level 1 process is not reported for its children."""
    named: set[str] = {
        term_id
        for value in written_values(
            release.products,
            release.journeys,
            release.channels,
            portfolio=release.portfolio,
            systems=release.systems,
        )
        for term_id in value.term_ids
    }
    for system in release.systems:
        named.update(system.masters, system.reads)
    for interface in release.interfaces:
        named.update(interface.open_api_ids, interface.entity_ids)
    by_id = {term.id: term for term in release.vocabulary}
    used: set[str] = set()
    for term_id in named:
        term: VocabularyTerm | None = by_id.get(term_id)
        while term is not None and term.id not in used:
            used.add(term.id)
            term = by_id.get(term.broader_id) if term.broader_id else None
    schemes = check_schemes(release.schemes)
    return tuple(
        Orphan(term.id, term.pref_label, term.scheme, scheme_name(term.scheme, schemes))
        for term in release.vocabulary
        if not term.deprecated and term.id not in used and term.scheme not in _USED_ELSEWHERE
    )


def _unconsumed_interfaces(
    release: ArchitectureKnowledge, in_service: set[str], names: dict[str, str]
) -> tuple[Orphan, ...]:
    """Interfaces of systems in service that no system is recorded as consuming and no
    journey step or tracking flow goes through."""
    gone_through = {
        link.interface_id for journey in release.journeys for link in journey.integrations
    }
    gone_through.update(
        flow.interface_id
        for offering in release.products
        if offering.tracking is not None
        for flow in offering.tracking.flows
    )
    return tuple(
        Orphan(item.id, item.name, item.system_id, names.get(item.system_id, item.system_id))
        for item in release.interfaces
        if item.system_id in in_service and not item.consumer_ids and item.id not in gone_through
    )
