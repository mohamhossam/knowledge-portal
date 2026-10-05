"""Where the catalogue's knowledge comes from, and where its sources disagree
(requirement-portal ADR-0101, step 5).

Sources are registered once, each with its level: L1 the canonical landscape every product
rests on, L2 a primary source for its scope, L3 a baseline carried forward from an earlier
source that could not be re-verified. A fact keeps its source as text ("SDD §11.1.3"); when
that text names a registered source, the screens say its level.

Where two sources contradict each other, the catalogue never picks one: a conflict records
both statements, what differs, its impact, the decision it needs, and which offerings and
order types it affects. Each offering keeps its own governance: its sources, the open
questions its sources leave, the architecture decisions taken, and the boundaries of what
its sources cover.
"""

from __future__ import annotations

import re
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source


class SourceLevel(StrEnum):
    """How far a source can be relied on, as the original explorer ranked its sources."""

    # The canonical enterprise landscape every product rests on.
    L1 = "L1"
    # A primary source for its scope, such as a product's solution design.
    L2 = "L2"
    # A baseline carried forward from an earlier source; it cannot be re-verified.
    L3 = "L3"


def source_level(value: SourceLevel | str) -> SourceLevel:
    """A level however it is written: "L2", "l2", "2", "Level 2"."""
    digits = re.findall(r"[123]", str(value))
    if len(digits) == 1:
        return SourceLevel(f"L{digits[0]}")
    raise InvalidKnowledgeError(f"A source's level is L1, L2 or L3, not {value!r}.")


@dataclass(frozen=True)
class KnowledgeSource:
    """One source the catalogue's knowledge is read from."""

    id: str
    title: str
    level: SourceLevel
    # How the source is cited, such as "BPP SDD".
    short: str | None = None
    version: str | None = None
    file: str | None = None
    # False when the source was not supplied and its content is carried forward unread.
    supplied: bool = True
    # What it is the authority for.
    authority: str | None = None
    # The products or areas it covers, in words.
    scope: str | None = None
    # What it cannot tell, such as diagrams that are not machine-readable.
    boundary: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Source id"))
        object.__setattr__(self, "title", required(self.title, "Source title"))
        object.__setattr__(self, "level", source_level(self.level))
        for field, label in (
            ("short", "Short name"),
            ("version", "Version"),
            ("file", "File"),
            ("authority", "Authority"),
            ("scope", "Scope"),
            ("boundary", "Boundary"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))


@dataclass(frozen=True)
class ConflictSide:
    """One of two contradicting statements, and where it is said."""

    source_id: str
    statement: str
    # Where in the source, such as "§11.1.3 P2".
    reference: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "source_id", required(self.source_id, "Source"))
        object.__setattr__(self, "statement", required(self.statement, "Statement"))
        object.__setattr__(self, "reference", optional(self.reference, "Reference"))


@dataclass(frozen=True)
class ConflictScope:
    """An offering a conflict affects: its order types (none: every one), and the open
    question the conflict raises for it."""

    product_id: str
    order_types: tuple[str, ...] = ()
    question_id: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "product_id", required(self.product_id, "Offering"))
        object.__setattr__(
            self,
            "order_types",
            tuple(dict.fromkeys(required(item, "Order type") for item in self.order_types)),
        )
        object.__setattr__(self, "question_id", optional(self.question_id, "Question"))

    def concerns(self, product_id: str, order_code: str | None = None) -> bool:
        if self.product_id != product_id:
            return False
        return (
            order_code is None
            or not self.order_types
            or any(item.casefold() == order_code.casefold() for item in self.order_types)
        )


@dataclass(frozen=True)
class SourceConflict:
    """Two sources contradicting each other, never silently reconciled."""

    id: str
    title: str
    a: ConflictSide
    b: ConflictSide
    scope: tuple[ConflictScope, ...] = ()
    # What differs between them.
    difference: str | None = None
    # What the catalogue does meanwhile, and what it holds up.
    impact: str | None = None
    # The decision it needs, and who takes it.
    decision: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Conflict id"))
        object.__setattr__(self, "title", required(self.title, "Conflict title"))
        for field, label in (
            ("difference", "What differs"),
            ("impact", "Impact"),
            ("decision", "Decision needed"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        check_source(self)
        products = [item.product_id for item in self.scope]
        if len(set(products)) != len(products):
            raise InvalidKnowledgeError(f"{self.title}: an offering is in its scope once.")

    def concerns(self, product_id: str, order_code: str | None = None) -> bool:
        """Whether the conflict affects an offering, and an order type of it when given."""
        return any(item.concerns(product_id, order_code) for item in self.scope)


@dataclass(frozen=True)
class OpenQuestion:
    """A question an offering's sources leave open, such as "Is B2B Digital in scope?"."""

    id: str
    text: str
    impact: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Question id"))
        object.__setattr__(self, "text", required(self.text, "Question"))
        object.__setattr__(self, "impact", optional(self.impact, "Impact"))
        check_source(self)


@dataclass(frozen=True)
class ArchitectureDecision:
    """A decision taken for an offering's architecture, and why."""

    id: str
    title: str
    text: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Decision id"))
        object.__setattr__(self, "title", required(self.title, "Decision"))
        object.__setattr__(self, "text", optional(self.text, "What was decided"))
        check_source(self)


def check_offering_governance(
    offering_name: str,
    questions: tuple[OpenQuestion, ...],
    decisions: tuple[ArchitectureDecision, ...],
    sources: tuple[str, ...],
    primary_source: str | None,
) -> None:
    """An offering's own governance: each question and decision once, and its primary source
    one of its sources."""
    for items, what in ((questions, "question"), (decisions, "decision")):
        ids = [item.id.casefold() for item in items]
        if len(set(ids)) != len(ids):
            raise InvalidKnowledgeError(f"{offering_name}: each {what} id is used once.")
    if primary_source is not None and sources and primary_source not in sources:
        raise InvalidKnowledgeError(
            f"{offering_name}: its primary source {primary_source!r} is not one of its sources."
        )


@dataclass(frozen=True)
class OfferingFacts:
    """What the release check needs of an offering: its order types, questions and sources."""

    name: str
    order_codes: Collection[str]
    question_ids: Collection[str]
    sources: tuple[str, ...]
    primary_source: str | None


def check_governance(
    sources: tuple[KnowledgeSource, ...],
    conflicts: tuple[SourceConflict, ...],
    offerings: Mapping[str, OfferingFacts],
) -> None:
    """Registered sources with one id and one short name each; conflicts between registered
    sources that name catalogued offerings, their order types and their questions; offerings
    naming only registered sources. The message says where an unknown one is named, so a
    source or question still named cannot be removed."""
    ids = [item.id for item in sources]
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError("Source ids must be unique.")
    shorts = [item.short.casefold() for item in sources if item.short]
    if len(set(shorts)) != len(shorts):
        raise InvalidKnowledgeError("Each source's short name must be its own.")
    registered = set(ids)
    for offering in offerings.values():
        named = [*offering.sources, *([offering.primary_source] if offering.primary_source else [])]
        unknown = [item for item in named if item not in registered]
        if unknown:
            raise InvalidKnowledgeError(
                f"{offering.name} names source {unknown[0]!r}, which is not in the register."
            )
    conflict_ids = [item.id for item in conflicts]
    if len(set(conflict_ids)) != len(conflict_ids):
        raise InvalidKnowledgeError("Conflict ids must be unique.")
    for conflict in conflicts:
        for side in (conflict.a, conflict.b):
            if side.source_id not in registered:
                raise InvalidKnowledgeError(
                    f"The conflict {conflict.title} cites source {side.source_id!r}, which is "
                    "not in the register."
                )
        for scope in conflict.scope:
            affected = offerings.get(scope.product_id)
            if affected is None:
                raise InvalidKnowledgeError(
                    f"The conflict {conflict.title} affects offering {scope.product_id!r}, "
                    "which is not in the catalogue."
                )
            codes = {code.casefold() for code in affected.order_codes}
            unknown = [item for item in scope.order_types if item.casefold() not in codes]
            if unknown:
                raise InvalidKnowledgeError(
                    f"The conflict {conflict.title} names order type {unknown[0]!r}, which "
                    f"{affected.name} does not have."
                )
            known = {item.casefold() for item in affected.question_ids}
            if scope.question_id and scope.question_id.casefold() not in known:
                raise InvalidKnowledgeError(
                    f"The conflict {conflict.title} raises question {scope.question_id!r}, "
                    f"which {affected.name} does not have."
                )


def named_source(text: str | None, sources: tuple[KnowledgeSource, ...]) -> KnowledgeSource | None:
    """The registered source a fact's source text begins with, by id or short name: "BPP SDD
    §10" is the source short-named "BPP SDD". The longest name wins, so "SDD" never takes
    "SDD Annex"'s facts."""
    written = (text or "").strip().casefold()
    if not written:
        return None
    best: tuple[int, KnowledgeSource] | None = None
    for source in sources:
        for name in (source.id, source.short):
            key = (name or "").strip().casefold()
            if not key or not written.startswith(key):
                continue
            rest = written[len(key) :]
            if rest and rest[0].isalnum():
                continue
            if best is None or len(key) > best[0]:
                best = (len(key), source)
    return best[1] if best else None
