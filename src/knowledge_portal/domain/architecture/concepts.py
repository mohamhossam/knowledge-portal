"""Business capability concepts: what the business needs done, as a curated scheme (ADR-0114).

A concept is SKOS-style: a preferred label, other labels people use, a definition,
and a broader concept. The capability domains are the scheme's top levels: a
top concept names the domain it sits in, and narrower concepts inherit it.

A system's capability and an offering's component are linked to concepts only
by a maintainer, or by a suggestion a maintainer accepts. A linked concept may
then select the systems behind it; an unlinked one never does.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source

# Below a capability domain; a deeper scheme is a sign the concepts describe systems.
MAX_CONCEPT_DEPTH = 3
CONCEPT_ID_PREFIX = "cap-"


def label_key(label: str) -> str:
    """How two labels are compared: their words, ignoring case and punctuation."""
    return " ".join(re.findall(r"\w+", label.casefold()))


@dataclass(frozen=True)
class BusinessCapability:
    """One concept, such as "Managed Wi-Fi access points"."""

    id: str
    pref_label: str
    alt_labels: tuple[str, ...] = ()
    definition: str | None = None
    # The broader concept it narrows; None for a top concept.
    broader_id: str | None = None
    # The capability domain a top concept sits in; None while nobody has placed it.
    domain_id: str | None = None
    # The same concept in an outside scheme, such as a TM Forum ODA capability.
    exact_match: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Concept id"))
        object.__setattr__(self, "pref_label", required(self.pref_label, "Concept label"))
        object.__setattr__(
            self, "alt_labels", tuple(required(item, "Other label") for item in self.alt_labels)
        )
        for field, label in (
            ("definition", "Concept definition"),
            ("broader_id", "Broader concept"),
            ("domain_id", "Concept domain"),
            ("exact_match", "Outside match"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        check_source(self)
        keys = [label_key(item) for item in self.labels]
        if any(not key for key in keys):
            raise InvalidKnowledgeError(f"{self.pref_label}: a label needs a letter or digit.")
        if len(set(keys)) != len(keys):
            raise InvalidKnowledgeError(f"{self.pref_label}: each label must differ from the rest.")
        if self.broader_id == self.id:
            raise InvalidKnowledgeError(f"{self.pref_label} cannot be broader than itself.")
        if self.broader_id is not None and self.domain_id is not None:
            raise InvalidKnowledgeError(
                f"{self.pref_label}: only a top concept names its domain; a narrower one sits "
                "in its broader concept's."
            )

    @property
    def labels(self) -> tuple[str, ...]:
        return (self.pref_label, *self.alt_labels)


@dataclass(frozen=True)
class CapabilityRef:
    """A system's capability, by the system's id and the capability's."""

    system_id: str
    capability_id: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "system_id", required(self.system_id, "System"))
        object.__setattr__(self, "capability_id", required(self.capability_id, "Capability"))


def check_concepts(
    concepts: tuple[BusinessCapability, ...], domain_ids: Iterable[str]
) -> dict[str, BusinessCapability]:
    """Unique ids, each label naming one concept, known broader concepts and domains, no
    cycles, and at most MAX_CONCEPT_DEPTH levels under a domain.

    Returns the concepts by id, for checking what links name.
    """
    by_id = {item.id: item for item in concepts}
    if len(by_id) != len(concepts):
        raise InvalidKnowledgeError("Concept ids must be unique.")
    domains = set(domain_ids)
    owners: dict[str, BusinessCapability] = {}
    for concept in concepts:
        for label in concept.labels:
            owner = owners.setdefault(label_key(label), concept)
            if owner.id != concept.id:
                raise InvalidKnowledgeError(
                    f"{label!r} already names {owner.pref_label}, so it cannot also name "
                    f"{concept.pref_label}. Each label must identify one concept."
                )
        if concept.domain_id is not None and concept.domain_id not in domains:
            raise InvalidKnowledgeError(
                f"{concept.pref_label} sits in domain {concept.domain_id!r}, which is not in "
                "the catalogue."
            )
        if concept.broader_id is not None and concept.broader_id not in by_id:
            raise InvalidKnowledgeError(
                f"{concept.pref_label} narrows {concept.broader_id!r}, which is not a concept "
                "in the catalogue."
            )
        depth, seen, current = 1, {concept.id}, concept
        while current.broader_id is not None:
            current = by_id[current.broader_id]
            if current.id in seen:
                raise InvalidKnowledgeError(f"{concept.pref_label} is narrower than itself.")
            seen.add(current.id)
            depth += 1
        if depth > MAX_CONCEPT_DEPTH:
            raise InvalidKnowledgeError(
                f"Concepts are at most {MAX_CONCEPT_DEPTH} levels deep; {concept.pref_label!r} "
                "is deeper."
            )
    return by_id


def check_link(concept_ids: Iterable[str], unlinked_reason: str | None, where: str) -> None:
    """A link is to concepts, or it says why none fits, never both."""
    ids = tuple(concept_ids)
    if ids and unlinked_reason is not None:
        raise InvalidKnowledgeError(
            f"{where} is linked to a concept, so it cannot also be marked as having none."
        )
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError(f"{where} names one concept more than once.")


def concept_id_for(label: str, taken: Iterable[str]) -> str:
    """A new concept id from its label, such as ``cap-wifi-access-points``, never one taken."""
    used = set(taken)
    base = CONCEPT_ID_PREFIX + "-".join(label_key(label).split()) if label_key(label) else "cap"
    candidate, number = base, 2
    while candidate in used:
        candidate, number = f"{base}-{number}", number + 1
    return candidate
