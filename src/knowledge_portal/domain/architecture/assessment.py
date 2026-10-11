"""The words a requirement assessment speaks in (ontology plan Phase 3, ADR-0114).

An assessment reads a requirement as facets, links each need to capability concepts, and
walks the catalogue from those concepts to the systems that realise them. Every system it
names carries the path that found it, from the facet through the concept to the system,
and a role and a change type a reviewer can check.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, required


class ChangeType(StrEnum):
    """What the requirement does to a system: a closed list."""

    NEW = "new"
    MODIFY = "modify"
    CONFIGURE = "configure"
    RETIRE = "retire"
    # Used as it is: read or called, never changed.
    CONSUME_ONLY = "consume_only"


class SystemRole(StrEnum):
    """Why an assessment names a system."""

    # It realises a capability the requirement needs: through a capability of its own, or
    # as a responsible system of an offering component that requires it.
    PRIMARY = "primary"
    # It is the entry system of a channel the requirement names.
    CHANNEL = "channel"
    # The requirement names it, and no concept reaches it.
    NAMED = "named"
    # Chosen from the evidence alone, with a quote, as mapping does today; or reached
    # through a decided requirement like this one (a precedent, ontology plan Phase 5).
    SUPPORTING = "supporting"
    # It is the system of record for data the requirement changes, or exposes an interface
    # it names (ontology plan Phase 8).
    OWNER = "owner"
    # It consumes an interface that carries what changes, or reads the data: the ripple of
    # a data or contract change, possibly several interfaces away.
    CONSUMER = "consumer"


class FacetKind(StrEnum):
    """One aspect of a requirement, as the review's retrieval design lists them."""

    # Something the business needs done; linked to capability concepts.
    NEED = "need"
    OFFERING = "offering"
    SEGMENT = "segment"
    # A product family or line of business, from the portfolio.
    FAMILY = "family"
    CHANNEL = "channel"
    ORDER_TYPE = "order_type"
    # A characteristic value the requirement sets, such as a speed, a commitment or a price.
    CHARACTERISTIC = "characteristic"
    # Something the requirement leaves out, such as "without SD-WAN".
    EXCLUDED = "excluded"
    # An information entity the requirement reads or changes.
    DATA = "data"
    CHANGE_TYPE = "change_type"
    # An interface the requirement changes or calls, such as an API (ontology plan Phase 8).
    INTERFACE = "interface"


# The facets whose value is a release id (or a change type), never free text alone.
REFERENCED_FACETS = frozenset(
    {
        FacetKind.OFFERING,
        FacetKind.SEGMENT,
        FacetKind.FAMILY,
        FacetKind.CHANNEL,
        FacetKind.ORDER_TYPE,
        FacetKind.CHANGE_TYPE,
        FacetKind.DATA,
        FacetKind.INTERFACE,
    }
)


@dataclass(frozen=True)
class Facet:
    """One facet: a short phrase to search with, the words of the requirement it came from,
    and, for a closed list, the release id it names (None when it names nothing the
    release has, such as a new segment)."""

    kind: FacetKind
    text: str
    quote: str
    ref_id: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "kind", FacetKind(self.kind))
        object.__setattr__(self, "text", required(self.text, "Facet text"))
        object.__setattr__(self, "quote", required(self.quote, "Facet quote"))
        if self.ref_id is not None:
            object.__setattr__(self, "ref_id", required(self.ref_id, "Facet reference"))
        if self.kind is FacetKind.CHANGE_TYPE:
            if self.ref_id is None:
                raise InvalidKnowledgeError("A change-type facet names its change type.")
            object.__setattr__(self, "ref_id", ChangeType(self.ref_id).value)


class PathKind(StrEnum):
    FACET = "facet"
    CONCEPT = "concept"
    OFFERING = "offering"
    COMPONENT = "component"
    CHANNEL = "channel"
    SYSTEM = "system"
    # An information entity and an interface (ontology plan Phase 8).
    ENTITY = "entity"
    INTERFACE = "interface"
    # A CFS, RFS or resource a component is realised as (ontology plan Phase 8).
    REALISATION = "realisation"
    # A decided requirement like this one, by requirement-portal's analysis id (Phase 5).
    PRECEDENT = "precedent"


@dataclass(frozen=True)
class PathStep:
    """One step of the path that found a system, by release id and its label."""

    kind: PathKind
    id: str
    label: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "kind", PathKind(self.kind))
        object.__setattr__(self, "id", required(self.id, "Path step id"))
        object.__setattr__(self, "label", required(self.label, "Path step label"))


_CHANGE_WORDS: tuple[tuple[ChangeType, tuple[str, ...]], ...] = (
    (ChangeType.RETIRE, ("retire", "decommission", "withdraw", "switch off", "sunset")),
    (
        ChangeType.CONFIGURE,
        ("configure", "price", "discount", "tier", "rate plan", "threshold", "parameter"),
    ),
    (ChangeType.CONSUME_ONLY, ("read only", "read-only", "look up", "consume")),
)


def change_type_in(text: str) -> ChangeType:
    """The change type the wording suggests, by the words it uses; modify when none fits.

    A starting point a model or a reviewer refines, never a reading of intent.
    """
    folded = " ".join(re.sub(r"[^\w\s-]+", " ", text.casefold()).split())
    for change, words in _CHANGE_WORDS:
        if any(re.search(rf"(?<![\w-]){re.escape(word)}", folded) for word in words):
            return change
    return ChangeType.MODIFY


_SPEED = re.compile(r"(\d+(?:\.\d+)?)\s*(k|m|g)b(?:it)?/?p?s\b", re.IGNORECASE)


def speeds_in(text: str) -> tuple[float, ...]:
    """Every speed the text states, in Mbps; "1 Gbps" reads as both 1000 and 1024."""
    found: list[float] = []
    for number, unit in _SPEED.findall(text):
        value = float(number)
        match unit.casefold():
            case "k":
                found.append(value / 1000)
            case "m":
                found.append(value)
            case _:
                found.extend((value * 1000, value * 1024))
    return tuple(found)
