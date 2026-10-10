"""Persistence boundary for AI-proposed catalogue changes and the runs that made them."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from knowledge_portal.domain.architecture.candidates import CatalogueCandidate


class CatalogueReading(StrEnum):
    """A reading of the draft's own catalogue rather than of a document (ADR-0114).

    Its value stands in for the document version id, so a new reading replaces the
    undecided suggestions of the previous one.
    """

    CONCEPT_BACKFILL = "concept_backfill"
    COMPONENT_LINKS = "component_links"


@dataclass(frozen=True)
class ExtractionRun:
    """One document read by one model; warnings say what it could not cover."""

    id: str
    release_id: str
    document_version_id: str
    model: str
    prompt_version: str
    candidate_count: int
    warnings: tuple[str, ...]
    created_at: datetime
    # The model that looked for existing systems behind unmatched names, if one ran.
    match_model: str | None = None
    match_prompt_version: str | None = None
    # Set when the run read a change request from Requirement AI rather than a document; its
    # ``document_version_id`` then holds the same id (requirement-portal ADR-0101, step 7).
    change_request_id: str | None = None
    # Set when the run read the draft's own catalogue; ``document_version_id`` then holds it.
    reading: CatalogueReading | None = None


class CatalogueCandidateRepositoryPort(Protocol):
    def replace_proposals(
        self, run: ExtractionRun, candidates: tuple[CatalogueCandidate, ...]
    ) -> None:
        """Record a run; its candidates replace undecided ones from the same document."""
        ...

    def runs(self, release_id: str) -> tuple[ExtractionRun, ...]: ...

    def list(self, release_id: str) -> tuple[CatalogueCandidate, ...]: ...

    def get(self, candidate_id: str) -> CatalogueCandidate | None: ...

    def save_decision(self, candidate: CatalogueCandidate) -> None:
        """Store a decision; raises CandidateDecisionConflictError if already decided."""
        ...

    def reopen(self, candidate_id: str) -> None:
        """Undo a decision whose draft change could not be saved."""
        ...
