"""Product offerings (ADR-0095) read from the YAML/JSON shape, with their order types,
components, tracking, lifecycle notes, plans and open points."""

from __future__ import annotations

from functools import partial
from typing import Any

from knowledge_portal.domain.architecture.governance import ArchitectureDecision, OpenQuestion
from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError
from knowledge_portal.domain.architecture.lifecycle import LifecycleNote, NoteBlock
from knowledge_portal.domain.architecture.products import (
    BusinessRule,
    ComponentResponsibility,
    OfferingComponent,
    OfferingNfr,
    OfferingPlan,
    OfferingPoint,
    OrderType,
    PlanCharacteristic,
    ProductOffering,
    Realisation,
    customer_stage,
)
from knowledge_portal.domain.architecture.tracking import (
    FalloutCase,
    OrderTracking,
    TrackingChannel,
    TrackingEvent,
    TrackingFlow,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.fields import (
    _flag,
    _located,
    _optional_text,
    _part,
    _retirement,
    _split,
    _sub_entries,
    _text,
    _text_list,
    _trust,
    _where,
)


# Product offerings (ADR-0095). Workbook rows are gathered into the YAML/JSON shape and
# read by the same code, each entry keeping where it came from for its errors.
def _point(item: dict[str, Any], where: str) -> OfferingPoint:
    return OfferingPoint(
        _text(item.get("name"), where, "name"),
        _optional_text(item.get("description"), where, "description"),
        _trust(item.get("confidence"), where),
        _optional_text(item.get("source"), where, "source"),
    )


def _offerings(entries: list[dict[str, Any]]) -> list[ProductOffering]:
    offerings = []
    for number, item in enumerate(entries, start=1):
        where = _where(item, f"products entry {number}")
        try:
            offerings.append(_offering(item, where))
        except InvalidKnowledgeError as exc:
            raise _located(where, exc) from exc
    return offerings


def _offering(item: dict[str, Any], where: str) -> ProductOffering:
    order_types = _order_types(item, where)
    components = [
        _offering_component(part, _where(part, f"{where}, component {position}"))
        for position, part in enumerate(_sub_entries(item, "components", where), 1)
    ]
    return ProductOffering(
        id=_text(item.get("id"), where, "id"),
        name=_text(item.get("name"), where, "name"),
        code=_optional_text(item.get("code"), where, "code"),
        family=_optional_text(item.get("family"), where, "family"),
        version=_optional_text(item.get("version"), where, "version"),
        lifecycle=_optional_text(item.get("lifecycle"), where, "lifecycle"),
        family_id=_optional_text(item.get("family_term"), where, "family_term"),
        lifecycle_id=_optional_text(item.get("lifecycle_term"), where, "lifecycle_term"),
        proposition=_optional_text(item.get("proposition"), where, "proposition"),
        rules=_text_list(item.get("rules"), where, "rules"),
        order_types=tuple(order_types),
        components=tuple(components),
        values=tuple(
            _point(point, _where(point, f"{where}, value {index}"))
            for index, point in enumerate(_sub_entries(item, "values", where), 1)
        ),
        audiences=tuple(
            _point(point, _where(point, f"{where}, audience {index}"))
            for index, point in enumerate(_sub_entries(item, "audiences", where), 1)
        ),
        confidence=_trust(item.get("confidence"), where),
        source=_optional_text(item.get("source"), where, "source"),
        nfrs=tuple(
            _nfr(nfr, _where(nfr, f"{where}, NFR {index}"))
            for index, nfr in enumerate(_sub_entries(item, "nfrs", where), 1)
        ),
        tracking=_tracking(item, where),
        lifecycle_notes=_lifecycle_notes(item, where),
        sources=_text_list(item.get("sources"), where, "sources"),
        primary_source=_optional_text(item.get("primary_source"), where, "primary_source"),
        questions=tuple(
            _part(spot, partial(_question, raw, spot))
            for index, raw in enumerate(_sub_entries(item, "questions", where), 1)
            for spot in [_where(raw, f"{where}, question {index}")]
        ),
        decisions=tuple(
            _part(spot, partial(_decision, raw, spot))
            for index, raw in enumerate(_sub_entries(item, "decisions", where), 1)
            for spot in [_where(raw, f"{where}, decision {index}")]
        ),
        boundaries=_text_list(item.get("boundaries"), where, "boundaries"),
        not_used=_text_list(item.get("not_used"), where, "not_used"),
        portfolio_node_id=_optional_text(item.get("portfolio"), where, "portfolio"),
        plans=tuple(
            _part(spot, partial(_plan, raw, spot))
            for index, raw in enumerate(_sub_entries(item, "plans", where), 1)
            for spot in [_where(raw, f"{where}, plan {index}")]
        ),
        business_rules=tuple(
            _part(spot, partial(_business_rule, raw, spot))
            for index, raw in enumerate(_sub_entries(item, "business_rules", where), 1)
            for spot in [_where(raw, f"{where}, business rule {index}")]
        ),
        purpose=_optional_text(item.get("purpose"), where, "purpose"),
        former_ids=_text_list(item.get("former_ids"), where, "former_ids"),
        **_retirement(item, where),
    )


def _order_types(item: dict[str, Any], where: str) -> list[OrderType]:
    return [
        OrderType(
            _text(order.get("code"), place, "code"),
            _text(order.get("name"), place, "name"),
            bool(_flag(order.get("enabled"), place, "enabled", True)),
            _optional_text(order.get("description"), place, "description"),
            _trust(order.get("confidence"), place),
            _optional_text(order.get("source"), place, "source"),
            _text_list(order.get("channels"), place, "channels"),
            delivery_drop=_optional_text(order.get("delivery_drop"), place, "delivery_drop"),
            stage=customer_stage(_optional_text(order.get("stage"), place, "stage")),
        )
        for position, order in enumerate(_sub_entries(item, "order_types", where), 1)
        for place in [_where(order, f"{where}, order type {position}")]
    ]


def _offering_component(part: dict[str, Any], place: str) -> OfferingComponent:
    responsibilities = [
        ComponentResponsibility(
            _text(duty.get("system"), spot, "system"),
            _text(duty.get("role"), spot, "role"),
            _text(duty.get("description"), spot, "description"),
            _text_list(duty.get("order_types"), spot, "order_types"),
            _trust(duty.get("confidence"), spot),
            _optional_text(duty.get("source"), spot, "source"),
            _optional_text(duty.get("role_term"), spot, "role_term"),
        )
        for index, duty in enumerate(_sub_entries(part, "responsibilities", place), 1)
        for spot in [_where(duty, f"{place}, responsibility {index}")]
    ]
    realisation = [
        Realisation(
            _text(layer.get("layer"), spot, "layer"),  # type: ignore[arg-type]
            _text(layer.get("name"), spot, "name"),
            _trust(layer.get("confidence"), spot),
            _optional_text(layer.get("source"), spot, "source"),
            _optional_text(layer.get("record"), spot, "record"),
        )
        for index, layer in enumerate(_sub_entries(part, "realisation", place), 1)
        for spot in [_where(layer, f"{place}, realisation {index}")]
    ]
    return OfferingComponent(
        id=_text(part.get("id"), place, "id"),
        name=_text(part.get("name"), place, "name"),
        code=_optional_text(part.get("code"), place, "code"),
        kind=_optional_text(part.get("type"), place, "type"),
        mandatory=_flag(part.get("mandatory"), place, "mandatory", None),
        customer_visible=_flag(part.get("customer_visible"), place, "customer_visible", None),
        description=_optional_text(part.get("description"), place, "description"),
        commercial_spec=_optional_text(part.get("commercial_spec"), place, "commercial_spec"),
        technical_spec=_optional_text(part.get("technical_spec"), place, "technical_spec"),
        technical_details=_optional_text(part.get("technical_details"), place, "technical_details"),
        responsibilities=tuple(responsibilities),
        confidence=_trust(part.get("confidence"), place),
        source=_optional_text(part.get("source"), place, "source"),
        realisation=tuple(realisation),
        capability_ids=_text_list(part.get("capabilities"), place, "capabilities"),
        unlinked_reason=_optional_text(part.get("unlinked_reason"), place, "unlinked_reason"),
        kind_id=_optional_text(part.get("type_term"), place, "type_term"),
        hub=bool(_flag(part.get("hub"), place, "hub", False)),
    )


def _plan(raw: dict[str, Any], where: str) -> OfferingPlan:
    """A plan: its name and characteristics, given as a mapping of name to value."""
    characteristics = raw.get("characteristics") or {}
    if not isinstance(characteristics, dict):
        raise InvalidKnowledgeError(f"{where}: characteristics must map each name to its value.")
    return OfferingPlan(
        name=_text(raw.get("name"), where, "name"),
        characteristics=tuple(
            PlanCharacteristic(_text(name, where, "characteristic"), _text(value, where, str(name)))
            for name, value in characteristics.items()
        ),
        description=_optional_text(raw.get("description"), where, "description"),
        confidence=_trust(raw.get("confidence"), where),
        source=_optional_text(raw.get("source"), where, "source"),
    )


def _business_rule(raw: dict[str, Any], where: str) -> BusinessRule:
    return BusinessRule(
        id=_text(raw.get("id"), where, "id"),
        statement=_text(raw.get("statement"), where, "statement"),
        kind=_optional_text(raw.get("kind"), where, "kind"),
        confidence=_trust(raw.get("confidence"), where),
        source=_optional_text(raw.get("source"), where, "source"),
        kind_id=_optional_text(raw.get("kind_term"), where, "kind_term"),
    )


def _question(raw: dict[str, Any], where: str) -> OpenQuestion:
    order_types = raw.get("order_types")
    return OpenQuestion(
        _text(raw.get("id"), where, "id"),
        _text(raw.get("text"), where, "text"),
        _optional_text(raw.get("impact"), where, "impact"),
        _trust(raw.get("confidence"), where),
        _optional_text(raw.get("source"), where, "source"),
        _text_list(order_types, where, "order_types")
        if isinstance(order_types, list)
        else _split(order_types, where, "order_types"),
        _optional_text(raw.get("title"), where, "title"),
    )


def _decision(raw: dict[str, Any], where: str) -> ArchitectureDecision:
    return ArchitectureDecision(
        _text(raw.get("id"), where, "id"),
        _text(raw.get("title"), where, "title"),
        _optional_text(raw.get("text"), where, "text"),
        _trust(raw.get("confidence"), where),
        _optional_text(raw.get("source"), where, "source"),
    )


def _tracking(item: dict[str, Any], where: str) -> OrderTracking | None:
    raw = item.get("tracking")
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise InvalidKnowledgeError(f"{where}: tracking must be an entry.")
    place = _where(raw, f"{where}, tracking")

    def each(key: str, label: str) -> list[tuple[dict[str, Any], str]]:
        return [
            (entry, _where(entry, f"{place}, {label} {index}"))
            for index, entry in enumerate(_sub_entries(raw, key, place), 1)
        ]

    return OrderTracking(
        order_types=_text_list(raw.get("order_types"), place, "order_types"),
        scope_note=_optional_text(raw.get("scope_note"), place, "scope_note"),
        not_applicable_note=_optional_text(
            raw.get("not_applicable_note"), place, "not_applicable_note"
        ),
        flows=tuple(
            TrackingFlow(
                _text(flow.get("from_system"), spot, "from_system"),
                _text(flow.get("to_system"), spot, "to_system"),
                _text(flow.get("label"), spot, "label"),
                _optional_text(flow.get("interface"), spot, "interface"),
                _trust(flow.get("confidence"), spot),
                _optional_text(flow.get("source"), spot, "source"),
                _optional_text(flow.get("interface_id"), spot, "interface_id"),
            )
            for flow, spot in each("flows", "flow")
        ),
        channels=tuple(
            TrackingChannel(
                _text(channel.get("channel"), spot, "channel"),
                _optional_text(channel.get("correlation_key"), spot, "correlation_key"),
                _optional_text(channel.get("ui_system"), spot, "ui_system"),
                _optional_text(channel.get("story"), spot, "story"),
                _optional_text(channel.get("read_system"), spot, "read_system"),
                _optional_text(channel.get("read_interface"), spot, "read_interface"),
                _optional_text(channel.get("ui_note"), spot, "ui_note"),
                _trust(channel.get("confidence"), spot),
                _optional_text(channel.get("source"), spot, "source"),
            )
            for channel, spot in each("channels", "channel")
        ),
        milestones=tuple(_event(event, spot) for event, spot in each("milestones", "milestone")),
        statuses=tuple(_event(event, spot) for event, spot in each("statuses", "status")),
        fallout=tuple(
            FalloutCase(
                _text(case.get("trigger"), spot, "trigger"),
                _optional_text(case.get("handling"), spot, "handling"),
                _trust(case.get("confidence"), spot),
                _optional_text(case.get("source"), spot, "source"),
                _optional_text(case.get("system"), spot, "system"),
            )
            for case, spot in each("fallout", "fallout")
        ),
        confidence=_trust(raw.get("confidence"), place),
        source=_optional_text(raw.get("source"), place, "source"),
    )


def _event(item: dict[str, Any], where: str) -> TrackingEvent:
    return TrackingEvent(
        _text(item.get("label"), where, "label"),
        _optional_text(item.get("detail"), where, "detail"),
        _optional_text(item.get("system"), where, "system"),
        _trust(item.get("confidence"), where),
        _optional_text(item.get("source"), where, "source"),
    )


def _lifecycle_notes(item: dict[str, Any], where: str) -> tuple[LifecycleNote, ...]:
    notes = []
    for index, note in enumerate(_sub_entries(item, "lifecycle_notes", where), 1):
        place = _where(note, f"{where}, lifecycle note {index}")
        try:
            blocks = []
            for position, block in enumerate(_sub_entries(note, "blocks", place), 1):
                spot = _where(block, f"{place}, block {position}")
                rows = block.get("rows") or []
                if not isinstance(rows, list) or not all(isinstance(row, list) for row in rows):
                    raise InvalidKnowledgeError(f"{spot}: rows must be a list of lists.")
                blocks.append(
                    NoteBlock(
                        kind=_text(block.get("kind"), spot, "kind"),  # type: ignore[arg-type]
                        title=_optional_text(block.get("title"), spot, "title"),
                        text=_optional_text(block.get("text"), spot, "text"),
                        items=_text_list(block.get("items"), spot, "items"),
                        columns=tuple(
                            _optional_text(cell, spot, "columns") or ""
                            for cell in block.get("columns") or []
                        ),
                        rows=tuple(
                            tuple(_optional_text(cell, spot, "rows") or "" for cell in row)
                            for row in rows
                        ),
                        caption=_optional_text(block.get("caption"), spot, "caption"),
                        confidence=_trust(block.get("confidence"), spot),
                        source=_optional_text(block.get("source"), spot, "source"),
                        to_verify=bool(_flag(block.get("to_verify"), spot, "to_verify", False)),
                    )
                )
            notes.append(
                LifecycleNote(
                    id=_text(note.get("id"), place, "id"),
                    title=_text(note.get("title"), place, "title"),
                    kind=_optional_text(note.get("kind"), place, "kind"),
                    summary=_optional_text(note.get("summary"), place, "summary"),
                    order_types=_text_list(note.get("order_types"), place, "order_types"),
                    channels=_text_list(note.get("channels"), place, "channels"),
                    blocks=tuple(blocks),
                    confidence=_trust(note.get("confidence"), place),
                    source=_optional_text(note.get("source"), place, "source"),
                )
            )
        except InvalidKnowledgeError as exc:
            raise _located(place, exc) from exc
    return tuple(notes)


def _nfr(item: dict[str, Any], where: str) -> OfferingNfr:
    return OfferingNfr(
        _text(item.get("quality"), where, "quality"),
        _text(item.get("coverage"), where, "coverage"),  # type: ignore[arg-type]
        _optional_text(item.get("statement"), where, "statement"),
        _trust(item.get("confidence"), where),
        _optional_text(item.get("source"), where, "source"),
        quality_id=_optional_text(item.get("quality_term"), where, "quality_term"),
    )
