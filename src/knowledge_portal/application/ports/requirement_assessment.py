"""Ports for assessing a whole requirement against one pinned release (ontology plan Phase 3).

`POST /internal/architecture/assess` answers with an `ArchitectureAssessment`: the
requirement's facets and the concepts they link to, how far the closest offering covers
them, the product verdict (or the questions to ask first), the systems with their role,
change type and path, the gaps, and who owns each impacted capability (ADR-0114,
requirement-portal ADR-0115).

Two model-backed steps sit behind ports, each with a fake: reading the requirement as
facets and picking concepts from a shortlist, and weighing the verdict and systems. Both
keep today's checks: ids only from the release, quotes only from their evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.domain.architecture.assessment import (
    ChangeType,
    Facet,
    FacetKind,
    PathStep,
    SystemRole,
)
from knowledge_portal.domain.architecture.entities import (
    ArchitectureCitation,
    OrganisationReference,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.verdicts import ProductVerdict, VerdictCall

PROMPT_VERSION = "requirement-assessment-v2"


@dataclass(frozen=True)
class AssessmentQuery:
    """A requirement as requirement-portal holds it: its text and its analysed facts."""

    text: tuple[str, ...]
    declared_systems: tuple[str, ...] = ()
    release_id: str | None = None


@dataclass(frozen=True)
class CatalogueTerm:
    """Something in the release a facet may name, by id, with the words it goes by."""

    id: str
    labels: tuple[str, ...]


@dataclass(frozen=True)
class CatalogueTerms:
    """The closed lists a requirement's facets are read against."""

    offerings: tuple[CatalogueTerm, ...] = ()
    segments: tuple[CatalogueTerm, ...] = ()
    families: tuple[CatalogueTerm, ...] = ()
    channels: tuple[CatalogueTerm, ...] = ()
    order_types: tuple[CatalogueTerm, ...] = ()
    # Information entities and interfaces (ontology plan Phase 8).
    entities: tuple[CatalogueTerm, ...] = ()
    interfaces: tuple[CatalogueTerm, ...] = ()

    def ids(self, kind: FacetKind) -> frozenset[str]:
        lists = {
            FacetKind.OFFERING: self.offerings,
            FacetKind.SEGMENT: self.segments,
            FacetKind.FAMILY: self.families,
            FacetKind.CHANNEL: self.channels,
            FacetKind.ORDER_TYPE: self.order_types,
            FacetKind.DATA: self.entities,
            FacetKind.INTERFACE: self.interfaces,
        }
        return frozenset(item.id for item in lists.get(kind, ()))


class ConceptBasis(StrEnum):
    """Why a concept is on a need's shortlist."""

    # One of its labels is in the need's words.
    LABEL = "label"
    # The need names an offering component the catalogue links to it.
    COMPONENT = "component"
    # The concept index ranked it near the need.
    INDEX = "index"


@dataclass(frozen=True)
class ConceptOption:
    """One concept on a need's shortlist."""

    concept_id: str
    label: str
    labels: tuple[str, ...]
    path: str
    basis: ConceptBasis
    definition: str | None = None


@dataclass(frozen=True)
class ConceptPick:
    """A concept the reader picked for one need, by the need's position among the needs."""

    need: int
    concept_id: str
    # The concept fits only loosely; a reviewer should check it.
    weak: bool = False


class RequirementReaderPort(Protocol):
    """Reads a requirement as facets, then picks each need's concepts from its shortlist."""

    @property
    def model(self) -> str: ...

    def facets(self, text: str, terms: CatalogueTerms) -> tuple[Facet, ...]: ...

    def pick(
        self, needs: tuple[Facet, ...], shortlists: tuple[tuple[ConceptOption, ...], ...]
    ) -> tuple[ConceptPick, ...]: ...


@dataclass(frozen=True)
class SystemCandidate:
    """A system the catalogue walk or the text reached, with every path that reached it."""

    system_id: str
    name: str
    role: SystemRole
    paths: tuple[tuple[PathStep, ...], ...] = ()


@dataclass(frozen=True)
class LinkedConcept:
    concept_id: str
    label: str
    # "Service › Managed Wi-Fi access points".
    path: str
    weak: bool = False


@dataclass(frozen=True)
class LinkedFacet:
    """A facet, with the concepts it links to when it is a need."""

    kind: FacetKind
    text: str
    quote: str
    ref_id: str | None = None
    concepts: tuple[LinkedConcept, ...] = ()


@dataclass(frozen=True)
class VerdictContext:
    """Everything the verdict reasoner may see; every id in it is the release's."""

    text: str
    release: ArchitectureKnowledge
    facets: tuple[LinkedFacet, ...]
    rule: VerdictCall
    candidates: tuple[SystemCandidate, ...]
    evidence: tuple[EvidenceChunk, ...]


@dataclass(frozen=True)
class SystemDecision:
    system_id: str
    change_type: ChangeType
    citations: tuple[ArchitectureCitation, ...]


@dataclass(frozen=True)
class VerdictDecision:
    verdict: ProductVerdict | None
    offering_id: str | None
    reason: str
    systems: tuple[SystemDecision, ...]
    uncertainty: str | None = None


class VerdictReasonerPort(Protocol):
    """Weighs the rules' verdict against the evidence and selects the impacted systems."""

    @property
    def model(self) -> str: ...

    def decide(self, context: VerdictContext) -> VerdictDecision: ...


@dataclass(frozen=True)
class ConceptCoverage:
    """One needed concept: which offerings compose it, which systems realise it, and whether
    the offering in question covers it."""

    concept_id: str
    label: str
    path: str
    composed_by: tuple[str, ...]
    realised_by: tuple[str, ...]
    covered: bool


@dataclass(frozen=True)
class ProposedComponent:
    offering_id: str
    component_id: str
    name: str


@dataclass(frozen=True)
class AssessmentProposal:
    """What the verdict proposes, for a reviewer and for drafting a catalogue change."""

    summary: str
    offering_id: str | None = None
    # The portfolio node a new offering would sit in.
    portfolio_node_id: str | None = None
    components: tuple[ProposedComponent, ...] = ()
    journey_ids: tuple[str, ...] = ()
    # Characteristic values a new plan sets.
    new_values: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssessedSystem:
    id: str
    name: str
    role: SystemRole
    change_type: ChangeType
    paths: tuple[tuple[PathStep, ...], ...] = ()


class GapKind(StrEnum):
    # A needed capability no system realises: a new capability, possibly a new system.
    CAPABILITY = "capability"
    # A needed capability whose realising system has no one in a squad on it.
    STAFFING = "staffing"


@dataclass(frozen=True)
class AssessmentGap:
    kind: GapKind
    concept_id: str
    label: str
    reason: str
    system_id: str | None = None


@dataclass(frozen=True)
class QuestionOption:
    """An answer built from the catalogue; no id for an answer it does not hold yet."""

    label: str
    id: str | None = None


@dataclass(frozen=True)
class AssessmentQuestion:
    """What to ask before a verdict can be given, with answers from the catalogue."""

    facet: FacetKind
    question: str
    options: tuple[QuestionOption, ...]


@dataclass(frozen=True)
class SeatReference:
    squad_id: str
    role: str
    person_id: str | None = None
    person_name: str | None = None
    # The seat is on this capability of the system, not on the whole system.
    scoped: bool = False


@dataclass(frozen=True)
class CapabilityOwners:
    """Who owns and staffs one impacted capability on one system (Phase 1b)."""

    concept_id: str
    system_id: str
    squads: tuple[OrganisationReference, ...] = ()
    value_streams: tuple[OrganisationReference, ...] = ()
    seats: tuple[SeatReference, ...] = ()


@dataclass(frozen=True)
class ArchitectureAssessment:
    knowledge_version: str
    facets: tuple[LinkedFacet, ...]
    coverage: tuple[ConceptCoverage, ...]
    # The offering in question: the one the requirement names, else the closest.
    offering_id: str | None
    verdict: ProductVerdict | None
    # What the rules of thumb alone said; differs from the verdict when the model disagreed.
    rule_verdict: ProductVerdict | None
    verdict_reason: str
    proposal: AssessmentProposal | None
    systems: tuple[AssessedSystem, ...]
    gaps: tuple[AssessmentGap, ...] = ()
    questions: tuple[AssessmentQuestion, ...] = ()
    owners: tuple[CapabilityOwners, ...] = ()
    # The organisation products that sell the offering, and their value streams.
    offering_products: tuple[OrganisationReference, ...] = ()
    offering_value_streams: tuple[OrganisationReference, ...] = ()
    citations: tuple[ArchitectureCitation, ...] = ()
    uncertainty: str | None = None
    model: str | None = None
    reader_model: str | None = None
    embedding_model: str | None = None
    prompt_version: str = PROMPT_VERSION
    index_revision: int | None = None


class RequirementAssessmentPort(Protocol):
    def assess(self, query: AssessmentQuery) -> ArchitectureAssessment: ...
