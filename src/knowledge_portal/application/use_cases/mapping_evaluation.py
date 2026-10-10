"""Score the impact mapper against a labelled golden set (ontology plan, Phase 0).

The golden set names, for each requirement, the product verdict, the offering, the systems a
reviewer expects to change and the capability concepts it needs. Every later phase of the
plan is measured here against the Phase 0 baseline: with fake models in CI, to catch
regressions, and with the configured models by hand, before a prompt, model or threshold
changes.

What is scored:
- system precision and recall, over all cases together;
- verdict accuracy, a case with no verdict counting as right only when none was given, and
  the false changes: new offerings, new lines and vague cases called a change to an
  existing offering;
- offering accuracy, over the cases labelled with an offering;
- concept-linking recall, once the mapper returns concepts (not measured before then);
- citation faithfulness: each cited quote must be found in the passage it cites.

The catalogue the golden set was labelled against is published into a throwaway release first,
so the scores never depend on what a live portal holds.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.architecture_knowledge import (
    ArchitectureKnowledgePort,
    ArchitectureQuery,
)
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceError,
    EvidenceChunk,
)
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.requirement_assessment import (
    AssessmentQuery,
    RequirementAssessmentPort,
)
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    KnowledgeNotFoundError,
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.entities import ArchitectureCitation
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.verdicts import ProductVerdict

EVALUATOR = Actor("golden-set-evaluation", frozenset({"knowledge_maintainer"}))


@dataclass(frozen=True)
class GoldenCase:
    """One labelled requirement. A case with no verdict expects questions instead."""

    id: str
    text: str
    verdict: ProductVerdict | None
    offering_id: str | None
    system_ids: frozenset[str]
    concept_ids: frozenset[str]
    missing_facets: tuple[str, ...] = ()


@dataclass(frozen=True)
class GoldenSet:
    version: int
    catalogue_version: str
    cases: tuple[GoldenCase, ...]


@dataclass(frozen=True)
class MappingPrediction:
    """What a mapper said about one requirement.

    `concept_ids` is None while the mapper returns no concepts at all, so concept recall is
    reported as not measured rather than as zero.
    """

    system_ids: frozenset[str]
    verdict: ProductVerdict | None
    offering_id: str | None
    concept_ids: frozenset[str] | None
    citations: tuple[ArchitectureCitation, ...]


class ImpactMapperPort(Protocol):
    """The mapper under evaluation, asked about one requirement against one release."""

    @property
    def name(self) -> str: ...

    def predict(self, text: str, release_id: str) -> MappingPrediction: ...


class PublishedEvidencePort(Protocol):
    def published_evidence(self, release_id: str, chunk_id: str) -> EvidenceChunk: ...


class MatchedImpact(ImpactMapperPort):
    """Today's mapper: `/internal/architecture/match` as requirement-portal calls it.

    It gives no verdict. Its nearest stand-in is the offering the text names
    (`product_contexts`, ADR-0097): naming one is read as a change to that offering, naming
    none as no verdict. It returns no concepts.
    """

    def __init__(self, knowledge: ArchitectureKnowledgePort) -> None:
        self._knowledge = knowledge

    @property
    def name(self) -> str:
        return "match"

    def predict(self, text: str, release_id: str) -> MappingPrediction:
        match = self._knowledge.match(ArchitectureQuery((text,), release_id=release_id))
        offering = match.product_contexts[0].product_id if match.product_contexts else None
        return MappingPrediction(
            system_ids=frozenset(item.id for item in match.systems if item.catalogued),
            verdict=ProductVerdict.CHANGE_EXISTING_OFFERING if offering else None,
            offering_id=offering,
            concept_ids=None,
            citations=match.citations,
        )


class AssessedImpact(ImpactMapperPort):
    """The assessment (ontology plan Phase 3): `/internal/architecture/assess`.

    Its verdict and its offering, when the verdict is about one, are the assessment's own;
    its concepts are every concept a need was linked to.
    """

    def __init__(self, assessment: RequirementAssessmentPort) -> None:
        self._assessment = assessment

    @property
    def name(self) -> str:
        return "assess"

    def predict(self, text: str, release_id: str) -> MappingPrediction:
        result = self._assessment.assess(AssessmentQuery((text,), release_id=release_id))
        verdict = result.verdict
        return MappingPrediction(
            system_ids=frozenset(item.id for item in result.systems),
            verdict=verdict,
            offering_id=result.offering_id if verdict and verdict.names_an_offering else None,
            concept_ids=frozenset(
                concept.concept_id for facet in result.facets for concept in facet.concepts
            ),
            citations=result.citations,
        )


@dataclass(frozen=True)
class CaseResult:
    case: GoldenCase
    prediction: MappingPrediction | None
    # Why the mapper gave no answer for this case, when it failed.
    failure: str | None
    citations_checked: int
    citations_faithful: int

    @property
    def predicted_systems(self) -> frozenset[str]:
        return self.prediction.system_ids if self.prediction else frozenset()

    @property
    def true_positives(self) -> int:
        return len(self.predicted_systems & self.case.system_ids)

    @property
    def false_positives(self) -> int:
        return len(self.predicted_systems - self.case.system_ids)

    @property
    def false_negatives(self) -> int:
        return len(self.case.system_ids - self.predicted_systems)

    @property
    def verdict_correct(self) -> bool:
        predicted = self.prediction.verdict if self.prediction else None
        return predicted is self.case.verdict

    @property
    def false_change(self) -> bool:
        """It called a change to an existing offering (or a new plan on one) what is a new
        offering, a new product line or too vague to place: the error the owner's verdict
        gate rules out."""
        predicted = self.prediction.verdict if self.prediction else None
        expected = self.case.verdict
        return (
            predicted is not None
            and predicted.names_an_offering
            and not (expected is not None and expected.names_an_offering)
        )

    @property
    def offering_correct(self) -> bool:
        predicted = self.prediction.offering_id if self.prediction else None
        return predicted == self.case.offering_id

    @property
    def concepts_found(self) -> int | None:
        if self.prediction is None or self.prediction.concept_ids is None:
            return None
        return len(self.prediction.concept_ids & self.case.concept_ids)


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


@dataclass(frozen=True)
class EvaluationReport:
    golden_set_version: int
    catalogue_version: str
    release_id: str
    mapper: str
    model: str
    results: tuple[CaseResult, ...]

    @property
    def failures(self) -> int:
        return sum(1 for item in self.results if item.failure is not None)

    @property
    def system_precision(self) -> float | None:
        found = sum(item.true_positives for item in self.results)
        return _ratio(found, found + sum(item.false_positives for item in self.results))

    @property
    def system_recall(self) -> float | None:
        found = sum(item.true_positives for item in self.results)
        return _ratio(found, found + sum(item.false_negatives for item in self.results))

    @property
    def verdict_accuracy(self) -> float | None:
        return _ratio(sum(item.verdict_correct for item in self.results), len(self.results))

    @property
    def false_changes(self) -> int:
        return sum(item.false_change for item in self.results)

    @property
    def offering_accuracy(self) -> float | None:
        labelled = [item for item in self.results if item.case.offering_id is not None]
        return _ratio(sum(item.offering_correct for item in labelled), len(labelled))

    @property
    def concept_recall(self) -> float | None:
        """None until every answered case returns concepts."""
        answered = [item for item in self.results if item.prediction is not None]
        found = [item.concepts_found for item in answered]
        if not answered or any(value is None for value in found):
            return None
        return _ratio(
            sum(value or 0 for value in found),
            sum(len(item.case.concept_ids) for item in answered),
        )

    @property
    def citation_faithfulness(self) -> float | None:
        return _ratio(
            sum(item.citations_faithful for item in self.results),
            sum(item.citations_checked for item in self.results),
        )


def _folded(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


class EvaluateImpactMapping:
    """Run the mapper over every golden case and score what it said."""

    def __init__(
        self, mapper: ImpactMapperPort, evidence: PublishedEvidencePort, model: str
    ) -> None:
        self._mapper = mapper
        self._evidence = evidence
        self._model = model

    def execute(
        self,
        golden: GoldenSet,
        release_id: str,
        progress: Callable[[CaseResult], None] = lambda _: None,
    ) -> EvaluationReport:
        results: list[CaseResult] = []
        for case in golden.cases:
            result = self._evaluate(case, release_id)
            progress(result)
            results.append(result)
        return EvaluationReport(
            golden.version,
            golden.catalogue_version,
            release_id,
            self._mapper.name,
            self._model,
            tuple(results),
        )

    def _evaluate(self, case: GoldenCase, release_id: str) -> CaseResult:
        try:
            prediction = self._mapper.predict(case.text, release_id)
        except ArchitectureEvidenceError as exc:
            # A provider that answers unusably fails this case, not the whole run; the
            # report counts it as a case with no answer.
            return CaseResult(case, None, str(exc), 0, 0)
        faithful = sum(self._faithful(release_id, citation) for citation in prediction.citations)
        return CaseResult(case, prediction, None, len(prediction.citations), faithful)

    def _faithful(self, release_id: str, citation: ArchitectureCitation) -> bool:
        try:
            chunk = self._evidence.published_evidence(release_id, citation.chunk_id)
        except KnowledgeNotFoundError:
            return False
        return _folded(citation.quote) in _folded(chunk.text)


class PublishCatalogueForEvaluation:
    """Publish a catalogue file as a release of its own, indexed, for the golden set to use.

    It never activates the release, so mapping without a pinned release is unchanged.
    """

    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        build_index: BuildArchitectureIndex,
        clock: ClockPort,
    ) -> None:
        self._knowledge = knowledge
        self._build_index = build_index
        self._clock = clock

    def execute(self, filename: str, content: bytes) -> ArchitectureKnowledge:
        draft = self._knowledge.create_draft(EVALUATOR, "Golden set evaluation")
        imported = self._knowledge.apply_file_import(
            draft.id, draft.revision, filename, content, EVALUATOR
        )
        built = self._build_index.execute(
            imported.id, imported.revision, EVALUATOR.id, fence=lambda: None
        )
        return self._knowledge.publish(
            built.id, built.revision, EVALUATOR, self._clock.now(), "Golden set evaluation"
        )


def unknown_ids(golden: GoldenSet, release: ArchitectureKnowledge) -> Sequence[str]:
    """Systems and offerings the golden set names that the release does not hold."""
    systems = {item.id for item in release.systems}
    offerings = {item.id for item in release.products}
    missing: list[str] = []
    for case in golden.cases:
        missing.extend(f"{case.id}: system {item}" for item in sorted(case.system_ids - systems))
        if case.offering_id is not None and case.offering_id not in offerings:
            missing.append(f"{case.id}: offering {case.offering_id}")
    return missing
