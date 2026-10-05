"""HTTP shapes for change requests from Requirement AI (requirement-portal ADR-0101, step 7).

The internal route takes requirement-portal's approved-backlog export (schema 1.x) as it
is written, but declares only what a change request needs. Every other field is ignored,
so additions within 1.x pass, and what is not declared is never stored: the approver's
email above all.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from knowledge_portal.application.use_cases.change_requests import (
    ChangeRequestReading,
    DeliveredBacklog,
)
from knowledge_portal.domain.architecture.change_requests import (
    IncomingChangeRequest,
    IncomingContext,
    IncomingFeature,
    IncomingStatus,
    IncomingSystem,
    RequirementTrace,
    TracedFeature,
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


class ChangeRequestResponse(BaseModel):
    """A change request in the inbox, as a knowledge admin sees it."""

    id: str
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

    @classmethod
    def from_domain(cls, item: IncomingChangeRequest) -> ChangeRequestResponse:
        return cls(
            id=item.id,
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
