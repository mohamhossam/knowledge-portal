"""Product offerings: what a commercial product is made of and which systems deliver it.

An offering such as "Business Pro Plus" is sold with order types (New
Activation, Upgrade), built from components (GPON connectivity, a managed
router), and each component is delivered by catalogued systems, each in a role
("primary orchestrator", "field fulfilment"). The document's own confidence in
each fact is kept as written: confirmed, inferred or a known gap (ADR-0095).

A component can say how it is realised, layer by layer (TM Forum SID): the
customer-facing service it is sold as, the resource-facing services that deliver
it, and the resources it runs on. An offering can state its non-functional
requirements, each with how far its sources define it, so a missing one is a
recorded gap rather than silence (requirement-portal ADR-0101).

These are not the organisation catalogue's products, which group ownership,
nor a system's components, which are its modules.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Collection
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.domain.architecture.governance import (
    ArchitectureDecision,
    OpenQuestion,
    check_offering_governance,
)
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.lifecycle import LifecycleNote, check_lifecycle_notes
from knowledge_portal.domain.architecture.sources import (
    SourceConfidence as SourceConfidence,
)
from knowledge_portal.domain.architecture.sources import (
    Sourced as Sourced,
)
from knowledge_portal.domain.architecture.sources import (
    check_source as check_source,
)
from knowledge_portal.domain.architecture.tracking import OrderTracking, check_tracking


@dataclass(frozen=True)
class OfferingPoint:
    """One thing an offering gives its customers, or one kind of customer it is for."""

    name: str
    description: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", required(self.name, "Name"))
        object.__setattr__(self, "description", optional(self.description, "Description"))
        check_source(self)


@dataclass(frozen=True)
class OrderType:
    """A way the offering is ordered, such as New Activation; ``code`` is its key."""

    code: str
    name: str
    enabled: bool = True
    description: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None
    # The channels it can be ordered through, by id; none named means the source does not say.
    channels: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "code", required(self.code, "Order type code"))
        object.__setattr__(self, "name", required(self.name, "Order type name"))
        object.__setattr__(self, "description", optional(self.description, "Description"))
        object.__setattr__(
            self,
            "channels",
            tuple(dict.fromkeys(required(item, "Channel") for item in self.channels)),
        )
        check_source(self)


class RealisationLayer(StrEnum):
    """Where a part is realised: what the customer is sold, what delivers it, what it runs on."""

    CFS = "cfs"
    RFS = "rfs"
    RESOURCE = "resource"


_LAYER_WORDS = {
    "cfs": RealisationLayer.CFS,
    "customerfacingservice": RealisationLayer.CFS,
    "rfs": RealisationLayer.RFS,
    "resourcefacingservice": RealisationLayer.RFS,
    "resource": RealisationLayer.RESOURCE,
    "res": RealisationLayer.RESOURCE,
}


def realisation_layer(value: RealisationLayer | str) -> RealisationLayer:
    """A layer however it is written: "CFS", "Customer-facing service", "resource"."""
    found = _LAYER_WORDS.get("".join(re.findall(r"[a-z]", str(value).casefold())))
    if found is None:
        raise InvalidKnowledgeError(f"A realisation layer is CFS, RFS or resource, not {value!r}.")
    return found


@dataclass(frozen=True)
class Realisation:
    """One thing a component is realised as, in one layer, such as the CFS
    "CFSS_ONPREM_FIREWALL_HE" or the resource "Fortinet HE CPE"."""

    layer: RealisationLayer
    name: str
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "layer", realisation_layer(self.layer))
        object.__setattr__(self, "name", required(self.name, "Realisation"))
        check_source(self)


class NfrCoverage(StrEnum):
    """How far the sources define a non-functional requirement."""

    DEFINED = "defined"
    PARTIAL = "partial"
    MISSING = "missing"


_COVERAGE_WORDS = {
    "defined": NfrCoverage.DEFINED,
    "partial": NfrCoverage.PARTIAL,
    "partlydefined": NfrCoverage.PARTIAL,
    "missing": NfrCoverage.MISSING,
    "gap": NfrCoverage.MISSING,
    "notdefined": NfrCoverage.MISSING,
}


def nfr_coverage(value: NfrCoverage | str) -> NfrCoverage:
    """Coverage however it is written: "Partial", "gap", "not defined"."""
    found = _COVERAGE_WORDS.get("".join(re.findall(r"[a-z]", str(value).casefold())))
    if found is None:
        raise InvalidKnowledgeError(
            f"An NFR's coverage is defined, partial or missing, not {value!r}."
        )
    return found


@dataclass(frozen=True)
class OfferingNfr:
    """A non-functional requirement of an offering, such as Availability, and what the
    sources say of it; a missing one is kept so the gap is visible."""

    quality: str
    coverage: NfrCoverage
    statement: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "quality", required(self.quality, "Quality"))
        object.__setattr__(self, "coverage", nfr_coverage(self.coverage))
        object.__setattr__(self, "statement", optional(self.statement, "Statement"))
        check_source(self)


def _realisation_key(item: Realisation) -> tuple[RealisationLayer, str]:
    return item.layer, item.name.casefold()


def role_code(value: str) -> str:
    """A role as one code: "Primary orchestrator" and "PRIMARY_ORCHESTRATOR" are the same."""
    return "_".join(required(value, "Role").upper().replace("-", " ").split())


@dataclass(frozen=True)
class ComponentResponsibility:
    """What one catalogued system does for a component, in which role, for which orders."""

    system_id: str
    role: str
    description: str
    order_types: tuple[str, ...] = ()
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "system_id", required(self.system_id, "Responsible system"))
        object.__setattr__(self, "role", role_code(self.role))
        object.__setattr__(self, "description", required(self.description, "Responsibility"))
        object.__setattr__(
            self, "order_types", tuple(required(item, "Order type") for item in self.order_types)
        )
        check_source(self)


@dataclass(frozen=True)
class OfferingComponent:
    """A part of an offering, such as its connectivity or its router."""

    id: str
    name: str
    code: str | None = None
    # As the source types it: "Service", "Resource", "Digital service".
    kind: str | None = None
    mandatory: bool | None = None
    customer_visible: bool | None = None
    description: str | None = None
    commercial_spec: str | None = None
    technical_spec: str | None = None
    technical_details: str | None = None
    responsibilities: tuple[ComponentResponsibility, ...] = ()
    confidence: SourceConfidence | None = None
    source: str | None = None
    # How it is realised, layer by layer: its CFS, the RFSs behind it, its resources.
    realisation: tuple[Realisation, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Component id"))
        object.__setattr__(self, "name", required(self.name, "Component name"))
        for field, label in (
            ("code", "Component code"),
            ("kind", "Component type"),
            ("description", "Description"),
            ("commercial_spec", "Commercial spec"),
            ("technical_spec", "Technical spec"),
            ("technical_details", "Technical details"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        check_source(self)
        keys = [(item.system_id, item.role) for item in self.responsibilities]
        if len(set(keys)) != len(keys):
            raise InvalidKnowledgeError(
                f"{self.name}: a system has the same role in it more than once."
            )
        layers = [_realisation_key(item) for item in self.realisation]
        if len(set(layers)) != len(layers):
            raise InvalidKnowledgeError(
                f"{self.name}: it is realised by the same thing twice in one layer."
            )


@dataclass(frozen=True)
class ProductOffering:
    id: str
    name: str
    code: str | None = None
    family: str | None = None
    version: str | None = None
    lifecycle: str | None = None
    proposition: str | None = None
    rules: tuple[str, ...] = ()
    order_types: tuple[OrderType, ...] = ()
    components: tuple[OfferingComponent, ...] = ()
    values: tuple[OfferingPoint, ...] = ()
    audiences: tuple[OfferingPoint, ...] = ()
    confidence: SourceConfidence | None = None
    source: str | None = None
    # Its non-functional requirements, one per quality.
    nfrs: tuple[OfferingNfr, ...] = ()
    # How its orders are tracked once placed, when its sources say.
    tracking: OrderTracking | None = None
    # What happens to it over its life: up/downgrades, renewals, cessation and the like.
    lifecycle_notes: tuple[LifecycleNote, ...] = ()
    # Its governance (requirement-portal ADR-0101, step 5): the registered sources it is
    # read from and the primary one among them, the questions they leave open, the
    # architecture decisions taken, what its sources cover and leave out, and what it no
    # longer uses.
    sources: tuple[str, ...] = ()
    primary_source: str | None = None
    questions: tuple[OpenQuestion, ...] = ()
    decisions: tuple[ArchitectureDecision, ...] = ()
    boundaries: tuple[str, ...] = ()
    not_used: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Offering id"))
        object.__setattr__(self, "name", required(self.name, "Offering name"))
        for field, label in (
            ("code", "Offering code"),
            ("family", "Family"),
            ("version", "Version"),
            ("lifecycle", "Lifecycle"),
            ("proposition", "Proposition"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        object.__setattr__(self, "rules", tuple(required(item, "Rule") for item in self.rules))
        for field, label in (
            ("sources", "Source"),
            ("boundaries", "Boundary"),
            ("not_used", "What it no longer uses"),
        ):
            object.__setattr__(
                self,
                field,
                tuple(dict.fromkeys(required(item, label) for item in getattr(self, field))),
            )
        object.__setattr__(self, "primary_source", optional(self.primary_source, "Primary source"))
        check_source(self)
        check_offering_governance(
            self.name, self.questions, self.decisions, self.sources, self.primary_source
        )
        codes = [item.code.casefold() for item in self.order_types]
        if len(set(codes)) != len(codes):
            raise InvalidKnowledgeError(f"{self.name}: order type codes must be unique.")
        ids = [item.id for item in self.components]
        if len(set(ids)) != len(ids):
            raise InvalidKnowledgeError(f"{self.name}: component ids must be unique.")
        qualities = [item.quality.casefold() for item in self.nfrs]
        if len(set(qualities)) != len(qualities):
            raise InvalidKnowledgeError(f"{self.name}: each NFR quality is stated once.")
        known = set(codes)
        if self.tracking is not None:
            check_tracking(self.name, self.tracking, known)
        check_lifecycle_notes(self.name, self.lifecycle_notes, known)
        for component in self.components:
            for responsibility in component.responsibilities:
                unknown = [
                    item for item in responsibility.order_types if item.casefold() not in known
                ]
                if unknown:
                    raise InvalidKnowledgeError(
                        f"{self.name} › {component.name}: order type {unknown[0]!r} is not one "
                        "of the offering's order types."
                    )

    @property
    def systems(self) -> tuple[str, ...]:
        """The catalogued systems its components name, in first-named order."""
        return tuple(
            dict.fromkeys(
                responsibility.system_id
                for component in self.components
                for responsibility in component.responsibilities
            )
        )


def check_offerings(
    offerings: tuple[ProductOffering, ...],
    system_ids: set[str],
    channel_ids: Collection[str] = (),
) -> None:
    """Unique offerings whose responsibilities and order tracking name only catalogued
    systems, and whose order types and tracking name only catalogued channels.

    So a system or channel still named by an offering cannot be removed: the message says
    where it is named.
    """
    ids = [item.id for item in offerings]
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError("Product offering ids must be unique.")
    for offering in offerings:
        codes = [item.code for item in offering.order_types]
        if offering.tracking is not None:
            check_tracking(offering.name, offering.tracking, codes, system_ids, channel_ids)
        check_lifecycle_notes(offering.name, offering.lifecycle_notes, codes, channel_ids)
        for order_type in offering.order_types:
            unknown = [item for item in order_type.channels if item not in channel_ids]
            if unknown:
                raise InvalidKnowledgeError(
                    f"{offering.name} › {order_type.name} names channel {unknown[0]!r}, which "
                    "is not in the catalogue."
                )
        for component in offering.components:
            for responsibility in component.responsibilities:
                if responsibility.system_id not in system_ids:
                    raise InvalidKnowledgeError(
                        f"{offering.name} › {component.name} names system "
                        f"{responsibility.system_id!r}, which is not in the catalogue."
                    )


def first_known[T](*values: T | None) -> T | None:
    return next((value for value in values if value is not None), None)


def _merged_points(
    first: tuple[OfferingPoint, ...], second: tuple[OfferingPoint, ...]
) -> tuple[OfferingPoint, ...]:
    names = {item.name.casefold() for item in first}
    return (*first, *(item for item in second if item.name.casefold() not in names))


def merge_components(first: OfferingComponent, second: OfferingComponent) -> OfferingComponent:
    """Two readings of one component as one: the first's facts win, the second fills gaps."""
    duties = {(item.system_id, item.role): item for item in first.responsibilities}
    for item in second.responsibilities:
        duties.setdefault((item.system_id, item.role), item)
    layers = {_realisation_key(item): item for item in first.realisation}
    for realised in second.realisation:
        layers.setdefault(_realisation_key(realised), realised)
    return OfferingComponent(
        id=first.id,
        name=first.name,
        code=first_known(first.code, second.code),
        kind=first_known(first.kind, second.kind),
        mandatory=first_known(first.mandatory, second.mandatory),
        customer_visible=first_known(first.customer_visible, second.customer_visible),
        description=first_known(first.description, second.description),
        commercial_spec=first_known(first.commercial_spec, second.commercial_spec),
        technical_spec=first_known(first.technical_spec, second.technical_spec),
        technical_details=first_known(first.technical_details, second.technical_details),
        responsibilities=tuple(duties.values()),
        confidence=first_known(first.confidence, second.confidence),
        source=first_known(first.source, second.source),
        realisation=tuple(layers.values()),
    )


def merge_offerings(first: ProductOffering, second: ProductOffering) -> ProductOffering:
    """Two readings of one offering as one: the first's facts win, the second fills gaps.

    A document's product section can be read in more than one call, or by the
    table reader and a model, each seeing part of it. Order types merge by code,
    components by id, responsibilities by system and role, points by name, realisation
    by layer and name, NFRs by quality, lifecycle notes, questions and decisions by id;
    tracking is taken whole, the first reading's if it has one.
    """
    codes = {item.code.casefold() for item in first.order_types}
    asked = {item.id.casefold() for item in first.questions}
    decided = {item.id.casefold() for item in first.decisions}
    qualities = {item.quality.casefold() for item in first.nfrs}
    notes = {item.id for item in first.lifecycle_notes}
    parts = {item.id: item for item in first.components}
    for item in second.components:
        parts[item.id] = merge_components(parts[item.id], item) if item.id in parts else item
    return ProductOffering(
        id=first.id,
        name=first.name,
        code=first_known(first.code, second.code),
        family=first_known(first.family, second.family),
        version=first_known(first.version, second.version),
        lifecycle=first_known(first.lifecycle, second.lifecycle),
        proposition=first_known(first.proposition, second.proposition),
        rules=tuple(dict.fromkeys((*first.rules, *second.rules))),
        order_types=(
            *first.order_types,
            *(item for item in second.order_types if item.code.casefold() not in codes),
        ),
        components=tuple(parts.values()),
        values=_merged_points(first.values, second.values),
        audiences=_merged_points(first.audiences, second.audiences),
        confidence=first_known(first.confidence, second.confidence),
        source=first_known(first.source, second.source),
        nfrs=(
            *first.nfrs,
            *(item for item in second.nfrs if item.quality.casefold() not in qualities),
        ),
        tracking=first_known(first.tracking, second.tracking),
        lifecycle_notes=(
            *first.lifecycle_notes,
            *(item for item in second.lifecycle_notes if item.id not in notes),
        ),
        sources=tuple(dict.fromkeys((*first.sources, *second.sources))),
        primary_source=first_known(first.primary_source, second.primary_source),
        questions=(
            *first.questions,
            *(item for item in second.questions if item.id.casefold() not in asked),
        ),
        decisions=(
            *first.decisions,
            *(item for item in second.decisions if item.id.casefold() not in decided),
        ),
        boundaries=tuple(dict.fromkeys((*first.boundaries, *second.boundaries))),
        not_used=tuple(dict.fromkeys((*first.not_used, *second.not_used))),
    )


def same_offering(first: ProductOffering, second: ProductOffering) -> bool:
    """Whether two offerings are one: the same id, code or name."""
    return (
        first.id == second.id
        or (
            first.code is not None
            and (first.code or "").casefold() == (second.code or "").casefold()
        )
        or first.name.casefold().strip() == second.name.casefold().strip()
    )


def _key(value: str) -> str:
    """A label without case, spaces or punctuation: "NEW_ACTIVATION" is "New Activation"."""
    return "".join(re.findall(r"[^\W_]", value.casefold()))


def _named[T](
    items: tuple[T, ...], reference: str, labels: Callable[[T], tuple[str | None, ...]]
) -> T | None:
    key = _key(reference)
    if not key:
        return None
    found = [item for item in items if key in {_key(label) for label in labels(item) if label}]
    return found[0] if len(found) == 1 else None


def find_offering(offerings: tuple[ProductOffering, ...], reference: str) -> ProductOffering | None:
    """The offering named by id, code or name, ignoring case and punctuation; only one may fit."""
    exact = next((item for item in offerings if item.id == reference), None)
    return exact or _named(offerings, reference, lambda item: (item.id, item.code, item.name))


def find_order_type(offering: ProductOffering, reference: str) -> OrderType | None:
    """One of the offering's order types, named by code or name."""
    return _named(offering.order_types, reference, lambda item: (item.code, item.name))


def find_offering_component(offering: ProductOffering, reference: str) -> OfferingComponent | None:
    """One of the offering's components, named by id, code or name."""
    exact = next((item for item in offering.components if item.id == reference), None)
    return exact or _named(
        offering.components, reference, lambda item: (item.id, item.code, item.name)
    )
