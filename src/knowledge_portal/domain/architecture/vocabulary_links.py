"""Where the catalogue writes a vocabulary value, and the term each one is linked to.

Six fields hold text a controlled vocabulary covers: an activity's eTOM process and
role, a channel's kind, an offering component's kind, a responsibility's role, and an
integration's TM Forum equivalent. ``written_values`` lists each place one is
written; ``with_terms`` links places to a term, but only where the text is still
what was read and no term is linked yet, so a maintainer's own link always stands.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum

from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, required
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    ActivityIntegration,
    Journey,
)
from knowledge_portal.domain.architecture.products import (
    OfferingComponent,
    ProductOffering,
)
from knowledge_portal.domain.architecture.vocabularies import (
    VocabularyScheme,
    VocabularyTerm,
    check_terms,
)


class VocabularyField(StrEnum):
    ACTIVITY_ETOM = "activity_etom"
    ACTIVITY_ROLE = "activity_role"
    CHANNEL_KIND = "channel_kind"
    COMPONENT_KIND = "component_kind"
    RESPONSIBILITY_ROLE = "responsibility_role"
    INTEGRATION_OPEN_API = "integration_open_api"


FIELD_SCHEMES = {
    VocabularyField.ACTIVITY_ETOM: VocabularyScheme.ETOM_PROCESS,
    VocabularyField.ACTIVITY_ROLE: VocabularyScheme.RESPONSIBILITY_ROLE,
    VocabularyField.CHANNEL_KIND: VocabularyScheme.CHANNEL_KIND,
    VocabularyField.COMPONENT_KIND: VocabularyScheme.COMPONENT_KIND,
    VocabularyField.RESPONSIBILITY_ROLE: VocabularyScheme.RESPONSIBILITY_ROLE,
    VocabularyField.INTEGRATION_OPEN_API: VocabularyScheme.OPEN_API,
}


@dataclass(frozen=True)
class VocabularyRef:
    """One place a value is written, and the value as it was read there.

    - activity fields: ``owner_id`` is the journey, ``item`` the activity number
    - channel kind: ``owner_id`` is the channel
    - component kind: ``owner_id`` is the offering, ``item`` the component
    - responsibility role: ``owner_id`` is the offering, ``item`` the component and
      ``part`` the responsible system
    - integration: ``owner_id`` is the journey, ``item`` the integration's position in it
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
        needs_item = self.field is not VocabularyField.CHANNEL_KIND
        if needs_item != (self.item is not None):
            raise InvalidKnowledgeError(f"A {self.field.value} reference names its item.")
        if (self.field is VocabularyField.RESPONSIBILITY_ROLE) != (self.part is not None):
            raise InvalidKnowledgeError("Only a responsibility's role names its system.")

    @property
    def scheme(self) -> VocabularyScheme:
        return FIELD_SCHEMES[self.field]


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
) -> tuple[WrittenValue, ...]:
    """Every vocabulary value the catalogue writes, in catalogue order."""
    found: list[WrittenValue] = []
    for channel in channels:
        if channel.kind:
            ref = VocabularyRef(VocabularyField.CHANNEL_KIND, channel.id, channel.kind)
            found.append(WrittenValue(ref, _ids(channel.kind_id)))
    for offering in products:
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
        for position, link in enumerate(journey.integrations):
            if link.tmf_equivalent:
                ref = VocabularyRef(
                    VocabularyField.INTEGRATION_OPEN_API,
                    journey.id,
                    link.tmf_equivalent,
                    str(position),
                )
                found.append(WrittenValue(ref, link.open_api_ids))
    return tuple(found)


def check_vocabulary_links(
    terms: dict[str, VocabularyTerm],
    products: tuple[ProductOffering, ...],
    journeys: tuple[Journey, ...],
    channels: tuple[Channel, ...],
) -> None:
    """Every linked term exists in its field's scheme, so a term in use cannot be removed."""
    for channel in channels:
        check_terms(
            _ids(channel.kind_id), VocabularyScheme.CHANNEL_KIND, terms, f"Channel {channel.name}"
        )
    for offering in products:
        for component in offering.components:
            where = f"{offering.name} › {component.name}"
            check_terms(_ids(component.kind_id), VocabularyScheme.COMPONENT_KIND, terms, where)
            for duty in component.responsibilities:
                check_terms(
                    _ids(duty.role_id),
                    VocabularyScheme.RESPONSIBILITY_ROLE,
                    terms,
                    f"{where} › {duty.system_id}",
                )
    for journey in journeys:
        for activity in journey.activities:
            where = f"{journey.name} › {activity.number}. {activity.name}"
            check_terms(_ids(activity.etom_id), VocabularyScheme.ETOM_PROCESS, terms, where)
            check_terms(_ids(activity.role_id), VocabularyScheme.RESPONSIBILITY_ROLE, terms, where)
        for link in journey.integrations:
            check_terms(
                link.open_api_ids,
                VocabularyScheme.OPEN_API,
                terms,
                f"{journey.name}: the call from activity {link.from_activity}",
            )


@dataclass(frozen=True)
class LinkedParts:
    products: tuple[ProductOffering, ...]
    journeys: tuple[Journey, ...]
    channels: tuple[Channel, ...]
    # How many places it linked.
    count: int


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
) -> tuple[VocabularyRef, ...]:
    """The places a term would still be linked to: there, with the text read, and free."""
    now = {item.ref: item.term_ids for item in written_values(products, journeys, channels)}
    return tuple(ref for ref in refs if ref in now and _free(now[ref], term_id, ref.field))


def with_terms(
    refs: tuple[VocabularyRef, ...],
    term_id: str,
    products: tuple[ProductOffering, ...],
    journeys: tuple[Journey, ...],
    channels: tuple[Channel, ...],
) -> LinkedParts:
    """The parts with the term linked at every place that still takes it."""
    places = set(linkable(refs, term_id, products, journeys, channels))

    def at(field: VocabularyField, owner: str, value: str | None, *path: str | None) -> bool:
        if value is None:
            return False
        item = path[0] if path else None
        part = path[1] if len(path) > 1 else None
        return VocabularyRef(field, owner, value, item, part) in places

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

    def activity(journey: Journey, step: Activity) -> Activity:
        etom = at(VocabularyField.ACTIVITY_ETOM, journey.id, step.etom, step.number)
        role = at(VocabularyField.ACTIVITY_ROLE, journey.id, step.role, step.number)
        return replace(
            step,
            etom_id=term_id if etom else step.etom_id,
            role_id=term_id if role else step.role_id,
        )

    def integration(
        journey: Journey, position: int, link: ActivityIntegration
    ) -> ActivityIntegration:
        if not at(
            VocabularyField.INTEGRATION_OPEN_API, journey.id, link.tmf_equivalent, str(position)
        ):
            return link
        return replace(link, open_api_ids=(*link.open_api_ids, term_id))

    return LinkedParts(
        products=tuple(
            replace(item, components=tuple(component(item, part) for part in item.components))
            for item in products
        ),
        journeys=tuple(
            replace(
                item,
                activities=tuple(activity(item, step) for step in item.activities),
                integrations=tuple(
                    integration(item, position, link)
                    for position, link in enumerate(item.integrations)
                ),
            )
            for item in journeys
        ),
        channels=tuple(
            replace(item, kind_id=term_id)
            if at(VocabularyField.CHANNEL_KIND, item.id, item.kind)
            else item
            for item in channels
        ),
        count=len(places),
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
