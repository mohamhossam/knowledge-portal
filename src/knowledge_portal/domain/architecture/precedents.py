"""Precedents: product verdicts a reviewer decided in requirement work (ontology plan Phase 5).

When a Requirement Owner accepts, overrides or leaves unknown the verdict an assessment
suggested, requirement-portal sends that decision here. It is kept with the requirement's
text, the concepts the requirement needed, the offering and the systems, against the
release it was assessed on. Two things read it:

- the precedent lane of the next assessment, which shows the nearest decided requirements
  to the verdict reasoner as worked examples;
- monitoring, which counts per release how often reviewers overrode the suggestion, and
  for which concepts.

One requirement analysis has one precedent; a later decision on it replaces the earlier
one, and an older one arriving late changes nothing.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.verdicts import ProductVerdict

# What a precedent keeps of the requirement: enough to compare and to show as an example.
TEXT_LIMIT = 4000
SYSTEM_LIMIT = 60
CONCEPT_LIMIT = 40


class PrecedentDecision(StrEnum):
    """What the reviewer did with the suggested verdict (requirement-portal ADR-0115)."""

    ACCEPTED = "accepted"
    OVERRIDDEN = "overridden"
    # The reviewer did not know; no verdict is kept, and the lane never uses it.
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class PrecedentSystem:
    """A system the decided impact named, with the role and change type it was given.

    Role and change type are kept as written: requirement-portal sends what the assessment
    said, and a value added later must not refuse the whole decision.
    """

    system_id: str
    role: str | None = None
    change_type: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "system_id", required(self.system_id, "Precedent system"))
        object.__setattr__(self, "role", optional(self.role, "Precedent system role"))
        object.__setattr__(
            self, "change_type", optional(self.change_type, "Precedent system change type")
        )


@dataclass(frozen=True)
class Precedent:
    """One decided product verdict, as requirement-portal sent it."""

    # requirement-portal's analysis id: one precedent per requirement analysis.
    id: str
    requirement_id: str
    # "analysis-id@version": the analysis version the decision was made on.
    version: str
    # The release the requirement was assessed against.
    release_id: str
    text: str
    suggested_verdict: ProductVerdict | None
    verdict: ProductVerdict | None
    decision: PrecedentDecision
    offering_id: str | None
    concept_ids: tuple[str, ...]
    systems: tuple[PrecedentSystem, ...]
    decided_at: datetime
    received_at: datetime

    def __post_init__(self) -> None:
        for name, label in (
            ("id", "Precedent id"),
            ("requirement_id", "Precedent requirement"),
            ("version", "Precedent version"),
            ("release_id", "Precedent release"),
        ):
            object.__setattr__(self, name, required(getattr(self, name), label))
        text = required(self.text, "Precedent text")
        if len(text) > TEXT_LIMIT:
            raise InvalidKnowledgeError(
                f"A precedent's text is at most {TEXT_LIMIT} characters long."
            )
        object.__setattr__(self, "text", text)
        object.__setattr__(self, "decision", PrecedentDecision(self.decision))
        for name in ("suggested_verdict", "verdict"):
            value = getattr(self, name)
            object.__setattr__(self, name, None if value is None else ProductVerdict(value))
        object.__setattr__(self, "offering_id", optional(self.offering_id, "Precedent offering"))
        if self.decided_at.tzinfo is None or self.received_at.tzinfo is None:
            raise InvalidKnowledgeError("A precedent's moments carry their time zone.")
        concepts = tuple(
            dict.fromkeys(required(item, "Precedent concept") for item in self.concept_ids)
        )
        if len(concepts) > CONCEPT_LIMIT or len(self.systems) > SYSTEM_LIMIT:
            raise InvalidKnowledgeError("A precedent names too many concepts or systems.")
        object.__setattr__(self, "concept_ids", concepts)
        seen: set[str] = set()
        for system in self.systems:
            if system.system_id in seen:
                raise InvalidKnowledgeError(f"{system.system_id} is named twice in a precedent.")
            seen.add(system.system_id)
        match self.decision:
            case PrecedentDecision.ACCEPTED:
                if self.verdict is None or self.verdict != self.suggested_verdict:
                    raise InvalidKnowledgeError("An accepted verdict is the suggested one.")
            case PrecedentDecision.OVERRIDDEN:
                if self.verdict is None or self.verdict == self.suggested_verdict:
                    raise InvalidKnowledgeError(
                        "An overridden verdict is another verdict than the suggested one."
                    )
            case PrecedentDecision.UNKNOWN:
                if self.verdict is not None:
                    raise InvalidKnowledgeError("A verdict left unknown has no verdict.")

    @property
    def decided(self) -> bool:
        """Whether a reviewer gave a verdict the lane can show as an example."""
        return self.verdict is not None

    def replaces(self, known: Precedent) -> bool:
        """Whether this decision supersedes the one kept: decided later, or the same moment
        sent again with other content (a corrected delivery)."""
        return self.decided_at > known.decided_at or (
            self.decided_at == known.decided_at and self.content() != known.content()
        )

    def content(self) -> tuple[object, ...]:
        """Everything but when it was received."""
        return (
            self.requirement_id,
            self.version,
            self.release_id,
            self.text,
            self.suggested_verdict,
            self.verdict,
            self.decision,
            self.offering_id,
            self.concept_ids,
            self.systems,
            self.decided_at,
        )


@dataclass(frozen=True)
class ConceptOverrides:
    concept_id: str
    decided: int
    overridden: int


@dataclass(frozen=True)
class PrecedentSummary:
    """How reviewers decided the verdicts suggested on one release."""

    release_id: str
    accepted: int
    overridden: int
    unknown: int
    last_decided_at: datetime | None
    # Per needed concept, most overridden first and, among equals, the one decided least
    # often (the higher rate); only concepts some decision needed.
    concepts: tuple[ConceptOverrides, ...] = ()

    @property
    def decided(self) -> int:
        return self.accepted + self.overridden

    @property
    def total(self) -> int:
        return self.decided + self.unknown

    @property
    def override_rate(self) -> float | None:
        """Overridden among the suggestions a reviewer decided; None before any was."""
        return self.overridden / self.decided if self.decided else None


def summarise(release_id: str, precedents: Iterable[Precedent]) -> PrecedentSummary:
    """Count one release's precedents, and the overrides per concept they needed."""
    mine = [item for item in precedents if item.release_id == release_id]
    per_concept: dict[str, list[int]] = {}
    for item in mine:
        if not item.decided:
            continue
        for concept_id in item.concept_ids:
            counts = per_concept.setdefault(concept_id, [0, 0])
            counts[0] += 1
            counts[1] += item.decision is PrecedentDecision.OVERRIDDEN
    return PrecedentSummary(
        release_id=release_id,
        accepted=sum(item.decision is PrecedentDecision.ACCEPTED for item in mine),
        overridden=sum(item.decision is PrecedentDecision.OVERRIDDEN for item in mine),
        unknown=sum(item.decision is PrecedentDecision.UNKNOWN for item in mine),
        last_decided_at=max((item.decided_at for item in mine), default=None),
        concepts=tuple(
            ConceptOverrides(concept_id, decided, overridden)
            for concept_id, (decided, overridden) in sorted(
                per_concept.items(), key=lambda item: (-item[1][1], item[1][0], item[0])
            )
        ),
    )
