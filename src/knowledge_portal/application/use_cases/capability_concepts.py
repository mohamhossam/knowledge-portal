"""Building the capability concept scheme and its links as suggestions (ADR-0114).

Two readings of a draft's own catalogue, each stored as undecided suggestions a
maintainer accepts, edits or rejects like any other:
- the backfill proposes one concept per distinct capability name, covering the
  systems that list it;
- link suggestions ask the configured model which concepts each unlinked offering
  component delivers.

Nothing is linked until a maintainer accepts it. A new reading replaces the
undecided suggestions of the previous one.
"""

from __future__ import annotations

from uuid import uuid4

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.capability_link_suggester import (
    CapabilityLinkSuggesterPort,
    ConceptChoice,
    LinkableComponent,
)
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
    CandidateBasis,
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CatalogueCandidate,
)
from knowledge_portal.domain.architecture.concept_backfill import (
    ConceptProposal,
    propose_concepts,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeConflictError,
    KnowledgeReleaseStatus,
)

BACKFILL_READER = "concept-backfill"
BACKFILL_VERSION = "concept-backfill-v1"
MAX_REASON = 300


def _draft(knowledge: ManageArchitectureKnowledge, release_id: str) -> ArchitectureKnowledge:
    release = knowledge.get(release_id)
    if release.status is not KnowledgeReleaseStatus.DRAFT:
        raise KnowledgeConflictError("Suggestions apply to drafts only.")
    return release


def _backfill_citations(
    proposal: ConceptProposal, release: ArchitectureKnowledge
) -> tuple[CandidateCitation, ...]:
    """Each covered capability, as the catalogue lists it."""
    systems = {item.id: item for item in release.systems}
    citations = []
    for ref in proposal.capabilities:
        system = systems[ref.system_id]
        capability = next(item for item in system.capabilities if item.id == ref.capability_id)
        citations.append(
            CandidateCitation(
                f"Catalogue › {system.name} › capability {capability.id}",
                "; ".join((capability.name, *capability.triggers)),
            )
        )
    return tuple(citations)


class ProposeCapabilityConcepts:
    """The backfill: concepts proposed from the capabilities the draft already lists."""

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
        release = _draft(self._knowledge, release_id)
        now = self._clock.now()
        reading = CatalogueReading.CONCEPT_BACKFILL
        found = tuple(
            CatalogueCandidate(
                uuid4().hex,
                release.id,
                reading.value,
                CandidateContent(
                    CandidateKind.CONCEPT,
                    proposal.concept.id,
                    concept=proposal.concept,
                    capability_refs=proposal.capabilities,
                ),
                _backfill_citations(proposal, release),
                BACKFILL_READER,
                BACKFILL_VERSION,
                now,
            )
            for proposal in propose_concepts(release)
        )
        warnings = (
            ()
            if found
            else (
                "Every capability in this draft is linked to a concept or marked as having none.",
            )
        )
        run = ExtractionRun(
            uuid4().hex,
            release.id,
            reading.value,
            BACKFILL_READER,
            BACKFILL_VERSION,
            len(found),
            warnings,
            now,
            reading=reading,
        )
        self._candidates.replace_proposals(run, found)
        return run


def _choices(release: ArchitectureKnowledge) -> tuple[ConceptChoice, ...]:
    choices = []
    for concept in release.business_capabilities:
        domain = release.concept_domain(concept.id)
        path = [
            *(item.name for item in release.domain_path(domain.id if domain else None)),
            *(item.pref_label for item in release.concept_path(concept.id)),
        ]
        choices.append(
            ConceptChoice(
                concept.id,
                concept.pref_label,
                concept.alt_labels,
                concept.definition,
                " › ".join(path),
            )
        )
    return tuple(choices)


def _unlinked_components(release: ArchitectureKnowledge) -> tuple[LinkableComponent, ...]:
    """Offering components with no concept that nobody has marked as having none."""
    names = {item.id: item.name for item in release.systems}
    return tuple(
        LinkableComponent(
            offering.id,
            offering.name,
            component.id,
            component.name,
            component.description,
            component.kind,
            tuple(
                dict.fromkeys(
                    names.get(item.system_id, item.system_id) for item in component.responsibilities
                )
            ),
        )
        for offering in release.products
        for component in offering.components
        if not component.capability_ids and component.unlinked_reason is None
    )


class SuggestComponentCapabilities:
    """Link suggestions: the configured model reads each unlinked offering component."""

    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        candidates: CatalogueCandidateRepositoryPort,
        suggester: CapabilityLinkSuggesterPort,
        clock: ClockPort,
    ) -> None:
        self._knowledge = knowledge
        self._candidates = candidates
        self._suggester = suggester
        self._clock = clock

    def execute(self, release_id: str, actor: Actor) -> ExtractionRun:
        require_maintainer(actor)
        release = _draft(self._knowledge, release_id)
        components = _unlinked_components(release)
        concepts = _choices(release)
        warnings: list[str] = []
        found: list[CatalogueCandidate] = []
        now = self._clock.now()
        if not concepts:
            warnings.append("This draft has no capability concepts to link components to yet.")
        elif not components:
            warnings.append(
                "Every offering component in this draft is linked to a concept or marked as "
                "having none."
            )
        else:
            result = self._suggester.suggest(components, concepts)
            warnings.extend(result.warnings)
            asked = {(item.offering_id, item.component_id): item for item in components}
            known = {item.id for item in concepts}
            seen: set[tuple[str, str]] = set()
            for suggestion in result.suggestions:
                key = (suggestion.offering_id, suggestion.component_id)
                component = asked.get(key)
                ids = tuple(dict.fromkeys(item for item in suggestion.concept_ids if item in known))
                reason = " ".join(suggestion.reason.split())[:MAX_REASON]
                if component is None or key in seen or not ids or not reason:
                    continue
                seen.add(key)
                found.append(
                    CatalogueCandidate(
                        uuid4().hex,
                        release.id,
                        CatalogueReading.COMPONENT_LINKS.value,
                        CandidateContent(
                            CandidateKind.COMPONENT_LINK,
                            component.offering_id,
                            component_id=component.component_id,
                            concept_ids=ids,
                        ),
                        (
                            CandidateCitation(
                                f"Catalogue › {component.offering_name} › component "
                                f"{component.component_id}",
                                component.description or component.name,
                            ),
                        ),
                        self._suggester.model,
                        self._suggester.prompt_version,
                        now,
                        basis=CandidateBasis.INFERRED,
                        rationale=reason,
                    )
                )
            unanswered = len(components) - len(seen)
            if unanswered:
                warnings.append(
                    f"No concept was suggested for {unanswered} of {len(components)} "
                    "components; link them by hand or mark them as having none."
                )
        run = ExtractionRun(
            uuid4().hex,
            release.id,
            CatalogueReading.COMPONENT_LINKS.value,
            self._suggester.model,
            self._suggester.prompt_version,
            len(found),
            tuple(warnings),
            now,
            reading=CatalogueReading.COMPONENT_LINKS,
        )
        self._candidates.replace_proposals(run, tuple(found))
        return run
