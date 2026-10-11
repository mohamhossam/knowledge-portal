"""HTTP schemas for architecture knowledge administration and architecture jobs.

The API owns these shapes so the knowledge domain can evolve without silently
changing the browser contract. Field names and JSON values match the releases
the API returned when it serialised the domain dataclasses directly.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from knowledge_portal.application.ports.architecture_jobs import (
    ArchitectureJob,
    ArchitectureJobKind,
    ArchitectureJobStatus,
)
from knowledge_portal.application.ports.architecture_rag import IndexCoverage
from knowledge_portal.application.ports.catalogue_candidates import (
    CatalogueReading,
    ExtractionRun,
)
from knowledge_portal.application.ports.located_document_extractor import LocatedText
from knowledge_portal.application.use_cases.architecture_comparison import (
    ComparedImpact,
    ImpactComparison,
)
from knowledge_portal.application.use_cases.architecture_documents import (
    BatchUploadResult,
    DocumentPassage,
    FileResult,
)
from knowledge_portal.application.use_cases.architecture_mapping_impact import MappingImpact
from knowledge_portal.application.use_cases.catalog_plans import CatalogPlans, CatalogPlansStatus
from knowledge_portal.application.use_cases.catalogue_candidates import (
    CandidateOverview,
    CandidateView,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateBasis,
    CandidateContent,
    CandidateKind,
    CandidateMatch,
    CandidateStatus,
    MatchRole,
    PossibleMatch,
)
from knowledge_portal.domain.architecture.change_requests import (
    ChangeItem,
    ChangeItemStatus,
    ChangeOrigin,
    ChangeRequestRecord,
    RequirementTrace,
    TracedFeature,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.concepts import BusinessCapability, CapabilityRef
from knowledge_portal.domain.architecture.diff import (
    CatalogueDiff,
    ChangedItem,
    ChangeKind,
)
from knowledge_portal.domain.architecture.governance import (
    ArchitectureDecision,
    ConflictScope,
    ConflictSide,
    KnowledgeSource,
    OpenQuestion,
    SourceConflict,
    SourceLevel,
)
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    ActivityIntegration,
    FlowRule,
    FlowRuleKind,
    Journey,
    journey_edges,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    CapabilityDomain,
    KnowledgeAuditEvent,
    KnowledgeCapability,
    KnowledgeDocumentVersion,
    KnowledgeReleaseStatus,
    LandscapeDomain,
    RelationshipKind,
    SystemComponent,
    SystemDefinition,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.lifecycle import (
    MAX_TABLE_COLUMNS,
    LifecycleNote,
    NoteBlock,
    NoteBlockKind,
)
from knowledge_portal.domain.architecture.plans import PriceKind
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import (
    BusinessRule,
    ComponentResponsibility,
    NfrCoverage,
    OfferingComponent,
    OfferingNfr,
    OfferingPlan,
    OfferingPoint,
    OrderType,
    PlanCharacteristic,
    ProductOffering,
    Realisation,
    RealisationLayer,
    SourceConfidence,
)
from knowledge_portal.domain.architecture.realisations import RealisationRecord
from knowledge_portal.domain.architecture.samples import MAX_SAMPLES, SampleRequirementSet
from knowledge_portal.domain.architecture.tracking import (
    FalloutCase,
    OrderTracking,
    TrackingChannel,
    TrackingEvent,
    TrackingFlow,
)
from knowledge_portal.domain.architecture.vocabularies import VocabularyScheme, VocabularyTerm
from knowledge_portal.domain.architecture.vocabulary_links import VocabularyField, VocabularyRef
from knowledge_portal.interfaces.api.schemas.bounds import (
    MAX_CATALOGUE_ITEMS,
    Identifier,
    Name,
    Sentence,
    Text,
)

# The catalogue schemas below are also response shapes. Their size limits apply
# to requests; `from_domain` builds them with `model_construct`, skipping
# validation, so a stored release always reads back.


class KnowledgeCapabilitySchema(BaseModel):
    id: Identifier
    name: Name
    triggers: list[Sentence] = Field(max_length=MAX_CATALOGUE_ITEMS)
    domain_id: Identifier | None = None
    component_id: Identifier | None = None
    # The business capability concept it delivers (ADR-0114), or why none fits.
    concept_id: Identifier | None = None
    unlinked_reason: Sentence | None = None

    @classmethod
    def from_domain(cls, capability: KnowledgeCapability) -> KnowledgeCapabilitySchema:
        return cls.model_construct(
            id=capability.id,
            name=capability.name,
            triggers=list(capability.triggers),
            domain_id=capability.domain_id,
            component_id=capability.component_id,
            concept_id=capability.concept_id,
            unlinked_reason=capability.unlinked_reason,
        )

    def to_domain(self) -> KnowledgeCapability:
        return KnowledgeCapability(
            self.id,
            self.name,
            tuple(self.triggers),
            self.domain_id,
            self.component_id,
            self.concept_id,
            self.unlinked_reason,
        )


class BusinessCapabilitySchema(BaseModel):
    """A business capability concept; a top concept names its capability domain (ADR-0114)."""

    id: Identifier
    pref_label: Name
    alt_labels: list[Name] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    definition: Text | None = None
    broader_id: Identifier | None = None
    domain_id: Identifier | None = None
    exact_match: Name | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, concept: BusinessCapability) -> BusinessCapabilitySchema:
        return cls.model_construct(
            id=concept.id,
            pref_label=concept.pref_label,
            alt_labels=list(concept.alt_labels),
            definition=concept.definition,
            broader_id=concept.broader_id,
            domain_id=concept.domain_id,
            exact_match=concept.exact_match,
            confidence=concept.confidence,
            source=concept.source,
        )

    def to_domain(self) -> BusinessCapability:
        return BusinessCapability(
            self.id,
            self.pref_label,
            tuple(self.alt_labels),
            self.definition,
            self.broader_id,
            self.domain_id,
            self.exact_match,
            self.confidence,
            self.source,
        )


class CapabilityRefSchema(BaseModel):
    system_id: Identifier
    capability_id: Identifier


class VocabularyTermSchema(BaseModel):
    """A term of a controlled vocabulary: an eTOM process, a channel or component kind, a
    role, an Open API or an information entity."""

    id: Identifier
    scheme: VocabularyScheme
    pref_label: Name
    alt_labels: list[Name] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    notation: Name | None = None
    definition: Text | None = None
    broader_id: Identifier | None = None
    exact_match: Name | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, term: VocabularyTerm) -> VocabularyTermSchema:
        return cls.model_construct(
            id=term.id,
            scheme=term.scheme,
            pref_label=term.pref_label,
            alt_labels=list(term.alt_labels),
            notation=term.notation,
            definition=term.definition,
            broader_id=term.broader_id,
            exact_match=term.exact_match,
            confidence=term.confidence,
            source=term.source,
        )

    def to_domain(self) -> VocabularyTerm:
        return VocabularyTerm(
            self.id,
            self.scheme,
            self.pref_label,
            tuple(self.alt_labels),
            self.notation,
            self.definition,
            self.broader_id,
            self.exact_match,
            self.confidence,
            self.source,
        )


class SystemInterfaceSchema(BaseModel):
    """An API, event or file contract one system exposes, and the systems that consume it."""

    id: Identifier
    name: Name
    system_id: Identifier
    style: InterfaceStyle = InterfaceStyle.UNSPECIFIED
    consumer_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    open_api_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    entity_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    description: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The interfaces it passes on, each one its system consumes.
    relays: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, interface: SystemInterface) -> SystemInterfaceSchema:
        return cls.model_construct(
            id=interface.id,
            name=interface.name,
            system_id=interface.system_id,
            style=interface.style,
            consumer_ids=list(interface.consumer_ids),
            open_api_ids=list(interface.open_api_ids),
            entity_ids=list(interface.entity_ids),
            description=interface.description,
            confidence=interface.confidence,
            source=interface.source,
            relays=list(interface.relays),
        )

    def to_domain(self) -> SystemInterface:
        return SystemInterface(
            self.id,
            self.name,
            self.system_id,
            self.style,
            tuple(self.consumer_ids),
            tuple(self.open_api_ids),
            tuple(self.entity_ids),
            self.description,
            self.confidence,
            self.source,
            tuple(self.relays),
        )


class VocabularyRefSchema(BaseModel):
    """One place a vocabulary value is written, and the value as it was read there."""

    field: VocabularyField
    owner_id: Identifier
    value: Name
    item: Identifier | None = None
    part: Identifier | None = None

    @classmethod
    def from_domain(cls, ref: VocabularyRef) -> VocabularyRefSchema:
        return cls.model_construct(
            field=ref.field,
            owner_id=ref.owner_id,
            value=ref.value,
            item=ref.item,
            part=ref.part,
        )

    def to_domain(self) -> VocabularyRef:
        return VocabularyRef(self.field, self.owner_id, self.value, self.item, self.part)


class SystemComponentSchema(BaseModel):
    id: Identifier
    name: Name
    name_ar: Name | None = None
    description: Text | None = None
    aliases: list[Name] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    technology: Name | None = None

    @classmethod
    def from_domain(cls, component: SystemComponent) -> SystemComponentSchema:
        return cls.model_construct(
            id=component.id,
            name=component.name,
            name_ar=component.name_ar,
            description=component.description,
            aliases=list(component.aliases),
            technology=component.technology,
        )

    def to_domain(self) -> SystemComponent:
        return SystemComponent(
            self.id,
            self.name,
            self.name_ar,
            self.description,
            tuple(self.aliases),
            self.technology,
        )


class CapabilityDomainSchema(BaseModel):
    id: Identifier
    name: Name
    name_ar: Name | None = None
    parent_id: Identifier | None = None
    description: Text | None = None

    @classmethod
    def from_domain(cls, domain: CapabilityDomain) -> CapabilityDomainSchema:
        return cls.model_construct(
            id=domain.id,
            name=domain.name,
            name_ar=domain.name_ar,
            parent_id=domain.parent_id,
            description=domain.description,
        )

    def to_domain(self) -> CapabilityDomain:
        return CapabilityDomain(self.id, self.name, self.name_ar, self.parent_id, self.description)


class LandscapeDomainSchema(BaseModel):
    """Where systems sit in the landscape; a sub-domain names its parent (ADR-0094)."""

    id: Identifier
    name: Name
    name_ar: Name | None = None
    parent_id: Identifier | None = None
    description: Text | None = None

    @classmethod
    def from_domain(cls, domain: LandscapeDomain) -> LandscapeDomainSchema:
        return cls.model_construct(
            id=domain.id,
            name=domain.name,
            name_ar=domain.name_ar,
            parent_id=domain.parent_id,
            description=domain.description,
        )

    def to_domain(self) -> LandscapeDomain:
        return LandscapeDomain(self.id, self.name, self.name_ar, self.parent_id, self.description)


class PortfolioNodeSchema(BaseModel):
    """A level of the product portfolio, such as Enterprise › Fixed › SMB; levels are data."""

    id: Identifier
    name: Name
    level: Name
    parent_id: Identifier | None = None
    description: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, node: PortfolioNode) -> PortfolioNodeSchema:
        return cls.model_construct(
            id=node.id,
            name=node.name,
            level=node.level,
            parent_id=node.parent_id,
            description=node.description,
            confidence=node.confidence,
            source=node.source,
        )

    def to_domain(self) -> PortfolioNode:
        return PortfolioNode(
            id=self.id,
            name=self.name,
            level=self.level,
            parent_id=self.parent_id,
            description=self.description,
            confidence=self.confidence,
            source=self.source,
        )


class ChannelSchema(BaseModel):
    """Where orders are placed, and the system each is entered through (ADR-0101, step 3)."""

    id: Identifier
    name: Name
    kind: Name | None = None
    entry_system_id: Identifier | None = None
    description: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The channel kind term the kind means.
    kind_id: Identifier | None = None

    @classmethod
    def from_domain(cls, channel: Channel) -> ChannelSchema:
        return cls.model_construct(
            id=channel.id,
            name=channel.name,
            kind=channel.kind,
            kind_id=channel.kind_id,
            entry_system_id=channel.entry_system_id,
            description=channel.description,
            confidence=channel.confidence,
            source=channel.source,
        )

    def to_domain(self) -> Channel:
        return Channel(
            id=self.id,
            name=self.name,
            kind=self.kind,
            kind_id=self.kind_id,
            entry_system_id=self.entry_system_id,
            description=self.description,
            confidence=self.confidence,
            source=self.source,
        )


class KnowledgeSourceSchema(BaseModel):
    """A source the catalogue is read from, and its level (ADR-0101, step 5)."""

    id: Identifier
    title: Name
    level: SourceLevel
    short: Name | None = None
    version: Name | None = None
    file: Text | None = None
    supplied: bool = True
    authority: Text | None = None
    scope: Text | None = None
    boundary: Text | None = None

    @classmethod
    def from_domain(cls, item: KnowledgeSource) -> KnowledgeSourceSchema:
        return cls.model_construct(
            id=item.id,
            title=item.title,
            level=item.level,
            short=item.short,
            version=item.version,
            file=item.file,
            supplied=item.supplied,
            authority=item.authority,
            scope=item.scope,
            boundary=item.boundary,
        )

    def to_domain(self) -> KnowledgeSource:
        return KnowledgeSource(
            id=self.id,
            title=self.title,
            level=self.level,
            short=self.short,
            version=self.version,
            file=self.file,
            supplied=self.supplied,
            authority=self.authority,
            scope=self.scope,
            boundary=self.boundary,
        )


class ConflictSideSchema(BaseModel):
    source_id: Identifier
    statement: Text
    reference: Name | None = None

    @classmethod
    def from_domain(cls, item: ConflictSide) -> ConflictSideSchema:
        return cls.model_construct(
            source_id=item.source_id, statement=item.statement, reference=item.reference
        )

    def to_domain(self) -> ConflictSide:
        return ConflictSide(self.source_id, self.statement, self.reference)


class ConflictScopeSchema(BaseModel):
    product_id: Identifier
    # Its order types by code; empty means every one.
    order_types: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    question_id: Identifier | None = None

    @classmethod
    def from_domain(cls, item: ConflictScope) -> ConflictScopeSchema:
        return cls.model_construct(
            product_id=item.product_id,
            order_types=list(item.order_types),
            question_id=item.question_id,
        )

    def to_domain(self) -> ConflictScope:
        return ConflictScope(self.product_id, tuple(self.order_types), self.question_id)


class SourceConflictSchema(BaseModel):
    """Two sources contradicting each other, and the decision it needs (ADR-0101, step 5)."""

    id: Identifier
    title: Name
    a: ConflictSideSchema
    b: ConflictSideSchema
    scope: list[ConflictScopeSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    difference: Text | None = None
    impact: Text | None = None
    decision: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: SourceConflict) -> SourceConflictSchema:
        return cls.model_construct(
            id=item.id,
            title=item.title,
            a=ConflictSideSchema.from_domain(item.a),
            b=ConflictSideSchema.from_domain(item.b),
            scope=[ConflictScopeSchema.from_domain(scope) for scope in item.scope],
            difference=item.difference,
            impact=item.impact,
            decision=item.decision,
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> SourceConflict:
        return SourceConflict(
            id=self.id,
            title=self.title,
            a=self.a.to_domain(),
            b=self.b.to_domain(),
            scope=tuple(scope.to_domain() for scope in self.scope),
            difference=self.difference,
            impact=self.impact,
            decision=self.decision,
            confidence=self.confidence,
            source=self.source,
        )


class OpenQuestionSchema(BaseModel):
    id: Identifier
    text: Text
    impact: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The order types it is asked for; none means the offering as a whole (step 7).
    order_types: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, item: OpenQuestion) -> OpenQuestionSchema:
        return cls.model_construct(
            id=item.id,
            text=item.text,
            impact=item.impact,
            confidence=item.confidence,
            source=item.source,
            order_types=list(item.order_types),
        )

    def to_domain(self) -> OpenQuestion:
        return OpenQuestion(
            self.id,
            self.text,
            self.impact,
            self.confidence,
            self.source,
            tuple(self.order_types),
        )


class TracedFeatureSchema(BaseModel):
    id: Identifier
    name: Name


class RequirementTraceSchema(BaseModel):
    """The approved requirement a change request comes from; the approver by name only."""

    requirement_id: Identifier
    breakdown_revision: int
    approval_id: Identifier
    epic_id: Identifier
    epic_name: Name
    approved_by: Name | None = None
    approved_at: datetime | None = None
    features: list[TracedFeatureSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    export_schema: Identifier | None = None
    knowledge_version: Identifier | None = None

    @classmethod
    def from_domain(cls, item: RequirementTrace) -> RequirementTraceSchema:
        return cls.model_construct(
            requirement_id=item.requirement_id,
            breakdown_revision=item.breakdown_revision,
            approval_id=item.approval_id,
            epic_id=item.epic_id,
            epic_name=item.epic_name,
            approved_by=item.approved_by,
            approved_at=item.approved_at,
            features=[
                TracedFeatureSchema.model_construct(id=each.id, name=each.name)
                for each in item.features
            ],
            export_schema=item.export_schema,
            knowledge_version=item.knowledge_version,
        )

    def to_domain(self) -> RequirementTrace:
        return RequirementTrace(
            requirement_id=self.requirement_id,
            breakdown_revision=self.breakdown_revision,
            approval_id=self.approval_id,
            epic_id=self.epic_id,
            epic_name=self.epic_name,
            approved_by=self.approved_by,
            approved_at=self.approved_at,
            features=tuple(TracedFeature(each.id, each.name) for each in self.features),
            export_schema=self.export_schema,
            knowledge_version=self.knowledge_version,
        )


class ChangeItemSchema(BaseModel):
    kind: Identifier
    summary: Text
    status: ChangeItemStatus = ChangeItemStatus.RECORDED
    feature_id: Identifier | None = None


class ChangeRequestRecordSchema(BaseModel):
    """A change request applied to the version (requirement-portal ADR-0101, step 7)."""

    id: Identifier
    title: Name
    origin: ChangeOrigin = ChangeOrigin.REQUIREMENT_AI
    product_id: Identifier | None = None
    requester: Name | None = None
    reason: Text | None = None
    priority: Name | None = None
    target_date: Name | None = None
    created_at: datetime | None = None
    applied_at: datetime | None = None
    trace: RequirementTraceSchema | None = None
    items: list[ChangeItemSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    gaps: list[Text] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, item: ChangeRequestRecord) -> ChangeRequestRecordSchema:
        return cls.model_construct(
            id=item.id,
            title=item.title,
            origin=item.origin,
            product_id=item.product_id,
            requester=item.requester,
            reason=item.reason,
            priority=item.priority,
            target_date=item.target_date,
            created_at=item.created_at,
            applied_at=item.applied_at,
            trace=RequirementTraceSchema.from_domain(item.trace) if item.trace else None,
            items=[
                ChangeItemSchema.model_construct(
                    kind=each.kind,
                    summary=each.summary,
                    status=each.status,
                    feature_id=each.feature_id,
                )
                for each in item.items
            ],
            gaps=list(item.gaps),
        )

    def to_domain(self) -> ChangeRequestRecord:
        return ChangeRequestRecord(
            id=self.id,
            title=self.title,
            origin=self.origin,
            product_id=self.product_id,
            requester=self.requester,
            reason=self.reason,
            priority=self.priority,
            target_date=self.target_date,
            created_at=self.created_at,
            applied_at=self.applied_at,
            trace=self.trace.to_domain() if self.trace else None,
            items=tuple(
                ChangeItem(each.kind, each.summary, each.status, each.feature_id)
                for each in self.items
            ),
            gaps=tuple(self.gaps),
        )


class ArchitectureDecisionSchema(BaseModel):
    id: Identifier
    title: Name
    text: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: ArchitectureDecision) -> ArchitectureDecisionSchema:
        return cls.model_construct(
            id=item.id,
            title=item.title,
            text=item.text,
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> ArchitectureDecision:
        return ArchitectureDecision(self.id, self.title, self.text, self.confidence, self.source)


class OfferingPointSchema(BaseModel):
    """A customer value, or a kind of customer an offering is for."""

    name: Name
    description: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, point: OfferingPoint) -> OfferingPointSchema:
        return cls.model_construct(
            name=point.name,
            description=point.description,
            confidence=point.confidence,
            source=point.source,
        )

    def to_domain(self) -> OfferingPoint:
        return OfferingPoint(self.name, self.description, self.confidence, self.source)


class RealisationSchema(BaseModel):
    """One thing a component is realised as: its CFS, an RFS behind it, or a resource."""

    layer: RealisationLayer
    name: Text
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The realisation record the name means (ontology plan Phase 8).
    record_id: Identifier | None = None

    @classmethod
    def from_domain(cls, item: Realisation) -> RealisationSchema:
        return cls.model_construct(
            layer=item.layer,
            name=item.name,
            confidence=item.confidence,
            source=item.source,
            record_id=item.record_id,
        )

    def to_domain(self) -> Realisation:
        return Realisation(self.layer, self.name, self.confidence, self.source, self.record_id)


class RealisationRecordSchema(BaseModel):
    """A CFS, RFS or resource, the systems that deliver it, and what realises it below."""

    id: Identifier
    layer: RealisationLayer
    name: Text
    aliases: list[Text] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    system_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    # The records one layer down that realise it.
    realised_by: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    description: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, record: RealisationRecord) -> RealisationRecordSchema:
        return cls.model_construct(
            id=record.id,
            layer=record.layer,
            name=record.name,
            aliases=list(record.aliases),
            system_ids=list(record.system_ids),
            realised_by=list(record.realised_by),
            description=record.description,
            confidence=record.confidence,
            source=record.source,
        )

    def to_domain(self) -> RealisationRecord:
        return RealisationRecord(
            self.id,
            self.layer,
            self.name,
            tuple(self.aliases),
            tuple(self.system_ids),
            tuple(self.realised_by),
            self.description,
            self.confidence,
            self.source,
        )


class OfferingNfrSchema(BaseModel):
    """A non-functional requirement of an offering and how far its sources define it."""

    quality: Name
    coverage: NfrCoverage
    statement: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: OfferingNfr) -> OfferingNfrSchema:
        return cls.model_construct(
            quality=item.quality,
            coverage=item.coverage,
            statement=item.statement,
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> OfferingNfr:
        return OfferingNfr(
            self.quality, self.coverage, self.statement, self.confidence, self.source
        )


class TrackingFlowSchema(BaseModel):
    """Order or milestone events from one system to another; to itself, a log."""

    from_system_id: Identifier
    to_system_id: Identifier
    label: Text
    interface: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: TrackingFlow) -> TrackingFlowSchema:
        return cls.model_construct(
            from_system_id=item.from_system_id,
            to_system_id=item.to_system_id,
            label=item.label,
            interface=item.interface,
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> TrackingFlow:
        return TrackingFlow(
            self.from_system_id,
            self.to_system_id,
            self.label,
            self.interface,
            self.confidence,
            self.source,
        )


class TrackingChannelSchema(BaseModel):
    """How one channel ties its order to the fulfilment order, and where progress is seen."""

    channel_id: Identifier
    correlation_key: Text | None = None
    ui_system_id: Identifier | None = None
    story: Text | None = None
    read_system_id: Identifier | None = None
    read_interface: Text | None = None
    ui_note: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: TrackingChannel) -> TrackingChannelSchema:
        return cls.model_construct(
            channel_id=item.channel_id,
            correlation_key=item.correlation_key,
            ui_system_id=item.ui_system_id,
            story=item.story,
            read_system_id=item.read_system_id,
            read_interface=item.read_interface,
            ui_note=item.ui_note,
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> TrackingChannel:
        return TrackingChannel(
            self.channel_id,
            self.correlation_key,
            self.ui_system_id,
            self.story,
            self.read_system_id,
            self.read_interface,
            self.ui_note,
            self.confidence,
            self.source,
        )


class TrackingEventSchema(BaseModel):
    """A milestone the customer sees, or an internal status."""

    label: Text
    detail: Text | None = None
    system_id: Identifier | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: TrackingEvent) -> TrackingEventSchema:
        return cls.model_construct(
            label=item.label,
            detail=item.detail,
            system_id=item.system_id,
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> TrackingEvent:
        return TrackingEvent(self.label, self.detail, self.system_id, self.confidence, self.source)


class FalloutCaseSchema(BaseModel):
    """What makes an order fall out, and how it is handled."""

    trigger: Text
    handling: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: FalloutCase) -> FalloutCaseSchema:
        return cls.model_construct(
            trigger=item.trigger,
            handling=item.handling,
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> FalloutCase:
        return FalloutCase(self.trigger, self.handling, self.confidence, self.source)


class OrderTrackingSchema(BaseModel):
    """How an offering's orders are tracked once placed (requirement-portal ADR-0101)."""

    order_types: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    scope_note: Text | None = None
    not_applicable_note: Text | None = None
    flows: list[TrackingFlowSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    channels: list[TrackingChannelSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    milestones: list[TrackingEventSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    statuses: list[TrackingEventSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    fallout: list[FalloutCaseSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: OrderTracking) -> OrderTrackingSchema:
        return cls.model_construct(
            order_types=list(item.order_types),
            scope_note=item.scope_note,
            not_applicable_note=item.not_applicable_note,
            flows=[TrackingFlowSchema.from_domain(flow) for flow in item.flows],
            channels=[TrackingChannelSchema.from_domain(channel) for channel in item.channels],
            milestones=[TrackingEventSchema.from_domain(event) for event in item.milestones],
            statuses=[TrackingEventSchema.from_domain(event) for event in item.statuses],
            fallout=[FalloutCaseSchema.from_domain(case) for case in item.fallout],
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> OrderTracking:
        return OrderTracking(
            order_types=tuple(self.order_types),
            scope_note=self.scope_note,
            not_applicable_note=self.not_applicable_note,
            flows=tuple(flow.to_domain() for flow in self.flows),
            channels=tuple(channel.to_domain() for channel in self.channels),
            milestones=tuple(event.to_domain() for event in self.milestones),
            statuses=tuple(event.to_domain() for event in self.statuses),
            fallout=tuple(case.to_domain() for case in self.fallout),
            confidence=self.confidence,
            source=self.source,
        )


class NoteBlockSchema(BaseModel):
    """One part of a lifecycle note: a paragraph, a list, or a table."""

    kind: NoteBlockKind
    title: Text | None = None
    text: Text | None = None
    items: list[Text] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    columns: list[Text] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    rows: list[Annotated[list[Text], Field(max_length=MAX_TABLE_COLUMNS)]] = Field(
        default=[], max_length=MAX_CATALOGUE_ITEMS
    )
    caption: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # Carried over from another source: to re-verify before anyone relies on it.
    to_verify: bool = False

    @classmethod
    def from_domain(cls, item: NoteBlock) -> NoteBlockSchema:
        return cls.model_construct(
            kind=item.kind,
            title=item.title,
            text=item.text,
            items=list(item.items),
            columns=list(item.columns),
            rows=[list(row) for row in item.rows],
            caption=item.caption,
            confidence=item.confidence,
            source=item.source,
            to_verify=item.to_verify,
        )

    def to_domain(self) -> NoteBlock:
        return NoteBlock(
            kind=self.kind,
            title=self.title,
            text=self.text,
            items=tuple(self.items),
            columns=tuple(self.columns),
            rows=tuple(tuple(row) for row in self.rows),
            caption=self.caption,
            confidence=self.confidence,
            source=self.source,
            to_verify=self.to_verify,
        )


class LifecycleNoteSchema(BaseModel):
    """What happens to an offering over its life, on one topic, as its sources say."""

    id: Identifier
    title: Name
    kind: Name | None = None
    summary: Text | None = None
    order_types: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    channels: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    blocks: list[NoteBlockSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, item: LifecycleNote) -> LifecycleNoteSchema:
        return cls.model_construct(
            id=item.id,
            title=item.title,
            kind=item.kind,
            summary=item.summary,
            order_types=list(item.order_types),
            channels=list(item.channels),
            blocks=[NoteBlockSchema.from_domain(block) for block in item.blocks],
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> LifecycleNote:
        return LifecycleNote(
            id=self.id,
            title=self.title,
            kind=self.kind,
            summary=self.summary,
            order_types=tuple(self.order_types),
            channels=tuple(self.channels),
            blocks=tuple(block.to_domain() for block in self.blocks),
            confidence=self.confidence,
            source=self.source,
        )


class OrderTypeSchema(BaseModel):
    code: Identifier
    name: Name
    enabled: bool = True
    description: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The channels it can be ordered through, by id; empty when the source does not say.
    channels: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, order: OrderType) -> OrderTypeSchema:
        return cls.model_construct(
            code=order.code,
            name=order.name,
            enabled=order.enabled,
            description=order.description,
            confidence=order.confidence,
            source=order.source,
            channels=list(order.channels),
        )

    def to_domain(self) -> OrderType:
        return OrderType(
            self.code,
            self.name,
            self.enabled,
            self.description,
            self.confidence,
            self.source,
            tuple(self.channels),
        )


class ComponentResponsibilitySchema(BaseModel):
    system_id: Identifier
    role: Name
    description: Text
    order_types: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The role term the role means.
    role_id: Identifier | None = None

    @classmethod
    def from_domain(cls, item: ComponentResponsibility) -> ComponentResponsibilitySchema:
        return cls.model_construct(
            system_id=item.system_id,
            role=item.role,
            role_id=item.role_id,
            description=item.description,
            order_types=list(item.order_types),
            confidence=item.confidence,
            source=item.source,
        )

    def to_domain(self) -> ComponentResponsibility:
        return ComponentResponsibility(
            self.system_id,
            self.role,
            self.description,
            tuple(self.order_types),
            self.confidence,
            self.source,
            self.role_id,
        )


class OfferingComponentSchema(BaseModel):
    id: Identifier
    name: Name
    code: Name | None = None
    kind: Name | None = None
    mandatory: bool | None = None
    customer_visible: bool | None = None
    description: Text | None = None
    commercial_spec: Text | None = None
    technical_spec: Text | None = None
    technical_details: Text | None = None
    responsibilities: list[ComponentResponsibilitySchema] = Field(
        default=[], max_length=MAX_CATALOGUE_ITEMS
    )
    confidence: SourceConfidence | None = None
    source: Text | None = None
    realisation: list[RealisationSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    # The business capability concepts it delivers (ADR-0114), or why none fits.
    capability_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    unlinked_reason: Sentence | None = None
    # The component kind term the kind means.
    kind_id: Identifier | None = None

    @classmethod
    def from_domain(cls, component: OfferingComponent) -> OfferingComponentSchema:
        return cls.model_construct(
            id=component.id,
            name=component.name,
            code=component.code,
            kind=component.kind,
            mandatory=component.mandatory,
            customer_visible=component.customer_visible,
            description=component.description,
            commercial_spec=component.commercial_spec,
            technical_spec=component.technical_spec,
            technical_details=component.technical_details,
            responsibilities=[
                ComponentResponsibilitySchema.from_domain(item)
                for item in component.responsibilities
            ],
            confidence=component.confidence,
            source=component.source,
            realisation=[RealisationSchema.from_domain(item) for item in component.realisation],
            capability_ids=list(component.capability_ids),
            unlinked_reason=component.unlinked_reason,
            kind_id=component.kind_id,
        )

    def to_domain(self) -> OfferingComponent:
        return OfferingComponent(
            id=self.id,
            name=self.name,
            code=self.code,
            kind=self.kind,
            mandatory=self.mandatory,
            customer_visible=self.customer_visible,
            description=self.description,
            commercial_spec=self.commercial_spec,
            technical_spec=self.technical_spec,
            technical_details=self.technical_details,
            responsibilities=tuple(item.to_domain() for item in self.responsibilities),
            confidence=self.confidence,
            source=self.source,
            realisation=tuple(item.to_domain() for item in self.realisation),
            capability_ids=tuple(self.capability_ids),
            unlinked_reason=self.unlinked_reason,
            kind_id=self.kind_id,
        )


class PlanCharacteristicSchema(BaseModel):
    name: Name
    value: Text

    @classmethod
    def from_domain(cls, item: PlanCharacteristic) -> PlanCharacteristicSchema:
        return cls.model_construct(name=item.name, value=item.value)

    def to_domain(self) -> PlanCharacteristic:
        return PlanCharacteristic(self.name, self.value)


class OfferingPlanSchema(BaseModel):
    """A plan as its sources describe it; its price is read live from the product catalog."""

    name: Name
    characteristics: list[PlanCharacteristicSchema] = Field(
        default=[], max_length=MAX_CATALOGUE_ITEMS
    )
    description: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, plan: OfferingPlan) -> OfferingPlanSchema:
        return cls.model_construct(
            name=plan.name,
            characteristics=[
                PlanCharacteristicSchema.from_domain(item) for item in plan.characteristics
            ],
            description=plan.description,
            confidence=plan.confidence,
            source=plan.source,
        )

    def to_domain(self) -> OfferingPlan:
        return OfferingPlan(
            name=self.name,
            characteristics=tuple(item.to_domain() for item in self.characteristics),
            description=self.description,
            confidence=self.confidence,
            source=self.source,
        )


class BusinessRuleSchema(BaseModel):
    id: Identifier
    statement: Text
    kind: Name | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, rule: BusinessRule) -> BusinessRuleSchema:
        return cls.model_construct(
            id=rule.id,
            statement=rule.statement,
            kind=rule.kind,
            confidence=rule.confidence,
            source=rule.source,
        )

    def to_domain(self) -> BusinessRule:
        return BusinessRule(
            id=self.id,
            statement=self.statement,
            kind=self.kind,
            confidence=self.confidence,
            source=self.source,
        )


class ProductOfferingSchema(BaseModel):
    """A commercial offering, its order types and components, and the systems behind them."""

    id: Identifier
    name: Name
    code: Name | None = None
    family: Name | None = None
    version: Name | None = None
    lifecycle: Name | None = None
    proposition: Text | None = None
    rules: list[Text] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    order_types: list[OrderTypeSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    components: list[OfferingComponentSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    values: list[OfferingPointSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    audiences: list[OfferingPointSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    confidence: SourceConfidence | None = None
    source: Text | None = None
    nfrs: list[OfferingNfrSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    tracking: OrderTrackingSchema | None = None
    lifecycle_notes: list[LifecycleNoteSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    # Its governance (ADR-0101, step 5): registered sources by id, the primary one, open
    # questions, architecture decisions, boundaries and what it no longer uses.
    sources: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    primary_source: Identifier | None = None
    questions: list[OpenQuestionSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    decisions: list[ArchitectureDecisionSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    boundaries: list[Text] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    not_used: list[Name] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    # Where it sits in the portfolio, its plans as the sources describe them, and its rules.
    portfolio_node_id: Identifier | None = None
    plans: list[OfferingPlanSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    business_rules: list[BusinessRuleSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, offering: ProductOffering) -> ProductOfferingSchema:
        return cls.model_construct(
            id=offering.id,
            name=offering.name,
            code=offering.code,
            family=offering.family,
            version=offering.version,
            lifecycle=offering.lifecycle,
            proposition=offering.proposition,
            rules=list(offering.rules),
            order_types=[OrderTypeSchema.from_domain(item) for item in offering.order_types],
            components=[OfferingComponentSchema.from_domain(item) for item in offering.components],
            values=[OfferingPointSchema.from_domain(item) for item in offering.values],
            audiences=[OfferingPointSchema.from_domain(item) for item in offering.audiences],
            confidence=offering.confidence,
            source=offering.source,
            nfrs=[OfferingNfrSchema.from_domain(item) for item in offering.nfrs],
            tracking=(
                OrderTrackingSchema.from_domain(offering.tracking) if offering.tracking else None
            ),
            lifecycle_notes=[
                LifecycleNoteSchema.from_domain(item) for item in offering.lifecycle_notes
            ],
            sources=list(offering.sources),
            primary_source=offering.primary_source,
            questions=[OpenQuestionSchema.from_domain(item) for item in offering.questions],
            decisions=[ArchitectureDecisionSchema.from_domain(item) for item in offering.decisions],
            boundaries=list(offering.boundaries),
            not_used=list(offering.not_used),
            portfolio_node_id=offering.portfolio_node_id,
            plans=[OfferingPlanSchema.from_domain(item) for item in offering.plans],
            business_rules=[
                BusinessRuleSchema.from_domain(item) for item in offering.business_rules
            ],
        )

    def to_domain(self) -> ProductOffering:
        return ProductOffering(
            id=self.id,
            name=self.name,
            code=self.code,
            family=self.family,
            version=self.version,
            lifecycle=self.lifecycle,
            proposition=self.proposition,
            rules=tuple(self.rules),
            order_types=tuple(item.to_domain() for item in self.order_types),
            components=tuple(item.to_domain() for item in self.components),
            values=tuple(item.to_domain() for item in self.values),
            audiences=tuple(item.to_domain() for item in self.audiences),
            confidence=self.confidence,
            source=self.source,
            nfrs=tuple(item.to_domain() for item in self.nfrs),
            tracking=self.tracking.to_domain() if self.tracking else None,
            lifecycle_notes=tuple(item.to_domain() for item in self.lifecycle_notes),
            sources=tuple(self.sources),
            primary_source=self.primary_source,
            questions=tuple(item.to_domain() for item in self.questions),
            decisions=tuple(item.to_domain() for item in self.decisions),
            boundaries=tuple(self.boundaries),
            not_used=tuple(self.not_used),
            portfolio_node_id=self.portfolio_node_id,
            plans=tuple(item.to_domain() for item in self.plans),
            business_rules=tuple(item.to_domain() for item in self.business_rules),
        )


class ActivitySchema(BaseModel):
    number: Identifier
    name: Name
    phase: Name | None = None
    track: Name | None = None
    performing_system_id: Identifier | None = None
    supporting_system_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    system_function: Text | None = None
    mode: Name | None = None
    customer_visible: bool | None = None
    description: Text | None = None
    component_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    input: Text | None = None
    output: Text | None = None
    etom: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The channels the step happens in; empty means every channel.
    channels: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    # Performed by the entry system of whichever channel the order came through.
    channel_entry: bool = False
    # Who performs it when that is not a catalogued system: a team, or the customer.
    performer: Name | None = None
    point_of_no_return: Text | None = None
    # What it does for the order, as one code, e.g. "ORCHESTRATE".
    role: Name | None = None
    # The eTOM process and role terms ``etom`` and ``role`` mean.
    etom_id: Identifier | None = None
    role_id: Identifier | None = None

    @classmethod
    def from_domain(cls, item: Activity) -> ActivitySchema:
        return cls.model_construct(
            number=item.number,
            name=item.name,
            phase=item.phase,
            track=item.track,
            performing_system_id=item.performing_system_id,
            supporting_system_ids=list(item.supporting_system_ids),
            system_function=item.system_function,
            mode=item.mode,
            customer_visible=item.customer_visible,
            description=item.description,
            component_ids=list(item.component_ids),
            input=item.input,
            output=item.output,
            etom=item.etom,
            confidence=item.confidence,
            source=item.source,
            channels=list(item.channels),
            channel_entry=item.channel_entry,
            performer=item.performer,
            point_of_no_return=item.point_of_no_return,
            role=item.role,
            etom_id=item.etom_id,
            role_id=item.role_id,
        )

    def to_domain(self) -> Activity:
        return Activity(
            number=self.number,
            name=self.name,
            phase=self.phase,
            track=self.track,
            performing_system_id=self.performing_system_id,
            supporting_system_ids=tuple(self.supporting_system_ids),
            system_function=self.system_function,
            mode=self.mode,
            customer_visible=self.customer_visible,
            description=self.description,
            component_ids=tuple(self.component_ids),
            input=self.input,
            output=self.output,
            etom=self.etom,
            confidence=self.confidence,
            source=self.source,
            channels=tuple(self.channels),
            channel_entry=self.channel_entry,
            performer=self.performer,
            point_of_no_return=self.point_of_no_return,
            role=self.role,
            etom_id=self.etom_id,
            role_id=self.role_id,
        )


class FlowRuleSchema(BaseModel):
    kind: FlowRuleKind
    from_activity: Identifier
    to_activity: Identifier
    condition: Name | None = None
    branch: Name | None = None
    parallel_group: Name | None = None
    rejoin_at: Identifier | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None

    @classmethod
    def from_domain(cls, rule: FlowRule) -> FlowRuleSchema:
        return cls.model_construct(
            kind=rule.kind,
            from_activity=rule.from_activity,
            to_activity=rule.to_activity,
            condition=rule.condition,
            branch=rule.branch,
            parallel_group=rule.parallel_group,
            rejoin_at=rule.rejoin_at,
            confidence=rule.confidence,
            source=rule.source,
        )

    def to_domain(self) -> FlowRule:
        return FlowRule(
            self.kind,
            self.from_activity,
            self.to_activity,
            self.condition,
            self.branch,
            self.parallel_group,
            self.rejoin_at,
            self.confidence,
            self.source,
        )


class ActivityIntegrationSchema(BaseModel):
    from_activity: Identifier
    to_activity: Identifier
    interaction: Name | None = None
    interface: Text | None = None
    payload: Text | None = None
    timing: Name | None = None
    correlation_key: Name | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The calling and called systems, and the integration layer between them. A call to a
    # system without a step of its own has to_activity equal to from_activity.
    from_system_id: Identifier | None = None
    to_system_id: Identifier | None = None
    via_system_id: Identifier | None = None
    purpose: Text | None = None
    style: Name | None = None
    tmf_equivalent: Name | None = None
    # The Open API terms ``tmf_equivalent`` names.
    open_api_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, link: ActivityIntegration) -> ActivityIntegrationSchema:
        return cls.model_construct(
            from_activity=link.from_activity,
            to_activity=link.to_activity,
            interaction=link.interaction,
            interface=link.interface,
            payload=link.payload,
            timing=link.timing,
            correlation_key=link.correlation_key,
            confidence=link.confidence,
            source=link.source,
            from_system_id=link.from_system_id,
            to_system_id=link.to_system_id,
            via_system_id=link.via_system_id,
            purpose=link.purpose,
            style=link.style,
            tmf_equivalent=link.tmf_equivalent,
            open_api_ids=list(link.open_api_ids),
        )

    def to_domain(self) -> ActivityIntegration:
        return ActivityIntegration(
            self.from_activity,
            self.to_activity,
            self.interaction,
            self.interface,
            self.payload,
            self.timing,
            self.correlation_key,
            self.confidence,
            self.source,
            from_system_id=self.from_system_id,
            to_system_id=self.to_system_id,
            via_system_id=self.via_system_id,
            purpose=self.purpose,
            style=self.style,
            tmf_equivalent=self.tmf_equivalent,
            open_api_ids=tuple(self.open_api_ids),
        )


class JourneyEdgeResponse(BaseModel):
    # Bounded like any request field, since a client may send a journey back with them.
    from_activity: Identifier
    to_activity: Identifier
    kind: Identifier
    label: Name | None = None


class JourneySchema(BaseModel):
    """A journey and, read-only, the flow derived from its order and rules (ADR-0096)."""

    id: Identifier
    name: Name
    product_id: Identifier | None = None
    order_type_code: Identifier | None = None
    description: Text | None = None
    activities: list[ActivitySchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    flow_rules: list[FlowRuleSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    integrations: list[ActivityIntegrationSchema] = Field(
        default=[], max_length=MAX_CATALOGUE_ITEMS
    )
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # Derived on the way out and ignored on the way in: the flow is never stored.
    edges: list[JourneyEdgeResponse] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS * 4)

    @classmethod
    def from_domain(cls, journey: Journey) -> JourneySchema:
        return cls.model_construct(
            id=journey.id,
            name=journey.name,
            product_id=journey.product_id,
            order_type_code=journey.order_type_code,
            description=journey.description,
            activities=[ActivitySchema.from_domain(item) for item in journey.activities],
            flow_rules=[FlowRuleSchema.from_domain(item) for item in journey.flow_rules],
            integrations=[
                ActivityIntegrationSchema.from_domain(item) for item in journey.integrations
            ],
            confidence=journey.confidence,
            source=journey.source,
            edges=[
                JourneyEdgeResponse.model_construct(
                    from_activity=edge.from_activity,
                    to_activity=edge.to_activity,
                    kind=edge.kind,
                    label=edge.label,
                )
                for edge in journey_edges(journey)
            ],
        )

    def to_domain(self) -> Journey:
        return Journey(
            id=self.id,
            name=self.name,
            product_id=self.product_id,
            order_type_code=self.order_type_code,
            description=self.description,
            activities=tuple(item.to_domain() for item in self.activities),
            flow_rules=tuple(item.to_domain() for item in self.flow_rules),
            integrations=tuple(item.to_domain() for item in self.integrations),
            confidence=self.confidence,
            source=self.source,
        )


class SystemDefinitionSchema(BaseModel):
    id: Identifier
    name: Name
    aliases: list[Name] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    capabilities: list[KnowledgeCapabilitySchema] = Field(
        default=[], max_length=MAX_CATALOGUE_ITEMS
    )
    constraints: list[Text] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    name_ar: Name | None = None
    components: list[SystemComponentSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    description: Text | None = None
    landscape_domain_id: Identifier | None = None
    owner: Name | None = None
    external: bool = False
    roadmap: Text | None = None
    # Where a source placed it, and why it moved, when it sits in another landscape domain.
    placement_from: Name | None = None
    placement_reason: Text | None = None
    confidence: SourceConfidence | None = None
    source: Text | None = None
    # The information entity terms it is the system of record for, and those it reads.
    masters: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    reads: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, system: SystemDefinition) -> SystemDefinitionSchema:
        return cls.model_construct(
            id=system.id,
            name=system.name,
            aliases=list(system.aliases),
            capabilities=[KnowledgeCapabilitySchema.from_domain(c) for c in system.capabilities],
            constraints=list(system.constraints),
            name_ar=system.name_ar,
            components=[SystemComponentSchema.from_domain(c) for c in system.components],
            description=system.description,
            landscape_domain_id=system.landscape_domain_id,
            owner=system.owner,
            external=system.external,
            roadmap=system.roadmap,
            placement_from=system.placement_from,
            placement_reason=system.placement_reason,
            confidence=system.confidence,
            source=system.source,
            masters=list(system.masters),
            reads=list(system.reads),
        )

    def to_domain(self) -> SystemDefinition:
        return SystemDefinition(
            id=self.id,
            name=self.name,
            aliases=tuple(self.aliases),
            capabilities=tuple(item.to_domain() for item in self.capabilities),
            constraints=tuple(self.constraints),
            name_ar=self.name_ar,
            components=tuple(item.to_domain() for item in self.components),
            description=self.description,
            landscape_domain_id=self.landscape_domain_id,
            owner=self.owner,
            external=self.external,
            roadmap=self.roadmap,
            placement_from=self.placement_from,
            placement_reason=self.placement_reason,
            confidence=self.confidence,
            source=self.source,
            masters=tuple(self.masters),
            reads=tuple(self.reads),
        )


class SystemRelationshipSchema(BaseModel):
    source_system_id: Identifier
    target_system_id: Identifier
    description: Text
    kind: RelationshipKind = RelationshipKind.UNSPECIFIED

    @classmethod
    def from_domain(cls, relationship: SystemRelationship) -> SystemRelationshipSchema:
        return cls.model_construct(
            source_system_id=relationship.source_system_id,
            target_system_id=relationship.target_system_id,
            description=relationship.description,
            kind=relationship.kind,
        )

    def to_domain(self) -> SystemRelationship:
        return SystemRelationship(
            self.source_system_id, self.target_system_id, self.description, self.kind
        )


class KnowledgeDocumentVersionResponse(BaseModel):
    id: str
    title: str
    filename: str
    mime_type: str
    language: str
    checksum: str
    storage_key: str
    uploaded_by: str
    uploaded_at: datetime

    @classmethod
    def from_domain(cls, version: KnowledgeDocumentVersion) -> KnowledgeDocumentVersionResponse:
        return cls(
            id=version.id,
            title=version.title,
            filename=version.filename,
            mime_type=version.mime_type,
            language=version.language,
            checksum=version.checksum,
            storage_key=version.storage_key,
            uploaded_by=version.uploaded_by,
            uploaded_at=version.uploaded_at,
        )


class KnowledgeReleaseResponse(BaseModel):
    id: str
    revision: int
    systems: list[SystemDefinitionSchema] = Field(max_length=MAX_CATALOGUE_ITEMS)
    relationships: list[SystemRelationshipSchema] = Field(max_length=MAX_CATALOGUE_ITEMS)
    documents: list[KnowledgeDocumentVersionResponse] = []
    status: KnowledgeReleaseStatus = KnowledgeReleaseStatus.DRAFT
    built_revision: int | None = None
    published_at: datetime | None = None
    published_by: str | None = None
    index_profile: str | None = None
    index_hash: str | None = None
    index_id: str | None = None
    name: str | None = None
    created_by: str | None = None
    capability_domains: list[CapabilityDomainSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    landscape_domains: list[LandscapeDomainSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    products: list[ProductOfferingSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    journeys: list[JourneySchema] = Field(default_factory=list, max_length=MAX_CATALOGUE_ITEMS)
    channels: list[ChannelSchema] = Field(default_factory=list, max_length=MAX_CATALOGUE_ITEMS)
    sources: list[KnowledgeSourceSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    conflicts: list[SourceConflictSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    # The change requests applied to it (requirement-portal ADR-0101, step 7).
    change_history: list[ChangeRequestRecordSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    portfolio: list[PortfolioNodeSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    # The business capability concepts (ADR-0114).
    business_capabilities: list[BusinessCapabilitySchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    # The controlled vocabularies.
    vocabulary: list[VocabularyTermSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    # The contracts systems expose and consume (ontology plan Phase 8).
    interfaces: list[SystemInterfaceSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    # The CFSs, RFSs and resources components are realised as (ontology plan Phase 8).
    realisations: list[RealisationRecordSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )

    @classmethod
    def from_domain(cls, release: ArchitectureKnowledge) -> KnowledgeReleaseResponse:
        return cls(
            id=release.id,
            revision=release.revision,
            systems=[SystemDefinitionSchema.from_domain(item) for item in release.systems],
            relationships=[
                SystemRelationshipSchema.from_domain(item) for item in release.relationships
            ],
            documents=[
                KnowledgeDocumentVersionResponse.from_domain(item) for item in release.documents
            ],
            status=release.status,
            built_revision=release.built_revision,
            published_at=release.published_at,
            published_by=release.published_by,
            index_profile=release.index_profile,
            index_hash=release.index_hash,
            index_id=release.index_id,
            name=release.name,
            created_by=release.created_by,
            capability_domains=[
                CapabilityDomainSchema.from_domain(item) for item in release.capability_domains
            ],
            landscape_domains=[
                LandscapeDomainSchema.from_domain(item) for item in release.landscape_domains
            ],
            products=[ProductOfferingSchema.from_domain(item) for item in release.products],
            journeys=[JourneySchema.from_domain(item) for item in release.journeys],
            channels=[ChannelSchema.from_domain(item) for item in release.channels],
            sources=[KnowledgeSourceSchema.from_domain(item) for item in release.sources],
            conflicts=[SourceConflictSchema.from_domain(item) for item in release.conflicts],
            change_history=[
                ChangeRequestRecordSchema.from_domain(item) for item in release.change_history
            ],
            portfolio=[PortfolioNodeSchema.from_domain(item) for item in release.portfolio],
            business_capabilities=[
                BusinessCapabilitySchema.from_domain(item) for item in release.business_capabilities
            ],
            vocabulary=[VocabularyTermSchema.from_domain(item) for item in release.vocabulary],
            interfaces=[SystemInterfaceSchema.from_domain(item) for item in release.interfaces],
            realisations=[
                RealisationRecordSchema.from_domain(item) for item in release.realisations
            ],
        )


class ExplorerReleaseResponse(BaseModel):
    """The version in service as the explorer reads it: its content, never its documents,
    index or version history (requirement-portal ADR-0101). The change requests applied to
    it are part of its content, for the Solution Architecture document (step 7)."""

    id: str
    name: str | None = None
    published_at: datetime | None = None
    systems: list[SystemDefinitionSchema] = Field(max_length=MAX_CATALOGUE_ITEMS)
    relationships: list[SystemRelationshipSchema] = Field(max_length=MAX_CATALOGUE_ITEMS)
    landscape_domains: list[LandscapeDomainSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    products: list[ProductOfferingSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    journeys: list[JourneySchema] = Field(default_factory=list, max_length=MAX_CATALOGUE_ITEMS)
    channels: list[ChannelSchema] = Field(default_factory=list, max_length=MAX_CATALOGUE_ITEMS)
    sources: list[KnowledgeSourceSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    conflicts: list[SourceConflictSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    change_history: list[ChangeRequestRecordSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )
    portfolio: list[PortfolioNodeSchema] = Field(
        default_factory=list, max_length=MAX_CATALOGUE_ITEMS
    )

    @classmethod
    def from_domain(cls, release: ArchitectureKnowledge) -> ExplorerReleaseResponse:
        return cls(
            id=release.id,
            name=release.name,
            published_at=release.published_at,
            systems=[SystemDefinitionSchema.from_domain(item) for item in release.systems],
            relationships=[
                SystemRelationshipSchema.from_domain(item) for item in release.relationships
            ],
            landscape_domains=[
                LandscapeDomainSchema.from_domain(item) for item in release.landscape_domains
            ],
            products=[ProductOfferingSchema.from_domain(item) for item in release.products],
            journeys=[JourneySchema.from_domain(item) for item in release.journeys],
            channels=[ChannelSchema.from_domain(item) for item in release.channels],
            sources=[KnowledgeSourceSchema.from_domain(item) for item in release.sources],
            conflicts=[SourceConflictSchema.from_domain(item) for item in release.conflicts],
            change_history=[
                ChangeRequestRecordSchema.from_domain(item) for item in release.change_history
            ],
            portfolio=[PortfolioNodeSchema.from_domain(item) for item in release.portfolio],
        )


class PlanPriceResponse(BaseModel):
    name: str
    kind: PriceKind
    # Exact, as the catalog states it; never a float.
    amount: str
    currency: str
    period: str | None = None
    unit: str | None = None


class CatalogPlanResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    lifecycle: str | None = None
    prices: list[PlanPriceResponse]
    terms: list[str]


class CatalogPlansResponse(BaseModel):
    """An offering's plans and prices, read live from the product catalog by its code."""

    status: CatalogPlansStatus
    code: str | None = None
    # What the screen calls the catalog that was read.
    catalog: str | None = None
    catalog_offering_id: str | None = None
    catalog_offering_name: str | None = None
    read_at: datetime | None = None
    terms: list[str] = []
    plans: list[CatalogPlanResponse] = []

    @classmethod
    def from_domain(cls, plans: CatalogPlans) -> CatalogPlansResponse:
        found = plans.offering
        return cls(
            status=plans.status,
            code=plans.code,
            catalog=plans.catalog,
            catalog_offering_id=found.id if found else None,
            catalog_offering_name=found.name if found else None,
            read_at=found.read_at if found else None,
            terms=list(found.terms) if found else [],
            plans=[
                CatalogPlanResponse(
                    id=plan.id,
                    name=plan.name,
                    description=plan.description,
                    lifecycle=plan.lifecycle,
                    prices=[
                        PlanPriceResponse(
                            name=price.name,
                            kind=price.kind,
                            amount=str(price.amount),
                            currency=price.currency,
                            period=price.period,
                            unit=price.unit,
                        )
                        for price in plan.prices
                    ],
                    terms=list(plan.terms),
                )
                for plan in (found.plans if found else ())
            ],
        )


class KnowledgeAuditEventResponse(BaseModel):
    release_id: str
    actor_id: str
    action: str
    revision: int
    rationale: str | None
    created_at: datetime

    @classmethod
    def from_domain(cls, event: KnowledgeAuditEvent) -> KnowledgeAuditEventResponse:
        return cls(
            release_id=event.release_id,
            actor_id=event.actor_id,
            action=event.action,
            revision=event.revision,
            rationale=event.rationale,
            created_at=event.created_at,
        )


class ArchitectureJobResponse(BaseModel):
    id: str
    kind: ArchitectureJobKind
    subject_id: str
    fingerprint: str
    actor_id: str
    status: ArchitectureJobStatus
    attempts: int = 0
    error_category: str | None = None
    lease_until: datetime | None = None

    @classmethod
    def from_domain(cls, job: ArchitectureJob) -> ArchitectureJobResponse:
        return cls(
            id=job.id,
            kind=job.kind,
            subject_id=job.subject_id,
            fingerprint=job.fingerprint,
            actor_id=job.actor_id,
            status=job.status,
            attempts=job.attempts,
            error_category=job.error_category,
            lease_until=job.lease_until,
        )


class DraftUpdateRequest(BaseModel):
    expected_revision: int
    systems: list[SystemDefinitionSchema] = Field(max_length=MAX_CATALOGUE_ITEMS)
    relationships: list[SystemRelationshipSchema] = Field(max_length=MAX_CATALOGUE_ITEMS)
    # Omitted by clients that predate domains: the draft keeps the ones it has.
    capability_domains: list[CapabilityDomainSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for clients that predate landscape domains (ADR-0094).
    landscape_domains: list[LandscapeDomainSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for product offerings (ADR-0095).
    products: list[ProductOfferingSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for journeys (ADR-0096).
    journeys: list[JourneySchema] | None = Field(default=None, max_length=MAX_CATALOGUE_ITEMS)
    # Likewise for channels (requirement-portal ADR-0101, step 3).
    channels: list[ChannelSchema] | None = Field(default=None, max_length=MAX_CATALOGUE_ITEMS)
    # Likewise for the source register and the conflicts between sources (step 5).
    sources: list[KnowledgeSourceSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    conflicts: list[SourceConflictSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for the product portfolio.
    portfolio: list[PortfolioNodeSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for the business capability concepts (ADR-0114).
    business_capabilities: list[BusinessCapabilitySchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for the controlled vocabularies.
    vocabulary: list[VocabularyTermSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for interfaces (ontology plan Phase 8).
    interfaces: list[SystemInterfaceSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )
    # Likewise for realisation records (ontology plan Phase 8).
    realisations: list[RealisationRecordSchema] | None = Field(
        default=None, max_length=MAX_CATALOGUE_ITEMS
    )


class SystemUpdateRequest(BaseModel):
    expected_revision: int
    system: SystemDefinitionSchema


class RevisionRequest(BaseModel):
    expected_revision: int


class CreateVersionRequest(BaseModel):
    name: Name


class RenameVersionRequest(RevisionRequest):
    name: Name


class PublishRequest(RevisionRequest):
    rationale: Text


class ActivateRequest(BaseModel):
    rationale: Text


class DocumentSelectionRequest(RevisionRequest):
    version_ids: list[Identifier] = Field(max_length=MAX_CATALOGUE_ITEMS)


class CatalogueChangeResponse(BaseModel):
    item: ChangedItem
    change: ChangeKind
    key: str
    label: str
    fields: list[str]


class CatalogueDiffResponse(BaseModel):
    base_release_id: str
    draft_release_id: str
    changes: list[CatalogueChangeResponse]

    @classmethod
    def from_domain(cls, diff: CatalogueDiff) -> CatalogueDiffResponse:
        return cls(
            base_release_id=diff.base_release_id,
            draft_release_id=diff.draft_release_id,
            changes=[
                CatalogueChangeResponse(
                    item=item.item,
                    change=item.change,
                    key=item.key,
                    label=item.label,
                    fields=list(item.fields),
                )
                for item in diff.changes
            ],
        )


class CandidateContentSchema(BaseModel):
    kind: CandidateKind
    system_id: Identifier
    name: Name = ""
    name_ar: Name | None = None
    aliases: list[Name] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    capability_id: Identifier | None = None
    triggers: list[Sentence] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    target_system_id: Identifier | None = None
    text: Text = ""
    relationship_kind: RelationshipKind | None = None
    component_id: Identifier | None = None
    description: Text | None = None
    technology: Name | None = None
    landscape_domain_id: Identifier | None = None
    parent_domain_id: Identifier | None = None
    # The whole offering, for a product suggestion (ADR-0095).
    product: ProductOfferingSchema | None = None
    # The whole journey, for a journey suggestion (ADR-0096).
    journey: JourneySchema | None = None
    # The whole channel, for a channel suggestion (requirement-portal ADR-0101).
    channel: ChannelSchema | None = None
    # An open question for the offering ``system_id`` names (step 7).
    question: OpenQuestionSchema | None = None
    # A concept and the capabilities it covers, for a concept suggestion (ADR-0114).
    concept: BusinessCapabilitySchema | None = None
    capability_refs: list[CapabilityRefSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    # The concepts a component delivers, for a component link (ADR-0114).
    concept_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    # A vocabulary term and the places it covers, for a vocabulary suggestion.
    term: VocabularyTermSchema | None = None
    value_refs: list[VocabularyRefSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)

    @classmethod
    def from_domain(cls, content: CandidateContent) -> CandidateContentSchema:
        return cls.model_construct(
            kind=content.kind,
            system_id=content.system_id,
            name=content.name,
            name_ar=content.name_ar,
            aliases=list(content.aliases),
            capability_id=content.capability_id,
            triggers=list(content.triggers),
            target_system_id=content.target_system_id,
            text=content.text,
            relationship_kind=content.relationship_kind,
            component_id=content.component_id,
            description=content.description,
            technology=content.technology,
            landscape_domain_id=content.landscape_domain_id,
            parent_domain_id=content.parent_domain_id,
            product=(
                ProductOfferingSchema.from_domain(content.product) if content.product else None
            ),
            journey=JourneySchema.from_domain(content.journey) if content.journey else None,
            channel=ChannelSchema.from_domain(content.channel) if content.channel else None,
            question=(
                OpenQuestionSchema.from_domain(content.question) if content.question else None
            ),
            concept=(
                BusinessCapabilitySchema.from_domain(content.concept) if content.concept else None
            ),
            capability_refs=[
                CapabilityRefSchema.model_construct(
                    system_id=item.system_id, capability_id=item.capability_id
                )
                for item in content.capability_refs
            ],
            concept_ids=list(content.concept_ids),
            term=VocabularyTermSchema.from_domain(content.term) if content.term else None,
            value_refs=[VocabularyRefSchema.from_domain(item) for item in content.value_refs],
        )

    def to_domain(self) -> CandidateContent:
        return CandidateContent(
            self.kind,
            self.system_id,
            self.name,
            self.name_ar,
            tuple(self.aliases),
            self.capability_id,
            tuple(self.triggers),
            self.target_system_id,
            self.text,
            self.relationship_kind,
            self.component_id,
            self.description,
            self.technology,
            self.landscape_domain_id,
            self.parent_domain_id,
            self.product.to_domain() if self.product else None,
            self.journey.to_domain() if self.journey else None,
            self.channel.to_domain() if self.channel else None,
            self.question.to_domain() if self.question else None,
            self.concept.to_domain() if self.concept else None,
            tuple(
                CapabilityRef(item.system_id, item.capability_id) for item in self.capability_refs
            ),
            tuple(self.concept_ids),
            self.term.to_domain() if self.term else None,
            tuple(item.to_domain() for item in self.value_refs),
        )


class CandidateCitationResponse(BaseModel):
    location: str
    quote: str


class PossibleMatchResponse(BaseModel):
    """An existing system a name in the suggestion may mean; a maintainer confirms it."""

    role: MatchRole
    written_as: str
    system_id: str
    system_name: str
    reason: str

    @classmethod
    def from_domain(cls, match: PossibleMatch, names: dict[str, str]) -> PossibleMatchResponse:
        return cls(
            role=match.role,
            written_as=match.written_as,
            system_id=match.system_id,
            system_name=names.get(match.system_id, match.system_id),
            reason=match.reason,
        )


class ChangeRequestCitationResponse(BaseModel):
    change_request_id: str
    feature_id: str


class CatalogueSuggestionResponse(BaseModel):
    id: str
    # The document it was read from, or the change request's id for one from a change request.
    document_version_id: str
    # Set when it comes from a change request from Requirement AI (step 7).
    change_request: ChangeRequestCitationResponse | None = None
    content: CandidateContentSchema
    citations: list[CandidateCitationResponse]
    match: CandidateMatch
    status: CandidateStatus
    edited: bool
    model: str
    prompt_version: str
    created_at: datetime
    decided_by: str | None
    decided_at: datetime | None
    # Stated outright by the document, or inferred from what it describes.
    basis: CandidateBasis
    rationale: str | None
    possible_matches: list[PossibleMatchResponse]
    # Names of the draft systems the suggestion's references resolve to, by any of their
    # names; null when the system is not in the draft yet.
    system_name: str | None
    target_system_name: str | None

    @classmethod
    def from_domain(cls, view: CandidateView, names: dict[str, str]) -> CatalogueSuggestionResponse:
        """``names`` are the draft's system names by id, to name each possible match."""
        item = view.candidate
        return cls(
            id=item.id,
            document_version_id=item.document_version_id,
            change_request=(
                ChangeRequestCitationResponse(
                    change_request_id=item.change_request.change_request_id,
                    feature_id=item.change_request.feature_id,
                )
                if item.change_request
                else None
            ),
            content=CandidateContentSchema.from_domain(item.content),
            citations=[
                CandidateCitationResponse(location=citation.location, quote=citation.quote)
                for citation in item.citations
            ],
            match=view.match,
            status=item.status,
            edited=item.edited,
            model=item.model,
            prompt_version=item.prompt_version,
            created_at=item.created_at,
            decided_by=item.decided_by,
            decided_at=item.decided_at,
            basis=item.basis,
            rationale=item.rationale,
            # Once the name a match is for is in the draft, that match has been decided.
            possible_matches=[
                PossibleMatchResponse.from_domain(match, names) for match in view.open_matches
            ],
            system_name=view.system_name,
            target_system_name=view.target_name,
        )


class ExtractionRunResponse(BaseModel):
    id: str
    document_version_id: str
    model: str
    prompt_version: str
    candidate_count: int
    warnings: list[str]
    created_at: datetime
    match_model: str | None
    match_prompt_version: str | None
    # Set when the run read a change request rather than a document (step 7).
    change_request_id: str | None = None
    # Set when the run read the draft's own catalogue for concepts or links (ADR-0114).
    reading: CatalogueReading | None = None

    @classmethod
    def from_domain(cls, run: ExtractionRun) -> ExtractionRunResponse:
        return cls(
            id=run.id,
            document_version_id=run.document_version_id,
            model=run.model,
            prompt_version=run.prompt_version,
            candidate_count=run.candidate_count,
            warnings=list(run.warnings),
            created_at=run.created_at,
            match_model=run.match_model,
            match_prompt_version=run.match_prompt_version,
            change_request_id=run.change_request_id,
            reading=run.reading,
        )


class CatalogueSuggestionsResponse(BaseModel):
    release_id: str
    release_revision: int
    suggestions: list[CatalogueSuggestionResponse]
    runs: list[ExtractionRunResponse]

    @classmethod
    def from_domain(cls, overview: CandidateOverview) -> CatalogueSuggestionsResponse:
        names = {system.id: system.name for system in overview.release.systems}
        return cls(
            release_id=overview.release.id,
            release_revision=overview.release.revision,
            suggestions=[
                CatalogueSuggestionResponse.from_domain(item, names) for item in overview.candidates
            ],
            runs=[ExtractionRunResponse.from_domain(item) for item in overview.runs],
        )


class SuggestionDecisionRequest(RevisionRequest):
    accept: bool
    # Present when the maintainer edited the suggestion before accepting it.
    content: CandidateContentSchema | None = None


class AcceptAllResponse(BaseModel):
    release: KnowledgeReleaseResponse
    remaining: int


class DocumentExtractionResponse(BaseModel):
    document_version_id: str
    job: ArchitectureJobResponse


class SampleRequirementSchema(BaseModel):
    """A sample requirement; omit `id` for a new one and the server assigns it."""

    id: Identifier | None = None
    text: Text


class SampleRequirementsRequest(RevisionRequest):
    items: list[SampleRequirementSchema] = Field(max_length=MAX_SAMPLES)


class SampleRequirementsResponse(BaseModel):
    revision: int
    items: list[SampleRequirementSchema]
    updated_by: str | None
    updated_at: datetime | None

    @classmethod
    def from_domain(cls, samples: SampleRequirementSet) -> SampleRequirementsResponse:
        return cls(
            revision=samples.revision,
            items=[SampleRequirementSchema(id=item.id, text=item.text) for item in samples.items],
            updated_by=samples.updated_by,
            updated_at=samples.updated_at,
        )


class ComparedSystemResponse(BaseModel):
    id: str
    name: str


class ComparedImpactResponse(BaseModel):
    release_id: str
    systems: list[ComparedSystemResponse]
    uncertainty: str | None

    @classmethod
    def from_domain(cls, impact: ComparedImpact) -> ComparedImpactResponse:
        return cls(
            release_id=impact.release_id,
            systems=[ComparedSystemResponse(id=item[0], name=item[1]) for item in impact.systems],
            uncertainty=impact.uncertainty,
        )


class ImpactComparisonResponse(BaseModel):
    query: str
    in_use: ComparedImpactResponse
    this_version: ComparedImpactResponse

    @classmethod
    def from_domain(cls, comparison: ImpactComparison) -> ImpactComparisonResponse:
        return cls(
            query=comparison.query,
            in_use=ComparedImpactResponse.from_domain(comparison.in_use),
            this_version=ComparedImpactResponse.from_domain(comparison.this_version),
        )


class MappingImpactResponse(BaseModel):
    """How much of the backlog is mapped, and how much uses an older catalogue version."""

    active_release_id: str
    requirements: int
    features: int
    stories: int
    outdated_requirements: int
    outdated_features: int
    outdated_stories: int

    @classmethod
    def from_domain(cls, impact: MappingImpact) -> MappingImpactResponse:
        return cls(
            active_release_id=impact.active_release_id,
            requirements=impact.requirements,
            features=impact.features,
            stories=impact.stories,
            outdated_requirements=impact.outdated_requirements,
            outdated_features=impact.outdated_features,
            outdated_stories=impact.outdated_stories,
        )


class RejectSuggestionsRequest(RevisionRequest):
    suggestion_ids: list[Identifier] = Field(max_length=MAX_CATALOGUE_ITEMS)


class RejectSuggestionsResponse(BaseModel):
    rejected: int


class PassageResponse(BaseModel):
    location: str
    text: str


class DocumentPassageResponse(BaseModel):
    mime_type: str
    passage: PassageResponse
    before: list[PassageResponse]
    after: list[PassageResponse]

    @classmethod
    def from_domain(cls, found: DocumentPassage) -> DocumentPassageResponse:
        def one(item: LocatedText) -> PassageResponse:
            return PassageResponse(location=item.location, text=item.text)

        return cls(
            mime_type=found.mime_type,
            passage=one(found.passage),
            before=[one(item) for item in found.before],
            after=[one(item) for item in found.after],
        )


class BatchUploadResponse(BaseModel):
    """Several files into a draft: the draft after them, and what became of each (C)."""

    release: KnowledgeReleaseResponse
    results: list[FileResult]

    @classmethod
    def from_domain(cls, value: BatchUploadResult) -> BatchUploadResponse:
        return cls(
            release=KnowledgeReleaseResponse.from_domain(value.release),
            results=list(value.results),
        )


class UnlinkedConceptSchema(BaseModel):
    id: str
    pref_label: str


class IndexCoverageResponse(BaseModel):
    """How far a release's evidence index links reach (ontology plan Phase 2).

    `linked` is false when the release has no index yet, or its index was built before
    links existed; rebuilding the draft links it.
    """

    linked: bool
    chunks: int = 0
    chunks_without_concept: int = 0
    concepts: int = 0
    concepts_without_chunk: list[UnlinkedConceptSchema] = Field(default_factory=list)

    @classmethod
    def from_domain(
        cls, coverage: IndexCoverage | None, release: ArchitectureKnowledge
    ) -> IndexCoverageResponse:
        if coverage is None:
            return cls(linked=False)
        labels = {item.id: item.pref_label for item in release.business_capabilities}
        return cls(
            linked=True,
            chunks=coverage.chunks,
            chunks_without_concept=coverage.chunks_without_concept,
            concepts=coverage.concepts,
            concepts_without_chunk=[
                UnlinkedConceptSchema(id=item, pref_label=labels.get(item, item))
                for item in coverage.concepts_without_chunk
            ],
        )
