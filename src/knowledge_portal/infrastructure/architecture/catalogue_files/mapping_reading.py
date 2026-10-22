"""The YAML/JSON catalogue shape read into catalogue content.

The workbook reader gathers its rows into this same shape, so both formats share these
readers and their errors.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import replace
from functools import partial
from typing import Any

from knowledge_portal.application.ports.catalogue_file import CatalogueContent
from knowledge_portal.domain.architecture.acceptance import AcceptanceKey, with_recorded_acceptances
from knowledge_portal.domain.architecture.change_requests import (
    ChangeItem,
    ChangeItemStatus,
    ChangeOrigin,
    ChangeRequestRecord,
    RequirementTrace,
    TracedFeature,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.governance import (
    ConflictScope,
    ConflictSide,
    KnowledgeSource,
    SourceConflict,
)
from knowledge_portal.domain.architecture.interfaces import (
    InterfaceStyle,
    SystemInterface,
    interface_style,
)
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    ActivityIntegration,
    FlowRule,
    Journey,
    flow_rule_kind,
)
from knowledge_portal.domain.architecture.knowledge import (
    CapabilityDomain,
    InvalidKnowledgeError,
    KnowledgeCapability,
    LandscapeDomain,
    MasteryNote,
    SystemComponent,
    SystemDefinition,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.provenance import AcceptedCitation, AcceptedFrom
from knowledge_portal.domain.architecture.realisations import RealisationRecord
from knowledge_portal.domain.architecture.vocabularies import (
    SCHEME_NAMES,
    ConceptScheme,
    VocabularyTerm,
    scheme_id,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.fields import (
    _entries,
    _flag,
    _kind,
    _located,
    _LocatedError,
    _moment,
    _optional_text,
    _part,
    _retirement,
    _sub_entries,
    _text,
    _text_list,
    _timing,
    _trust,
    _where,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.offering_reading import _offerings


def _mastery_notes(value: object, where: str) -> tuple[MasteryNote, ...]:
    """A system's notes on what it masters where others master it too (ADR-0123)."""
    if value is None:
        return ()
    if not isinstance(value, list):
        raise InvalidKnowledgeError(f"{where}: mastery_notes must be a list.")
    notes = []
    for number, item in enumerate(value, start=1):
        place = f"{where} mastery note {number}"
        if not isinstance(item, dict):
            raise InvalidKnowledgeError(f"{place} must name an entity and a note.")
        notes.append(
            MasteryNote(
                _text(item.get("entity"), place, "entity"), _text(item.get("note"), place, "note")
            )
        )
    return tuple(notes)


def _accepted_citations(value: object, where: str) -> tuple[AcceptedCitation, ...]:
    """An acceptance's citations: a list in YAML and JSON, that list as JSON in a cell."""
    if value is None or value == "":
        return ()
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise InvalidKnowledgeError(f"{where}: citations must be a JSON list.") from exc
    if not isinstance(value, list):
        raise InvalidKnowledgeError(f"{where}: citations must be a list.")
    citations = []
    for number, item in enumerate(value, start=1):
        place = f"{where}, citation {number}"
        if not isinstance(item, dict):
            raise InvalidKnowledgeError(f"{place} must be an object.")
        citations.append(
            AcceptedCitation(
                _text(item.get("location"), place, "location"),
                _text(item.get("quote"), place, "quote"),
                _optional_text(item.get("document_version_id"), place, "document_version_id"),
                _optional_text(item.get("document"), place, "document"),
            )
        )
    return tuple(citations)


def _acceptance(item: dict[str, Any], where: str) -> AcceptedFrom:
    moment = _moment(item.get("decided_at"), where, "decided_at")
    if moment is None:
        raise InvalidKnowledgeError(f"{where}: decided_at is required.")
    return AcceptedFrom(
        _text(item.get("candidate_id"), where, "candidate_id"),
        _text(item.get("model"), where, "model"),
        _text(item.get("prompt_version"), where, "prompt_version"),
        _text(item.get("decided_by"), where, "decided_by"),
        moment,
        _accepted_citations(item.get("citations"), where),
    )


def _acceptances(
    entries: list[dict[str, Any]],
) -> dict[AcceptanceKey, tuple[AcceptedFrom, ...]]:
    recorded: dict[AcceptanceKey, list[AcceptedFrom]] = {}
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"acceptances entry {number}")
        key = (
            _text(item.get("entity"), where, "entity"),
            *_text_list(item.get("key"), where, "key"),
        )
        recorded.setdefault(key, []).append(_part(where, partial(_acceptance, item, where)))
    return {key: tuple(entries) for key, entries in recorded.items()}


def content_from_mapping(raw: object) -> CatalogueContent:
    """The YAML/JSON shape: ``systems`` with nested capabilities and components, plus
    ``dependencies``."""
    if not isinstance(raw, dict):
        raise InvalidKnowledgeError("The catalogue file must contain an object at the top level.")
    systems = [
        _system(item, f"systems entry {number}")
        for number, item in enumerate(_entries(raw, "systems"), start=1)
    ]
    relationships = _dependencies(_entries(raw, "dependencies"))
    content = _content(
        systems,
        relationships,
        _mapped_domains(raw, "capability_domains", CapabilityDomain),
        _cross_cutting(
            _mapped_domains(raw, "landscape_domains", LandscapeDomain),
            enumerate(_entries(raw, "landscape_domains"), start=1),
            "landscape_domains entry",
        ),
        _offerings(_entries(raw, "products")),
        _journeys(_entries(raw, "journeys")),
        _channels(_entries(raw, "channels")),
        _sources(_entries(raw, "sources")),
        _conflicts(_entries(raw, "conflicts")),
        _history(_entries(raw, "change_history")) if "change_history" in raw else None,
        _portfolio(_entries(raw, "portfolio")),
        _concepts(_entries(raw, "business_capabilities")),
        _terms(_entries(raw, "vocabulary")),
        _interfaces(_entries(raw, "interfaces")),
        _realisations(_entries(raw, "realisations")),
        schemes=_schemes(_entries(raw, "schemes")),
    )
    return with_recorded_acceptances(content, _acceptances(_entries(raw, "acceptances")))


def _system(item: dict[str, Any], where: str) -> SystemDefinition:
    capabilities = _system_capabilities(item, where)
    components = _system_components(item, where)
    try:
        return SystemDefinition(
            id=_text(item.get("id"), where, "id"),
            name=_text(item.get("name"), where, "name"),
            aliases=_text_list(item.get("aliases"), where, "aliases"),
            capabilities=tuple(capabilities),
            constraints=_text_list(item.get("constraints"), where, "constraints"),
            components=tuple(components),
            description=_optional_text(item.get("description"), where, "description"),
            landscape_domain_id=_optional_text(
                item.get("landscape_domain"), where, "landscape_domain"
            ),
            owner=_optional_text(item.get("owner"), where, "owner"),
            external=bool(_flag(item.get("external"), where, "external", False)),
            roadmap=_optional_text(item.get("roadmap"), where, "roadmap"),
            placement_from=_optional_text(item.get("placement_from"), where, "placement_from"),
            placement_reason=_optional_text(
                item.get("placement_reason"), where, "placement_reason"
            ),
            confidence=_trust(item.get("confidence"), where),
            source=_optional_text(item.get("source"), where, "source"),
            masters=_text_list(item.get("masters"), where, "masters"),
            reads=_text_list(item.get("reads"), where, "reads"),
            deprecated=bool(_flag(item.get("deprecated"), where, "deprecated", False)),
            replaced_by=_optional_text(item.get("replaced_by"), where, "replaced_by"),
            mastery_notes=_mastery_notes(item.get("mastery_notes"), where),
        )
    except InvalidKnowledgeError as exc:
        raise _located(where, exc) from exc


def _system_capabilities(item: dict[str, Any], where: str) -> list[KnowledgeCapability]:
    capabilities = []
    raw_capabilities = item.get("capabilities") or []
    if not isinstance(raw_capabilities, list):
        raise InvalidKnowledgeError(f"{where}: capabilities must be a list.")
    for position, capability in enumerate(raw_capabilities, start=1):
        place = f"{where}, capability {position}"
        if not isinstance(capability, dict):
            raise InvalidKnowledgeError(f"{place} must be an object.")
        try:
            capabilities.append(
                KnowledgeCapability(
                    _text(capability.get("id"), place, "id"),
                    _text(capability.get("name"), place, "name"),
                    _text_list(capability.get("triggers"), place, "triggers"),
                    _optional_text(capability.get("domain"), place, "domain"),
                    _optional_text(capability.get("component"), place, "component"),
                    _optional_text(capability.get("concept"), place, "concept"),
                    _optional_text(capability.get("unlinked_reason"), place, "unlinked_reason"),
                    confidence=_trust(capability.get("confidence"), place),
                    source=_optional_text(capability.get("source"), place, "source"),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(place, exc) from exc
    return capabilities


def _system_components(item: dict[str, Any], where: str) -> list[SystemComponent]:
    components = []
    try:
        raw_components = _entries(item, "components")
    except InvalidKnowledgeError as exc:
        raise _located(where, exc) from exc
    for position, component in enumerate(raw_components, start=1):
        place = f"{where}, component {position}"
        try:
            components.append(
                SystemComponent(
                    id=_text(component.get("id"), place, "id"),
                    name=_text(component.get("name"), place, "name"),
                    description=_optional_text(component.get("description"), place, "description"),
                    aliases=_text_list(component.get("aliases"), place, "aliases"),
                    technology=_optional_text(component.get("technology"), place, "technology"),
                    confidence=_trust(component.get("confidence"), place),
                    source=_optional_text(component.get("source"), place, "source"),
                    technology_id=_optional_text(
                        component.get("technology_term"), place, "technology_term"
                    ),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(place, exc) from exc
    return components


def _dependencies(entries: list[dict[str, Any]]) -> list[SystemRelationship]:
    relationships = []
    for number, item in enumerate(entries, start=1):
        where = f"dependencies entry {number}"
        try:
            relationships.append(
                SystemRelationship(
                    _text(item.get("source_system_id"), where, "source_system_id"),
                    _text(item.get("target_system_id"), where, "target_system_id"),
                    _text(item.get("description"), where, "description"),
                    _kind(item.get("kind"), where),
                    confidence=_trust(item.get("confidence"), where),
                    source=_optional_text(item.get("source"), where, "source"),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return relationships


def _concepts(entries: list[dict[str, Any]]) -> list[BusinessCapability]:
    """Business capability concepts (ADR-0114); a top concept names its domain."""
    concepts = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"business_capabilities entry {number}")
        try:
            concepts.append(
                BusinessCapability(
                    _text(item.get("id"), where, "id"),
                    _text(item.get("pref_label"), where, "pref_label"),
                    _text_list(item.get("alt_labels"), where, "alt_labels"),
                    _optional_text(item.get("definition"), where, "definition"),
                    _optional_text(item.get("broader"), where, "broader"),
                    _optional_text(item.get("domain"), where, "domain"),
                    _optional_text(item.get("exact_match"), where, "exact_match"),
                    _trust(item.get("confidence"), where),
                    _optional_text(item.get("source"), where, "source"),
                    **_retirement(item, where),
                    close_match=_text_list(item.get("close_match"), where, "close_match"),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return concepts


def _terms(entries: list[dict[str, Any]]) -> list[VocabularyTerm]:
    """Controlled vocabulary terms, each naming its scheme."""
    terms = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"vocabulary entry {number}")
        try:
            terms.append(
                VocabularyTerm(
                    _text(item.get("id"), where, "id"),
                    scheme_id(_text(item.get("scheme"), where, "scheme")),
                    _text(item.get("pref_label"), where, "pref_label"),
                    _text_list(item.get("alt_labels"), where, "alt_labels"),
                    _optional_text(item.get("notation"), where, "notation"),
                    _optional_text(item.get("definition"), where, "definition"),
                    _optional_text(item.get("broader"), where, "broader"),
                    _optional_text(item.get("exact_match"), where, "exact_match"),
                    _trust(item.get("confidence"), where),
                    _optional_text(item.get("source"), where, "source"),
                    **_retirement(item, where),
                    close_match=_text_list(item.get("close_match"), where, "close_match"),
                    rank=_rank(item.get("rank"), where),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return terms


def _rank(value: object, where: str) -> int | None:
    """A term's rank as a file writes it: a whole number, or nothing."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise InvalidKnowledgeError(f"{where}: rank must be a whole number.")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    raise InvalidKnowledgeError(f"{where}: rank must be a whole number.")


def _schemes(entries: list[dict[str, Any]]) -> list[ConceptScheme]:
    """The vocabularies a curator defines, each with the fields it covers (review
    recommendation 9)."""
    schemes = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"schemes entry {number}")
        try:
            schemes.append(
                ConceptScheme(
                    _text(item.get("id"), where, "id"),
                    _text(item.get("name"), where, "name"),
                    _optional_text(item.get("definition"), where, "definition"),
                    _text_list(item.get("fields"), where, "fields"),  # type: ignore[arg-type]
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return schemes


def _interfaces(entries: list[dict[str, Any]]) -> list[SystemInterface]:
    """The contracts systems expose, with their consumers, Open APIs and entities."""
    interfaces = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"interfaces entry {number}")
        try:
            interfaces.append(
                SystemInterface(
                    _text(item.get("id"), where, "id"),
                    _text(item.get("name"), where, "name"),
                    _text(item.get("system"), where, "system"),
                    interface_style(
                        _optional_text(item.get("style"), where, "style")
                        or InterfaceStyle.UNSPECIFIED
                    ),
                    _text_list(item.get("consumers"), where, "consumers"),
                    _text_list(item.get("open_apis"), where, "open_apis"),
                    _text_list(item.get("entities"), where, "entities"),
                    _optional_text(item.get("description"), where, "description"),
                    _trust(item.get("confidence"), where),
                    _optional_text(item.get("source"), where, "source"),
                    _text_list(item.get("relays"), where, "relays"),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return interfaces


def _realisations(entries: list[dict[str, Any]]) -> list[RealisationRecord]:
    """The CFSs, RFSs and resources components are realised as."""
    records = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"realisations entry {number}")
        try:
            records.append(
                RealisationRecord(
                    _text(item.get("id"), where, "id"),
                    _text(item.get("layer"), where, "layer"),  # type: ignore[arg-type]
                    _text(item.get("name"), where, "name"),
                    _text_list(item.get("aliases"), where, "aliases"),
                    _text_list(item.get("systems"), where, "systems"),
                    _text_list(item.get("realised_by"), where, "realised_by"),
                    _optional_text(item.get("description"), where, "description"),
                    _trust(item.get("confidence"), where),
                    _optional_text(item.get("source"), where, "source"),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return records


def _activity(step: dict[str, Any], place: str) -> Activity:
    return Activity(
        number=_text(step.get("number"), place, "number"),
        name=_text(step.get("name"), place, "name"),
        phase=_optional_text(step.get("phase"), place, "phase"),
        track=_optional_text(step.get("track"), place, "track"),
        performing_system_id=_optional_text(step.get("system"), place, "system"),
        supporting_system_ids=_text_list(step.get("supporting"), place, "supporting"),
        system_function=_optional_text(step.get("system_function"), place, "system_function"),
        mode=_optional_text(step.get("mode"), place, "mode"),
        customer_visible=_flag(step.get("customer_visible"), place, "customer_visible", None),
        description=_optional_text(step.get("description"), place, "description"),
        component_ids=_text_list(step.get("components"), place, "components"),
        input=_optional_text(step.get("input"), place, "input"),
        output=_optional_text(step.get("output"), place, "output"),
        etom=_optional_text(step.get("etom"), place, "etom"),
        confidence=_trust(step.get("confidence"), place),
        source=_optional_text(step.get("source"), place, "source"),
        channels=_text_list(step.get("channels"), place, "channels"),
        channel_entry=bool(_flag(step.get("channel_entry"), place, "channel_entry", False)),
        performer=_optional_text(step.get("performer"), place, "performer"),
        point_of_no_return=_optional_text(
            step.get("point_of_no_return"), place, "point_of_no_return"
        ),
        role=_optional_text(step.get("role"), place, "role"),
        etom_id=_optional_text(step.get("etom_term"), place, "etom_term"),
        role_id=_optional_text(step.get("role_term"), place, "role_term"),
        mode_id=_optional_text(step.get("mode_term"), place, "mode_term"),
        phase_id=_optional_text(step.get("phase_term"), place, "phase_term"),
    )


def _rule(rule: dict[str, Any], place: str) -> FlowRule:
    return FlowRule(
        kind=flow_rule_kind(_text(rule.get("kind"), place, "kind")),
        from_activity=_text(rule.get("from"), place, "from"),
        to_activity=_text(rule.get("to"), place, "to"),
        condition=_optional_text(rule.get("condition"), place, "condition"),
        branch=_optional_text(rule.get("branch"), place, "branch"),
        parallel_group=_optional_text(rule.get("parallel_group"), place, "parallel_group"),
        rejoin_at=_optional_text(rule.get("rejoin_at"), place, "rejoin_at"),
        confidence=_trust(rule.get("confidence"), place),
        source=_optional_text(rule.get("source"), place, "source"),
        channel_id=_optional_text(rule.get("channel"), place, "channel"),
    )


def _link(link: dict[str, Any], place: str) -> ActivityIntegration:
    return ActivityIntegration(
        from_activity=_text(link.get("from"), place, "from"),
        to_activity=_text(link.get("to"), place, "to"),
        interaction=_optional_text(link.get("interaction"), place, "interaction"),
        interface=_optional_text(link.get("interface"), place, "interface"),
        payload=_optional_text(link.get("payload"), place, "payload"),
        timing=_timing(link.get("timing"), place),
        correlation_key=_optional_text(link.get("correlation_key"), place, "correlation_key"),
        confidence=_trust(link.get("confidence"), place),
        source=_optional_text(link.get("source"), place, "source"),
        from_system_id=_optional_text(link.get("from_system"), place, "from_system"),
        to_system_id=_optional_text(link.get("to_system"), place, "to_system"),
        via_system_id=_optional_text(link.get("via"), place, "via"),
        purpose=_optional_text(link.get("purpose"), place, "purpose"),
        style=_optional_text(link.get("style"), place, "style"),
        tmf_equivalent=_optional_text(link.get("tmf_equivalent"), place, "tmf_equivalent"),
        open_api_ids=_text_list(link.get("open_apis"), place, "open_apis"),
        interface_id=_optional_text(link.get("interface_id"), place, "interface_id"),
    )


# Journeys (ADR-0096), read the same way as offerings; each activity, rule and
# integration says which row it is when it is refused.
def _journeys(entries: list[dict[str, Any]]) -> list[Journey]:
    journeys = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"journeys entry {number}")
        try:
            activities = [
                _part(place, partial(_activity, step, place))
                for position, step in enumerate(_sub_entries(item, "activities", where), 1)
                for place in [_where(step, f"{where}, activity {position}")]
            ]
            rules = [
                _part(place, partial(_rule, rule, place))
                for position, rule in enumerate(_sub_entries(item, "flow_rules", where), 1)
                for place in [_where(rule, f"{where}, flow rule {position}")]
            ]
            links = [
                _part(place, partial(_link, link, place))
                for position, link in enumerate(_sub_entries(item, "integrations", where), 1)
                for place in [_where(link, f"{where}, integration {position}")]
            ]
            journeys.append(
                Journey(
                    id=_text(item.get("id"), where, "id"),
                    name=_text(item.get("name"), where, "name"),
                    product_id=_optional_text(item.get("product"), where, "product"),
                    order_type_code=_optional_text(item.get("order_type"), where, "order_type"),
                    description=_optional_text(item.get("description"), where, "description"),
                    activities=tuple(activities),
                    flow_rules=tuple(rules),
                    integrations=tuple(links),
                    confidence=_trust(item.get("confidence"), where),
                    source=_optional_text(item.get("source"), where, "source"),
                    former_ids=_text_list(item.get("former_ids"), where, "former_ids"),
                )
            )
        except _LocatedError:
            raise
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return journeys


def _portfolio(entries: list[dict[str, Any]]) -> list[PortfolioNode]:
    nodes = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"portfolio entry {number}")
        try:
            nodes.append(
                PortfolioNode(
                    id=_text(item.get("id"), where, "id"),
                    name=_text(item.get("name"), where, "name"),
                    level=_text(item.get("level"), where, "level"),
                    level_id=_optional_text(item.get("level_term"), where, "level_term"),
                    parent_id=_optional_text(item.get("parent"), where, "parent"),
                    description=_optional_text(item.get("description"), where, "description"),
                    confidence=_trust(item.get("confidence"), where),
                    source=_optional_text(item.get("source"), where, "source"),
                    **_retirement(item, where),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return nodes


def _mapped_domains[DomainT: (CapabilityDomain, LandscapeDomain)](
    raw: dict[str, Any], key: str, kind: type[DomainT]
) -> list[DomainT]:
    domains = []
    for number, item in enumerate(_entries(raw, key), start=1):
        where = f"{key} entry {number}"
        try:
            domain = kind(
                id=_text(item.get("id"), where, "id"),
                name=_text(item.get("name"), where, "name"),
                parent_id=_optional_text(item.get("parent_id"), where, "parent_id"),
                description=_optional_text(item.get("description"), where, "description"),
            )
            domains.append(domain)
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return domains


def _content(
    systems: list[SystemDefinition],
    relationships: list[SystemRelationship],
    domains: list[CapabilityDomain],
    landscape: list[LandscapeDomain],
    offerings: list[ProductOffering],
    journeys: list[Journey],
    channels: list[Channel] | None = None,
    sources: list[KnowledgeSource] | None = None,
    conflicts: list[SourceConflict] | None = None,
    history: list[ChangeRequestRecord] | None = None,
    portfolio: list[PortfolioNode] | None = None,
    concepts: list[BusinessCapability] | None = None,
    terms: list[VocabularyTerm] | None = None,
    interfaces: list[SystemInterface] | None = None,
    realisations: list[RealisationRecord] | None = None,
    schemes: list[ConceptScheme] | None = None,
) -> CatalogueContent:
    """The file's content, refusing a placement in a domain the file does not list, a link
    to a concept it does not list, or a term in a vocabulary neither built in nor listed."""
    vocabularies = {*SCHEME_NAMES, *(item.id for item in schemes or ())}
    for term in terms or ():
        if term.scheme not in vocabularies:
            raise InvalidKnowledgeError(
                f"Vocabulary term {term.id!r}: its vocabulary {term.scheme!r} is neither built "
                "in nor listed among the schemes."
            )
    known = {item.id for item in domains}
    places = {item.id for item in landscape}
    listed = {item.id for item in concepts or ()}
    for system in systems:
        for capability in system.capabilities:
            if capability.domain_id is not None and capability.domain_id not in known:
                raise InvalidKnowledgeError(
                    f"{system.id}, capability {capability.id}: domain {capability.domain_id!r} "
                    "is not listed among the capability domains."
                )
            if capability.concept_id is not None and capability.concept_id not in listed:
                raise InvalidKnowledgeError(
                    f"{system.id}, capability {capability.id}: concept "
                    f"{capability.concept_id!r} is not listed among the business capabilities."
                )
        if system.landscape_domain_id is not None and system.landscape_domain_id not in places:
            raise InvalidKnowledgeError(
                f"{system.id}: landscape domain {system.landscape_domain_id!r} is not listed "
                "among the landscape domains."
            )
    return CatalogueContent(
        tuple(systems),
        tuple(relationships),
        tuple(domains),
        tuple(landscape),
        tuple(offerings),
        tuple(journeys),
        tuple(channels or ()),
        tuple(sources or ()),
        tuple(conflicts or ()),
        None if history is None else tuple(history),
        tuple(portfolio or ()),
        tuple(concepts or ()),
        tuple(terms or ()),
        tuple(interfaces or ()),
        tuple(realisations or ()),
        tuple(schemes or ()),
    )


# Channels (ADR-0101, step 3): where orders are placed.
def _channels(entries: list[dict[str, Any]]) -> list[Channel]:
    channels = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"channels entry {number}")
        try:
            channels.append(
                Channel(
                    id=_text(item.get("id"), where, "id"),
                    name=_text(item.get("name"), where, "name"),
                    kind=_optional_text(item.get("kind"), where, "kind"),
                    kind_id=_optional_text(item.get("kind_term"), where, "kind_term"),
                    entry_system_id=_optional_text(item.get("entry_system"), where, "entry_system"),
                    description=_optional_text(item.get("description"), where, "description"),
                    confidence=_trust(item.get("confidence"), where),
                    source=_optional_text(item.get("source"), where, "source"),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return channels


# Governance (ADR-0101, step 5): the source register and the conflicts
# between sources.
def _sources(entries: list[dict[str, Any]]) -> list[KnowledgeSource]:
    sources = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"sources entry {number}")
        sources.append(_part(where, partial(_source, item, where)))
    return sources


def _source(item: dict[str, Any], where: str) -> KnowledgeSource:
    return KnowledgeSource(
        id=_text(item.get("id"), where, "id"),
        title=_text(item.get("title"), where, "title"),
        level=_text(item.get("level"), where, "level"),  # type: ignore[arg-type]
        short=_optional_text(item.get("short"), where, "short"),
        version=_optional_text(item.get("version"), where, "version"),
        file=_optional_text(item.get("file"), where, "file"),
        supplied=bool(_flag(item.get("supplied"), where, "supplied", True)),
        authority=_optional_text(item.get("authority"), where, "authority"),
        scope=_optional_text(item.get("scope"), where, "scope"),
        boundary=_optional_text(item.get("boundary"), where, "boundary"),
    )


def _side(raw: object, where: str, field: str) -> ConflictSide:
    if not isinstance(raw, dict):
        raise InvalidKnowledgeError(f"{where}: {field} must be an object.")
    return ConflictSide(
        _text(raw.get("source"), where, f"{field}.source"),
        _text(raw.get("statement"), where, f"{field}.statement"),
        _optional_text(raw.get("reference"), where, f"{field}.reference"),
    )


def _conflicts(entries: list[dict[str, Any]]) -> list[SourceConflict]:
    conflicts = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"conflicts entry {number}")
        conflicts.append(_part(where, partial(_conflict, item, where)))
    return conflicts


def _conflict(item: dict[str, Any], where: str) -> SourceConflict:
    return SourceConflict(
        id=_text(item.get("id"), where, "id"),
        title=_text(item.get("title"), where, "title"),
        a=_side(item.get("a"), where, "a"),
        b=_side(item.get("b"), where, "b"),
        scope=tuple(
            ConflictScope(
                _text(scope.get("product"), spot, "product"),
                _text_list(scope.get("order_types"), spot, "order_types"),
                _optional_text(scope.get("question"), spot, "question"),
            )
            for index, scope in enumerate(_sub_entries(item, "scope", where), 1)
            for spot in [f"{where}, scope {index}"]
        ),
        difference=_optional_text(item.get("difference"), where, "difference"),
        impact=_optional_text(item.get("impact"), where, "impact"),
        decision=_optional_text(item.get("decision"), where, "decision"),
        confidence=_trust(item.get("confidence"), where),
        source=_optional_text(item.get("source"), where, "source"),
    )


def _cross_cutting(
    domains: list[LandscapeDomain], entries: Iterator[tuple[int, dict[str, Any]]], where: str
) -> list[LandscapeDomain]:
    """The landscape domains, each marked cross-cutting when its entry says so (no by default),
    and with the place on the map it names, if any (review recommendation 10)."""
    marked = []
    for domain, (number, cells) in zip(domains, entries, strict=True):
        place = f"{where} {number}"
        crossing = _flag(cells.get("cross_cutting"), place, "cross_cutting", False)
        layout = _optional_text(cells.get("layout"), place, "layout")
        try:
            marked.append(
                replace(
                    domain,
                    cross_cutting=bool(crossing),
                    layout=layout,  # type: ignore[arg-type]
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(place, exc) from exc
    return marked


# Change history (ADR-0101, step 7): the change requests applied, each
# with the approved requirement it comes from.


def _history(entries: list[dict[str, Any]]) -> list[ChangeRequestRecord]:
    return [
        _part(where, partial(_record, item, where))
        for number, item in enumerate(entries, start=1)
        for where in (_where(item, f"change_history entry {number}"),)
    ]


def _record(item: dict[str, Any], where: str) -> ChangeRequestRecord:
    raw_trace = item.get("trace")
    trace = None
    if isinstance(raw_trace, dict):
        place = f"{where}, trace"
        revision = raw_trace.get("revision")
        trace = RequirementTrace(
            requirement_id=_text(raw_trace.get("requirement"), place, "requirement"),
            breakdown_revision=int(str(revision)) if revision not in (None, "") else 1,
            approval_id=_text(raw_trace.get("approval"), place, "approval"),
            epic_id=_text(raw_trace.get("epic"), place, "epic"),
            epic_name=_text(raw_trace.get("epic_name"), place, "epic_name"),
            approved_by=_optional_text(raw_trace.get("approved_by"), place, "approved_by"),
            approved_at=_moment(raw_trace.get("approved_at"), place, "approved_at"),
            features=tuple(
                TracedFeature(
                    _text(feature.get("id"), place, "feature id"),
                    _text(feature.get("name"), place, "feature name"),
                )
                for feature in raw_trace.get("features") or []
                if isinstance(feature, dict)
            ),
            export_schema=_optional_text(raw_trace.get("export_schema"), place, "export_schema"),
            knowledge_version=_optional_text(
                raw_trace.get("knowledge_version"), place, "knowledge_version"
            ),
        )
    items = []
    for position, raw in enumerate(item.get("items") or [], start=1):
        place = _where(raw, f"{where}, item {position}") if isinstance(raw, dict) else where
        if not isinstance(raw, dict):
            raise InvalidKnowledgeError(f"{place}: an item must be an object.")
        status = _optional_text(raw.get("status"), place, "status") or "recorded"
        try:
            known = ChangeItemStatus(status.casefold())
        except ValueError as exc:
            raise InvalidKnowledgeError(
                f"{place}: status must be recorded, inferred, gap or conflict."
            ) from exc
        items.append(
            ChangeItem(
                _text(raw.get("kind"), place, "kind"),
                _text(raw.get("summary"), place, "summary"),
                known,
                _optional_text(raw.get("feature"), place, "feature"),
            )
        )
    origin = _optional_text(item.get("origin"), where, "origin") or "requirement-ai"
    try:
        source = ChangeOrigin(origin.casefold())
    except ValueError as exc:
        raise InvalidKnowledgeError(
            f"{where}: origin must be app, requirement-ai or explorer."
        ) from exc
    return ChangeRequestRecord(
        id=_text(item.get("id"), where, "id"),
        title=_text(item.get("title"), where, "title"),
        origin=source,
        product_id=_optional_text(item.get("product"), where, "product"),
        requester=_optional_text(item.get("requester"), where, "requester"),
        reason=_optional_text(item.get("reason"), where, "reason"),
        priority=_optional_text(item.get("priority"), where, "priority"),
        target_date=_optional_text(item.get("target_date"), where, "target_date"),
        created_at=_moment(item.get("created_at"), where, "created_at"),
        applied_at=_moment(item.get("applied_at"), where, "applied_at"),
        trace=trace,
        items=tuple(items),
        gaps=_text_list(item.get("gaps"), where, "gaps"),
    )
