"""What a draft changes relative to another release, for review before publishing."""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum

from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.products import ProductOffering

# What a changed offering names, in the order a reviewer reads it.
_OFFERING_FIELDS = (
    "name",
    "code",
    "family",
    "version",
    "lifecycle",
    "proposition",
    "rules",
    "confidence",
    "source",
    "order_types",
    "components",
    "values",
    "audiences",
    "nfrs",
    "tracking",
    "lifecycle_notes",
    "sources",
    "primary_source",
    "questions",
    "decisions",
    "boundaries",
    "not_used",
)


# A channel's attributes, and the field each is reported as: a relationship already
# reports "kind" for how it depends.
_CHANNEL_FIELDS = (
    ("name", "name"),
    ("kind", "channel_kind"),
    ("kind_id", "vocabulary_links"),
    ("entry_system_id", "entry_system_id"),
    ("description", "description"),
    ("confidence", "confidence"),
    ("source", "source"),
)


# A registered source's attributes and a conflict's, as reported (ADR-0101, step 5).
_SOURCE_FIELDS = (
    "title",
    "level",
    "short",
    "version",
    "file",
    "supplied",
    "authority",
    "scope",
    "boundary",
)
_CHANGE_REQUEST_FIELDS = (
    "title",
    "origin",
    "product_id",
    "requester",
    "reason",
    "priority",
    "target_date",
    "applied_at",
    "trace",
    "items",
    "gaps",
)
_CONFLICT_FIELDS = (
    "title",
    "a",
    "b",
    "scope",
    "difference",
    "impact",
    "decision",
    "confidence",
    "source",
)


_JOURNEY_FIELDS = (
    "name",
    "product_id",
    "order_type_code",
    "description",
    "confidence",
    "source",
    "activities",
    "flow_rules",
    "integrations",
)


# A concept's attributes, as reported (ADR-0114).
_CONCEPT_FIELDS = (
    "pref_label",
    "alt_labels",
    "definition",
    "broader_id",
    "domain_id",
    "exact_match",
    "confidence",
    "source",
)


# A vocabulary term's attributes, as reported.
_TERM_FIELDS = (
    "scheme",
    "pref_label",
    "alt_labels",
    "notation",
    "definition",
    "broader_id",
    "exact_match",
    "confidence",
    "source",
)


# An interface's attributes, as reported (ontology plan Phase 8).
_INTERFACE_FIELDS = (
    "name",
    "system_id",
    "style",
    "consumer_ids",
    "open_api_ids",
    "entity_ids",
    "relays",
    "description",
    "confidence",
    "source",
)

_REALISATION_FIELDS = (
    "layer",
    "name",
    "aliases",
    "system_ids",
    "realised_by",
    "description",
    "confidence",
    "source",
)


def _bare(offering: ProductOffering) -> tuple[object, ...]:
    """An offering's components without their responsibilities, realisation, concepts and
    vocabulary terms."""
    return tuple(
        replace(
            item,
            responsibilities=(),
            realisation=(),
            capability_ids=(),
            unlinked_reason=None,
            kind_id=None,
        )
        for item in offering.components
    )


def _duties(offering: ProductOffering) -> list[tuple[object, ...]]:
    """Each component's responsibilities without their role terms."""
    return [
        tuple(replace(duty, role_id=None) for duty in item.responsibilities)
        for item in offering.components
    ]


def _offering_terms(offering: ProductOffering) -> dict[tuple[str, ...], str]:
    """The terms its parts and their responsibilities are linked to, by where."""
    terms: dict[tuple[str, ...], str] = {
        (item.id,): item.kind_id for item in offering.components if item.kind_id
    }
    terms.update(
        ((item.id, duty.system_id, duty.role), duty.role_id)
        for item in offering.components
        for duty in item.responsibilities
        if duty.role_id
    )
    return terms


def _journey_fields(before: Journey, after: Journey) -> tuple[str, ...]:
    """Which parts of a journey changed; the terms its activities and integrations are
    linked to count as "vocabulary_links", apart from the rest of them."""

    def bare(journey: Journey) -> Journey:
        return replace(
            journey,
            activities=tuple(
                replace(item, etom_id=None, role_id=None) for item in journey.activities
            ),
            integrations=tuple(replace(item, open_api_ids=()) for item in journey.integrations),
        )

    def terms(journey: Journey) -> dict[tuple[str, ...], tuple[str, ...]]:
        found: dict[tuple[str, ...], tuple[str, ...]] = {
            (item.number, name): (term,)
            for item in journey.activities
            for name, term in (("etom", item.etom_id), ("role", item.role_id))
            if term
        }
        found.update(
            ((str(position), "api"), item.open_api_ids)
            for position, item in enumerate(journey.integrations)
            if item.open_api_ids
        )
        return found

    plain_before, plain_after = bare(before), bare(after)
    fields = [
        field
        for field in _JOURNEY_FIELDS
        if getattr(plain_before, field) != getattr(plain_after, field)
    ]
    if terms(before) != terms(after):
        fields.append("vocabulary_links")
    return tuple(fields)


def _links(offering: ProductOffering) -> list[tuple[frozenset[str], str | None]]:
    return [(frozenset(item.capability_ids), item.unlinked_reason) for item in offering.components]


def _offering_fields(before: ProductOffering, after: ProductOffering) -> tuple[str, ...]:
    """Which parts of an offering changed; a component's responsibilities count as
    "responsibilities", its realisation as "realisation" and its concepts as
    "capability_links", apart from the rest of the component."""
    fields = [
        field
        for field in _OFFERING_FIELDS
        if field != "components" and getattr(before, field) != getattr(after, field)
    ]
    if _bare(before) != _bare(after):
        fields.append("components")
    if _duties(before) != _duties(after):
        fields.append("responsibilities")
    if [item.realisation for item in before.components] != [
        item.realisation for item in after.components
    ]:
        fields.append("realisation")
    if _links(before) != _links(after):
        fields.append("capability_links")
    if _offering_terms(before) != _offering_terms(after):
        fields.append("vocabulary_links")
    return tuple(fields)


class ChangeKind(StrEnum):
    ADDED = "added"
    REMOVED = "removed"
    CHANGED = "changed"


class ChangedItem(StrEnum):
    SYSTEM = "system"
    CAPABILITY = "capability"
    RELATIONSHIP = "relationship"
    DOCUMENT = "document"
    DOMAIN = "domain"
    COMPONENT = "component"
    LANDSCAPE_DOMAIN = "landscape_domain"
    PRODUCT = "product"
    JOURNEY = "journey"
    CHANNEL = "channel"
    SOURCE = "source"
    CONFLICT = "conflict"
    # A change request applied to the version (requirement-portal ADR-0101, step 7).
    CHANGE_REQUEST = "change_request"
    # A business capability concept (ADR-0114).
    CONCEPT = "concept"
    # A controlled vocabulary term: an eTOM process, a channel or component kind, a role or
    # an Open API.
    VOCABULARY_TERM = "vocabulary_term"
    # A contract a system exposes, with its consumers (ontology plan Phase 8).
    INTERFACE = "interface"
    REALISATION = "realisation"


@dataclass(frozen=True)
class CatalogueChange:
    item: ChangedItem
    change: ChangeKind
    key: str
    label: str
    fields: tuple[str, ...] = ()


@dataclass(frozen=True)
class CatalogueDiff:
    base_release_id: str
    draft_release_id: str
    changes: tuple[CatalogueChange, ...]

    @property
    def empty(self) -> bool:
        return not self.changes


def _system_fields(before: SystemDefinition, after: SystemDefinition) -> tuple[str, ...]:
    fields = []
    if before.name != after.name:
        fields.append("name")
    if before.name_ar != after.name_ar:
        fields.append("name_ar")
    if sorted(before.aliases) != sorted(after.aliases):
        fields.append("aliases")
    if sorted(before.constraints) != sorted(after.constraints):
        fields.append("constraints")
    if before.description != after.description:
        fields.append("description")
    if before.landscape_domain_id != after.landscape_domain_id:
        fields.append("landscape_domain")
    if sorted(before.masters) != sorted(after.masters):
        fields.append("masters")
    if sorted(before.reads) != sorted(after.reads):
        fields.append("reads")
    return tuple(fields)


def _keyed_changes[T](
    item: ChangedItem,
    before: dict[str, tuple[str, T]],
    after: dict[str, tuple[str, T]],
) -> list[CatalogueChange]:
    """Items present on only one side; changes to kept items are the caller's concern."""
    changes = [
        CatalogueChange(item, ChangeKind.ADDED, key, label)
        for key, (label, _) in after.items()
        if key not in before
    ]
    changes.extend(
        CatalogueChange(item, ChangeKind.REMOVED, key, label)
        for key, (label, _) in before.items()
        if key not in after
    )
    return changes


def _register_changes(
    item: ChangedItem,
    fields: tuple[str, ...],
    before: dict[str, tuple[str, object]],
    after: dict[str, tuple[str, object]],
) -> list[CatalogueChange]:
    """A register's added, removed and changed entries, each change naming its fields."""
    changes = _keyed_changes(item, before, after)
    for key, (label, value) in after.items():
        previous = before.get(key)
        if previous is None or previous[1] == value:
            continue
        changes.append(
            CatalogueChange(
                item,
                ChangeKind.CHANGED,
                key,
                label,
                tuple(
                    field
                    for field in fields
                    if getattr(previous[1], field) != getattr(value, field)
                ),
            )
        )
    return changes


def diff_releases(base: ArchitectureKnowledge, draft: ArchitectureKnowledge) -> CatalogueDiff:
    changes: list[CatalogueChange] = []

    base_systems = {item.id: item for item in base.systems}
    draft_systems = {item.id: item for item in draft.systems}
    for system_id, system in draft_systems.items():
        previous = base_systems.get(system_id)
        if previous is None:
            changes.append(
                CatalogueChange(ChangedItem.SYSTEM, ChangeKind.ADDED, system_id, system.name)
            )
            continue
        fields = _system_fields(previous, system)
        if fields:
            changes.append(
                CatalogueChange(
                    ChangedItem.SYSTEM, ChangeKind.CHANGED, system_id, system.name, fields
                )
            )
    changes.extend(
        CatalogueChange(ChangedItem.SYSTEM, ChangeKind.REMOVED, system_id, system.name)
        for system_id, system in base_systems.items()
        if system_id not in draft_systems
    )

    def capabilities(release: ArchitectureKnowledge) -> dict[str, tuple[str, tuple[str, ...]]]:
        return {
            f"{system.id}/{capability.id}": (
                f"{system.name}: {capability.name}",
                (
                    capability.name,
                    capability.domain_id or "",
                    capability.component_id or "",
                    capability.concept_id or "",
                    capability.unlinked_reason or "",
                    *sorted(capability.triggers),
                ),
            )
            for system in release.systems
            for capability in system.capabilities
        }

    base_capabilities, draft_capabilities = capabilities(base), capabilities(draft)
    changes.extend(_keyed_changes(ChangedItem.CAPABILITY, base_capabilities, draft_capabilities))
    for key, (label, value) in draft_capabilities.items():
        previous_capability = base_capabilities.get(key)
        if previous_capability is None or previous_capability[1] == value:
            continue
        changed = []
        if previous_capability[1][0] != value[0]:
            changed.append("name")
        if previous_capability[1][1] != value[1]:
            changed.append("domain")
        if previous_capability[1][2] != value[2]:
            changed.append("component")
        if previous_capability[1][3:5] != value[3:5]:
            changed.append("concept")
        if previous_capability[1][5:] != value[5:]:
            changed.append("triggers")
        changes.append(
            CatalogueChange(ChangedItem.CAPABILITY, ChangeKind.CHANGED, key, label, tuple(changed))
        )

    def components(
        release: ArchitectureKnowledge,
    ) -> dict[str, tuple[str, tuple[str, str, tuple[str, ...], str, str]]]:
        return {
            f"{system.id}/{component.id}": (
                f"{system.name}: {component.name}",
                (
                    component.name,
                    component.name_ar or "",
                    tuple(sorted(component.aliases)),
                    component.description or "",
                    component.technology or "",
                ),
            )
            for system in release.systems
            for component in system.components
        }

    base_components, draft_components = components(base), components(draft)
    changes.extend(_keyed_changes(ChangedItem.COMPONENT, base_components, draft_components))
    for key, (label, component_value) in draft_components.items():
        previous_component = base_components.get(key)
        if previous_component is None or previous_component[1] == component_value:
            continue
        changes.append(
            CatalogueChange(
                ChangedItem.COMPONENT,
                ChangeKind.CHANGED,
                key,
                label,
                tuple(
                    field
                    for field, before, after in zip(
                        ("name", "name_ar", "aliases", "description", "technology"),
                        previous_component[1],
                        component_value,
                        strict=True,
                    )
                    if before != after
                ),
            )
        )

    def relationships(release: ArchitectureKnowledge) -> dict[str, tuple[str, str]]:
        # The key and label formats are read by the catalogue workbench; the kind is
        # the value, so a changed kind is an edit to the same relationship.
        names = {item.id: item.name for item in release.systems}
        return {
            f"{item.source_system_id}->{item.target_system_id}:{item.description.casefold()}": (
                f"{names.get(item.source_system_id, item.source_system_id)} → "
                f"{names.get(item.target_system_id, item.target_system_id)}: {item.description}",
                item.kind.value,
            )
            for item in release.relationships
        }

    base_relationships, draft_relationships = relationships(base), relationships(draft)
    changes.extend(
        _keyed_changes(ChangedItem.RELATIONSHIP, base_relationships, draft_relationships)
    )
    changes.extend(
        CatalogueChange(ChangedItem.RELATIONSHIP, ChangeKind.CHANGED, key, label, ("kind",))
        for key, (label, kind) in draft_relationships.items()
        if key in base_relationships and base_relationships[key][1] != kind
    )

    def domains(
        release: ArchitectureKnowledge, landscape: bool
    ) -> dict[str, tuple[str, tuple[str, str, str, str]]]:
        tree = release.landscape_domains if landscape else release.capability_domains
        path = release.landscape_path if landscape else release.domain_path
        return {
            item.id: (
                " › ".join(part.name for part in path(item.id)),
                (item.name, item.name_ar or "", item.parent_id or "", item.description or ""),
            )
            for item in tree
        }

    for item, landscape in ((ChangedItem.DOMAIN, False), (ChangedItem.LANDSCAPE_DOMAIN, True)):
        base_domains, draft_domains = domains(base, landscape), domains(draft, landscape)
        changes.extend(_keyed_changes(item, base_domains, draft_domains))
        for key, (label, value) in draft_domains.items():
            previous_domain = base_domains.get(key)
            if previous_domain is None or previous_domain[1] == value:
                continue
            changes.append(
                CatalogueChange(
                    item,
                    ChangeKind.CHANGED,
                    key,
                    label,
                    tuple(
                        field
                        for field, before, after in zip(
                            ("name", "name_ar", "parent", "description"),
                            previous_domain[1],
                            value,
                            strict=True,
                        )
                        if before != after
                    ),
                )
            )
    base_offerings = {item.id: (item.name, item) for item in base.products}
    draft_offerings = {item.id: (item.name, item) for item in draft.products}
    changes.extend(_keyed_changes(ChangedItem.PRODUCT, base_offerings, draft_offerings))
    for key, (label, offering) in draft_offerings.items():
        previous_offering = base_offerings.get(key)
        if previous_offering is None or previous_offering[1] == offering:
            continue
        changes.append(
            CatalogueChange(
                ChangedItem.PRODUCT,
                ChangeKind.CHANGED,
                key,
                label,
                _offering_fields(previous_offering[1], offering),
            )
        )
    base_journeys = {item.id: (item.name, item) for item in base.journeys}
    draft_journeys = {item.id: (item.name, item) for item in draft.journeys}
    changes.extend(_keyed_changes(ChangedItem.JOURNEY, base_journeys, draft_journeys))
    for key, (label, journey) in draft_journeys.items():
        previous_journey = base_journeys.get(key)
        if previous_journey is None or previous_journey[1] == journey:
            continue
        changes.append(
            CatalogueChange(
                ChangedItem.JOURNEY,
                ChangeKind.CHANGED,
                key,
                label,
                _journey_fields(previous_journey[1], journey),
            )
        )
    base_channels = {item.id: (item.name, item) for item in base.channels}
    draft_channels = {item.id: (item.name, item) for item in draft.channels}
    changes.extend(_keyed_changes(ChangedItem.CHANNEL, base_channels, draft_channels))
    for key, (label, channel) in draft_channels.items():
        previous_channel = base_channels.get(key)
        if previous_channel is None or previous_channel[1] == channel:
            continue
        changes.append(
            CatalogueChange(
                ChangedItem.CHANNEL,
                ChangeKind.CHANGED,
                key,
                label,
                tuple(
                    reported
                    for field, reported in _CHANNEL_FIELDS
                    if getattr(previous_channel[1], field) != getattr(channel, field)
                ),
            )
        )
    changes.extend(
        _register_changes(
            ChangedItem.SOURCE,
            _SOURCE_FIELDS,
            {item.id: (item.title, item) for item in base.sources},
            {item.id: (item.title, item) for item in draft.sources},
        )
    )
    changes.extend(
        _register_changes(
            ChangedItem.CONFLICT,
            _CONFLICT_FIELDS,
            {item.id: (item.title, item) for item in base.conflicts},
            {item.id: (item.title, item) for item in draft.conflicts},
        )
    )
    changes.extend(
        _register_changes(
            ChangedItem.CONCEPT,
            _CONCEPT_FIELDS,
            {item.id: (item.pref_label, item) for item in base.business_capabilities},
            {item.id: (item.pref_label, item) for item in draft.business_capabilities},
        )
    )
    changes.extend(
        _register_changes(
            ChangedItem.VOCABULARY_TERM,
            _TERM_FIELDS,
            {item.id: (item.pref_label, item) for item in base.vocabulary},
            {item.id: (item.pref_label, item) for item in draft.vocabulary},
        )
    )
    changes.extend(
        _register_changes(
            ChangedItem.INTERFACE,
            _INTERFACE_FIELDS,
            {item.id: (item.name, item) for item in base.interfaces},
            {item.id: (item.name, item) for item in draft.interfaces},
        )
    )
    changes.extend(
        _register_changes(
            ChangedItem.REALISATION,
            _REALISATION_FIELDS,
            {item.id: (item.name, item) for item in base.realisations},
            {item.id: (item.name, item) for item in draft.realisations},
        )
    )
    changes.extend(
        _register_changes(
            ChangedItem.CHANGE_REQUEST,
            _CHANGE_REQUEST_FIELDS,
            {item.id: (item.title, item) for item in base.change_history},
            {item.id: (item.title, item) for item in draft.change_history},
        )
    )
    changes.extend(
        _keyed_changes(
            ChangedItem.DOCUMENT,
            {item.id: (item.title, None) for item in base.documents},
            {item.id: (item.title, None) for item in draft.documents},
        )
    )
    return CatalogueDiff(base.id, draft.id, tuple(changes))
