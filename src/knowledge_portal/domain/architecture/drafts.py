"""A drafted offering and the journey that fulfils it (ontology plan Phase 9).

`offering_drafts.draft_offering` builds one for a new-offering verdict; the app that asked
keeps it on the decided product impact and sends it back with the approved backlog, where
it is read into two suggestions, the offering first.
"""

from __future__ import annotations

from dataclasses import dataclass

from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, optional
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.products import ProductOffering


@dataclass(frozen=True)
class OfferingDraft:
    """A drafted offering, the journey that fulfils it, and the offering it starts from."""

    offering: ProductOffering
    journey: Journey | None = None
    based_on: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "based_on", optional(self.based_on, "Nearest offering"))
        if self.journey is not None and self.journey.product_id != self.offering.id:
            raise InvalidKnowledgeError("A drafted journey fulfils the drafted offering.")
