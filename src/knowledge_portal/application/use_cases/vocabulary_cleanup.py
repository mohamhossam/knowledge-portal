"""The vocabulary clean-up as suggestions: existing values mapped onto controlled terms.

One reading of a draft's own catalogue. Each eTOM process, channel kind, component
kind, role and Open API value is proposed as a link to the term it names, or, when no
term names it, as a new term a maintainer decides alone. Nothing is linked until a
maintainer accepts it; a new reading replaces the undecided suggestions of the last.
"""

from __future__ import annotations

from uuid import uuid4

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.catalogue_candidates import (
    CatalogueCandidateRepositoryPort,
    CatalogueReading,
    ExtractionRun,
)
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CatalogueCandidate,
)
from knowledge_portal.domain.architecture.knowledge import (
    KnowledgeConflictError,
    KnowledgeReleaseStatus,
)
from knowledge_portal.domain.architecture.vocabulary_cleanup import TermProposal, propose_terms
from knowledge_portal.domain.architecture.vocabulary_links import VocabularyField

CLEANUP_READER = "vocabulary-cleanup"
CLEANUP_VERSION = "vocabulary-cleanup-v1"

_PLACES = {
    VocabularyField.ACTIVITY_ETOM: ("activity's eTOM process", "activities' eTOM process"),
    VocabularyField.ACTIVITY_ROLE: ("activity's role", "activities' role"),
    VocabularyField.CHANNEL_KIND: ("channel's kind", "channels' kind"),
    VocabularyField.COMPONENT_KIND: ("offering part's kind", "offering parts' kind"),
    VocabularyField.RESPONSIBILITY_ROLE: (
        "responsibility's role",
        "responsibilities' role",
    ),
    VocabularyField.INTEGRATION_OPEN_API: (
        "integration's TMF equivalent",
        "integrations' TMF equivalent",
    ),
}


def _citations(proposal: TermProposal) -> tuple[CandidateCitation, ...]:
    """One per distinct value it covers, saying where and how often it is written."""
    counts: dict[tuple[VocabularyField, str], int] = {}
    for ref in proposal.refs:
        key = (ref.field, ref.value)
        counts[key] = counts.get(key, 0) + 1
    return tuple(
        CandidateCitation(f"Catalogue › {count} {_PLACES[field][0 if count == 1 else 1]}", value)
        for (field, value), count in counts.items()
    )


class CleanUpVocabulary:
    """Maps the values the draft already writes onto its controlled vocabularies."""

    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        candidates: CatalogueCandidateRepositoryPort,
        clock: ClockPort,
    ) -> None:
        self._knowledge = knowledge
        self._candidates = candidates
        self._clock = clock

    def execute(self, release_id: str, actor: Actor) -> ExtractionRun:
        require_maintainer(actor)
        release = self._knowledge.get(release_id)
        if release.status is not KnowledgeReleaseStatus.DRAFT:
            raise KnowledgeConflictError("Suggestions apply to drafts only.")
        now = self._clock.now()
        reading = CatalogueReading.VOCABULARY_CLEANUP
        proposals = propose_terms(release)
        found = tuple(
            CatalogueCandidate(
                uuid4().hex,
                release.id,
                reading.value,
                CandidateContent(
                    CandidateKind.VOCABULARY_TERM,
                    proposal.term.id,
                    term=proposal.term,
                    value_refs=proposal.refs,
                ),
                _citations(proposal),
                CLEANUP_READER,
                CLEANUP_VERSION,
                now,
            )
            for proposal in proposals
        )
        flagged = sum(1 for item in proposals if not item.existing)
        warnings: tuple[str, ...]
        if not found:
            warnings = ("Every vocabulary value in this draft is linked to a term.",)
        elif flagged:
            warnings = (
                f"{flagged} {'value matches' if flagged == 1 else 'values match'} no term "
                "yet; each is suggested as a new term to decide one by one.",
            )
        else:
            warnings = ()
        run = ExtractionRun(
            uuid4().hex,
            release.id,
            reading.value,
            CLEANUP_READER,
            CLEANUP_VERSION,
            len(found),
            warnings,
            now,
            reading=reading,
        )
        self._candidates.replace_proposals(run, found)
        return run
