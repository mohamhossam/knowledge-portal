"""Where the catalogue writes a vocabulary value, and the term each one is linked to.

Six fields hold text a built-in vocabulary covers: an activity's eTOM process and
role, a channel's kind, an offering component's kind, a responsibility's role, and an
integration's TM Forum equivalent. Eight more are covered once a curator binds a
vocabulary of their own to them (review recommendation 9): an offering's NFR quality,
family, lifecycle stage and business-rule kind, an activity's mode and phase, a portfolio
node's level, and a system component's technology. ``written_values`` lists each place
one is written; ``with_terms`` links places to a term, but only where the text is still
what was read and no term is linked yet, so a maintainer's own link always stands.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING

from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, required
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    ActivityIntegration,
    Journey,
)
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import (
    OfferingComponent,
    ProductOffering,
)
from knowledge_portal.domain.architecture.vocabularies import (
    FIELD_SCHEMES,
    VocabularyField,
    VocabularyTerm,
    check_terms,
)

if TYPE_CHECKING:
    # The system register imports this module to check a version; a system is only read.
    from knowledge_portal.domain.architecture.knowledge import SystemDefinition

__all__ = [
    "FIELD_SCHEMES",
    "LinkedParts",
    "VocabularyField",
    "VocabularyRef",
    "WrittenValue",
    "check_vocabulary_links",
    "kept_component_terms",
    "kept_journey_terms",
    "kept_offering_terms",
    "linkable",
    "with_terms",
    "written_values",
]

# Fields written once per owner, so a place names no item.
_WHOLE = frozenset(
    {
        VocabularyField.CHANNEL_KIND,
        VocabularyField.OFFERING_FAMILY,
        VocabularyField.OFFERING_LIFECYCLE,
        VocabularyField.PORTFOLIO_LEVEL,
    }
)


@dataclass(frozen=True)
class VocabularyRef:
    """One place a value is written, and the value as it was read there.

    - activity fields: ``owner_id`` is the journey, ``item`` the activity number
    - channel kind: ``owner_id`` is the channel
    - component kind: ``owner_id`` is the offering, ``item`` the component
    - responsibility role: ``owner_id`` is the offering, ``item`` the component and
      ``part`` the responsible system
    - integration: ``owner_id`` is the journey, ``item`` the integration's position in it
    - offering family and lifecycle: ``owner_id`` is the offering
    - NFR quality: ``owner_id`` is the offering, ``item`` the quality as written
    - business-rule kind: ``owner_id`` is the offering, ``item`` the rule
    - portfolio level: ``owner_id`` is the node
    - component technology: ``owner_id`` is the system, ``item`` the component
    """

    field: VocabularyField
    owner_id: str
    value: str
    item: str | None = None
    part: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "field", VocabularyField(self.field))
        object.__setattr__(self, "owner_id", required(self.owner_id, "Vocabulary owner"))
        object.__setattr__(self, "value", required(self.value, "Written value"))
        needs_item = self.field not in _WHOLE
        if needs_item != (self.item is not None):
            raise InvalidKnowledgeError(f"A {self.field.value} reference names its item.")
        if (self.field is VocabularyField.RESPONSIBILITY_ROLE) != (self.part is not None):
            raise InvalidKnowledgeError("Only a responsibility's role names its system.")

    @property
    def scheme(self) -> str | None:
        """Its built-in scheme; None for a field only a curated scheme covers."""
        return FIELD_SCHEMES.get(self.field)


@dataclass(frozen=True)
class WrittenValue:
    ref: VocabularyRef
    # The terms it is linked to now; empty while unmapped.
    term_ids: tuple[str, ...]


def _ids(term_id: str | None) -> tuple[str, ...]:
    return (term_id,) if term_id else ()


def written_values(
    products: tuple[ProductOffering, ...],
    journeys: tuple[Journey, ...],
    channels: tuple[Channel, ...],
    *,
    portfolio: tuple[PortfolioNode, ...] = (),
    systems: tuple[SystemDefinition, ...] = (),
) -> tuple[WrittenValue, ...]:
    """Every vocabulary value the catalogue writes, in catalogue order, whether or not a
    vocabulary covers its field yet."""
    found: list[WrittenValue] = []

    def add(
        field: VocabularyField,
        owner: str,
        value: str | None,
        term_id: str | None,
        item: str | None = None,
    ) -> None:
        if value:
            found.append(WrittenValue(VocabularyRef(field, owner, value, item), _ids(term_id)))

    for channel in channels:
        add(VocabularyField.CHANNEL_KIND, channel.id, channel.kind, channel.kind_id)
    for node in portfolio:
        add(VocabularyField.PORTFOLIO_LEVEL, node.id, node.level, node.level_id)
    for offering in products:
        add(VocabularyField.OFFERING_FAMILY, offering.id, offering.family, offering.family_id)
        add(
            VocabularyField.OFFERING_LIFECYCLE,
            offering.id,
            offering.lifecycle,
            offering.lifecycle_id,
        )
        for nfr in offering.nfrs:
            add(VocabularyField.NFR_QUALITY, offering.id, nfr.quality, nfr.quality_id, nfr.quality)
        for rule in offering.business_rules:
            add(VocabularyField.RULE_KIND, offering.id, rule.kind, rule.kind_id, rule.id)
        for component in offering.components:
            if component.kind:
                ref = VocabularyRef(
                    VocabularyField.COMPONENT_KIND, offering.id, component.kind, component.id
                )
                found.append(WrittenValue(ref, _ids(component.kind_id)))
            for duty in component.responsibilities:
                ref = VocabularyRef(
                    VocabularyField.RESPONSIBILITY_ROLE,
                    offering.id,
                    duty.role,
                    component.id,
                    duty.system_id,
                )
                found.append(WrittenValue(ref, _ids(duty.role_id)))
    for journey in journeys:
        for activity in journey.activities:
            if activity.etom:
                ref = VocabularyRef(
                    VocabularyField.ACTIVITY_ETOM, journey.id, activity.etom, activity.number
                )
                found.append(WrittenValue(ref, _ids(activity.etom_id)))
            if activity.role:
                ref = VocabularyRef(
                    VocabularyField.ACTIVITY_ROLE, journey.id, activity.role, activity.number
                )
                found.append(WrittenValue(ref, _ids(activity.role_id)))
            add(
                VocabularyField.ACTIVITY_MODE,
                journey.id,
                activity.mode,
                activity.mode_id,
                activity.number,
            )
            add(
                VocabularyField.ACTIVITY_PHASE,
                journey.id,
                activity.phase,
                activity.phase_id,
                activity.number,
            )
        for position, link in enumerate(journey.integrations):
            if link.tmf_equivalent:
                ref = VocabularyRef(
                    VocabularyField.INTEGRATION_OPEN_API,
                    journey.id,
                    link.tmf_equivalent,
                    str(position),
                )
                found.append(WrittenValue(ref, link.open_api_ids))
    for system in systems:
        for part in system.components:
            add(
                VocabularyField.COMPONENT_TECHNOLOGY,
                system.id,
                part.technology,
                part.technology_id,
                part.id,
            )
    return tuple(found)


def check_vocabulary_links(
    terms: dict[str, VocabularyTerm],
    products: tuple[ProductOffering, ...],
    journeys: tuple[Journey, ...],
    channels: tuple[Channel, ...],
    *,
    portfolio: tuple[PortfolioNode, ...] = (),
    systems: tuple[SystemDefinition, ...] = (),
    bound: Mapping[VocabularyField, str] | None = None,
    names: Mapping[str, str] | None = None,
) -> None:
    """Every linked term exists in its field's scheme, so a term in use cannot be removed,
    and a field no vocabulary covers links none. ``bound`` is each field's scheme
    (``field_schemes``); the built-in ones when not given."""
    schemes = FIELD_SCHEMES if bound is None else bound

    def check(field: VocabularyField, term_ids: tuple[str, ...], where: str) -> None:
        check_terms(term_ids, schemes.get(field), terms, where, names)

    for channel in channels:
        check(VocabularyField.CHANNEL_KIND, _ids(channel.kind_id), f"Channel {channel.name}")
    for node in portfolio:
        check(VocabularyField.PORTFOLIO_LEVEL, _ids(node.level_id), f"Portfolio {node.name}")
    for offering in products:
        check(VocabularyField.OFFERING_FAMILY, _ids(offering.family_id), offering.name)
        check(VocabularyField.OFFERING_LIFECYCLE, _ids(offering.lifecycle_id), offering.name)
        for nfr in offering.nfrs:
            check(
                VocabularyField.NFR_QUALITY,
                _ids(nfr.quality_id),
                f"{offering.name} › NFR {nfr.quality}",
            )
        for rule in offering.business_rules:
            check(
                VocabularyField.RULE_KIND, _ids(rule.kind_id), f"{offering.name} › rule {rule.id}"
            )
        for component in offering.components:
            where = f"{offering.name} › {component.name}"
            check(VocabularyField.COMPONENT_KIND, _ids(component.kind_id), where)
            for duty in component.responsibilities:
                check(
                    VocabularyField.RESPONSIBILITY_ROLE,
                    _ids(duty.role_id),
                    f"{where} › {duty.system_id}",
                )
    for journey in journeys:
        for activity in journey.activities:
            where = f"{journey.name} › {activity.number}. {activity.name}"
            check(VocabularyField.ACTIVITY_ETOM, _ids(activity.etom_id), where)
            check(VocabularyField.ACTIVITY_ROLE, _ids(activity.role_id), where)
            check(VocabularyField.ACTIVITY_MODE, _ids(activity.mode_id), where)
            check(VocabularyField.ACTIVITY_PHASE, _ids(activity.phase_id), where)
        for link in journey.integrations:
            check(
                VocabularyField.INTEGRATION_OPEN_API,
                link.open_api_ids,
                f"{journey.name}: the call from activity {link.from_activity}",
            )
    for system in systems:
        for part in system.components:
            check(
                VocabularyField.COMPONENT_TECHNOLOGY,
                _ids(part.technology_id),
                f"{system.name} › {part.name}",
            )


@dataclass(frozen=True)
class LinkedParts:
    products: tuple[ProductOffering, ...]
    journeys: tuple[Journey, ...]
    channels: tuple[Channel, ...]
    # How many places it linked.
    count: int
    portfolio: tuple[PortfolioNode, ...] = ()
    systems: tuple[SystemDefinition, ...] = ()


def _free(current: tuple[str, ...], term_id: str, field: VocabularyField) -> bool:
    """Whether a place still takes the term: unlinked, or an API list without it."""
    if field is VocabularyField.INTEGRATION_OPEN_API:
        return term_id not in current
    return not current


def linkable(
    refs: tuple[VocabularyRef, ...],
    term_id: str,
    products: tuple[ProductOffering, ...],
    journeys: tuple[Journey, ...],
    channels: tuple[Channel, ...],
    *,
    portfolio: tuple[PortfolioNode, ...] = (),
    systems: tuple[SystemDefinition, ...] = (),
) -> tuple[VocabularyRef, ...]:
    """The places a term would still be linked to: there, with the text read, and free."""
    now = {
        item.ref: item.term_ids
        for item in written_values(
            products, journeys, channels, portfolio=portfolio, systems=systems
        )
    }
    return tuple(ref for ref in refs if ref in now and _free(now[ref], term_id, ref.field))


def with_terms(
    refs: tuple[VocabularyRef, ...],
    term_id: str,
    products: tuple[ProductOffering, ...],
    journeys: tuple[Journey, ...],
    channels: tuple[Channel, ...],
    *,
    portfolio: tuple[PortfolioNode, ...] = (),
    systems: tuple[SystemDefinition, ...] = (),
) -> LinkedParts:
    """The parts with the term linked at every place that still takes it."""
    places = set(
        linkable(refs, term_id, products, journeys, channels, portfolio=portfolio, systems=systems)
    )

    def at(field: VocabularyField, owner: str, value: str | None, *path: str | None) -> bool:
        if value is None:
            return False
        item = path[0] if path else None
        part = path[1] if len(path) > 1 else None
        return VocabularyRef(field, owner, value, item, part) in places

    def linked(
        now: str | None, field: VocabularyField, owner: str, value: str | None, *path: str | None
    ) -> str | None:
        return term_id if at(field, owner, value, *path) else now

    def component(offering: ProductOffering, part: OfferingComponent) -> OfferingComponent:
        duties = tuple(
            replace(duty, role_id=term_id)
            if at(
                VocabularyField.RESPONSIBILITY_ROLE,
                offering.id,
                duty.role,
                part.id,
                duty.system_id,
            )
            else duty
            for duty in part.responsibilities
        )
        kind = at(VocabularyField.COMPONENT_KIND, offering.id, part.kind, part.id)
        return replace(part, responsibilities=duties, kind_id=term_id if kind else part.kind_id)

    def offering(item: ProductOffering) -> ProductOffering:
        return replace(
            item,
            family_id=linked(item.family_id, VocabularyField.OFFERING_FAMILY, item.id, item.family),
            lifecycle_id=linked(
                item.lifecycle_id, VocabularyField.OFFERING_LIFECYCLE, item.id, item.lifecycle
            ),
            nfrs=tuple(
                replace(
                    nfr,
                    quality_id=linked(
                        nfr.quality_id,
                        VocabularyField.NFR_QUALITY,
                        item.id,
                        nfr.quality,
                        nfr.quality,
                    ),
                )
                for nfr in item.nfrs
            ),
            business_rules=tuple(
                replace(
                    rule,
                    kind_id=linked(
                        rule.kind_id, VocabularyField.RULE_KIND, item.id, rule.kind, rule.id
                    ),
                )
                for rule in item.business_rules
            ),
            components=tuple(component(item, part) for part in item.components),
        )

    def activity(journey: Journey, step: Activity) -> Activity:
        etom = at(VocabularyField.ACTIVITY_ETOM, journey.id, step.etom, step.number)
        role = at(VocabularyField.ACTIVITY_ROLE, journey.id, step.role, step.number)
        return replace(
            step,
            etom_id=term_id if etom else step.etom_id,
            role_id=term_id if role else step.role_id,
            mode_id=linked(
                step.mode_id, VocabularyField.ACTIVITY_MODE, journey.id, step.mode, step.number
            ),
            phase_id=linked(
                step.phase_id, VocabularyField.ACTIVITY_PHASE, journey.id, step.phase, step.number
            ),
        )

    def integration(
        journey: Journey, position: int, link: ActivityIntegration
    ) -> ActivityIntegration:
        if not at(
            VocabularyField.INTEGRATION_OPEN_API, journey.id, link.tmf_equivalent, str(position)
        ):
            return link
        return replace(link, open_api_ids=(*link.open_api_ids, term_id))

    touched = {ref.owner_id for ref in places}
    return LinkedParts(
        products=tuple(offering(item) if item.id in touched else item for item in products),
        journeys=tuple(
            replace(
                item,
                activities=tuple(activity(item, step) for step in item.activities),
                integrations=tuple(
                    integration(item, position, link)
                    for position, link in enumerate(item.integrations)
                ),
            )
            if item.id in touched
            else item
            for item in journeys
        ),
        channels=tuple(
            replace(item, kind_id=term_id)
            if at(VocabularyField.CHANNEL_KIND, item.id, item.kind)
            else item
            for item in channels
        ),
        count=len(places),
        portfolio=tuple(
            replace(item, level_id=term_id)
            if at(VocabularyField.PORTFOLIO_LEVEL, item.id, item.level)
            else item
            for item in portfolio
        ),
        systems=tuple(
            replace(
                item,
                components=tuple(
                    replace(
                        part,
                        technology_id=linked(
                            part.technology_id,
                            VocabularyField.COMPONENT_TECHNOLOGY,
                            item.id,
                            part.technology,
                            part.id,
                        ),
                    )
                    for part in item.components
                ),
            )
            if item.id in touched
            else item
            for item in systems
        ),
    )


def kept_component_terms(item: OfferingComponent, kept: OfferingComponent) -> OfferingComponent:
    """A component read again keeping the terms linked where it still writes the same
    value: a document never unlinks what a maintainer mapped. Its realisations keep their
    records likewise, by layer and name (ontology plan Phase 8)."""
    roles = {(duty.system_id, duty.role): duty.role_id for duty in kept.responsibilities}
    records = {(layer.layer, layer.name): layer.record_id for layer in kept.realisation}
    return replace(
        item,
        kind_id=item.kind_id or (kept.kind_id if item.kind == kept.kind else None),
        responsibilities=tuple(
            replace(duty, role_id=duty.role_id or roles.get((duty.system_id, duty.role)))
            for duty in item.responsibilities
        ),
        realisation=tuple(
            replace(layer, record_id=layer.record_id or records.get((layer.layer, layer.name)))
            for layer in item.realisation
        ),
    )


def kept_journey_terms(journey: Journey, kept: Journey) -> Journey:
    """A journey read again keeping the terms linked where an activity, by number, or an
    integration, by its activities and interface, still writes the same value."""
    steps = {item.number: item for item in kept.activities}
    links = {
        (item.from_activity, item.to_activity, item.interface, item.tmf_equivalent): item
        for item in kept.integrations
    }

    def activity(step: Activity) -> Activity:
        before = steps.get(step.number)
        if before is None:
            return step
        return replace(
            step,
            etom_id=step.etom_id or (before.etom_id if before.etom == step.etom else None),
            role_id=step.role_id or (before.role_id if before.role == step.role else None),
            mode_id=step.mode_id or (before.mode_id if before.mode == step.mode else None),
            phase_id=step.phase_id or (before.phase_id if before.phase == step.phase else None),
        )

    def integration(link: ActivityIntegration) -> ActivityIntegration:
        before = links.get(
            (link.from_activity, link.to_activity, link.interface, link.tmf_equivalent)
        )
        if before is None or link.open_api_ids:
            return link
        return replace(link, open_api_ids=before.open_api_ids)

    return replace(
        journey,
        activities=tuple(activity(item) for item in journey.activities),
        integrations=tuple(integration(item) for item in journey.integrations),
    )


def kept_offering_terms(item: ProductOffering, kept: ProductOffering) -> ProductOffering:
    """An offering read again keeping the terms linked to its family, lifecycle stage, NFR
    qualities (by quality) and business-rule kinds (by rule) where it still writes the same
    value. Its components keep theirs through ``kept_component_terms``."""
    qualities = {nfr.quality: nfr.quality_id for nfr in kept.nfrs}
    kinds = {(rule.id, rule.kind): rule.kind_id for rule in kept.business_rules}
    return replace(
        item,
        family_id=item.family_id or (kept.family_id if item.family == kept.family else None),
        lifecycle_id=item.lifecycle_id
        or (kept.lifecycle_id if item.lifecycle == kept.lifecycle else None),
        nfrs=tuple(
            replace(nfr, quality_id=nfr.quality_id or qualities.get(nfr.quality))
            for nfr in item.nfrs
        ),
        business_rules=tuple(
            replace(rule, kind_id=rule.kind_id or kinds.get((rule.id, rule.kind)))
            for rule in item.business_rules
        ),
    )
