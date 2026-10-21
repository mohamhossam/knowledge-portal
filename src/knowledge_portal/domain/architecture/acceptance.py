"""Accepted suggestions recorded on the facts they produced, and kept there (ADR-0120).

Every entity an accepted suggestion can create or extend carries ``accepted``. Accepting
appends one entry to the entity of the suggestion's own kind that the acceptance created
or changed; everything else keeps exactly the entries it had. A maintainer's edit is the
same rule with nothing to append, so history stays history whatever the edit replaced.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from typing import Any, ClassVar, Protocol

from knowledge_portal.domain.architecture.candidates import CandidateKind
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.interfaces import SystemInterface
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeCapability,
    LandscapeDomain,
    SystemComponent,
    SystemDefinition,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
from knowledge_portal.domain.architecture.vocabularies import VocabularyTerm

# Which entity, by kind and identity: ("system", id), ("component", system id, id),
# ("relationship", source, target, kind), ("offering", id) and so on.
type AcceptanceKey = tuple[str, ...]
type _Carrier = (
    SystemDefinition
    | SystemComponent
    | KnowledgeCapability
    | SystemRelationship
    | LandscapeDomain
    | ProductOffering
    | Journey
    | Channel
    | SystemInterface
    | BusinessCapability
    | VocabularyTerm
)


class CatalogueBody(Protocol):
    """A release, or a catalogue file's content: the collections whose entities carry
    provenance."""

    __dataclass_fields__: ClassVar[dict[str, Any]]

    @property
    def systems(self) -> tuple[SystemDefinition, ...]: ...

    @property
    def relationships(self) -> tuple[SystemRelationship, ...]: ...

    @property
    def landscape_domains(self) -> tuple[LandscapeDomain, ...]: ...

    @property
    def products(self) -> tuple[ProductOffering, ...]: ...

    @property
    def journeys(self) -> tuple[Journey, ...]: ...

    @property
    def channels(self) -> tuple[Channel, ...]: ...

    @property
    def business_capabilities(self) -> tuple[BusinessCapability, ...]: ...

    @property
    def vocabulary(self) -> tuple[VocabularyTerm, ...]: ...

    @property
    def interfaces(self) -> tuple[SystemInterface, ...]: ...


class _Visitor(Protocol):
    def __call__[T: _Carrier](self, key: AcceptanceKey, item: T, /) -> T: ...


# Which entity an accepted suggestion of each kind records itself on: its subject.
_SUBJECT: dict[CandidateKind, str] = {
    CandidateKind.SYSTEM: "system",
    CandidateKind.PLACEMENT: "system",
    CandidateKind.CONSTRAINT: "system",
    CandidateKind.COMPONENT: "component",
    CandidateKind.CAPABILITY: "capability",
    CandidateKind.RELATIONSHIP: "relationship",
    CandidateKind.LANDSCAPE_DOMAIN: "landscape_domain",
    CandidateKind.PRODUCT: "offering",
    CandidateKind.OFFERING_RULE: "offering",
    CandidateKind.QUESTION: "offering",
    CandidateKind.COMPONENT_LINK: "offering",
    CandidateKind.JOURNEY: "journey",
    CandidateKind.CHANNEL: "channel",
    CandidateKind.INTERFACE: "interface",
    CandidateKind.CONCEPT: "concept",
    CandidateKind.VOCABULARY_TERM: "term",
}


def _visit[Body: CatalogueBody](body: Body, visit: _Visitor) -> Body:
    """The body with every entity that carries provenance passed through ``visit``.

    Parts first, so a system is visited with its components and capabilities already done.
    """
    systems = tuple(
        visit(
            ("system", system.id),
            replace(
                system,
                components=tuple(
                    visit(("component", system.id, part.id), part) for part in system.components
                ),
                capabilities=tuple(
                    visit(("capability", system.id, item.id), item) for item in system.capabilities
                ),
            ),
        )
        for system in body.systems
    )
    return replace(
        body,
        systems=systems,
        relationships=tuple(
            visit(
                ("relationship", item.source_system_id, item.target_system_id, item.kind.value),
                item,
            )
            for item in body.relationships
        ),
        landscape_domains=tuple(
            visit(("landscape_domain", item.id), item) for item in body.landscape_domains
        ),
        products=tuple(visit(("offering", item.id), item) for item in body.products),
        journeys=tuple(visit(("journey", item.id), item) for item in body.journeys),
        channels=tuple(visit(("channel", item.id), item) for item in body.channels),
        business_capabilities=tuple(
            visit(("concept", item.id), item) for item in body.business_capabilities
        ),
        vocabulary=tuple(visit(("term", item.id), item) for item in body.vocabulary),
        interfaces=tuple(visit(("interface", item.id), item) for item in body.interfaces),
    )


def _entities(body: CatalogueBody) -> dict[AcceptanceKey, _Carrier]:
    found: dict[AcceptanceKey, _Carrier] = {}

    def remember[T: _Carrier](key: AcceptanceKey, item: T) -> T:
        found[key] = item
        return item

    _visit(body, remember)
    return found


def _restamped(
    before: ArchitectureKnowledge,
    after: ArchitectureKnowledge,
    subject: str | None,
    entry: AcceptedFrom | None,
) -> ArchitectureKnowledge:
    previous = _entities(before)

    def kept[T: _Carrier](key: AcceptanceKey, item: T) -> T:
        old = previous.get(key)
        # Everything it held stays, followed by whatever it arrived with that it did not
        # hold: a catalogue file carries its own record, an edit or a suggestion none.
        held = item.accepted
        if old is not None:
            held = (*old.accepted, *(each for each in item.accepted if each not in old.accepted))
        stamps = held
        if entry is not None and key[0] == subject:
            if old is None or replace(old, accepted=()) != replace(item, accepted=()):
                stamps = (*held, entry)
        return item if item.accepted == stamps else replace(item, accepted=stamps)

    return _visit(after, kept)


def with_acceptance(
    kind: CandidateKind,
    before: ArchitectureKnowledge,
    after: ArchitectureKnowledge,
    entry: AcceptedFrom,
) -> ArchitectureKnowledge:
    """``after`` (``before`` with one suggestion applied) recording it on its subject.

    The subject is stamped only when the acceptance created or changed it: a suggestion
    that added nothing contributed nothing.
    """
    return _restamped(before, after, _SUBJECT[kind], entry)


def with_provenance_kept(
    current: ArchitectureKnowledge, edited: ArchitectureKnowledge
) -> ArchitectureKnowledge:
    """``edited`` with every entity that ``current`` holds keeping its recorded acceptances.

    Nothing an edit sends removes one. An edit made on a page sends none, so it adds none;
    an imported file adds the ones it recorded, so an exported history survives the trip.
    """
    return _restamped(current, edited, None, None)


def without_acceptances(release: ArchitectureKnowledge) -> ArchitectureKnowledge:
    """The release with no acceptance recorded anywhere, for readers who see content only."""

    def cleared[T: _Carrier](_key: AcceptanceKey, item: T) -> T:
        return replace(item, accepted=()) if item.accepted else item

    return _visit(release, cleared)


def recorded_acceptances(
    body: CatalogueBody,
) -> dict[AcceptanceKey, tuple[AcceptedFrom, ...]]:
    """Every entity that records acceptances, by key, in catalogue order."""
    return {key: item.accepted for key, item in _entities(body).items() if item.accepted}


def with_recorded_acceptances[Body: CatalogueBody](
    body: Body, recorded: Mapping[AcceptanceKey, tuple[AcceptedFrom, ...]]
) -> Body:
    """The body with the acceptances a file recorded set on the entities they name.

    A record naming nothing in the body is left out: it describes nothing there.
    """

    def restored[T: _Carrier](key: AcceptanceKey, item: T) -> T:
        stamps = recorded.get(key)
        return item if stamps is None else replace(item, accepted=stamps)

    return _visit(body, restored)
