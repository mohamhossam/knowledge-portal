"""Curate value streams, products, squads and people, independent of HTTP and storage."""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import replace

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.identity import (
    Actor,
    require_maintainer,
    require_reader,
)
from knowledge_portal.application.ports.organisation_repository import (
    OrganisationRepositoryPort,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.organisation.catalogue import (
    InvalidOrganisationError,
    OrganisationAuditEvent,
    OrganisationCatalogue,
    Person,
    Product,
    ReferenceFlag,
    ReleaseReferences,
    Squad,
    SystemOwnership,
    ValueStream,
    check_references,
)

_AUDIT_LIMIT = 200


class ManageOrganisationCatalogue:
    def __init__(
        self,
        repository: OrganisationRepositoryPort,
        architecture: ArchitectureKnowledgeRepositoryPort,
    ) -> None:
        self._repository = repository
        self._architecture = architecture

    def view(self, actor: Actor) -> OrganisationCatalogue:
        """Readers see who does what; contact details are for maintainers only."""
        require_reader(actor)
        catalogue = self._repository.load()
        if actor.may_maintain_knowledge:
            return catalogue
        return replace(
            catalogue, people=tuple(replace(item, email=None) for item in catalogue.people)
        )

    def audit(self, actor: Actor) -> tuple[OrganisationAuditEvent, ...]:
        require_maintainer(actor)
        return self._repository.audit(_AUDIT_LIMIT)

    def ownership(
        self, system_id: str, actor: Actor, capability_id: str | None = None
    ) -> SystemOwnership:
        return self.view(actor).ownership(system_id, capability_id)

    def references(self, actor: Actor) -> tuple[ReferenceFlag, ...]:
        """Squads and products whose links the version in service leaves stale.

        Read on demand, so publishing a release that retires a system, offering or
        portfolio node flags whatever still names it from that moment on.
        """
        catalogue = self.view(actor)
        return check_references(catalogue, _release_references(self._architecture.active()))

    def save_person(
        self, person: Person, expected_revision: int | None, actor: Actor
    ) -> OrganisationCatalogue:
        require_maintainer(actor)
        return self._repository.change(
            lambda current: current.put_person(person, expected_revision),
            actor.id,
            "save_person",
            person.id,
        )

    def save_value_stream(
        self, stream: ValueStream, expected_revision: int | None, actor: Actor
    ) -> OrganisationCatalogue:
        require_maintainer(actor)
        return self._repository.change(
            lambda current: current.put_value_stream(stream, expected_revision),
            actor.id,
            "save_value_stream",
            stream.id,
        )

    def save_product(
        self, product: Product, expected_revision: int | None, actor: Actor
    ) -> OrganisationCatalogue:
        require_maintainer(actor)

        def change(current: OrganisationCatalogue) -> OrganisationCatalogue:
            previous = next((item for item in current.products if item.id == product.id), None)
            release = _release_references(self._architecture.active())
            _require_known(
                "Systems",
                product.system_ids,
                release.systems,
                previous.system_ids if previous is not None else (),
            )
            _require_known(
                "Offerings",
                product.offering_ids,
                release.offering_systems,
                previous.offering_ids if previous is not None else (),
            )
            if product.portfolio_node_id is not None:
                _require_known(
                    "Portfolio nodes",
                    (product.portfolio_node_id,),
                    release.portfolio_node_ids,
                    (previous.portfolio_node_id,)
                    if previous and previous.portfolio_node_id
                    else (),
                )
            return current.put_product(product, expected_revision)

        return self._repository.change(change, actor.id, "save_product", product.id)

    def save_squad(
        self, squad: Squad, expected_revision: int | None, actor: Actor
    ) -> OrganisationCatalogue:
        require_maintainer(actor)

        def change(current: OrganisationCatalogue) -> OrganisationCatalogue:
            previous = next((item for item in current.squads if item.id == squad.id), None)
            release = _release_references(self._architecture.active())
            _require_known(
                "Systems",
                squad.system_ids,
                release.systems,
                previous.system_ids if previous else (),
            )
            _require_realised(squad, release, previous)
            return current.put_squad(squad, expected_revision)

        return self._repository.change(change, actor.id, "save_squad", squad.id)

    def remove_value_stream(
        self, value_stream_id: str, expected_revision: int, actor: Actor
    ) -> OrganisationCatalogue:
        require_maintainer(actor)
        return self._repository.change(
            lambda current: current.remove_value_stream(value_stream_id, expected_revision),
            actor.id,
            "remove_value_stream",
            value_stream_id,
        )

    def remove_product(
        self, product_id: str, expected_revision: int, actor: Actor
    ) -> OrganisationCatalogue:
        require_maintainer(actor)
        return self._repository.change(
            lambda current: current.remove_product(product_id, expected_revision),
            actor.id,
            "remove_product",
            product_id,
        )

    def remove_squad(
        self, squad_id: str, expected_revision: int, actor: Actor
    ) -> OrganisationCatalogue:
        require_maintainer(actor)
        return self._repository.change(
            lambda current: current.remove_squad(squad_id, expected_revision),
            actor.id,
            "remove_squad",
            squad_id,
        )


def _release_references(release: ArchitectureKnowledge) -> ReleaseReferences:
    return ReleaseReferences(
        systems={
            system.id: {item.concept_id for item in system.capabilities if item.concept_id}
            for system in release.systems
        },
        offering_systems={
            offering.id: _offering_systems(release, offering) for offering in release.products
        },
        portfolio_node_ids={item.id for item in release.portfolio},
    )


def _offering_systems(release: ArchitectureKnowledge, offering: ProductOffering) -> set[str]:
    """The systems an offering names: its components' responsible systems, the systems
    its order channels are entered through, and those its journeys' activities use."""
    entry = {item.id: item.entry_system_id for item in release.channels}
    systems = {
        responsibility.system_id
        for component in offering.components
        for responsibility in component.responsibilities
    }
    for order_type in offering.order_types:
        for channel_id in order_type.channels:
            entry_system = entry.get(channel_id)
            if entry_system is not None:
                systems.add(entry_system)
    for journey in release.journeys:
        if journey.product_id != offering.id:
            continue
        for activity in journey.activities:
            if activity.performing_system_id is not None:
                systems.add(activity.performing_system_id)
            systems.update(activity.supporting_system_ids)
    return systems


def _require_known(
    label: str,
    ids: tuple[str, ...],
    known: Collection[str],
    already_linked: tuple[str, ...],
) -> None:
    """New links must name what the active release has; kept links may have lapsed."""
    unknown = sorted(set(ids) - set(known) - set(already_linked))
    if unknown:
        raise InvalidOrganisationError(
            f"{label} {', '.join(unknown)} are not in the active architecture catalogue."
        )


def _require_realised(squad: Squad, release: ReleaseReferences, previous: Squad | None) -> None:
    """A seat newly scoped to a capability names a concept its system realises in the
    active release; a scope the squad already had may have lapsed."""
    kept = (
        {(item.system_id, item.capability_id) for item in previous.resources} if previous else set()
    )
    for resource in squad.resources:
        scope = (resource.system_id, resource.capability_id)
        if resource.capability_id is None or scope in kept:
            continue
        if resource.capability_id not in release.systems.get(resource.system_id, ()):
            raise InvalidOrganisationError(
                f"{resource.system_id} has no capability linked to concept "
                f"{resource.capability_id!r} in the active architecture catalogue."
            )
