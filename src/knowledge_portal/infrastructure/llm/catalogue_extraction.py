"""Structured catalogue proposals from architecture documents, checked before use."""

from __future__ import annotations

import json
import logging
import re
import threading
import unicodedata
from collections import Counter, deque
from collections.abc import Callable, Sequence
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass, field, replace
from typing import Any, ClassVar, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from smb_kernel.llm.structured_output import (
    StructuredOutputClient,
    StructuredOutputError,
    truncated,
)

from knowledge_portal.application.errors import ModelTransportError
from knowledge_portal.application.ports.catalogue_extractor import (
    CatalogueAnswerUnusableError,
    CatalogueCitationError,
    CatalogueExtractionError,
    CatalogueExtractionUnsupportedError,
    CatalogueProposal,
    ExtractionRequest,
    ExtractionSegment,
    KnownSystem,
    ProposedChange,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateBasis,
    CandidateContent,
    CandidateKind,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.concepts import label_key
from knowledge_portal.domain.architecture.governance import (
    ConflictScope,
    ConflictSide,
    KnowledgeSource,
    SourceConflict,
    SourceLevel,
)
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    FlowRule,
    FlowRuleKind,
    Journey,
)
from knowledge_portal.domain.architecture.knowledge import (
    CapabilityDomain,
    InvalidKnowledgeError,
    RelationshipKind,
)
from knowledge_portal.domain.architecture.lifecycle import (
    MAX_LIST_ITEMS,
    MAX_TABLE_COLUMNS,
    MAX_TABLE_ROWS,
    LifecycleNote,
    NoteBlock,
    NoteBlockKind,
)
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
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
    merge_components,
)
from knowledge_portal.domain.architecture.realisations import RealisationRecord, record_id
from knowledge_portal.domain.architecture.tracking import (
    FalloutCase,
    OrderTracking,
    TrackingChannel,
    TrackingEvent,
    TrackingFlow,
)
from knowledge_portal.infrastructure.json_reading import trimmed_text
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    DETAILED_SYSTEM_PROMPT,
    LEAN_SYSTEM_PROMPT,
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    build_user_prompt,
)

_LOG = logging.getLogger(__name__)
_MAX_NAME = 200
_MAX_TEXT = 1000
_MAX_REASONING = 300


_Confidence = Literal["confirmed", "inferred", "gap"] | None
# Schema keywords the model never needs: titles, class descriptions, defaults, and the size
# limits, which validation still enforces (and mends, ``_mended``). Left out, the schema costs
# a small model far less room.
_NOISE = ("title", "description", "maxLength", "maxItems", "default")


def _compact(schema: dict[str, Any]) -> None:
    """Strip schema keywords the model never needs, never a field's own name.

    A field called "description" or "title" is a property, not the keyword: it
    once went missing from the schema the model was shown while validation still
    required it, and an answer leaving it out was refused whole. Every property is
    required, so the model writes each key, null when it has no value.
    """

    def strip(node: object) -> None:
        if isinstance(node, dict):
            for key in _NOISE:
                node.pop(key, None)
            properties = node.get("properties")
            if isinstance(properties, dict):
                node["required"] = list(properties)
                for value in properties.values():
                    strip(value)
            for key, value in node.items():
                if key != "properties":
                    strip(value)
        elif isinstance(node, list):
            for value in node:
                strip(value)

    strip(schema)


class _Output(BaseModel):
    """An answer shape sent to the model; its schema is compact."""

    model_config = ConfigDict(json_schema_extra=_compact)


class ResponsibilityOutput(_Output):
    system: str = Field(max_length=_MAX_NAME)
    role: str = Field(max_length=_MAX_NAME)
    description: str = Field(max_length=_MAX_TEXT)
    order_types: list[str] = Field(max_length=20)
    confidence: _Confidence


class ComponentOutput(_Output):
    name: str = Field(max_length=_MAX_NAME)
    code: str | None = Field(max_length=_MAX_NAME)
    type: str | None = Field(max_length=_MAX_NAME)
    mandatory: bool | None
    customer_visible: bool | None
    description: str | None = Field(max_length=_MAX_TEXT)
    responsibilities: list[ResponsibilityOutput] = Field(max_length=40)
    confidence: _Confidence


class OrderTypeOutput(_Output):
    name: str = Field(max_length=_MAX_NAME)
    code: str | None = Field(max_length=_MAX_NAME)
    enabled: bool | None
    description: str | None = Field(max_length=_MAX_TEXT)
    confidence: _Confidence
    # The channels it can be ordered through, as named; empty when the document does not say.
    channels: list[str] = Field(max_length=20)


class PointOutput(_Output):
    name: str = Field(max_length=_MAX_NAME)
    description: str | None = Field(max_length=_MAX_TEXT)


class CharacteristicOutput(_Output):
    name: str = Field(max_length=_MAX_NAME)
    value: str = Field(max_length=_MAX_NAME)


class PlanOutput(_Output):
    """A plan, tier or child PO of the offering: its name and each stated fact of it."""

    name: str = Field(max_length=_MAX_NAME)
    characteristics: list[CharacteristicOutput] = Field(max_length=20)
    description: str | None = Field(max_length=_MAX_TEXT)


class OfferingOutput(_Output):
    """A product offering as the model read it; tidied into a valid one before use."""

    code: str | None = Field(max_length=_MAX_NAME)
    family: str | None = Field(max_length=_MAX_NAME)
    version: str | None = Field(max_length=_MAX_NAME)
    lifecycle: str | None = Field(max_length=_MAX_NAME)
    proposition: str | None = Field(max_length=_MAX_TEXT)
    rules: list[str] = Field(max_length=20)
    order_types: list[OrderTypeOutput] = Field(max_length=20)
    components: list[ComponentOutput] = Field(max_length=40)
    values: list[PointOutput] = Field(max_length=20)
    audiences: list[PointOutput] = Field(max_length=20)
    confidence: _Confidence


class PlannedOfferingOutput(OfferingOutput):
    """An offering with its plans, in every reading but the lean one, which has no room."""

    # Its plans, tiers or child POs (PO1 100 Mbps, PO2 200 Mbps), never offerings of their
    # own; empty when the document names none. The schema still asks for the key.
    plans: list[PlanOutput] = Field(default_factory=list, max_length=40)


# An offering's details (ADR-0101, step 4): asked for only in the full reading.


class RealisationOutput(_Output):
    layer: Literal["cfs", "rfs", "resource"]
    name: str = Field(max_length=_MAX_NAME)
    confidence: _Confidence


class DetailedComponentOutput(ComponentOutput):
    realisation: list[RealisationOutput] = Field(max_length=20)


class NfrOutput(_Output):
    quality: str = Field(max_length=_MAX_NAME)
    coverage: Literal["defined", "partial", "missing"]
    statement: str | None = Field(max_length=_MAX_TEXT)
    confidence: _Confidence


class TrackingFlowOutput(_Output):
    from_system: str = Field(max_length=_MAX_NAME)
    to_system: str = Field(max_length=_MAX_NAME)
    what: str = Field(max_length=_MAX_NAME)
    interface: str | None = Field(max_length=_MAX_NAME)


class TrackingChannelOutput(_Output):
    channel: str = Field(max_length=_MAX_NAME)
    correlation_key: str | None = Field(max_length=_MAX_NAME)
    # The system the customer follows the order in, and where it reads progress from.
    tracked_in: str | None = Field(max_length=_MAX_NAME)
    read_from: str | None = Field(max_length=_MAX_NAME)
    read_over: str | None = Field(max_length=_MAX_NAME)


class TrackingEventOutput(_Output):
    label: str = Field(max_length=_MAX_NAME)
    detail: str | None = Field(max_length=_MAX_TEXT)
    # The system that raises a milestone; null for an internal status.
    system: str | None = Field(max_length=_MAX_NAME)


class FalloutOutput(_Output):
    trigger: str = Field(max_length=_MAX_NAME)
    handling: str | None = Field(max_length=_MAX_TEXT)


class TrackingOutput(_Output):
    order_types: list[str] = Field(max_length=20)
    scope_note: str | None = Field(max_length=_MAX_TEXT)
    not_applicable_note: str | None = Field(max_length=_MAX_TEXT)
    flows: list[TrackingFlowOutput] = Field(max_length=40)
    channels: list[TrackingChannelOutput] = Field(max_length=20)
    milestones: list[TrackingEventOutput] = Field(max_length=40)
    statuses: list[TrackingEventOutput] = Field(max_length=40)
    fallout: list[FalloutOutput] = Field(max_length=40)
    confidence: _Confidence


class NoteBlockOutput(_Output):
    kind: Literal["text", "list", "table"]
    title: str | None = Field(max_length=_MAX_NAME)
    text: str | None = Field(max_length=_MAX_TEXT)
    items: list[str] = Field(max_length=MAX_LIST_ITEMS)
    columns: list[str] = Field(max_length=MAX_TABLE_COLUMNS)
    rows: list[list[str]] = Field(max_length=MAX_TABLE_ROWS)
    to_verify: bool


class LifecycleNoteOutput(_Output):
    title: str = Field(max_length=_MAX_NAME)
    kind: str | None = Field(max_length=_MAX_NAME)
    summary: str | None = Field(max_length=_MAX_TEXT)
    order_types: list[str] = Field(max_length=20)
    channels: list[str] = Field(max_length=20)
    blocks: list[NoteBlockOutput] = Field(max_length=20)
    confidence: _Confidence


class DetailedOfferingOutput(PlannedOfferingOutput):
    """An offering with what it is made of and what happens to it, in the full reading."""

    components: list[DetailedComponentOutput] = Field(max_length=40)  # type: ignore[assignment]
    nfrs: list[NfrOutput] = Field(max_length=30)
    tracking: TrackingOutput | None
    lifecycle_notes: list[LifecycleNoteOutput] = Field(max_length=30)

    @classmethod
    def without_details(cls, offering: OfferingOutput) -> DetailedOfferingOutput:
        """An offering read without its details, as a lean reading reads it."""
        read = offering.model_dump()
        return cls.model_validate(
            {
                **read,
                "components": [{**part, "realisation": []} for part in read["components"]],
                "nfrs": [],
                "tracking": None,
                "lifecycle_notes": [],
            }
        )


class StepOutput(_Output):
    number: str = Field(max_length=_MAX_NAME)
    name: str = Field(max_length=_MAX_NAME)
    track: str | None = Field(max_length=_MAX_NAME)
    system: str | None = Field(max_length=_MAX_NAME)
    supporting: list[str] = Field(max_length=20)
    function: str | None = Field(max_length=_MAX_TEXT)
    # The channels the step happens in, as named; empty for every channel.
    channels: list[str] = Field(max_length=20)
    # Performed by the system of whichever channel the order came through.
    channel_entry: bool | None


class RuleOutput(_Output):
    kind: Literal["decision", "loop", "parallel"]
    from_step: str = Field(max_length=_MAX_NAME)
    to_step: str = Field(max_length=_MAX_NAME)
    condition: str | None = Field(max_length=_MAX_NAME)
    rejoin: str | None = Field(max_length=_MAX_NAME)


class JourneyOutput(_Output):
    """A journey as the model read it: kept lean, since it is the largest answer shape."""

    product: str | None = Field(max_length=_MAX_NAME)
    order_type: str | None = Field(max_length=_MAX_NAME)
    steps: list[StepOutput] = Field(max_length=100)
    rules: list[RuleOutput] = Field(max_length=100)


class ConflictSideOutput(_Output):
    """One of two contradicting statements: the source that says it, as the document names
    it, what it says, and where."""

    source: str = Field(max_length=_MAX_NAME)
    statement: str = Field(max_length=_MAX_TEXT)
    reference: str | None = Field(max_length=_MAX_NAME)


_LeanKind = Literal[
    "system",
    "component",
    "capability",
    "constraint",
    "offering_rule",
    "relationship",
    "landscape_domain",
    "placement",
    "product_offering",
]


class LeanChangeOutput(_Output):
    """One suggestion, for a model whose context has no room for journeys (ADR-0096)."""

    kind: _LeanKind
    system: str = Field(max_length=_MAX_NAME)
    name: str | None = Field(max_length=_MAX_NAME)
    name_ar: str | None = Field(max_length=_MAX_NAME)
    aliases: list[str] = Field(max_length=20)
    triggers: list[str] = Field(max_length=20)
    target_system: str | None = Field(max_length=_MAX_NAME)
    # The component a capability belongs to, as named; null for other kinds.
    component: str | None = Field(max_length=_MAX_NAME)
    technology: str | None = Field(max_length=_MAX_NAME)
    # Where systems sit (ADR-0094): a placement's domain, and a landscape domain's parent,
    # as named; null for other kinds.
    domain: str | None = Field(max_length=_MAX_NAME)
    parent_domain: str | None = Field(max_length=_MAX_NAME)
    # The whole offering, for a product_offering; null for other kinds (ADR-0095).
    offering: OfferingOutput | None

    text: str | None = Field(max_length=_MAX_TEXT)
    evidence_numbers: list[int] = Field(min_length=1, max_length=10)
    quote: str = Field(max_length=_MAX_TEXT)
    basis: Literal["stated", "implied"]
    reasoning: str | None = Field(max_length=_MAX_REASONING)
    relationship_kind: (
        Literal[
            "calls_api", "publishes_events_to", "transfers_data_to", "orchestrates", "unspecified"
        ]
        | None
    )


class ChangeOutput(LeanChangeOutput):
    # A small context reads without journeys and channels; tables still give both.
    kind: (
        _LeanKind
        | Literal[  # type: ignore[assignment]
            "journey",
            "channel",
            "interface",
            "capability_domain",
            "portfolio_node",
            "realisation_record",
            "source",
            "conflict",
        ]
    )
    # The whole journey, for a journey; null for other kinds (ADR-0096).
    offering: PlannedOfferingOutput | None
    journey: JourneyOutput | None
    # A channel's kind, such as Digital or Assisted; null for other kinds (ADR-0101).
    channel_kind: str | None = Field(max_length=_MAX_NAME)
    # How an interface is called; null for other kinds (ADR-0123).
    interface_style: Literal["api", "event", "file", "unspecified"] | None
    # A portfolio node's level in the operator's words, such as Segment; null for other kinds.
    portfolio_level: str | None = Field(max_length=_MAX_NAME)
    # A realisation record's layer and the records one layer down that realise it, by name;
    # null and empty for other kinds.
    realisation_layer: Literal["cfs", "rfs", "resource"] | None
    realised_by: list[str] = Field(max_length=20)
    # A source's level and version, when the document states them; null for other kinds.
    source_level: Literal["L1", "L2", "L3"] | None
    source_version: str | None = Field(max_length=_MAX_NAME)
    # A conflict's two sides and the offerings it affects, by name; empty for other kinds.
    conflict_sides: list[ConflictSideOutput] = Field(max_length=2)
    affected_offerings: list[str] = Field(max_length=20)


class ExtractionOutput(_Output):
    # Generous, so a long but valid answer is never refused: how much one call
    # is asked to cover is decided by batching, not by this cap.
    changes: list[ChangeOutput] = Field(max_length=200)


class LeanExtractionOutput(_Output):
    changes: list[LeanChangeOutput] = Field(max_length=200)


class DetailedChangeOutput(ChangeOutput):
    """One suggestion, its offering with its details (ADR-0101, step 4); every reading's
    answer is checked in this shape."""

    offering: DetailedOfferingOutput | None


class DetailedExtractionOutput(_Output):
    changes: list[DetailedChangeOutput] = Field(max_length=200)


class _Answers(BaseModel):
    """An answer's suggestions, each checked on its own (``_mended``) rather than together.

    The model is shown the full schema; one item that breaks it (a key left
    out, eleven evidence numbers) would otherwise lose every suggestion of the call.
    """

    shape: ClassVar[type[_Output]]
    changes: list[Any]

    @classmethod
    def model_json_schema(cls, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return cls.shape.model_json_schema(*args, **kwargs)


class _DetailedAnswers(_Answers):
    shape = DetailedExtractionOutput


class _StandardAnswers(_Answers):
    shape = ExtractionOutput


class _LeanAnswers(_Answers):
    shape = LeanExtractionOutput


# Transports name the schema after the class they are given.
_DetailedAnswers.__name__ = DetailedExtractionOutput.__name__
_StandardAnswers.__name__ = ExtractionOutput.__name__
_LeanAnswers.__name__ = LeanExtractionOutput.__name__
# How many times one item is mended before it is left out.
_MEND_ROUNDS = 6
_EMPTY_FOR_TYPE = {"list_type": [], "bool_type": False, "string_type": ""}


def _mended(shape: type[LeanChangeOutput], raw: object) -> LeanChangeOutput | None:
    """One answered item in its shape, mended where the model only overstepped a limit.

    A key left out reads as null; a value over its limit is cut to it (eleven
    evidence numbers become the first ten, a long quote its first 1,000
    characters); null where a list, a flag or a table cell belongs reads as empty;
    "inferred" reads as "implied". Anything else leaves the item out.
    """
    data = raw.model_dump() if isinstance(raw, BaseModel) else raw
    if not isinstance(data, dict):
        return None
    for _ in range(_MEND_ROUNDS):
        try:
            return shape.model_validate(data)
        except ValidationError as error:
            if not all(_mend(data, problem) for problem in error.errors()):
                return None
    return None


def _mend(data: dict[str, Any], problem: Any) -> bool:
    """Mend one validation problem in place; False when it cannot be mended."""
    *path, key = problem["loc"]
    parent: Any = data
    for step in path:
        try:
            parent = parent[step]
        except (KeyError, IndexError, TypeError):
            return False
    kind, value = problem["type"], problem.get("input")
    limit = (problem.get("ctx") or {}).get("max_length")
    if kind == "missing" and isinstance(parent, dict):
        parent[key] = None
    elif kind in _EMPTY_FOR_TYPE and value is None:
        parent[key] = _EMPTY_FOR_TYPE[kind]
    elif kind == "too_long" and isinstance(value, list) and limit is not None:
        parent[key] = value[:limit]
    elif kind == "string_too_long" and isinstance(value, str) and limit is not None:
        parent[key] = value[:limit]
    elif kind == "literal_error" and key == "basis" and str(value).casefold() == "inferred":
        parent[key] = "implied"
    else:
        return False
    return True


_Reading = Literal["detailed", "standard", "lean"]


def _kind_of(raw: object) -> str:
    """The kind an item it could not use says it is, for counting what was left out."""
    data = raw.model_dump() if isinstance(raw, BaseModel) else raw
    kind = data.get("kind") if isinstance(data, dict) else None
    return kind if isinstance(kind, str) and kind in _KINDS else "item"


_KINDS = frozenset(
    (
        *get_args(_LeanKind),
        "journey",
        "channel",
        "interface",
        "capability_domain",
        "portfolio_node",
        "realisation_record",
        "source",
        "conflict",
    )
)
# What each reading asks with: its prompt, the answer it parses, and each item's shape.
_ASKED: dict[_Reading, tuple[str, type[_Answers], type[LeanChangeOutput]]] = {
    "detailed": (DETAILED_SYSTEM_PROMPT, _DetailedAnswers, DetailedChangeOutput),
    "standard": (SYSTEM_PROMPT, _StandardAnswers, ChangeOutput),
    "lean": (LEAN_SYSTEM_PROMPT, _LeanAnswers, LeanChangeOutput),
}


def _detailed(item: LeanChangeOutput) -> DetailedChangeOutput:
    """A reading's suggestion in the detailed shape: what it was not asked for, empty."""
    if isinstance(item, DetailedChangeOutput):
        return item
    offering = item.offering
    return DetailedChangeOutput.model_validate(
        {
            "journey": None,
            "channel_kind": None,
            "interface_style": None,
            "portfolio_level": None,
            "realisation_layer": None,
            "realised_by": [],
            "source_level": None,
            "source_version": None,
            "conflict_sides": [],
            "affected_offerings": [],
            **item.model_dump(),
            "offering": (
                offering
                if offering is None or isinstance(offering, DetailedOfferingOutput)
                else DetailedOfferingOutput.without_details(offering)
            ),
        }
    )


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")[:80] or "item"


# Typography a model rewrites when it quotes: curly quotes, dashes, ellipses,
# non-breaking and zero-width spaces read as their plain forms.
_TYPOGRAPHY = str.maketrans(
    {
        **dict.fromkeys("‘’‚‛", "'"),
        **dict.fromkeys("“”„", '"'),
        **dict.fromkeys("‐‑‒–—−", "-"),
        "…": "...",
        **dict.fromkeys("  ", " "),
        **dict.fromkeys("​‌‍﻿", ""),
    }
)


def _normalise(value: str) -> str:
    return " ".join(value.translate(_TYPOGRAPHY).casefold().split())


def _clean(values: list[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(item.strip() for item in values if item.strip()))


# Joiners, variation selectors and the keycap mark that build emoji from parts.
_EMOJI_PARTS = frozenset({"‍", "⃣", "︎", "️"})


def plain_name(value: str) -> str:
    """A system name without the pictographs a landscape decorates it with.

    "📈 BCRM" and "🛠️ WFM / Remedy" are the systems BCRM and WFM / Remedy; the
    symbol is styling, and kept it would make the name differ from every other
    mention of the system. Letters, digits and punctuation are untouched.
    """
    kept = "".join(
        character
        for character in value
        if character not in _EMOJI_PARTS
        and unicodedata.category(character) != "So"
        # Emoji skin-tone modifiers; other modifier symbols (such as "^") stay.
        and not (unicodedata.category(character) == "Sk" and ord(character) >= 0x1F000)
    )
    return " ".join(kept.split())


def _plain(item: DetailedChangeOutput) -> DetailedChangeOutput:
    """The model's item with every system name written plainly; quotes stay verbatim."""
    return item.model_copy(
        update={
            "system": plain_name(item.system),
            "name": plain_name(item.name) if item.name is not None else None,
            "aliases": [plain_name(alias) for alias in item.aliases],
            "target_system": (
                plain_name(item.target_system) if item.target_system is not None else None
            ),
        }
    )


class _SystemNames:
    """Resolves how the model named a system to a catalogue id."""

    def __init__(
        self, known: tuple[KnownSystem, ...], proposed: list[DetailedChangeOutput]
    ) -> None:
        self._ids: dict[str, str] = {}
        for system in known:
            for label in (system.id, system.name, *system.aliases):
                self._ids.setdefault(label.casefold().strip(), system.id)
        for item in proposed:
            if item.kind == "system" and (item.name or item.system).strip():
                name = (item.name or item.system).strip()
                for label in (item.system, name, *item.aliases):
                    self._ids.setdefault(label.casefold().strip(), slug(name))

    def resolve(self, reference: str) -> str:
        key = reference.casefold().strip()
        return self._ids.get(key, slug(reference))


def _proposed(
    item: DetailedChangeOutput, names: _SystemNames, locations: tuple[str, ...], quote: str
) -> ProposedChange:
    """A checked proposal, or InvalidKnowledgeError when the model's item cannot be used.

    Only a dependency can be implied, and an implied one must say why.
    """
    implied = item.basis == "implied"
    reasoning = (item.reasoning or "").strip()
    if implied and (item.kind != "relationship" or not reasoning):
        raise InvalidKnowledgeError("An implied item must be a dependency with its reasoning.")
    content = _content(item, names)
    source = (
        (item.name or item.system)
        if content.kind
        in {
            CandidateKind.SYSTEM,
            CandidateKind.LANDSCAPE_DOMAIN,
            CandidateKind.PRODUCT,
            CandidateKind.JOURNEY,
            CandidateKind.CHANNEL,
            CandidateKind.INTERFACE,
            CandidateKind.CAPABILITY_DOMAIN,
            CandidateKind.PORTFOLIO_NODE,
            CandidateKind.REALISATION_RECORD,
            CandidateKind.SOURCE,
            CandidateKind.CONFLICT,
        }
        else item.system
    )
    return ProposedChange(
        content,
        locations,
        quote,
        source_name=source.strip(),
        target_name=(item.target_system or "").strip(),
        basis=CandidateBasis.INFERRED if implied else CandidateBasis.STATED,
        rationale=reasoning if implied else None,
    )


def domain_key(name: str, parent: str | None = None) -> str:
    """A landscape domain's key from its name: a sub-domain's says where it sits,
    "customer-assisted", as the table reader and the editor write it."""
    return slug(f"{parent} {name}" if parent else name)


def _trust(value: str | None) -> SourceConfidence | None:
    return SourceConfidence(value) if value else None


def _realisation(items: list[RealisationOutput]) -> tuple[Realisation, ...]:
    found: dict[tuple[str, str], Realisation] = {}
    for item in items:
        try:
            layer = Realisation(item.layer, item.name, _trust(item.confidence))  # type: ignore[arg-type]
        except InvalidKnowledgeError:
            continue
        found.setdefault((layer.layer, layer.name.casefold()), layer)
    return tuple(found.values())


def _nfrs(items: list[NfrOutput]) -> tuple[OfferingNfr, ...]:
    found: dict[str, OfferingNfr] = {}
    for item in items:
        try:
            nfr = OfferingNfr(
                item.quality,
                item.coverage,  # type: ignore[arg-type]
                trimmed_text(item.statement),
                _trust(item.confidence),
            )
        except InvalidKnowledgeError:
            continue
        found.setdefault(nfr.quality.casefold(), nfr)
    return tuple(found.values())


def _codes(written: list[str], keys: dict[str, str]) -> tuple[str, ...] | None:
    """The order types written, as the offering's codes; None when some were written and
    none is the offering's, since naming none would mean every one."""
    codes = tuple(
        dict.fromkeys(
            keys[key] for key in (name.strip().casefold() for name in written) if key in keys
        )
    )
    return None if any(name.strip() for name in written) and not codes else codes


def _built[T](build: Callable[..., T], *args: Any, **values: Any) -> T | None:
    """One part of a detail, or None when the model's version of it is not valid."""
    try:
        return build(*args, **values)
    except InvalidKnowledgeError:
        return None


def _tracking(
    read: TrackingOutput | None, names: _SystemNames, keys: dict[str, str]
) -> OrderTracking | None:
    """The model's tracking made valid: its systems resolved, each channel and event once."""
    if read is None:
        return None
    codes = _codes(read.order_types, keys)
    if codes is None:
        return None

    def system(reference: str | None) -> str | None:
        name = plain_name(reference or "")
        return names.resolve(name) if name else None

    flows = [
        _built(
            TrackingFlow,
            system(flow.from_system) or "",
            system(flow.to_system) or "",
            flow.what,
            trimmed_text(flow.interface),
        )
        for flow in read.flows
    ]
    channels: dict[str, TrackingChannel] = {}
    for item in read.channels:
        key = plain_name(item.channel)
        channel = _built(
            TrackingChannel,
            key,
            correlation_key=trimmed_text(item.correlation_key),
            ui_system_id=system(item.tracked_in),
            read_system_id=system(item.read_from),
            read_interface=trimmed_text(item.read_over),
        )
        if channel is not None:
            channels.setdefault(key.casefold(), channel)

    def events(items: list[TrackingEventOutput], *, systems: bool) -> tuple[TrackingEvent, ...]:
        found: dict[str, TrackingEvent] = {}
        for item in items:
            event = _built(
                TrackingEvent,
                item.label,
                trimmed_text(item.detail),
                system(item.system) if systems else None,
            )
            if event is not None:
                found.setdefault(event.label.casefold(), event)
        return tuple(found.values())

    fallout = [
        _built(FalloutCase, case.trigger, trimmed_text(case.handling)) for case in read.fallout
    ]
    tracking = _built(
        OrderTracking,
        order_types=codes,
        scope_note=trimmed_text(read.scope_note),
        not_applicable_note=trimmed_text(read.not_applicable_note),
        flows=tuple(item for item in flows if item is not None),
        channels=tuple(channels.values()),
        milestones=events(read.milestones, systems=True),
        statuses=events(read.statuses, systems=False),
        fallout=tuple(item for item in fallout if item is not None),
        confidence=_trust(read.confidence),
    )
    # Tracking that says nothing but its confidence is no tracking.
    if tracking is None or replace(tracking, confidence=None) == OrderTracking(order_types=codes):
        return None
    return tracking


def _block(item: NoteBlockOutput) -> NoteBlock | None:
    kind = NoteBlockKind(item.kind)
    table = kind is NoteBlockKind.TABLE
    return _built(
        NoteBlock,
        kind,
        title=trimmed_text(item.title),
        text=trimmed_text(item.text) if kind is NoteBlockKind.TEXT else None,
        items=_clean(item.items) if kind is NoteBlockKind.LIST else (),
        columns=tuple(column.strip() for column in item.columns) if table else (),
        rows=tuple(tuple(row) for row in item.rows) if table else (),
        to_verify=item.to_verify,
    )


def _lifecycle_notes(
    items: list[LifecycleNoteOutput], keys: dict[str, str]
) -> tuple[LifecycleNote, ...]:
    """The model's notes made valid: each title once, keyed by it, naming only the offering's
    order types; a part it cannot use is left out, and a note with nothing left too."""
    notes: dict[str, LifecycleNote] = {}
    for item in items:
        codes = _codes(item.order_types, keys)
        if codes is None:
            continue
        note = _built(
            LifecycleNote,
            slug(item.title),
            item.title,
            kind=trimmed_text(item.kind),
            summary=trimmed_text(item.summary),
            order_types=codes,
            channels=_names(item.channels),
            blocks=tuple(block for block in map(_block, item.blocks) if block is not None),
            confidence=_trust(item.confidence),
        )
        if note is not None:
            notes.setdefault(note.id, note)
    return tuple(notes.values())


def _offering(item: DetailedChangeOutput, names: _SystemNames) -> ProductOffering:
    """The model's offering made valid: order types keyed once, components by id, each
    system named once per role, and only order types the offering has."""
    read = item.offering
    name = (item.name or item.system).strip()
    if read is None:
        return ProductOffering(slug(name), name)
    orders: list[OrderType] = []
    keys: dict[str, str] = {}
    for order in read.order_types:
        title = order.name.strip()
        code = (order.code or "").strip() or "_".join(title.upper().split())
        if not title or code.casefold() in keys:
            continue
        keys[title.casefold()] = keys[code.casefold()] = code
        orders.append(
            OrderType(
                code,
                title,
                order.enabled is not False,
                trimmed_text(order.description),
                _trust(order.confidence),
                channels=_names(order.channels),
            )
        )
    parts: dict[str, OfferingComponent] = {}
    for part in read.components:
        title = part.name.strip()
        if not title:
            continue
        duties: dict[tuple[str, str], ComponentResponsibility] = {}
        for duty in part.responsibilities:
            system, role, text = (
                plain_name(duty.system),
                duty.role.strip(),
                duty.description.strip(),
            )
            if not (system and role and text):
                continue
            found = ComponentResponsibility(
                names.resolve(system),
                role,
                text,
                tuple(
                    keys[key]
                    for key in (code.casefold() for code in duty.order_types)
                    if key in keys
                ),
                _trust(duty.confidence),
            )
            duties.setdefault((found.system_id, found.role), found)
        component = OfferingComponent(
            slug(part.code or title),
            title,
            code=trimmed_text(part.code),
            kind=trimmed_text(part.type),
            mandatory=part.mandatory,
            customer_visible=part.customer_visible,
            description=trimmed_text(part.description),
            responsibilities=tuple(duties.values()),
            confidence=_trust(part.confidence),
            realisation=_realisation(part.realisation),
        )
        previous = parts.get(component.id)
        parts[component.id] = merge_components(previous, component) if previous else component

    def points(items: list[PointOutput]) -> tuple[OfferingPoint, ...]:
        found = {item.name.strip().casefold(): item for item in items if item.name.strip()}
        return tuple(
            OfferingPoint(item.name.strip(), trimmed_text(item.description))
            for item in found.values()
        )

    plans: dict[str, OfferingPlan] = {}
    for plan in read.plans:
        facts: dict[str, PlanCharacteristic] = {}
        for fact in plan.characteristics:
            stated = _built(PlanCharacteristic, fact.name.strip(), fact.value.strip())
            if stated is not None:
                facts.setdefault(stated.name.casefold(), stated)
        made = _built(
            OfferingPlan, plan.name.strip(), tuple(facts.values()), trimmed_text(plan.description)
        )
        if made is not None:
            plans.setdefault(made.name.casefold(), made)
    offering_code = trimmed_text(read.code)
    return ProductOffering(
        id=slug(offering_code or name),
        name=name,
        code=offering_code,
        family=trimmed_text(read.family),
        version=trimmed_text(read.version),
        lifecycle=trimmed_text(read.lifecycle),
        proposition=trimmed_text(read.proposition),
        rules=tuple(dict.fromkeys(rule.strip() for rule in read.rules if rule.strip())),
        order_types=tuple(orders),
        components=tuple(parts.values()),
        values=points(read.values),
        audiences=points(read.audiences),
        confidence=_trust(read.confidence),
        nfrs=_nfrs(read.nfrs),
        tracking=_tracking(read.tracking, names, keys),
        lifecycle_notes=_lifecycle_notes(read.lifecycle_notes, keys),
        plans=tuple(plans.values()),
    )


def _journey(item: DetailedChangeOutput, names: _SystemNames) -> Journey:
    """The model's journey made valid: each activity number once, and only rules between
    activities it has; the offering, order type and systems are resolved when accepted."""
    read = item.journey
    name = (item.name or item.system).strip()
    product = trimmed_text(read.product) if read else None
    steps: dict[str, Activity] = {}
    rules: list[FlowRule] = []
    for step in read.steps if read else []:
        number, title = step.number.strip(), step.name.strip()
        if not number or not title or number in steps:
            continue
        performer = plain_name(step.system or "")
        # A named performer wins: the channel's entry system stands in only for no one.
        entry = step.channel_entry is True and not performer
        steps[number] = Activity(
            number,
            title,
            track=trimmed_text(step.track),
            performing_system_id=names.resolve(performer) if performer else None,
            supporting_system_ids=tuple(
                dict.fromkeys(
                    names.resolve(plain_name(other))
                    for other in step.supporting
                    if plain_name(other)
                )
            ),
            system_function=trimmed_text(step.function),
            channels=_names(step.channels),
            channel_entry=entry,
        )
    for rule in read.rules if read else []:
        start, end = rule.from_step.strip(), rule.to_step.strip()
        rejoin = trimmed_text(rule.rejoin) if rule.kind == "parallel" else None
        if start in steps and end in steps and (rejoin is None or rejoin in steps):
            rules.append(
                FlowRule(
                    FlowRuleKind(rule.kind),
                    start,
                    end,
                    trimmed_text(rule.condition),
                    None,
                    None,
                    rejoin,
                )
            )
    return Journey(
        id=slug(f"{product} {name}" if product else name),
        name=name,
        product_id=product,
        order_type_code=trimmed_text(read.order_type) if read and product else None,
        activities=tuple(steps.values()),
        flow_rules=tuple(rules),
    )


def _names(values: list[str]) -> tuple[str, ...]:
    """Channel names as written, each once; they are matched to channels when reviewed."""
    return tuple(dict.fromkeys(value.strip() for value in values if value.strip()))


def _channel(item: DetailedChangeOutput, names: _SystemNames) -> Channel:
    """A channel as stated, its entry system resolved like any system reference."""
    name = (item.name or item.system).strip()
    entry = plain_name(item.target_system or "")
    return Channel(
        slug(name),
        name,
        kind=trimmed_text(item.channel_kind),
        entry_system_id=names.resolve(entry) if entry else None,
        description=trimmed_text(item.text),
        confidence=SourceConfidence.CONFIRMED,
    )


def _interface(item: DetailedChangeOutput, names: _SystemNames) -> SystemInterface:
    """An interface as stated: the system that exposes it and, when named, one consumer, both
    resolved like any system reference; readings of one interface are merged later."""
    name = (item.name or "").strip()
    exposer = plain_name(item.system or "")
    if not name or not exposer:
        raise InvalidKnowledgeError("An interface needs its name and the system that exposes it.")
    exposer_id = names.resolve(exposer)
    consumer = plain_name(item.target_system or "")
    consumer_id = names.resolve(consumer) if consumer else None
    return SystemInterface(
        f"if-{slug(exposer_id)}-{slug(name)}",
        name,
        exposer_id,
        style=InterfaceStyle(item.interface_style or "unspecified"),
        consumer_ids=(consumer_id,) if consumer_id and consumer_id != exposer_id else (),
        description=trimmed_text(item.text),
        confidence=SourceConfidence.CONFIRMED,
    )


def _capability_domain(item: DetailedChangeOutput) -> CapabilityDomain:
    """A business area as stated, keyed like a landscape domain; its parent as named."""
    name = (item.name or "").strip()
    if not name:
        raise InvalidKnowledgeError("A capability domain needs its name.")
    parent = (item.parent_domain or "").strip() or None
    return CapabilityDomain(
        domain_key(name, parent), name, parent_id=parent, description=trimmed_text(item.text)
    )


def _portfolio_node(item: DetailedChangeOutput) -> PortfolioNode:
    """A place in the product portfolio as stated, with its level; its parent as named."""
    name = (item.name or "").strip()
    level = (item.portfolio_level or "").strip()
    if not name or not level:
        raise InvalidKnowledgeError("A portfolio node needs its name and its level.")
    parent = (item.parent_domain or "").strip() or None
    return PortfolioNode(
        domain_key(name, parent),
        name,
        level,
        parent_id=parent,
        description=trimmed_text(item.text),
        confidence=SourceConfidence.CONFIRMED,
    )


def _knowledge_source(item: DetailedChangeOutput) -> KnowledgeSource:
    """A source as stated: its title, the name it is cited by, its version and what it is the
    authority for when given, and its level, L3 (a baseline) unless the document states one."""
    title = (item.name or "").strip()
    if not title:
        raise InvalidKnowledgeError("A source needs its title.")
    short = next(iter(_clean(item.aliases)), None)
    return KnowledgeSource(
        f"src-{slug(short or title)}",
        title,
        SourceLevel(item.source_level or "L3"),
        short=short,
        version=trimmed_text(item.source_version),
        authority=trimmed_text(item.text),
    )


def _source_conflict(item: DetailedChangeOutput) -> SourceConflict:
    """Two sources contradicting each other as stated: both sides, the offerings it affects by
    name, and what differs."""
    title = (item.name or "").strip()
    if not title or len(item.conflict_sides) != 2:
        raise InvalidKnowledgeError("A conflict needs its title and its two sides.")
    a, b = (
        ConflictSide(side.source.strip(), side.statement.strip(), trimmed_text(side.reference))
        for side in item.conflict_sides
    )
    return SourceConflict(
        f"conflict-{slug(title)}",
        title,
        a,
        b,
        scope=tuple(ConflictScope(name) for name in dict.fromkeys(_clean(item.affected_offerings))),
        difference=trimmed_text(item.text),
        confidence=SourceConfidence.CONFIRMED,
    )


def _realisation_record(item: DetailedChangeOutput, names: _SystemNames) -> RealisationRecord:
    """A CFS, RFS or resource as stated, with the system that delivers or holds it, when named,
    and what realises it one layer down, by name until the draft resolves them."""
    name = (item.name or "").strip()
    if not name or item.realisation_layer is None:
        raise InvalidKnowledgeError("A realisation record needs its name and its layer.")
    system = plain_name(item.system or "")
    layer = RealisationLayer(item.realisation_layer)
    below = tuple(
        dict.fromkeys(
            entry for entry in _clean(item.realised_by) if label_key(entry) != label_key(name)
        )
    )
    return RealisationRecord(
        record_id(layer, slug(name)),
        layer,
        name,
        system_ids=(names.resolve(system),) if system else (),
        realised_by=() if layer is RealisationLayer.RESOURCE else below,
        description=trimmed_text(item.text),
        confidence=SourceConfidence.CONFIRMED,
    )


def _content(item: DetailedChangeOutput, names: _SystemNames) -> CandidateContent:
    if item.kind == "journey":
        journey = _journey(item, names)
        return CandidateContent(
            CandidateKind.JOURNEY, journey.id, name=journey.name, journey=journey
        )
    if item.kind == "product_offering":
        offering = _offering(item, names)
        return CandidateContent(
            CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
        )
    if item.kind == "channel":
        channel = _channel(item, names)
        return CandidateContent(
            CandidateKind.CHANNEL, channel.id, name=channel.name, channel=channel
        )
    if item.kind == "interface":
        interface = _interface(item, names)
        return CandidateContent(
            CandidateKind.INTERFACE, interface.id, name=interface.name, interface=interface
        )
    if item.kind == "capability_domain":
        domain = _capability_domain(item)
        return CandidateContent(
            CandidateKind.CAPABILITY_DOMAIN, domain.id, name=domain.name, capability_domain=domain
        )
    if item.kind == "source":
        source = _knowledge_source(item)
        return CandidateContent(
            CandidateKind.SOURCE, source.id, name=source.title, knowledge_source=source
        )
    if item.kind == "conflict":
        conflict = _source_conflict(item)
        return CandidateContent(
            CandidateKind.CONFLICT, conflict.id, name=conflict.title, conflict=conflict
        )
    if item.kind == "realisation_record":
        record = _realisation_record(item, names)
        return CandidateContent(
            CandidateKind.REALISATION_RECORD, record.id, name=record.name, realisation=record
        )
    if item.kind == "portfolio_node":
        node = _portfolio_node(item)
        return CandidateContent(
            CandidateKind.PORTFOLIO_NODE, node.id, name=node.name, portfolio_node=node
        )
    kind = CandidateKind(item.kind)
    name = (item.name or "").strip()
    if kind is CandidateKind.LANDSCAPE_DOMAIN:
        parent = (item.parent_domain or "").strip() or None
        key = domain_key(name, parent)
        return CandidateContent(
            kind,
            key,
            name=name,
            name_ar=(item.name_ar or "").strip() or None,
            landscape_domain_id=key,
            parent_domain_id=slug(parent) if parent else None,
            description=(item.text or "").strip() or None,
        )
    subject = item.system.strip()
    if not (subject or (kind is CandidateKind.SYSTEM and name)):
        # Resolved, a blank name would become a system called "item" that nothing adds.
        raise InvalidKnowledgeError(f"A {kind.value} needs the system it is about.")
    if kind is CandidateKind.SYSTEM:
        name = name or subject
        return CandidateContent(
            kind,
            names.resolve(item.system or name),
            name=name,
            name_ar=(item.name_ar or "").strip() or None,
            aliases=tuple(
                alias for alias in _clean(item.aliases) if alias.casefold() != name.casefold()
            ),
            description=(item.text or "").strip() or None,
        )
    if kind is CandidateKind.PLACEMENT:
        place = (item.domain or "").strip()
        parent = (item.parent_domain or "").strip() or None
        return CandidateContent(
            kind,
            names.resolve(item.system),
            # A sub-domain is keyed under its parent; a bare name still finds a domain
            # that alone has it.
            landscape_domain_id=domain_key(place, parent) if place else "",
        )
    system_id = names.resolve(item.system)
    if kind is CandidateKind.COMPONENT:
        return CandidateContent(
            kind,
            system_id,
            name=name,
            name_ar=(item.name_ar or "").strip() or None,
            aliases=tuple(
                alias for alias in _clean(item.aliases) if alias.casefold() != name.casefold()
            ),
            component_id=slug(name),
            description=(item.text or "").strip() or None,
            technology=(item.technology or "").strip() or None,
        )
    if kind is CandidateKind.CAPABILITY:
        component = (item.component or "").strip()
        return CandidateContent(
            kind,
            system_id,
            name=name,
            capability_id=slug(name),
            triggers=_clean(item.triggers),
            component_id=slug(component) if component else None,
        )
    if kind is CandidateKind.CONSTRAINT:
        return CandidateContent(kind, system_id, text=(item.text or "").strip())
    if kind is CandidateKind.OFFERING_RULE:
        # Its subject is an offering, by name until the draft resolves it.
        return CandidateContent(kind, slug(item.system), text=(item.text or "").strip())
    target = (item.target_system or "").strip()
    if not target:
        # Resolved, a blank name would become a system called "item".
        raise InvalidKnowledgeError("A dependency needs the system it depends on.")
    if _GROUP.match(item.system.strip()) or _GROUP.match(target):
        # "Channels submit the request to RTF" names no system: offered, it waited for a
        # system called "Channels" that nothing could add.
        raise InvalidKnowledgeError("A dependency is between named systems, not a group of them.")
    relationship = RelationshipKind(item.relationship_kind or "unspecified")
    return CandidateContent(
        kind,
        system_id,
        target_system_id=names.resolve(target),
        # A stated dependency the model gave no words for is still one: said by its kind,
        # as the table reader says "Integrates with" (the reported reading lost 104).
        text=(item.text or "").strip() or f"{_LINKED[relationship]} {target}",
        relationship_kind=relationship,
    )


# A group of systems or channels a document names as a whole: "Channels", "Digital Channels",
# "the fulfilment systems". Never one end of a dependency.
_GROUP = re.compile(
    r"(?i)^(?:all |the |other |digital |sales |ordering |order |fulfil?ment |downstream "
    r"|upstream |front[- ]end |back[- ]end |b2b |internal |external )*"
    r"(?:channels?|systems?|applications?|platforms?)$"
)

_LINKED = {
    RelationshipKind.CALLS_API: "Calls the API of",
    RelationshipKind.PUBLISHES_EVENTS_TO: "Publishes events to",
    RelationshipKind.TRANSFERS_DATA_TO: "Transfers data to",
    RelationshipKind.ORCHESTRATES: "Orchestrates",
    RelationshipKind.UNSPECIFIED: "Depends on",
}


_QUOTE_OVERLAP = 0.6
_MAX_QUOTE = 300
# Each call's text stays below this even with a very large context window, so
# a single answer is not asked to cover a whole book.
MAX_TEXT_CHARACTERS_PER_CALL = 48_000
# Below this much room for document text, reading is not worth attempting.
_MIN_TEXT_TOKENS = 400
_IMAGE_TOKENS = 1024
# Measured as the transports send them: without spaces.
_SCHEMA_TEXT = json.dumps(ExtractionOutput.model_json_schema(), separators=(",", ":"))
_DETAILED_SCHEMA_TEXT = json.dumps(
    DetailedExtractionOutput.model_json_schema(), separators=(",", ":")
)
_LEAN_SCHEMA_TEXT = json.dumps(LeanExtractionOutput.model_json_schema(), separators=(",", ":"))
# With less room than this for document text, a reading leaves journeys out (ADR-0096).
_JOURNEY_ROOM = 4 * _MIN_TEXT_TOKENS
_JOURNEY_WORD = re.compile(r"\bjourneys?\b", re.IGNORECASE)
# With less room than this for document text, a reading leaves an offering's details out
# (ADR-0101, step 4): they cost each call over a thousand tokens of schema.
_DETAIL_ROOM = 10 * _MIN_TEXT_TOKENS
_DETAIL_WORD = re.compile(
    r"\border tracking\b|\blifecycle\b|\bnon-functional\b|\bNFRs?\b|\breali[sz](?:ed|ation)\b",
    re.IGNORECASE,
)
# Each part of a document is asked for at most this many times.
_ATTEMPTS = 2
# What one suggestion costs in the answer, keys and quote included, and how much
# document text one answer token covers in a dense catalogue table. Together they
# size a call so its answer fits the model's output limit (ADR-0091).
_TOKENS_PER_CHANGE = 150
_CHARACTERS_PER_OUTPUT_TOKEN = 1.0
# Assumed when the client does not say how long its answers may be.
_DEFAULT_OUTPUT_TOKENS = 16_384
# Never ask a call for fewer suggestions than this, however small the model.
_MIN_CAPACITY = 10
# A part whose answer was cut off, or filled up, is split and asked again at
# most this many times over; a passage shorter than this is not split.
_MAX_SPLIT_DEPTH = 4
_MIN_SPLIT_CHARACTERS = 400
_REASONS = {
    "unusable": "the model's answer was unusable.",
    "uncited": "no suggestion cited the text correctly.",
    "invalid": "every suggestion the model gave was incomplete.",
    "truncated": "the model's answer was too long, even for a small part.",
    "budget": "the reading reached its limit on model calls.",
}
# Provider failures that asking again cannot fix.
_PERMANENT_KINDS = {"authentication", "configuration", "payment"}
# HTTP statuses that mean the same, from a transport that does not classify them.
_REFUSED = {401: "authentication", 402: "payment", 403: "authentication", 404: "configuration"}


def _why(error: BaseException) -> str:
    """What went wrong with an answer, by error type only: never the document's text."""
    current: BaseException | None = error
    while current is not None:
        if isinstance(current, ValidationError):
            problems = sorted({str(problem["type"]) for problem in current.errors()})
            return f"{current.error_count()} schema problem(s): {', '.join(problems)}"
        if current.__cause__ is None:
            return type(current).__name__
        current = current.__cause__
    return type(error).__name__


def _refusal(error: BaseException) -> ModelTransportError | None:
    """The provider's refusal behind a failed call, when asking again cannot fix it.

    A transport may raise the app's own classification, or only wrap the HTTP
    response: OpenRouter's 402 (no credit for the model) arrived as a plain status
    error, so each of 300 parts was asked twice and every one refused.
    """
    current: BaseException | None = error
    while current is not None:
        if isinstance(current, ModelTransportError):
            return current if current.kind in _PERMANENT_KINDS else None
        status = getattr(getattr(current, "response", None), "status_code", None)
        if status in _REFUSED:
            return ModelTransportError(_REFUSED[status])
        current = current.__cause__
    return None


def _permanent(error: BaseException) -> bool:
    return _refusal(error) is not None


def _tokens(text: str) -> int:
    """The transports' own estimate, so a batch that fits here fits there."""
    return len(text) // 4 + 1


def _words(value: str) -> set[str]:
    return {word for word in re.findall(r"\w+", value.casefold()) if len(word) > 2}


# A sentence ends at ". ", "! " or "? ", but not after one letter ("B. Pro+", "e.g. ").
_SENTENCE = re.compile(r"(?<=[.!?])(?<!\b\w\.)\s+|\n+")


def _evidence_quote(
    quote: str, cited: list[ExtractionSegment], batch: Sequence[ExtractionSegment] = ()
) -> tuple[str, tuple[ExtractionSegment, ...]] | None:
    """The verbatim text supporting a quote and the passages that hold it; None when
    no passage says it.

    Small models often paraphrase, and cite the wrong passage. An exact quote is
    kept: from a cited passage, from two cited neighbours read together (a sentence
    across a page or a row break), or else from wherever in the call's text it is,
    and it is cited there. A close paraphrase is replaced by the sentence it best
    matches, so what a person reads is always the document's own words, cited
    where they are.
    """
    normalised = _normalise(quote)
    if not normalised:
        return None
    images = tuple(segment for segment in cited if segment.image_mime_type)
    if images:
        # A vision model reads an image; there is no text to match the quote against.
        return quote.strip(), images
    for segment in cited:
        if normalised in _normalise(segment.text):
            return quote.strip(), (segment,)
    ordered = sorted(cited, key=lambda segment: segment.number)
    for first, second in zip(ordered, ordered[1:], strict=False):
        if second.number == first.number + 1 and normalised in _normalise(
            f"{first.text} {second.text}"
        ):
            return quote.strip(), (first, second)
    others = [segment for segment in batch if segment not in cited and not segment.image_mime_type]
    for segment in others:
        if normalised in _normalise(segment.text):
            return quote.strip(), (segment,)
    wanted = _words(quote.translate(_TYPOGRAPHY))
    if not wanted:
        return None
    for candidates in (cited, others):
        best, best_overlap, where = None, 0.0, None
        for segment in candidates:
            for sentence in _SENTENCE.split(segment.text):
                overlap = len(wanted & _words(sentence)) / len(wanted)
                if overlap > best_overlap and sentence.strip():
                    best, best_overlap, where = sentence.strip(), overlap, segment
        if best is not None and where is not None and best_overlap >= _QUOTE_OVERLAP:
            shown = best if len(best) <= _MAX_QUOTE else best[: _MAX_QUOTE - 1].rstrip() + "…"
            return shown, (where,)
    return None


def _parts(segment: ExtractionSegment, limit: int) -> list[ExtractionSegment]:
    """A passage too long for one call, cut at line or word breaks, keeping its location."""
    if segment.image_mime_type or len(segment.text) <= limit:
        return [segment]
    pieces: list[str] = []
    remaining = segment.text
    while len(remaining) > limit:
        cut = remaining.rfind("\n", 0, limit)
        if cut < limit // 2:
            cut = remaining.rfind(" ", 0, limit)
        if cut < limit // 2:
            cut = limit
        pieces.append(remaining[:cut].strip())
        remaining = remaining[cut:]
    pieces.append(remaining.strip())
    pieces = [piece for piece in pieces if piece]
    # A part keeps its row's cells and whether its systems were read from them, so a
    # long row read in parts is still known for one.
    return [
        replace(segment, location=f"{segment.location} (part {index} of {len(pieces)})", text=piece)
        for index, piece in enumerate(pieces, start=1)
    ]


def _span(batch: list[ExtractionSegment]) -> str:
    first, last = batch[0].location, batch[-1].location
    return first if first == last else f"{first} to {last}"


def _halves(batch: list[ExtractionSegment]) -> list[list[ExtractionSegment]] | None:
    """A part split for asking again, in document order; None when it cannot be split."""
    if len(batch) > 1:
        # Cut where the headings change nearest the middle, so a table stays whole.
        middle = len(batch) // 2
        boundaries = [i for i in range(1, len(batch)) if batch[i].section != batch[i - 1].section]
        cut = min(boundaries, key=lambda i: abs(i - middle), default=middle)
        return [batch[:cut], batch[cut:]]
    segment = batch[0]
    if segment.image_mime_type or len(segment.text) < _MIN_SPLIT_CHARACTERS:
        return None
    pieces = _parts(segment, len(segment.text) // 2 + 1)
    return [[piece] for piece in pieces] if len(pieces) > 1 else None


@dataclass
class _Answer:
    """One call's checked changes, and what was left out of what the model gave.

    ``uncited`` items quoted nothing the text says; ``invalid`` ones, by kind,
    could not be made a suggestion (a key it had no value for, an implied item
    that is not a dependency).
    """

    changes: list[ProposedChange]
    given: int
    uncited: int = 0
    invalid: Counter[str] = field(default_factory=Counter)

    @property
    def failed(self) -> str | None:
        """Why a call that gave suggestions yielded none, or None when it yielded some."""
        if self.changes or not self.given:
            return None
        return "uncited" if self.uncited else "invalid"


class _Budget:
    """The calls a reading may still make, shared by the parts read at once."""

    def __init__(self, calls: int) -> None:
        self._lock = threading.Lock()
        self._left = calls
        # Parts not yet started, which the calls left must still cover.
        self.waiting = 0

    @property
    def left(self) -> int:
        with self._lock:
            return self._left

    def take(self) -> bool:
        with self._lock:
            if self._left < 1:
                return False
            self._left -= 1
            return True

    def spare(self) -> bool:
        """Whether a call can go to asking again, leaving one for each part still waiting."""
        with self._lock:
            return self._left > self.waiting


@dataclass(frozen=True)
class _Part:
    """A part of the document for one call; ``path`` orders it, its halves after it."""

    path: tuple[int, ...]
    batch: list[ExtractionSegment]
    depth: int


@dataclass(frozen=True)
class _Outcome:
    """What reading one part gave: its answer, or why it gave none."""

    batch: list[ExtractionSegment]
    answer: _Answer | None
    reason: str
    error: Exception | None
    refused: ModelTransportError | None
    full: bool


class StructuredCatalogueExtractor:
    def __init__(
        self,
        client: StructuredOutputClient,
        *,
        supports_images: bool,
        max_input_tokens: int | None = None,
        max_output_tokens: int | None = None,
        concurrency: int = 1,
    ) -> None:
        """``max_input_tokens`` is the prompt room the client allows; None means ample.

        ``max_output_tokens`` is how long one answer may be; None means the
        client does not say, and a common hosted limit is assumed. ``concurrency``
        is how many parts are read at once.
        """
        self._concurrency = max(1, concurrency)
        self._client = client
        self._supports_images = supports_images
        self._max_input_tokens = max_input_tokens
        self._output_tokens = max_output_tokens or _DEFAULT_OUTPUT_TOKENS
        # How many suggestions one answer can hold; an answer this long may have
        # been cut short by the model, so its part is split and asked again.
        self._capacity = max(_MIN_CAPACITY, int(self._output_tokens * 0.8) // _TOKENS_PER_CHANGE)

    @property
    def supports_images(self) -> bool:
        return self._supports_images

    @property
    def model(self) -> str:
        return self._client.model

    @property
    def prompt_version(self) -> str:
        return PROMPT_VERSION

    def _known(
        self, request: ExtractionRequest, budget: int, warnings: list[str]
    ) -> tuple[KnownSystem, ...]:
        """The catalogue given to the model, trimmed so document text still has room."""
        known = request.known_systems

        def cost(systems: tuple[KnownSystem, ...]) -> int:
            return _tokens(
                build_user_prompt(ExtractionRequest(request.document_title, (), systems))
            )

        if cost(known) <= budget // 3:
            return known
        known = tuple(KnownSystem(item.id, item.name, ()) for item in known)
        kept = len(known)
        while kept and cost(known[:kept]) > budget // 3:
            kept -= 1
        if kept < len(known):
            warnings.append(
                f"Only {kept} of {len(known)} catalogue systems were shown to the model; "
                "it may suggest some existing systems again."
            )
        return known[:kept]

    def _batches(
        self, segments: tuple[ExtractionSegment, ...], text_characters: int
    ) -> list[list[ExtractionSegment]]:
        batches: list[list[ExtractionSegment]] = []
        current: list[ExtractionSegment] = []
        size = 0
        for segment in (part for item in segments for part in _parts(item, text_characters)):
            if segment.image_mime_type:
                batches.append([segment])
                continue
            # The segment's JSON wrapping (number, location, section) costs a little too.
            cost = len(segment.text) + len(segment.location) + 40
            cost += sum(len(heading) + 3 for heading in segment.section)
            # Past half full, a new section starts a new call rather than splitting one.
            new_section = bool(current) and segment.section != current[-1].section
            if current and (
                size + cost > text_characters or (new_section and size >= text_characters // 2)
            ):
                batches.append(current)
                current, size = [], 0
            current.append(segment)
            size += cost
        if current:
            batches.append(current)
        return batches

    def propose(self, request: ExtractionRequest) -> CatalogueProposal:
        budget = self._max_input_tokens
        warnings: list[str] = []
        available = int(budget * 0.9) if budget is not None else 10**9
        room = available - _tokens(DETAILED_SYSTEM_PROMPT) - _tokens(_DETAILED_SCHEMA_TEXT)
        reading: _Reading = "detailed"
        # An offering's details cost the most room of all; a context without ample room reads
        # without them (ADR-0101, step 4).
        if room < _DETAIL_ROOM:
            reading = "standard"
            room = available - _tokens(SYSTEM_PROMPT) - _tokens(_SCHEMA_TEXT)
            if any(
                _DETAIL_WORD.search(" ".join((*item.section, item.text)))
                for item in request.segments
            ):
                warnings.append(
                    "This model's context is too small to also read an offering's realisation, "
                    "NFRs, order tracking and lifecycle notes from prose; those set out in "
                    "tables are still read."
                )
        # A journey is the largest answer shape; a small context reads without it rather than
        # with too little room left for the document (ADR-0096).
        if room < _JOURNEY_ROOM:
            reading = "lean"
            room = available - _tokens(LEAN_SYSTEM_PROMPT) - _tokens(_LEAN_SCHEMA_TEXT)
            if any(
                _JOURNEY_WORD.search(" ".join((*item.section, item.text)))
                for item in request.segments
            ):
                warnings.append(
                    "This model's context is too small to also propose journeys from prose; "
                    "journeys set out in tables are still read."
                )
        if room < _MIN_TEXT_TOKENS * 2:
            raise CatalogueExtractionUnsupportedError(
                "The configured model's context window is too small to read documents. Raise "
                "LOCAL_LLM_CONTEXT_WINDOW_TOKENS (and the model server's context), or the "
                "profile's context_tokens, so at least 8,192 tokens are left for input."
            )
        known = self._known(request, room, warnings)
        known_cost = _tokens(
            build_user_prompt(ExtractionRequest(request.document_title, (), known))
        )
        # A call covers only as much text as one answer can hold suggestions for.
        text_characters = min(
            MAX_TEXT_CHARACTERS_PER_CALL,
            (room - known_cost) * 4,
            max(_MIN_TEXT_TOKENS * 4, int(self._output_tokens * _CHARACTERS_PER_OUTPUT_TOKEN)),
        )
        changes: list[ProposedChange] = []
        uncited = 0
        invalid: Counter[str] = Counter()
        failures: list[tuple[str, str]] = []
        last_error: Exception | None = None
        read_any = False
        batches = self._batches(request.segments, text_characters)
        queue = deque(_Part((index,), batch, 0) for index, batch in enumerate(batches))
        # Splitting is bounded, so a document that every model answer overflows
        # still finishes in a predictable number of calls.
        calls = _Budget(3 * len(batches) + 4)
        # The provider's refusal (no credit, bad key, unknown model) ends the reading:
        # every part would be refused the same way.
        refused: ModelTransportError | None = None
        refused_at: _Part | None = None
        outcomes: dict[tuple[int, ...], _Outcome] = {}
        skipped: dict[tuple[int, ...], tuple[str, str]] = {}
        done = 0
        # Parts are read several at a time (a call waits mostly on the model writing its
        # answer); what they give is put back in document order, so the reading is the
        # same however the calls finish.
        with ThreadPoolExecutor(max_workers=self._concurrency) as pool:
            running: dict[Future[_Outcome], _Part] = {}
            while queue or running:
                while queue and len(running) < self._concurrency and refused is None:
                    part = queue.popleft()
                    if calls.left < 1:
                        skipped[part.path] = (
                            "budget",
                            f"{_span(part.batch)} could not be read: {_REASONS['budget']}",
                        )
                        continue
                    request.checkpoint()
                    numbered = tuple(
                        replace(item, number=number)
                        for number, item in enumerate(part.batch, start=1)
                    )
                    images = tuple(
                        (item.image_mime_type, item.image)
                        for item in numbered
                        if item.image_mime_type
                    )
                    if images and room - known_cost < _IMAGE_TOKENS * len(images):
                        skipped[part.path] = (
                            "image",
                            f"{_span(part.batch)} is too large an image for the configured model.",
                        )
                        continue
                    calls.waiting = len(queue)
                    future = pool.submit(
                        self._attempt, request, part, numbered, known, images, reading, calls
                    )
                    running[future] = part
                if not running:
                    break
                request.progress(done, done + len(running) + len(queue))
                finished, _ = wait(running, return_when=FIRST_COMPLETED)
                for future in finished:
                    part = running.pop(future)
                    outcome = future.result()
                    done += 1
                    if outcome.error is not None:
                        last_error = outcome.error
                    if outcome.refused is not None and refused is None:
                        refused, refused_at = outcome.refused, part
                    halves = (
                        _halves(part.batch)
                        if outcome.full and part.depth < _MAX_SPLIT_DEPTH
                        else None
                    )
                    if halves and refused is None and calls.left >= len(queue) + len(halves):
                        # A smaller part gets the whole answer to itself; the full answer
                        # is set aside so its parts are not suggested twice.
                        for number, half in reversed(list(enumerate(halves))):
                            queue.appendleft(_Part((*part.path, number), half, part.depth + 1))
                        continue
                    outcomes[part.path] = outcome
        for path in sorted({*outcomes, *skipped}):
            if path in skipped:
                failures.append(skipped[path])
                continue
            outcome = outcomes[path]
            answer = outcome.answer
            if answer is not None:
                uncited += answer.uncited
                invalid.update(answer.invalid)
            if outcome.refused is not None:
                continue
            if answer is None or answer.failed is not None:
                failures.append(
                    (
                        outcome.reason,
                        f"{_span(outcome.batch)} could not be read: {_REASONS[outcome.reason]}",
                    )
                )
                continue
            read_any = True
            if outcome.full:
                warnings.append(
                    f"{_span(outcome.batch)} may not be read completely: the model's answer "
                    "reached its limit."
                )
            changes.extend(answer.changes)
        if refused is not None and refused_at is not None:
            unread = len(queue) + sum(1 for item in outcomes.values() if item.refused is not None)
            failures.append(
                (
                    "refused",
                    f"The model provider refused the reading ({refused.kind}): {unread} "
                    f"part(s) from {_span(refused_at.batch)} on were not read.",
                )
            )
        warnings.extend(message for _, message in failures)
        if failures and not read_any:
            message = f"No part of the document could be read by the model. {failures[-1][1]}"
            if all(reason == "uncited" for reason, _ in failures):
                raise CatalogueCitationError(message)
            if refused is not None:
                raise CatalogueAnswerUnusableError(message) from refused
            if last_error is not None:
                raise CatalogueAnswerUnusableError(message) from last_error
            raise CatalogueExtractionError(message)
        if uncited:
            warnings.append(
                f"{uncited} suggestion(s) were left out: what they quote was not found in "
                "the document."
            )
        if invalid:
            kinds = ", ".join(
                f"{count} {kind.replace('_', ' ')}" for kind, count in sorted(invalid.items())
            )
            warnings.append(f"Incomplete suggestions were left out: {kinds}.")
        return CatalogueProposal(
            tuple(changes), self._client.model, PROMPT_VERSION, tuple(warnings)
        )

    def _attempt(
        self,
        request: ExtractionRequest,
        part: _Part,
        numbered: tuple[ExtractionSegment, ...],
        known: tuple[KnownSystem, ...],
        images: tuple[tuple[str, bytes], ...],
        reading: _Reading,
        budget: _Budget,
    ) -> _Outcome:
        """One part read, asked once more when its answer is rejected and calls are spare."""
        answer: _Answer | None = None
        reason = "budget"
        error: Exception | None = None
        refused: ModelTransportError | None = None
        span = _span(part.batch)
        # Answers vary between calls, so a rejected one is asked for once more,
        # unless the parts still waiting need the calls left.
        for attempt in range(_ATTEMPTS):
            if (attempt and not budget.spare()) or not budget.take():
                break
            try:
                got = self._read(request, numbered, known, images, reading)
            except (StructuredOutputError, ValidationError, ModelTransportError) as exc:
                error, answer = exc, None
                _LOG.warning("Catalogue reading of %s failed: %s", span, _why(exc))
                if truncated(exc):
                    # Asking for the same part again would be cut off again.
                    reason = "truncated"
                    break
                reason = "unusable"
                refused = _refusal(exc)
                if refused is not None:
                    break
                continue
            answer = got
            if got.failed is None:
                break
            reason = got.failed
            _LOG.warning(
                "Catalogue reading of %s gave no usable suggestion: %d uncited, invalid %s",
                span,
                got.uncited,
                dict(got.invalid),
            )
        usable = answer is not None and answer.failed is None
        full = reason == "truncated" or (
            usable and answer is not None and answer.given >= self._capacity
        )
        return _Outcome(part.batch, answer, reason, error, refused, full)

    def _read(
        self,
        request: ExtractionRequest,
        numbered: tuple[ExtractionSegment, ...],
        known: tuple[KnownSystem, ...],
        images: tuple[tuple[str, bytes], ...],
        reading: _Reading = "detailed",
    ) -> _Answer:
        """One call's checked changes, and what was left out and why.

        Each answered item is checked on its own, so one the model got wrong costs
        only itself. A ``standard`` call asks without an offering's details, and a
        ``lean`` one without journeys and channels too, for a model whose context has
        no room for them.
        """
        prompt = build_user_prompt(ExtractionRequest(request.document_title, numbered, known))
        system_prompt, answers, shape = _ASKED[reading]
        answered = self._client.parse(
            system_prompt=system_prompt,
            user_prompt=prompt,
            schema_type=answers,
            images=images,
        ).changes
        answer = _Answer([], len(answered))
        given: list[DetailedChangeOutput] = []
        for raw in answered:
            item = _mended(shape, raw)
            if item is None:
                answer.invalid[_kind_of(raw)] += 1
                continue
            given.append(_plain(_detailed(item)))
        segments = {item.number: item for item in numbered}
        names = _SystemNames(request.known_systems, given)
        for item in given:
            # A number outside this call's passages is a slip; the others still say where.
            cited = [segments[n] for n in dict.fromkeys(item.evidence_numbers) if n in segments]
            found = _evidence_quote(item.quote, cited, numbered)
            if found is None:
                answer.uncited += 1
                continue
            quote, holding = found
            try:
                change = _proposed(
                    item, names, tuple(segment.location for segment in holding), quote
                )
            except InvalidKnowledgeError:
                answer.invalid[item.kind] += 1
                continue
            answer.changes.append(change)
        return answer


class FakeCatalogueExtractor:
    """Deterministic offline extraction from labelled lines; not a language model.

    Recognises ``System: Name``, ``Component: Name [technology]``,
    ``Capability: Name (phrase, phrase) @ Component``, ``Constraint: text`` and
    ``Interface: Name [api] consumed by A, B`` (all for the last system named; the
    technology, component, style and consumers are optional),
    ``Capability domain: Name under Parent`` and ``Portfolio: Name (Level) under Parent``
    (the parent optional), ``Realisation: NAME [cfs] realised by A, B`` (delivered by the last
    system named, if any), ``Source: Title [L2] as SHORT`` (level and short name optional),
    ``Conflict: Title; A says statement; B says statement; affects X, Y`` (the offerings
    optional),
    ``A depends on B for reason`` and ``A calls B for reason`` lines (the second
    as an API call), and reads ``A sends X to B`` as an inferred data transfer.
    An uploaded image yields one system named after the document so the review
    flow can be exercised without a vision model; a Word document's figures yield
    nothing. Only prose is read: a table row arrives
    as ``Column: value | Column: value`` and would otherwise match a label, so a
    segment with cells, or a line holding `` | ``, is skipped.
    """

    _SYSTEM = re.compile(r"^system:\s*(?P<name>.+)$", re.IGNORECASE)
    _COMPONENT = re.compile(
        r"^component:\s*(?P<name>[^\[]+?)\s*(?:\[(?P<technology>[^\]]+)\])?$", re.I
    )
    _CAPABILITY = re.compile(
        r"^capability:\s*(?P<name>[^(]+)\((?P<triggers>[^)]+)\)(?:\s*@\s*(?P<component>.+))?",
        re.I,
    )
    _CONSTRAINT = re.compile(r"^constraint:\s*(?P<text>.+)$", re.IGNORECASE)
    _INTERFACE = re.compile(
        r"^interface:\s*(?P<name>[^\[]+?)\s*(?:\[(?P<style>api|event|file)\])?"
        r"(?:\s+consumed by\s+(?P<consumers>.+?))?\.?$",
        re.IGNORECASE,
    )
    _DOMAIN = re.compile(
        r"^capability domain:\s*(?P<name>.+?)(?:\s+under\s+(?P<parent>.+?))?\.?$", re.I
    )
    _SOURCE = re.compile(
        r"^source:\s*(?P<title>.+?)(?:\s*\[(?P<level>L[123])\])?(?:\s+as\s+(?P<short>\S+))?\.?$",
        re.I,
    )
    # Semicolons, not bars: a line holding " | " is a table row and is skipped.
    _CONFLICT = re.compile(
        r"^conflict:\s*(?P<title>[^;]+?)\s*;\s*(?P<a>[^;]+?)\s+says\s+(?P<sa>[^;]+?)\s*"
        r";\s*(?P<b>[^;]+?)\s+says\s+(?P<sb>[^;]+?)"
        r"(?:\s*;\s*affects\s+(?P<offerings>.+?))?\.?$",
        re.I,
    )
    _REALISATION = re.compile(
        r"^realisation:\s*(?P<name>[^\[]+?)\s*\[(?P<layer>cfs|rfs|resource)\]"
        r"(?:\s+realised by\s+(?P<below>.+?))?\.?$",
        re.I,
    )
    _PORTFOLIO = re.compile(
        r"^portfolio:\s*(?P<name>[^(]+?)\s*\((?P<level>[^)]+)\)"
        r"(?:\s+under\s+(?P<parent>.+?))?\.?$",
        re.I,
    )
    _DEPENDS = re.compile(
        r"^(?P<source>.+?)\s+(?P<verb>depends on|calls)\s+(?P<target>.+?)"
        r"(?:\s+(?:for|to)\s+(?P<why>.+?))?\.?$",
        re.IGNORECASE,
    )
    _SENDS = re.compile(
        r"^(?P<source>.+?)\s+(?:sends|posts|pushes)\s+(?P<what>.+?)\s+to\s+(?P<target>.+?)\.?$",
        re.IGNORECASE,
    )

    supports_images = True
    model = "fake-catalogue-extractor"
    prompt_version = PROMPT_VERSION

    def propose(self, request: ExtractionRequest) -> CatalogueProposal:
        known: dict[str, str] = {}
        for system in request.known_systems:
            for label in (system.id, system.name, *system.aliases):
                known[label.casefold()] = system.id
        changes: list[ProposedChange] = []
        current: str | None = None
        current_name = ""

        def system_id(name: str) -> str:
            return known.setdefault(name.casefold().strip(), slug(name))

        for segment in request.segments:
            request.checkpoint()
            if segment.image_mime_type:
                if segment.location != "image":
                    continue  # A Word document's figure; only an uploaded image stands alone.
                name = request.document_title.strip()
                changes.append(
                    ProposedChange(
                        CandidateContent(CandidateKind.SYSTEM, system_id(name), name=name),
                        (segment.location,),
                        name,
                    )
                )
                continue
            if segment.cells:
                continue
            for line in (raw.strip() for raw in segment.text.splitlines()):
                if " | " in line:
                    continue
                source_name, target_name = current_name, ""
                basis, rationale = CandidateBasis.STATED, None
                if match := self._SYSTEM.match(line):
                    name = match["name"].strip()
                    current, current_name = system_id(name), name
                    source_name = name
                    content = CandidateContent(CandidateKind.SYSTEM, current, name=name)
                elif (match := self._COMPONENT.match(line)) and current:
                    name = match["name"].strip()
                    content = CandidateContent(
                        CandidateKind.COMPONENT,
                        current,
                        name=name,
                        component_id=slug(name),
                        technology=(match["technology"] or "").strip() or None,
                    )
                elif (match := self._CAPABILITY.match(line)) and current:
                    name = match["name"].strip()
                    component = (match["component"] or "").strip()
                    content = CandidateContent(
                        CandidateKind.CAPABILITY,
                        current,
                        name=name,
                        capability_id=slug(name),
                        triggers=_clean(match["triggers"].split(",")),
                        component_id=slug(component) if component else None,
                    )
                elif (match := self._CONSTRAINT.match(line)) and current:
                    content = CandidateContent(
                        CandidateKind.CONSTRAINT, current, text=match["text"].strip()
                    )
                elif (match := self._INTERFACE.match(line)) and current:
                    name = match["name"].strip()
                    consumers = _clean(re.split(r",|\band\b", match["consumers"] or ""))
                    interface = SystemInterface(
                        f"if-{current}-{slug(name)}",
                        name,
                        current,
                        style=InterfaceStyle((match["style"] or "unspecified").casefold()),
                        consumer_ids=tuple(
                            dict.fromkeys(
                                system_id(item) for item in consumers if system_id(item) != current
                            )
                        ),
                    )
                    source_name = name
                    content = CandidateContent(
                        CandidateKind.INTERFACE, interface.id, name=name, interface=interface
                    )
                elif match := self._DOMAIN.match(line):
                    name, parent = match["name"].strip(), (match["parent"] or "").strip() or None
                    domain = CapabilityDomain(domain_key(name, parent), name, parent_id=parent)
                    source_name = name
                    content = CandidateContent(
                        CandidateKind.CAPABILITY_DOMAIN,
                        domain.id,
                        name=name,
                        capability_domain=domain,
                    )
                elif match := self._SOURCE.match(line):
                    title, short = match["title"].strip(), match["short"]
                    source = KnowledgeSource(
                        f"src-{slug(short or title)}",
                        title,
                        SourceLevel((match["level"] or "L3").upper()),
                        short=short,
                    )
                    source_name = title
                    content = CandidateContent(
                        CandidateKind.SOURCE, source.id, name=title, knowledge_source=source
                    )
                elif match := self._CONFLICT.match(line):
                    title = match["title"].strip()
                    conflict = SourceConflict(
                        f"conflict-{slug(title)}",
                        title,
                        ConflictSide(match["a"].strip(), match["sa"].strip()),
                        ConflictSide(match["b"].strip(), match["sb"].strip()),
                        scope=tuple(
                            ConflictScope(item)
                            for item in dict.fromkeys(
                                _clean(re.split(r",", match["offerings"] or ""))
                            )
                        ),
                    )
                    source_name = title
                    content = CandidateContent(
                        CandidateKind.CONFLICT, conflict.id, name=title, conflict=conflict
                    )
                elif match := self._REALISATION.match(line):
                    name = match["name"].strip()
                    layer = RealisationLayer(match["layer"].casefold())
                    record = RealisationRecord(
                        record_id(layer, slug(name)),
                        layer,
                        name,
                        system_ids=(current,) if current else (),
                        realised_by=_clean(re.split(r",", match["below"] or "")),
                    )
                    source_name = name
                    content = CandidateContent(
                        CandidateKind.REALISATION_RECORD, record.id, name=name, realisation=record
                    )
                elif match := self._PORTFOLIO.match(line):
                    name, parent = match["name"].strip(), (match["parent"] or "").strip() or None
                    node = PortfolioNode(
                        domain_key(name, parent), name, match["level"].strip(), parent_id=parent
                    )
                    source_name = name
                    content = CandidateContent(
                        CandidateKind.PORTFOLIO_NODE, node.id, name=name, portfolio_node=node
                    )
                elif match := self._DEPENDS.match(line) or self._SENDS.match(line):
                    source_name, target_name = match["source"].strip(), match["target"].strip()
                    sends = match.re is self._SENDS
                    calls = not sends and match["verb"].casefold() == "calls"
                    content = CandidateContent(
                        CandidateKind.RELATIONSHIP,
                        system_id(source_name),
                        target_system_id=system_id(target_name),
                        text=(
                            f"Sends {match['what'].strip()}"
                            if sends
                            else (match["why"] or ("Calls" if calls else "Depends on")).strip()
                        ),
                        relationship_kind=(
                            RelationshipKind.TRANSFERS_DATA_TO
                            if sends
                            else RelationshipKind.CALLS_API
                            if calls
                            else RelationshipKind.UNSPECIFIED
                        ),
                    )
                    if sends:
                        basis = CandidateBasis.INFERRED
                        rationale = (
                            f"{source_name} sends {match['what'].strip()} to {target_name}, "
                            f"so it relies on {target_name} to receive them."
                        )
                else:
                    continue
                changes.append(
                    ProposedChange(
                        content,
                        (segment.location,),
                        line,
                        source_name,
                        target_name,
                        basis,
                        rationale,
                    )
                )
        return CatalogueProposal(tuple(changes), self.model, self.prompt_version)
