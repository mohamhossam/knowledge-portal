"""A release written as the YAML/JSON catalogue shape; files leave out what is unknown."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from knowledge_portal.domain.architecture.acceptance import CatalogueBody, recorded_acceptances
from knowledge_portal.domain.architecture.change_requests import ChangeRequestRecord
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.governance import (
    ConflictSide,
    KnowledgeSource,
    SourceConflict,
)
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.journeys import Activity, Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    CapabilityDomain,
    LandscapeDomain,
    RelationshipKind,
    SystemComponent,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.lifecycle import LifecycleNote
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import (
    BusinessRule,
    OfferingComponent,
    OfferingPlan,
    OrderType,
    ProductOffering,
)
from knowledge_portal.domain.architecture.provenance import AcceptedCitation
from knowledge_portal.domain.architecture.realisations import RealisationRecord
from knowledge_portal.domain.architecture.tracking import OrderTracking, TrackingEvent
from knowledge_portal.domain.architecture.vocabularies import ConceptScheme, VocabularyTerm


# Acceptances (ADR-0120): which accepted suggestions produced an entity, one row each, naming
# the entity by kind and key so the entries themselves stay as people write them.
def _acceptance_rows(body: CatalogueBody) -> list[dict[str, Any]]:
    return [
        {
            "entity": key[0],
            "key": list(key[1:]),
            "candidate_id": entry.candidate_id,
            "model": entry.model,
            "prompt_version": entry.prompt_version,
            "decided_by": entry.decided_by,
            "decided_at": entry.decided_at.isoformat(),
            **_present(citations=[_citation_mapping(item) for item in entry.citations]),
        }
        for key, entries in recorded_acceptances(body).items()
        for entry in entries
    ]


def _citation_mapping(citation: AcceptedCitation) -> dict[str, Any]:
    return {
        "location": citation.location,
        "quote": citation.quote,
        **_present(document_version_id=citation.document_version_id, document=citation.document),
    }


def _concept_mapping(concept: BusinessCapability) -> dict[str, Any]:
    return {
        "id": concept.id,
        "pref_label": concept.pref_label,
        **_present(
            alt_labels=list(concept.alt_labels),
            definition=concept.definition,
            broader=concept.broader_id,
            domain=concept.domain_id,
            exact_match=concept.exact_match,
            close_match=list(concept.close_match),
        ),
        **_sourced(concept),
        **_retired(concept),
    }


def _term_mapping(term: VocabularyTerm) -> dict[str, Any]:
    return {
        "id": term.id,
        "scheme": str(term.scheme),
        "pref_label": term.pref_label,
        **_present(
            alt_labels=list(term.alt_labels),
            notation=term.notation,
            definition=term.definition,
            broader=term.broader_id,
            exact_match=term.exact_match,
            close_match=list(term.close_match),
            rank=term.rank,
        ),
        **_sourced(term),
        **_retired(term),
    }


def _scheme_mapping(scheme: ConceptScheme) -> dict[str, Any]:
    return {
        "id": scheme.id,
        "name": scheme.name,
        **_present(definition=scheme.definition, fields=[item.value for item in scheme.fields]),
    }


def _realisation_mapping(record: RealisationRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "layer": record.layer.value,
        "name": record.name,
        **_present(
            aliases=list(record.aliases),
            systems=list(record.system_ids),
            realised_by=list(record.realised_by),
            description=record.description,
        ),
        **_sourced(record),
    }


def _interface_mapping(interface: SystemInterface) -> dict[str, Any]:
    return {
        "id": interface.id,
        "name": interface.name,
        "system": interface.system_id,
        **_present(
            style=None if interface.style is InterfaceStyle.UNSPECIFIED else interface.style.value,
            consumers=list(interface.consumer_ids),
            open_apis=list(interface.open_api_ids),
            entities=list(interface.entity_ids),
            description=interface.description,
        ),
        **_sourced(interface),
        **_present(relays=list(interface.relays)),
    }


def _journey_mapping(journey: Journey) -> dict[str, Any]:
    return {
        "id": journey.id,
        "name": journey.name,
        **_present(
            product=journey.product_id,
            order_type=journey.order_type_code,
            description=journey.description,
            former_ids=list(journey.former_ids),
        ),
        **_sourced(journey),
        **_present(
            activities=[_activity_mapping(step) for step in journey.activities],
            flow_rules=[
                {
                    "kind": rule.kind.value,
                    "from": rule.from_activity,
                    "to": rule.to_activity,
                    **_present(
                        condition=rule.condition,
                        branch=rule.branch,
                        parallel_group=rule.parallel_group,
                        rejoin_at=rule.rejoin_at,
                        channel=rule.channel_id,
                    ),
                    **_sourced(rule),
                }
                for rule in journey.flow_rules
            ],
            integrations=[
                {
                    "from": link.from_activity,
                    "to": link.to_activity,
                    **_present(
                        interaction=link.interaction,
                        interface=link.interface,
                        payload=link.payload,
                        timing=link.timing.value if link.timing else None,
                        correlation_key=link.correlation_key,
                        from_system=link.from_system_id,
                        to_system=link.to_system_id,
                        via=link.via_system_id,
                        purpose=link.purpose,
                        style=link.style,
                        tmf_equivalent=link.tmf_equivalent,
                        open_apis=list(link.open_api_ids),
                        interface_id=link.interface_id,
                    ),
                    **_sourced(link),
                }
                for link in journey.integrations
            ],
        ),
    }


def _activity_mapping(step: Activity) -> dict[str, Any]:
    return {
        "number": step.number,
        "name": step.name,
        **_present(
            phase=step.phase,
            track=step.track,
            system=step.performing_system_id,
            supporting=list(step.supporting_system_ids),
            system_function=step.system_function,
            mode=step.mode,
            customer_visible=step.customer_visible,
            description=step.description,
            components=list(step.component_ids),
            input=step.input,
            output=step.output,
            etom=step.etom,
            channels=list(step.channels),
            channel_entry=step.channel_entry or None,
            performer=step.performer,
            point_of_no_return=step.point_of_no_return,
            role=step.role,
            etom_term=step.etom_id,
            role_term=step.role_id,
            mode_term=step.mode_id,
            phase_term=step.phase_id,
        ),
        **_sourced(step),
    }


def _portfolio_mapping(node: PortfolioNode) -> dict[str, Any]:
    return {
        "id": node.id,
        "name": node.name,
        "level": node.level,
        **_present(level_term=node.level_id, parent=node.parent_id, description=node.description),
        **_sourced(node),
        **_retired(node),
    }


def _present(**values: object) -> dict[str, Any]:
    """The keys that say something; files leave out what is unknown."""
    return {key: value for key, value in values.items() if value not in (None, "", [], ())}


def _sourced(item: Any) -> dict[str, Any]:
    return _present(
        confidence=item.confidence.value if item.confidence else None, source=item.source
    )


def _retired(item: Any) -> dict[str, Any]:
    """A retired entry and its successor (ADR-0121); one in service writes neither."""
    return _present(deprecated=item.deprecated or None, replaced_by=item.replaced_by)


def _offering_mapping(offering: ProductOffering) -> dict[str, Any]:
    return {
        "id": offering.id,
        "name": offering.name,
        **_present(
            code=offering.code,
            family=offering.family,
            family_term=offering.family_id,
            version=offering.version,
            lifecycle=offering.lifecycle,
            lifecycle_term=offering.lifecycle_id,
            proposition=offering.proposition,
            purpose=offering.purpose,
            rules=list(offering.rules),
        ),
        **_sourced(offering),
        **_present(
            order_types=[_order_type_mapping(order) for order in offering.order_types],
            components=[_offering_component_mapping(part) for part in offering.components],
            values=[
                {"name": point.name, **_present(description=point.description), **_sourced(point)}
                for point in offering.values
            ],
            audiences=[
                {"name": point.name, **_present(description=point.description), **_sourced(point)}
                for point in offering.audiences
            ],
            nfrs=[
                {
                    "quality": nfr.quality,
                    "coverage": nfr.coverage.value,
                    **_present(statement=nfr.statement, quality_term=nfr.quality_id),
                    **_sourced(nfr),
                }
                for nfr in offering.nfrs
            ],
        ),
        **({"tracking": _tracking_mapping(offering.tracking)} if offering.tracking else {}),
        **_present(lifecycle_notes=[_note_mapping(note) for note in offering.lifecycle_notes]),
        **_present(
            sources=list(offering.sources),
            primary_source=offering.primary_source,
            questions=[
                {
                    "id": item.id,
                    **_present(title=item.title),
                    "text": item.text,
                    **_present(impact=item.impact, order_types=list(item.order_types)),
                    **_sourced(item),
                }
                for item in offering.questions
            ],
            decisions=[
                {"id": item.id, "title": item.title, **_present(text=item.text), **_sourced(item)}
                for item in offering.decisions
            ],
            boundaries=list(offering.boundaries),
            not_used=list(offering.not_used),
            portfolio=offering.portfolio_node_id,
            plans=[_plan_mapping(plan) for plan in offering.plans],
            business_rules=[_business_rule_mapping(rule) for rule in offering.business_rules],
            former_ids=list(offering.former_ids),
        ),
        **_retired(offering),
    }


def _order_type_mapping(order: OrderType) -> dict[str, Any]:
    return {
        "code": order.code,
        "name": order.name,
        "enabled": order.enabled,
        **_present(
            description=order.description,
            channels=list(order.channels),
            delivery_drop=order.delivery_drop,
            stage=order.stage.value if order.stage else None,
        ),
        **_sourced(order),
    }


def _offering_component_mapping(part: OfferingComponent) -> dict[str, Any]:
    return {
        "id": part.id,
        "name": part.name,
        **_present(
            code=part.code,
            type=part.kind,
            mandatory=part.mandatory,
            customer_visible=part.customer_visible,
            description=part.description,
            commercial_spec=part.commercial_spec,
            technical_spec=part.technical_spec,
            technical_details=part.technical_details,
        ),
        **_sourced(part),
        **_present(
            responsibilities=[
                {
                    "system": duty.system_id,
                    "role": duty.role,
                    "description": duty.description,
                    **_present(order_types=list(duty.order_types), role_term=duty.role_id),
                    **_sourced(duty),
                }
                for duty in part.responsibilities
            ],
            realisation=[
                {
                    "layer": item.layer.value,
                    "name": item.name,
                    **_sourced(item),
                    **_present(record=item.record_id),
                }
                for item in part.realisation
            ],
            capabilities=list(part.capability_ids),
            unlinked_reason=part.unlinked_reason,
            type_term=part.kind_id,
            hub=part.hub or None,
        ),
    }


def _plan_mapping(plan: OfferingPlan) -> dict[str, Any]:
    return {
        "name": plan.name,
        **_present(
            characteristics={item.name: item.value for item in plan.characteristics},
            description=plan.description,
        ),
        **_sourced(plan),
    }


def _business_rule_mapping(rule: BusinessRule) -> dict[str, Any]:
    return {
        "id": rule.id,
        "statement": rule.statement,
        **_present(kind=rule.kind, kind_term=rule.kind_id),
        **_sourced(rule),
    }


def _note_mapping(note: LifecycleNote) -> dict[str, Any]:
    return {
        "id": note.id,
        "title": note.title,
        **_present(
            kind=note.kind,
            summary=note.summary,
            order_types=list(note.order_types),
            channels=list(note.channels),
        ),
        **_sourced(note),
        **_present(
            blocks=[
                {
                    "kind": block.kind.value,
                    **_present(
                        title=block.title,
                        text=block.text,
                        items=list(block.items),
                        columns=list(block.columns),
                        rows=[list(row) for row in block.rows],
                        caption=block.caption,
                    ),
                    **_sourced(block),
                    **({"to_verify": True} if block.to_verify else {}),
                }
                for block in note.blocks
            ]
        ),
    }


def _tracking_mapping(tracking: OrderTracking) -> dict[str, Any]:
    def event(item: TrackingEvent) -> dict[str, Any]:
        return {
            "label": item.label,
            **_present(detail=item.detail, system=item.system_id),
            **_sourced(item),
        }

    return {
        **_present(
            order_types=list(tracking.order_types),
            scope_note=tracking.scope_note,
            not_applicable_note=tracking.not_applicable_note,
        ),
        **_sourced(tracking),
        **_present(
            flows=[
                {
                    "from_system": flow.from_system_id,
                    "to_system": flow.to_system_id,
                    "label": flow.label,
                    **_present(interface=flow.interface, interface_id=flow.interface_id),
                    **_sourced(flow),
                }
                for flow in tracking.flows
            ],
            channels=[
                {
                    "channel": channel.channel_id,
                    **_present(
                        correlation_key=channel.correlation_key,
                        ui_system=channel.ui_system_id,
                        story=channel.story,
                        read_system=channel.read_system_id,
                        read_interface=channel.read_interface,
                        ui_note=channel.ui_note,
                    ),
                    **_sourced(channel),
                }
                for channel in tracking.channels
            ],
            milestones=[event(item) for item in tracking.milestones],
            statuses=[event(item) for item in tracking.statuses],
            fallout=[
                {
                    "trigger": case.trigger,
                    **_present(handling=case.handling, system=case.system_id),
                    **_sourced(case),
                }
                for case in tracking.fallout
            ],
        ),
    }


def _channel_mapping(channel: Channel) -> dict[str, Any]:
    return {
        "id": channel.id,
        "name": channel.name,
        **_present(
            kind=channel.kind,
            kind_term=channel.kind_id,
            entry_system=channel.entry_system_id,
            description=channel.description,
        ),
        **_sourced(channel),
    }


def _source_mapping(source: KnowledgeSource) -> dict[str, Any]:
    return {
        "id": source.id,
        "title": source.title,
        "level": source.level.value,
        **_present(short=source.short, version=source.version, file=source.file),
        **({} if source.supplied else {"supplied": False}),
        **_present(authority=source.authority, scope=source.scope, boundary=source.boundary),
    }


def _conflict_mapping(conflict: SourceConflict) -> dict[str, Any]:
    def side(item: ConflictSide) -> dict[str, Any]:
        return {
            "source": item.source_id,
            **_present(reference=item.reference),
            "statement": item.statement,
        }

    return {
        "id": conflict.id,
        "title": conflict.title,
        "a": side(conflict.a),
        "b": side(conflict.b),
        **_present(
            scope=[
                {
                    "product": item.product_id,
                    **_present(order_types=list(item.order_types), question=item.question_id),
                }
                for item in conflict.scope
            ],
            difference=conflict.difference,
            impact=conflict.impact,
            decision=conflict.decision,
        ),
        **_sourced(conflict),
    }


def _domain_mapping(item: CapabilityDomain | LandscapeDomain) -> dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        **({"name_ar": item.name_ar} if item.name_ar else {}),
        **({"parent_id": item.parent_id} if item.parent_id else {}),
        **({"description": item.description} if item.description else {}),
        **(
            {"cross_cutting": True}
            if isinstance(item, LandscapeDomain) and item.cross_cutting
            else {}
        ),
        **(
            {"layout": item.layout.value}
            if isinstance(item, LandscapeDomain) and item.layout
            else {}
        ),
    }


def _component_mapping(component: SystemComponent) -> dict[str, Any]:
    return {
        "id": component.id,
        "name": component.name,
        **({"name_ar": component.name_ar} if component.name_ar else {}),
        **({"aliases": list(component.aliases)} if component.aliases else {}),
        **({"technology": component.technology} if component.technology else {}),
        **_present(technology_term=component.technology_id),
        **({"description": component.description} if component.description else {}),
        **_sourced(component),
    }


def release_to_mapping(release: ArchitectureKnowledge) -> dict[str, Any]:
    return {
        "version": release.id,
        "systems": [_system_mapping(item) for item in release.systems],
        "dependencies": [
            {
                "source_system_id": item.source_system_id,
                "target_system_id": item.target_system_id,
                "description": item.description,
                **(
                    {"kind": item.kind.value}
                    if item.kind is not RelationshipKind.UNSPECIFIED
                    else {}
                ),
                **_sourced(item),
            }
            for item in release.relationships
        ],
        **(
            {"capability_domains": [_domain_mapping(item) for item in release.capability_domains]}
            if release.capability_domains
            else {}
        ),
        **(
            {"landscape_domains": [_domain_mapping(item) for item in release.landscape_domains]}
            if release.landscape_domains
            else {}
        ),
        **(
            {"products": [_offering_mapping(item) for item in release.products]}
            if release.products
            else {}
        ),
        **(
            {"journeys": [_journey_mapping(item) for item in release.journeys]}
            if release.journeys
            else {}
        ),
        **(
            {"channels": [_channel_mapping(item) for item in release.channels]}
            if release.channels
            else {}
        ),
        **_present(
            sources=[_source_mapping(item) for item in release.sources],
            conflicts=[_conflict_mapping(item) for item in release.conflicts],
            change_history=[_history_mapping(item) for item in release.change_history],
            portfolio=[_portfolio_mapping(item) for item in release.portfolio],
            business_capabilities=[
                _concept_mapping(item) for item in release.business_capabilities
            ],
            schemes=[_scheme_mapping(item) for item in release.schemes],
            vocabulary=[_term_mapping(item) for item in release.vocabulary],
            interfaces=[_interface_mapping(item) for item in release.interfaces],
            realisations=[_realisation_mapping(item) for item in release.realisations],
            acceptances=_acceptance_rows(release),
        ),
    }


def _system_mapping(item: SystemDefinition) -> dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        **({"name_ar": item.name_ar} if item.name_ar else {}),
        "aliases": list(item.aliases),
        **({"description": item.description} if item.description else {}),
        **({"landscape_domain": item.landscape_domain_id} if item.landscape_domain_id else {}),
        "capabilities": [
            {
                "id": cap.id,
                "name": cap.name,
                "triggers": list(cap.triggers),
                **({"domain": cap.domain_id} if cap.domain_id else {}),
                **({"component": cap.component_id} if cap.component_id else {}),
                **_present(concept=cap.concept_id, unlinked_reason=cap.unlinked_reason),
                **_sourced(cap),
            }
            for cap in item.capabilities
        ],
        **(
            {"components": [_component_mapping(part) for part in item.components]}
            if item.components
            else {}
        ),
        **({"constraints": list(item.constraints)} if item.constraints else {}),
        **_present(
            owner=item.owner,
            external=item.external or None,
            roadmap=item.roadmap,
            placement_from=item.placement_from,
            placement_reason=item.placement_reason,
        ),
        **_sourced(item),
        **_present(masters=list(item.masters), reads=list(item.reads)),
        **_present(
            mastery_notes=[
                {"entity": note.entity_id, "note": note.note} for note in item.mastery_notes
            ]
        ),
        **_retired(item),
    }


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _history_mapping(record: ChangeRequestRecord) -> dict[str, Any]:
    trace = record.trace
    return {
        "id": record.id,
        "title": record.title,
        "origin": record.origin.value,
        **_present(
            product=record.product_id,
            requester=record.requester,
            reason=record.reason,
            priority=record.priority,
            target_date=record.target_date,
            created_at=_iso(record.created_at),
            applied_at=_iso(record.applied_at),
        ),
        **(
            {
                "trace": {
                    "requirement": trace.requirement_id,
                    "revision": trace.breakdown_revision,
                    "approval": trace.approval_id,
                    "epic": trace.epic_id,
                    "epic_name": trace.epic_name,
                    **_present(
                        approved_by=trace.approved_by,
                        approved_at=_iso(trace.approved_at),
                        features=[{"id": item.id, "name": item.name} for item in trace.features],
                        export_schema=trace.export_schema,
                        knowledge_version=trace.knowledge_version,
                    ),
                }
            }
            if trace
            else {}
        ),
        **_present(
            items=[
                {
                    "kind": item.kind,
                    "summary": item.summary,
                    "status": item.status.value,
                    **_present(feature=item.feature_id),
                }
                for item in record.items
            ],
            gaps=list(record.gaps),
        ),
    }
