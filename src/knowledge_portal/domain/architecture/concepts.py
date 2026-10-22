"""Business capability concepts: what the business needs done, as a curated scheme (ADR-0114).

A concept is SKOS-style (``skos.py``, shared with vocabulary terms): a preferred label,
other labels people use, a definition, a broader concept, and matches in outside schemes.
The capability domains are the scheme's top levels: a top concept names the domain it
sits in, and narrower concepts inherit it.

A system's capability and an offering's component are linked to concepts only
by a maintainer, or by a suggestion a maintainer accepts. A linked concept may
then select the systems behind it; an unlinked one never does.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from knowledge_portal.domain.architecture.deprecation import check_retirement
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
from knowledge_portal.domain.architecture.skos import (
    check_entry,
    check_tree,
    label_key,
    label_words,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source

__all__ = [
    "BusinessCapability",
    "CapabilityRef",
    "check_concepts",
    "check_link",
    "concept_domain",
    "concept_id_for",
    "label_key",
    "label_words",
    "labels_in",
]

# Below a capability domain; a deeper scheme is a sign the concepts describe systems.
MAX_CONCEPT_DEPTH = 3
CONCEPT_ID_PREFIX = "cap-"


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
    # Retired, with the concept of the same type that takes its place if any (ADR-0121):
    # it stays readable everywhere but selection and matching leave it out.
    deprecated: bool = False
    replaced_by: str | None = None
    # The accepted suggestions that created or extended it, oldest first (ADR-0120).
    accepted: tuple[AcceptedFrom, ...] = ()
    # Outside references near enough to read across, though not the same (SKOS closeMatch),
    # such as a TM Forum ODA component beside the ODA capability it matches exactly.
    close_match: tuple[str, ...] = ()

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
        check_retirement(self, self.pref_label)
        check_entry(self)
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
    by_id = check_tree(
        concepts,
        kind="concept",
        max_depth=MAX_CONCEPT_DEPTH,
        outside=lambda _: "a concept in the catalogue",
    )
    domains = set(domain_ids)
    for concept in concepts:
        if concept.domain_id is not None and concept.domain_id not in domains:
            raise InvalidKnowledgeError(
                f"{concept.pref_label} sits in domain {concept.domain_id!r}, which is not in "
                "the catalogue."
            )
    return by_id


def concept_domain(concepts: dict[str, BusinessCapability], concept_id: str) -> str | None:
    """The domain a concept sits in: its own as a top concept, else its top concept's."""
    current = concepts.get(concept_id)
    seen: set[str] = set()
    while current is not None and current.id not in seen:
        if current.broader_id is None:
            return current.domain_id
        seen.add(current.id)
        current = concepts.get(current.broader_id)
    return None


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
    words = label_words(label)
    base = CONCEPT_ID_PREFIX + "-".join(words) if words else "cap"
    candidate, number = base, 2
    while candidate in used:
        candidate, number = f"{base}-{number}", number + 1
    return candidate


def _contains(words: tuple[str, ...], key: str) -> bool:
    """Whether consecutive words, run together, spell the label key exactly."""
    for start in range(len(words)):
        joined = ""
        for word in words[start:]:
            joined += word
            if joined == key:
                return True
            if len(joined) >= len(key) or not key.startswith(joined):
                break
    return False


def labels_in(text: str, concepts: Iterable[BusinessCapability]) -> tuple[str, ...]:
    """The ids of the concepts one of whose labels the text contains as whole words, in
    order. Labels compare as `label_key` does, so "WiFi" finds "Wi-Fi"; "billings" does
    not find "billing"."""
    words = label_words(text)
    return tuple(
        concept.id
        for concept in concepts
        # A retired concept is never matched again (ADR-0121).
        if not concept.deprecated
        and any(_contains(words, label_key(label)) for label in concept.labels)
    )
