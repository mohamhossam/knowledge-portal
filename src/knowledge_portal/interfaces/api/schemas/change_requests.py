"""HTTP shapes for change requests from Requirement AI (requirement-portal ADR-0101, step 7).

The internal route takes requirement-portal's approved-backlog export (schema 1.x) as it
is written, but declares only what a change request needs. Every other field is ignored,
so additions within 1.x pass, and what is not declared is never stored: the approver's
email above all.

A closed or removed Epic (ontology plan Phase 7) comes to its own internal route, as
`DeliveryRequest`: what requirement-portal read from the work-item tracker and the
decided product impact, with the catalogue changes it implies already worked out.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator

from knowledge_portal.application.use_cases.change_requests import (
    ChangeRequestReading,
    DeliveredBacklog,
    DeliveredEpic,
)
from knowledge_portal.domain.architecture.change_requests import (
    ChangeRequestKind,
    DeliveredChange,
    DeliveredChangeKind,
    DeliveryTrace,
    IncomingChangeRequest,
    IncomingContext,
    IncomingFeature,
    IncomingStatus,
    IncomingSystem,
    PredictedSystem,
    ReleaseDeliveries,
    RequirementTrace,
    TracedFeature,
    UndeliveredFeature,
)
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    ExtractionRunResponse,
    KnowledgeReleaseResponse,
    RequirementTraceSchema,
)
from knowledge_portal.interfaces.api.schemas.bounds import (
    MAX_CATALOGUE_ITEMS,
    Identifier,
    Name,
    RequiredIdentifier,
    Sentence,
    Text,
)

# The export's schema line this service reads.
SUPPORTED_MAJOR = "1"


class ExportPerson(BaseModel):
    id: Identifier | None = None
    display_name: Name | None = None


class ExportApproval(BaseModel):
    id: RequiredIdentifier
    subject_fingerprint: RequiredIdentifier
    recorded_by: ExportPerson | None = None
    recorded_at: datetime | None = None


class ExportManifest(BaseModel):
    requirement_id: RequiredIdentifier
    breakdown_revision: int = Field(ge=1)
    final_approval: ExportApproval


class ExportSystem(BaseModel):
    id: Identifier | None = None
    name: Name = Field(min_length=1)


class ExportProductContext(BaseModel):
    product_id: Identifier | None = None
    product_name: Name | None = None
    order_type: Name | None = None


class ExportArchitecture(BaseModel):
    knowledge_version: Identifier | None = None
    systems: list[ExportSystem] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    product_contexts: list[ExportProductContext] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)


class ExportStory(BaseModel):
    architecture: ExportArchitecture | None = None


class ExportFeature(BaseModel):
    sequence: int = Field(ge=0)
    id: RequiredIdentifier
    name: Name = Field(min_length=1)
    outcome: Text | None = None
    architecture: ExportArchitecture | None = None
    stories: list[ExportStory] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    def incoming(self) -> IncomingFeature:
        """The feature with what its own mapping and its stories' name, each once."""
        blocks = [self.architecture, *(story.architecture for story in self.stories)]
        contexts: dict[tuple[str, str, str], IncomingContext] = {}
        systems: dict[str, IncomingSystem] = {}
        for block in blocks:
            if block is None:
                continue
            for context in block.product_contexts:
                if not (context.product_id or context.product_name):
                    continue
                key = (
                    (context.product_id or "").casefold(),
                    (context.product_name or "").casefold(),
                    (context.order_type or "").casefold(),
                )
                contexts.setdefault(
                    key,
                    IncomingContext(context.product_id, context.product_name, context.order_type),
                )
            for system in block.systems:
                systems.setdefault(
                    (system.id or system.name).casefold(), IncomingSystem(system.name, system.id)
                )
        return IncomingFeature(
            id=self.id,
            sequence=self.sequence,
            name=self.name,
            outcome=self.outcome or None,
            contexts=tuple(contexts.values()),
            systems=tuple(systems.values()),
        )


class ExportEpic(BaseModel):
    id: RequiredIdentifier
    name: Name = Field(min_length=1)
    outcome: Text | None = None
    business_case: Text | None = None
    features: list[ExportFeature] = Field(min_length=1, max_length=MAX_CATALOGUE_ITEMS)


class ApprovedBacklogRequest(BaseModel):
    """requirement-portal's approved-backlog export, schema 1.x, as delivered."""

    schema_version: str = Field(min_length=1, max_length=20)
    manifest: ExportManifest
    epic: ExportEpic

    @field_validator("schema_version")
    @classmethod
    def _readable(cls, value: str) -> str:
        if value.split(".")[0].strip() != SUPPORTED_MAJOR:
            raise ValueError(f"This service reads backlog export schema 1.x, not {value!r}.")
        return value

    def to_backlog(self) -> DeliveredBacklog:
        approval = self.manifest.final_approval
        features = tuple(item.incoming() for item in self.epic.features)
        version = next(
            (
                block.knowledge_version
                for feature in self.epic.features
                for block in (
                    feature.architecture,
                    *(story.architecture for story in feature.stories),
                )
                if block is not None and block.knowledge_version
            ),
            None,
        )
        return DeliveredBacklog(
            approval_id=approval.id,
            subject_fingerprint=approval.subject_fingerprint,
            title=self.epic.name,
            reason=self.epic.business_case or self.epic.outcome or None,
            features=features,
            trace=RequirementTrace(
                requirement_id=self.manifest.requirement_id,
                breakdown_revision=self.manifest.breakdown_revision,
                approval_id=approval.id,
                epic_id=self.epic.id,
                epic_name=self.epic.name,
                approved_by=(approval.recorded_by.display_name if approval.recorded_by else None)
                or None,
                approved_at=approval.recorded_at,
                features=tuple(TracedFeature(item.id, item.name) for item in features),
                export_schema=self.schema_version,
                knowledge_version=version,
            ),
        )


class DeliveryState(StrEnum):
    # The Epic was closed as done in the tracker.
    CLOSED = "closed"
    # The Epic was removed: nothing was delivered.
    REMOVED = "removed"


class DeliveredEpicBody(BaseModel):
    id: RequiredIdentifier
    name: Name = Field(min_length=1)
    external_id: RequiredIdentifier
    url: Text | None = None


class DeliveredFeatureBody(BaseModel):
    """A Feature of the Epic, its state in the tracker, and the systems its mapping names."""

    id: RequiredIdentifier
    sequence: int = Field(ge=0)
    name: Name = Field(min_length=1)
    outcome: Text | None = None
    external_id: Identifier | None = None
    state: Name = Field(min_length=1)
    delivered: bool
    systems: list[ExportSystem] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    def incoming(self) -> IncomingFeature:
        systems = {
            (item.id or item.name).casefold(): IncomingSystem(item.name, item.id)
            for item in self.systems
        }
        return IncomingFeature(
            id=self.id,
            sequence=self.sequence,
            name=self.name,
            outcome=self.outcome or None,
            systems=tuple(systems.values()),
        )


class PredictedSystemBody(BaseModel):
    id: RequiredIdentifier
    name: Name = Field(min_length=1)
    role: Identifier | None = None
    change_type: Identifier | None = None


class DeliveredChangeBody(BaseModel):
    """A catalogue change the decided product impact implies for the delivered Features."""

    op: DeliveredChangeKind
    concept_id: RequiredIdentifier
    concept_label: Name = Field(min_length=1)
    system_id: Identifier | None = None
    system_name: Name | None = None
    offering_id: Identifier | None = None
    offering_name: Name | None = None
    feature_ids: list[RequiredIdentifier] = Field(min_length=1, max_length=MAX_CATALOGUE_ITEMS)

    def change(self) -> DeliveredChange:
        return DeliveredChange(
            kind=self.op,
            concept_id=self.concept_id,
            concept_label=self.concept_label,
            feature_ids=tuple(self.feature_ids),
            system_id=self.system_id or None,
            system_name=self.system_name or None,
            offering_id=self.offering_id or None,
            offering_name=self.offering_name or None,
        )


class DeliveryRequest(BaseModel):
    """A published Epic closed or removed in the work-item tracker (ontology plan Phase 7).

    A closure carries the decided product impact it is compared with; a removal needs only
    which Epic it was.
    """

    delivery_id: RequiredIdentifier
    state: DeliveryState
    requirement_id: RequiredIdentifier
    breakdown_revision: int = Field(ge=1)
    approval_id: RequiredIdentifier
    epic: DeliveredEpicBody
    occurred_at: datetime
    release_id: Identifier | None = None
    impact_version: Identifier | None = None
    decision: Identifier | None = None
    suggested_verdict: Identifier | None = None
    verdict: Identifier | None = None
    offering_id: Identifier | None = None
    offering_name: Name | None = None
    predicted_systems: list[PredictedSystemBody] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    features: list[DeliveredFeatureBody] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    changes: list[DeliveredChangeBody] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @model_validator(mode="after")
    def _closed_is_compared(self) -> DeliveryRequest:
        if self.state is DeliveryState.CLOSED:
            if not (self.release_id and self.impact_version and self.decision):
                raise ValueError(
                    "A closed Epic carries the product impact decided for its requirement."
                )
            if not any(item.delivered for item in self.features):
                raise ValueError("A closed Epic carries at least one delivered Feature.")
        return self

    def to_delivery(self) -> DeliveredEpic:
        delivered = [item for item in self.features if item.delivered]
        features = tuple(item.incoming() for item in delivered)
        encoded = json.dumps(self.model_dump(mode="json"), sort_keys=True, ensure_ascii=False)
        return DeliveredEpic(
            delivery_id=self.delivery_id,
            subject_fingerprint=f"sha256:{hashlib.sha256(encoded.encode()).hexdigest()}",
            title=self.epic.name,
            reason=f"Epic {self.epic.external_id} was closed in the work-item tracker.",
            features=features,
            trace=RequirementTrace(
                requirement_id=self.requirement_id,
                breakdown_revision=self.breakdown_revision,
                approval_id=self.approval_id,
                epic_id=self.epic.id,
                epic_name=self.epic.name,
                features=tuple(TracedFeature(item.id, item.name) for item in features),
                knowledge_version=self.release_id,
            ),
            delivery=DeliveryTrace(
                delivery_id=self.delivery_id,
                epic_external_id=self.epic.external_id,
                closed_at=self.occurred_at,
                release_id=self.release_id or "",
                impact_version=self.impact_version or "",
                decision=self.decision or "",
                epic_url=self.epic.url or None,
                suggested_verdict=self.suggested_verdict or None,
                verdict=self.verdict or None,
                offering_id=self.offering_id or None,
                offering_name=self.offering_name or None,
                predicted=tuple(
                    PredictedSystem(item.id, item.name, item.role or None, item.change_type or None)
                    for item in {each.id: each for each in self.predicted_systems}.values()
                ),
                not_delivered=tuple(
                    UndeliveredFeature(item.id, item.name, item.state)
                    for item in self.features
                    if not item.delivered
                ),
                changes=tuple(item.change() for item in self.changes),
            ),
        )


class DeliveryReceipt(BaseModel):
    # The catalogue change a closure was kept as; none for a removal.
    change_request_id: str | None
    # False when the same closure had been delivered before.
    created: bool
    # Catalogue changes still waiting that the removal withdrew.
    withdrawn: list[str]


class ChangeRequestReceipt(BaseModel):
    change_request_id: str
    approval_id: str
    # False when the same approval had been delivered before.
    created: bool


class IncomingContextResponse(BaseModel):
    product_id: str | None
    product_name: str | None
    order_type: str | None


class IncomingSystemResponse(BaseModel):
    id: str | None
    name: str


class IncomingFeatureResponse(BaseModel):
    id: str
    sequence: int
    name: str
    outcome: str | None
    contexts: list[IncomingContextResponse]
    systems: list[IncomingSystemResponse]


class DeliveredChangeResponse(BaseModel):
    op: DeliveredChangeKind
    concept_id: str
    concept_label: str
    system_id: str | None
    system_name: str | None
    offering_id: str | None
    offering_name: str | None
    feature_ids: list[str]


class UndeliveredFeatureResponse(BaseModel):
    id: str
    name: str
    state: str


class PredictedSystemResponse(BaseModel):
    id: str
    name: str
    role: str | None
    change_type: str | None


class DeliveryHitsResponse(BaseModel):
    """Delivered systems that were predicted and that were not, and predicted systems not
    delivered: ids as the mapping wrote them, case set aside."""

    predicted: list[str]
    unpredicted: list[str]
    undelivered: list[str]


class DeliveryResponse(BaseModel):
    """What a closed Epic delivered, set against the product impact decided for it."""

    delivery_id: str
    epic_external_id: str
    epic_url: str | None
    closed_at: datetime
    release_id: str
    impact_version: str
    decision: str
    suggested_verdict: str | None
    verdict: str | None
    offering_id: str | None
    offering_name: str | None
    predicted: list[PredictedSystemResponse]
    not_delivered: list[UndeliveredFeatureResponse]
    changes: list[DeliveredChangeResponse]
    hits: DeliveryHitsResponse

    @classmethod
    def from_domain(cls, item: IncomingChangeRequest) -> DeliveryResponse | None:
        delivery, hits = item.delivery, item.hits()
        if delivery is None or hits is None:
            return None
        return cls(
            delivery_id=delivery.delivery_id,
            epic_external_id=delivery.epic_external_id,
            epic_url=delivery.epic_url,
            closed_at=delivery.closed_at,
            release_id=delivery.release_id,
            impact_version=delivery.impact_version,
            decision=delivery.decision,
            suggested_verdict=delivery.suggested_verdict,
            verdict=delivery.verdict,
            offering_id=delivery.offering_id,
            offering_name=delivery.offering_name,
            predicted=[
                PredictedSystemResponse(
                    id=each.id, name=each.name, role=each.role, change_type=each.change_type
                )
                for each in delivery.predicted
            ],
            not_delivered=[
                UndeliveredFeatureResponse(id=each.id, name=each.name, state=each.state)
                for each in delivery.not_delivered
            ],
            changes=[
                DeliveredChangeResponse(
                    op=each.kind,
                    concept_id=each.concept_id,
                    concept_label=each.concept_label,
                    system_id=each.system_id,
                    system_name=each.system_name,
                    offering_id=each.offering_id,
                    offering_name=each.offering_name,
                    feature_ids=list(each.feature_ids),
                )
                for each in delivery.changes
            ],
            hits=DeliveryHitsResponse(
                predicted=list(hits.predicted),
                unpredicted=list(hits.unpredicted),
                undelivered=list(hits.undelivered),
            ),
        )


class ChangeRequestResponse(BaseModel):
    """A change request in the inbox, as a knowledge admin sees it."""

    id: str
    kind: ChangeRequestKind
    title: str
    reason: str | None
    trace: RequirementTraceSchema
    features: list[IncomingFeatureResponse]
    received_at: datetime
    status: IncomingStatus
    read_into: str | None
    read_by: str | None
    read_at: datetime | None
    dismissed_by: str | None
    dismissed_at: datetime | None
    dismissal_reason: str | None
    # Only on a catalogue change.
    delivery: DeliveryResponse | None

    @classmethod
    def from_domain(cls, item: IncomingChangeRequest) -> ChangeRequestResponse:
        return cls(
            id=item.id,
            kind=item.kind,
            title=item.title,
            reason=item.reason,
            trace=RequirementTraceSchema.from_domain(item.trace),
            features=[
                IncomingFeatureResponse(
                    id=feature.id,
                    sequence=feature.sequence,
                    name=feature.name,
                    outcome=feature.outcome,
                    contexts=[
                        IncomingContextResponse(
                            product_id=context.product_id,
                            product_name=context.product_name,
                            order_type=context.order_type,
                        )
                        for context in feature.contexts
                    ],
                    systems=[
                        IncomingSystemResponse(id=system.id, name=system.name)
                        for system in feature.systems
                    ],
                )
                for feature in item.features
            ],
            received_at=item.received_at,
            status=item.status,
            read_into=item.read_into,
            read_by=item.read_by,
            read_at=item.read_at,
            dismissed_by=item.dismissed_by,
            dismissed_at=item.dismissed_at,
            dismissal_reason=item.dismissal_reason,
            delivery=DeliveryResponse.from_domain(item),
        )


class ChangeRequestsResponse(BaseModel):
    change_requests: list[ChangeRequestResponse]


class ChangeRequestReadingResponse(BaseModel):
    release: KnowledgeReleaseResponse
    run: ExtractionRunResponse
    change_request: ChangeRequestResponse

    @classmethod
    def from_domain(cls, reading: ChangeRequestReading) -> ChangeRequestReadingResponse:
        return cls(
            release=KnowledgeReleaseResponse.from_domain(reading.release),
            run=ExtractionRunResponse.from_domain(reading.run),
            change_request=ChangeRequestResponse.from_domain(reading.change_request),
        )


class ChangeRequestDismissalRequest(BaseModel):
    reason: Sentence = Field(min_length=1)


class ReleaseDeliveriesResponse(BaseModel):
    release_id: str
    deliveries: int
    delivered: int
    predicted: int
    unpredicted: int
    undelivered: int
    last_closed_at: datetime

    @classmethod
    def from_domain(cls, item: ReleaseDeliveries) -> ReleaseDeliveriesResponse:
        return cls(
            release_id=item.release_id,
            deliveries=item.deliveries,
            delivered=item.delivered,
            predicted=item.predicted,
            unpredicted=item.unpredicted,
            undelivered=item.undelivered,
            last_closed_at=item.last_closed_at,
        )


class DeliverySummariesResponse(BaseModel):
    """The delivery hit rate per release, newest closure first."""

    releases: list[ReleaseDeliveriesResponse]

    @classmethod
    def from_domain(cls, items: tuple[ReleaseDeliveries, ...]) -> DeliverySummariesResponse:
        return cls(releases=[ReleaseDeliveriesResponse.from_domain(item) for item in items])
