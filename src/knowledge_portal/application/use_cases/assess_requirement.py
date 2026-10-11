"""Assess a whole requirement against one pinned release (ontology plan Phase 3, ADR-0114).

1. Read the requirement as facets (a model, or the fake), against the release's lists.
2. Link each need to concepts: a shortlist by label, named component and concept index,
   from which the reader picks.
3. Fit the offering in question and give the rules' verdict, with the gaps.
4. With no verdict, stop and ask: the questions' answers come from the catalogue.
5. Walk the catalogue from the concepts to the systems (graph lane), find the nearest
   decided requirements (precedent lane), and fetch the passages about each facet,
   reranked and within each lane's budget (passage lane).
6. The verdict reasoner weighs the rules' verdict against that evidence, with the
   precedents as worked examples, and selects the systems, each with quotes from it.
7. Add who owns each impacted capability, the staffing gaps and what the verdict proposes.

The precedent lane and the reranker are ontology plan Phase 5.
"""

from __future__ import annotations

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceError,
    ArchitectureEvidenceIndexPort,
)
from knowledge_portal.application.ports.organisation_repository import (
    OrganisationRepositoryPort,
)
from knowledge_portal.application.ports.passage_reranker import PassageRerankerPort
from knowledge_portal.application.ports.precedents import PrecedentMatch, PrecedentStorePort
from knowledge_portal.application.ports.requirement_assessment import (
    ArchitectureAssessment,
    AssessedPrecedent,
    AssessedSystem,
    AssessmentGap,
    AssessmentProposal,
    AssessmentQuery,
    AssessmentQuestion,
    CapabilityOwners,
    ConceptCoverage,
    ConceptOption,
    GapKind,
    LinkedConcept,
    LinkedFacet,
    ProposedComponent,
    QuestionOption,
    RequirementAssessmentPort,
    RequirementReaderPort,
    SeatReference,
    VerdictContext,
    VerdictReasonerPort,
)
from knowledge_portal.application.use_cases.assessment_lanes import (
    catalogue_terms,
    excluded_concepts,
    graph_lane,
    new_family,
    offering_fit,
    order_type_id,
    passage_lane,
    precedent_candidates,
    precedent_lane,
    shortlist,
)
from knowledge_portal.application.use_cases.index_links import concept_path
from knowledge_portal.domain.architecture.assessment import (
    Facet,
    FacetKind,
    PathKind,
    SystemRole,
)
from knowledge_portal.domain.architecture.entities import OrganisationReference
from knowledge_portal.domain.architecture.impact_graph import realised_nowhere, realisers
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeConflictError,
    KnowledgeReleaseStatus,
)
from knowledge_portal.domain.architecture.verdicts import (
    OfferingFit,
    ProductVerdict,
    decide_verdict,
)
from knowledge_portal.domain.organisation.catalogue import (
    OrganisationCatalogue,
    OrganisationNotFoundError,
)

MAX_OPTIONS = 8
# The release built from the packaged reference YAML has no catalogue to walk.
REFERENCE_RELEASE = "smb-source-reference-v1"


class AssessRequirement(RequirementAssessmentPort):
    def __init__(
        self,
        repository: ArchitectureKnowledgeRepositoryPort,
        index: ArchitectureEvidenceIndexPort,
        reader: RequirementReaderPort,
        reasoner: VerdictReasonerPort,
        organisation: OrganisationRepositoryPort,
        reranker: PassageRerankerPort,
        precedents: PrecedentStorePort,
    ) -> None:
        self._repository = repository
        self._index = index
        self._reader = reader
        self._reasoner = reasoner
        self._organisation = organisation
        self._reranker = reranker
        self._precedents = precedents

    def assess(self, query: AssessmentQuery) -> ArchitectureAssessment:
        release = self._release(query.release_id)
        index_id = release.index_id or release.id
        text = "\n".join(item.strip() for item in query.text if item.strip())
        facets = self._reader.facets(text, catalogue_terms(release)) if text else ()
        linked = self._link(release, index_id, facets)
        excluded = excluded_concepts(release, facets)
        needed = frozenset(
            concept.concept_id
            for facet in linked
            for concept in facet.concepts
            if concept.concept_id not in excluded
        )
        fit = offering_fit(release, needed, facets)
        gaps = realised_nowhere(release, needed)
        rule = decide_verdict(needed, gaps, fit, new_family(facets))
        coverage = _coverage(release, linked, needed, fit)
        capability_gaps = tuple(
            AssessmentGap(
                GapKind.CAPABILITY,
                item.concept_id,
                item.label,
                "No system in the release realises it.",
            )
            for item in coverage
            if item.concept_id in gaps
        )
        nearest = precedent_lane(self._precedents, self._index, text, needed, query.requirement_id)
        common = {
            "precedents": tuple(
                _precedent(release, needed, match, verdict, score)
                for match, score in nearest
                if (verdict := match.precedent.verdict) is not None
            ),
            "reranker_model": self._reranker.model,
            "knowledge_version": release.id,
            "facets": linked,
            "coverage": coverage,
            "offering_id": fit.offering_id if fit else None,
            "rule_verdict": rule.verdict,
            "reader_model": self._reader.model,
            "embedding_model": self._index.embedding_model,
            "index_revision": release.built_revision,
        }
        if rule.verdict is None:
            return ArchitectureAssessment(
                verdict=None,
                verdict_reason=rule.reason,
                proposal=None,
                systems=(),
                gaps=capability_gaps,
                questions=self._questions(release, index_id, text, linked, fit),
                **common,  # type: ignore[arg-type]
            )
        candidates = graph_lane(
            release,
            tuple(
                facet
                for facet in linked
                if facet.kind is not FacetKind.NEED
                or all(item.concept_id not in excluded for item in facet.concepts)
            ),
            fit.offering_id if fit else None,
            text,
            query.declared_systems,
        )
        examples = tuple(match for match, _ in nearest)
        candidates = (
            *candidates,
            *precedent_candidates(
                release, examples, fit.offering_id if fit else None, needed, candidates
            ),
        )
        evidence = passage_lane(self._index, self._reranker, index_id, linked, candidates)
        decision = self._reasoner.decide(
            VerdictContext(text, release, linked, rule, candidates, evidence, examples)
        )
        offerings = {item.id: item for item in release.products}
        if decision.offering_id is not None and decision.offering_id not in offerings:
            raise ArchitectureEvidenceError("The verdict named an offering outside the release.")
        by_candidate = {item.system_id: item for item in candidates}
        names = {item.id: item.name for item in release.systems}
        systems = tuple(
            AssessedSystem(
                item.system_id,
                names[item.system_id],
                by_candidate[item.system_id].role
                if item.system_id in by_candidate
                else SystemRole.SUPPORTING,
                item.change_type,
                by_candidate[item.system_id].paths if item.system_id in by_candidate else (),
            )
            for item in decision.systems
            if item.system_id in names
        )
        catalogue = self._organisation.load()
        owners = _owners(catalogue, systems)
        staffing = tuple(
            AssessmentGap(
                GapKind.STAFFING,
                item.concept_id,
                _label(release, item.concept_id),
                "No one in a squad is on this system for this capability.",
                item.system_id,
            )
            for item in owners
            if not any(seat.person_id for seat in item.seats)
        )
        offering_id = decision.offering_id if decision.verdict else None
        products = tuple(
            item
            for item in sorted(catalogue.products, key=lambda item: item.name.casefold())
            if offering_id is not None and offering_id in item.offering_ids
        )
        streams = {item.value_stream_id for item in products}
        return ArchitectureAssessment(
            verdict=decision.verdict,
            verdict_reason=decision.reason,
            proposal=_proposal(release, decision.verdict, offering_id, fit, needed, facets),
            systems=systems,
            gaps=(*capability_gaps, *staffing),
            questions=(),
            owners=owners,
            offering_products=tuple(OrganisationReference(item.id, item.name) for item in products),
            offering_value_streams=tuple(
                OrganisationReference(item.id, item.name)
                for item in sorted(catalogue.value_streams, key=lambda item: item.name.casefold())
                if item.id in streams
            ),
            citations=tuple(
                dict.fromkeys(citation for item in decision.systems for citation in item.citations)
            ),
            uncertainty=decision.uncertainty,
            model=self._reasoner.model,
            **common,  # type: ignore[arg-type]
        )

    def _release(self, release_id: str | None) -> ArchitectureKnowledge:
        release = self._repository.get(release_id) if release_id else self._repository.active()
        if release is None or release.status is not KnowledgeReleaseStatus.PUBLISHED:
            raise KnowledgeConflictError("The selected architecture release is unavailable.")
        if release.id == REFERENCE_RELEASE:
            raise KnowledgeConflictError(
                "The packaged reference release cannot be assessed; publish a catalogue release."
            )
        if release.built_revision != release.revision:
            raise KnowledgeConflictError("The published release has no complete evidence index.")
        if not self._index.reads(release.index_profile):
            raise KnowledgeConflictError(
                "The architecture embedding profile changed; rebuild a draft."
            )
        return release

    def _link(
        self, release: ArchitectureKnowledge, index_id: str, facets: tuple[Facet, ...]
    ) -> tuple[LinkedFacet, ...]:
        needs = tuple(item for item in facets if item.kind is FacetKind.NEED)
        shortlists = tuple(shortlist(release, self._index, index_id, item) for item in needs)
        picks = self._reader.pick(needs, shortlists) if any(shortlists) else ()
        chosen: dict[int, list[LinkedConcept]] = {}
        for pick in picks:
            options: tuple[ConceptOption, ...] = (
                shortlists[pick.need] if 0 <= pick.need < len(needs) else ()
            )
            option = next((item for item in options if item.concept_id == pick.concept_id), None)
            if option is None:
                raise ArchitectureEvidenceError("The reader picked a concept off its shortlist.")
            picked = chosen.setdefault(pick.need, [])
            if all(item.concept_id != option.concept_id for item in picked):
                picked.append(
                    LinkedConcept(option.concept_id, option.label, option.path, pick.weak)
                )
        linked: list[LinkedFacet] = []
        position = 0
        for facet in facets:
            concepts: tuple[LinkedConcept, ...] = ()
            if facet.kind is FacetKind.NEED:
                concepts = tuple(chosen.get(position, ()))
                position += 1
            linked.append(LinkedFacet(facet.kind, facet.text, facet.quote, facet.ref_id, concepts))
        return tuple(linked)

    def _questions(
        self,
        release: ArchitectureKnowledge,
        index_id: str,
        text: str,
        facets: tuple[LinkedFacet, ...],
        fit: OfferingFit | None,
    ) -> tuple[AssessmentQuestion, ...]:
        """What to ask before a verdict: the offering, the capability, then the order."""
        questions: list[AssessmentQuestion] = []
        offering = next(
            (item for item in release.products if fit and item.id == fit.offering_id), None
        )
        if fit is None or not fit.named:
            questions.append(
                AssessmentQuestion(
                    FacetKind.OFFERING,
                    "Which offering does this change, or is it for a new one?",
                    (
                        *(QuestionOption(item.name, item.id) for item in release.products),
                        QuestionOption("A new offering"),
                    ),
                )
            )
        if not any(facet.concepts for facet in facets):
            suggested = (
                [
                    item.concept_id
                    for item in self._index.match_concepts(index_id, text, MAX_OPTIONS)
                ]
                if text
                else []
            )
            if not suggested and offering is not None:
                suggested = [
                    concept for part in offering.components for concept in part.capability_ids
                ]
            if not suggested:
                suggested = [
                    item.id
                    for item in sorted(
                        release.business_capabilities, key=lambda item: item.pref_label.casefold()
                    )
                ]
            ids = list(dict.fromkeys(suggested))[:MAX_OPTIONS]
            if ids:
                questions.append(
                    AssessmentQuestion(
                        FacetKind.NEED,
                        "Which capability does it need?",
                        tuple(QuestionOption(_label(release, item), item) for item in ids),
                    )
                )
        if (
            offering is not None
            and fit is not None
            and fit.named
            and offering.order_types
            and not any(facet.kind is FacetKind.ORDER_TYPE for facet in facets)
        ):
            questions.append(
                AssessmentQuestion(
                    FacetKind.ORDER_TYPE,
                    f"Which {offering.name} order does it change?",
                    tuple(
                        QuestionOption(item.name, order_type_id(offering, item.code))
                        for item in offering.order_types[: MAX_OPTIONS * 2]
                    ),
                )
            )
        return tuple(questions)


def _precedent(
    release: ArchitectureKnowledge,
    needed: frozenset[str],
    match: PrecedentMatch,
    verdict: ProductVerdict,
    score: float,
) -> AssessedPrecedent:
    precedent = match.precedent
    systems = {item.id for item in release.systems}
    return AssessedPrecedent(
        precedent_id=precedent.id,
        requirement_id=precedent.requirement_id,
        release_id=precedent.release_id,
        verdict=verdict,
        decision=precedent.decision,
        offering_id=precedent.offering_id,
        score=round(score, 4),
        system_ids=tuple(item.system_id for item in precedent.systems if item.system_id in systems),
        shared_concept_ids=tuple(item for item in precedent.concept_ids if item in needed),
    )


def _label(release: ArchitectureKnowledge, concept_id: str) -> str:
    return next(
        (item.pref_label for item in release.business_capabilities if item.id == concept_id),
        concept_id,
    )


def _coverage(
    release: ArchitectureKnowledge,
    facets: tuple[LinkedFacet, ...],
    needed: frozenset[str],
    fit: OfferingFit | None,
) -> tuple[ConceptCoverage, ...]:
    ordered = dict.fromkeys(
        concept.concept_id
        for facet in facets
        for concept in facet.concepts
        if concept.concept_id in needed
    )
    return tuple(
        ConceptCoverage(
            concept_id,
            _label(release, concept_id),
            concept_path(release, concept_id),
            tuple(
                offering.id
                for offering in release.products
                if any(concept_id in part.capability_ids for part in offering.components)
            ),
            tuple(dict.fromkeys(item.system_id for item in realisers(release, concept_id))),
            fit is not None and concept_id in fit.covered,
        )
        for concept_id in ordered
    )


def _owners(
    catalogue: OrganisationCatalogue, systems: tuple[AssessedSystem, ...]
) -> tuple[CapabilityOwners, ...]:
    """For each primary system, the owners of each capability a path reaches it by."""
    found: list[CapabilityOwners] = []
    for system in systems:
        if system.role is not SystemRole.PRIMARY:
            continue
        concepts = dict.fromkeys(
            step.id for path in system.paths for step in path if step.kind is PathKind.CONCEPT
        )
        for concept_id in concepts:
            ownership = catalogue.ownership(system.id, concept_id)
            seats = []
            for seat in ownership.seats:
                person = seat.resource.person_id
                try:
                    name = catalogue.person(person).name if person else None
                except OrganisationNotFoundError:
                    name = None
                seats.append(
                    SeatReference(
                        seat.squad_id,
                        seat.resource.role.value,
                        person,
                        name,
                        seat.resource.capability_id == concept_id,
                    )
                )
            found.append(
                CapabilityOwners(
                    concept_id,
                    system.id,
                    tuple(OrganisationReference(item.id, item.name) for item in ownership.squads),
                    tuple(
                        OrganisationReference(item.id, item.name)
                        for item in ownership.value_streams
                    ),
                    tuple(seats),
                )
            )
    return tuple(found)


def _proposal(
    release: ArchitectureKnowledge,
    verdict: ProductVerdict | None,
    offering_id: str | None,
    fit: OfferingFit | None,
    needed: frozenset[str],
    facets: tuple[Facet, ...],
) -> AssessmentProposal | None:
    if verdict is None:
        return None
    offering = next((item for item in release.products if item.id == offering_id), None)
    nearest = offering or next(
        (item for item in release.products if fit and item.id == fit.offering_id), None
    )
    components = tuple(
        ProposedComponent(item.id, part.id, part.name)
        for item in release.products
        for part in item.components
        if needed & set(part.capability_ids) and (offering is None or item.id == offering.id)
    )
    orders = {item.ref_id for item in facets if item.kind is FacetKind.ORDER_TYPE}
    journeys = tuple(
        item.id
        for item in release.journeys
        if offering is not None
        and item.product_id == offering.id
        and item.order_type_code is not None
        and order_type_id(offering, item.order_type_code) in orders
    )
    match verdict:
        case ProductVerdict.CHANGE_EXISTING_OFFERING if offering is not None:
            return AssessmentProposal(
                f"Change {offering.name}: its components and the journeys of the orders it names.",
                offering.id,
                components=components,
                journey_ids=journeys,
            )
        case ProductVerdict.NEW_PLAN if offering is not None:
            return AssessmentProposal(
                f"A new plan on {offering.name}.",
                offering.id,
                new_values=fit.new_values if fit else (),
                journey_ids=journeys,
            )
        case ProductVerdict.NEW_OFFERING_IN_FAMILY:
            return AssessmentProposal(
                "A new offering in the family of the closest one, from components that exist."
                if nearest
                else "A new offering, from components that exist.",
                portfolio_node_id=nearest.portfolio_node_id if nearest else None,
                components=components,
            )
        case _:
            return AssessmentProposal(
                "A new product line: the capabilities it needs that nothing realises go to "
                "architecture review.",
            )
