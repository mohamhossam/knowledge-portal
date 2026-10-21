"""The golden-set evaluations' object graphs: the impact mapper's (ontology plan, Phases 0
and 3) and the reference library's retrieval (RAG review, E1).

They use the configured models, so the same run scores fake models in CI and live ones by
hand, but keep every release, document, index and squad record in memory: an evaluation never
reads or writes the portal's database.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from threading import RLock

from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.observability.metrics import Metrics
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import GoldenSetUnavailableError
from knowledge_portal.application.ports.architecture_jobs import JobProgress, ProgressReport
from knowledge_portal.application.ports.golden_runs import (
    GoldenPrecedents,
    GoldenRunOptions,
    GoldenRunResult,
    GoldenSetInfo,
)
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.assess_requirement import AssessRequirement
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.golden_runs import repetition
from knowledge_portal.application.use_cases.library_evaluation import (
    EvaluateLibraryRetrieval,
    SeedLibraryForEvaluation,
)
from knowledge_portal.application.use_cases.mapping_evaluation import (
    AssessedImpact,
    CaseResult,
    EvaluateImpactMapping,
    EvaluationReport,
    GoldenSet,
    MatchedImpact,
    PublishCatalogueForEvaluation,
    SeedGoldenPrecedents,
    unknown_ids,
)
from knowledge_portal.application.use_cases.precedents import RecordPrecedent
from knowledge_portal.application.use_cases.reference_knowledge import (
    ReferenceKnowledge,
    StructureAwareChunks,
)
from knowledge_portal.application.use_cases.resolve_architecture_knowledge import (
    ResolveArchitectureKnowledge,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.golden_floors_file import (
    GoldenFloorsFileError,
    read_golden_floors,
)
from knowledge_portal.infrastructure.architecture.golden_set_file import (
    GoldenSetFileError,
    read_golden_set,
)
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.yaml_knowledge import (
    YamlArchitectureKnowledge,
    default_knowledge_path,
)
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.document_library import InMemoryDocumentLibrary
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_organisation import (
    InMemoryOrganisationRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_precedents import InMemoryPrecedents
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from knowledge_portal.infrastructure.persistence.reference_index import (
    ApproximateTokenCounter,
    InMemoryReferenceIndex,
)
from knowledge_portal.interfaces.api.composition.architecture import (
    build_architecture_retrieval,
)
from knowledge_portal.interfaces.api.composition.llm import build_llm_adapters


@dataclass(frozen=True)
class MappingEvaluation:
    publish: PublishCatalogueForEvaluation
    # The assessment (Phase 3) by default; today's per-item match on request.
    evaluate: EvaluateImpactMapping
    evaluate_match: EvaluateImpactMapping
    # Keeps the golden cases as accepted verdicts, for the leave-one-out run (Phase 5).
    seed_precedents: SeedGoldenPrecedents
    # Releases the model clients the run shares.
    close: Callable[[], None]


def build_mapping_evaluation(settings: Settings, clock: ClockPort) -> MappingEvaluation:
    llm = build_llm_adapters(settings, Metrics())
    retrieval = build_architecture_retrieval(llm.knowledge_embedding)
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    index = InMemoryEvidenceIndex(
        retrieval.embeddings, retrieval.tokenizer, settings.architecture_index_version
    )
    manage = ManageArchitectureKnowledge(
        repository,
        CatalogueFileAdapter(),
        index,
        settings.document_max_file_bytes,
        OfflineDocumentScanner(),
    )
    build_index = BuildArchitectureIndex(
        manage,
        index,
        InMemoryDocumentStorage(),
        LocatedDocumentExtractor(SafeDocumentTextExtractor()),
        retrieval.tokenizer,
    )
    organisation = InMemoryOrganisationRepository(clock)
    knowledge = ResolveArchitectureKnowledge(
        repository,
        index,
        llm.architecture_reasoner,
        YamlArchitectureKnowledge(default_knowledge_path()),
        organisation,
    )
    precedents = InMemoryPrecedents()
    assessment = AssessRequirement(
        repository,
        index,
        llm.requirement_reader,
        llm.verdict_reasoner,
        organisation,
        llm.passage_reranker,
        precedents,
    )
    return MappingEvaluation(
        publish=PublishCatalogueForEvaluation(manage, build_index, clock),
        evaluate=EvaluateImpactMapping(
            AssessedImpact(assessment), manage, llm.verdict_reasoner.model, manage
        ),
        evaluate_match=EvaluateImpactMapping(
            MatchedImpact(knowledge), manage, llm.architecture_reasoner.model
        ),
        seed_precedents=SeedGoldenPrecedents(
            RecordPrecedent(repository, index, precedents, clock), clock
        ),
        close=llm.close,
    )


@dataclass(frozen=True)
class LibraryEvaluation:
    # Puts the golden corpus in service through the worker's own path.
    seed: SeedLibraryForEvaluation
    evaluate: EvaluateLibraryRetrieval
    # Releases the model clients the run shares.
    close: Callable[[], None]


def build_library_evaluation(settings: Settings, clock: ClockPort) -> LibraryEvaluation:
    """The library as `build_container` wires it, on in-memory stores and an offline scanner.

    The chunking policy, the token counter and the embedding adapter are the container's, so
    the chunks scored are the chunks the portal would serve for the same configuration.
    """
    llm = build_llm_adapters(settings, Metrics())
    lock = RLock()
    repository = InMemoryDocumentLibrary(lock)
    storage = InMemoryDocumentStorage()
    index = InMemoryReferenceIndex(lock, repository)
    transactions = InMemoryTransactionManager(lock)
    transactions.enroll(repository, storage, index)
    library = DocumentLibrary(
        repository,
        storage,
        SafeDocumentTextExtractor(),
        OfflineDocumentScanner(),
        transactions,
        clock,
        settings.document_max_file_bytes,
    )
    knowledge = ReferenceKnowledge(
        repository,
        index,
        llm.knowledge_embedding,
        StructureAwareChunks(ApproximateTokenCounter()),
        transactions,
        clock,
        llm.knowledge_embedding.model,
    )
    return LibraryEvaluation(
        seed=SeedLibraryForEvaluation(library, knowledge),
        evaluate=EvaluateLibraryRetrieval(knowledge, llm.knowledge_embedding.model),
        close=llm.close,
    )


GOLDEN_SET_FILE = Path("tests/fixtures/golden/impact_golden_set.json")
FLOORS_FILE = Path("tests/fixtures/golden/impact_floors.json")
CATALOGUE_FILE = Path("catalogues/smb-architecture.yaml")


class GoldenSetRunner:
    """Scores the impact mapper over the golden set found under `EVALUATION_ROOT`.

    Each pass builds its own in-memory graph, so a run never shares state with another, with
    the portal's database, or with the live catalogue.
    """

    def __init__(self, settings: Settings, clock: ClockPort) -> None:
        self._settings = settings
        self._clock = clock

    @property
    def _provider(self) -> str:
        return "fake" if self._settings.llm_provider is LLMProvider.FAKE else "live"

    def _read(self, relative: Path) -> bytes:
        path = self._settings.evaluation_root / relative
        try:
            return path.read_bytes()
        except OSError as exc:
            raise GoldenSetUnavailableError(
                f"This deployment holds no {relative.name}; the golden set report needs "
                "the golden set, its floors and the catalogue under EVALUATION_ROOT."
            ) from exc

    def _golden(self) -> GoldenSet:
        try:
            return read_golden_set(self._read(GOLDEN_SET_FILE))
        except GoldenSetFileError as exc:
            raise GoldenSetUnavailableError(str(exc)) from exc

    def info(self) -> GoldenSetInfo:
        golden = self._golden()
        try:
            floors = read_golden_floors(self._read(FLOORS_FILE))
        except GoldenFloorsFileError as exc:
            raise GoldenSetUnavailableError(str(exc)) from exc
        return GoldenSetInfo(
            golden_set_version=golden.version,
            catalogue_version=golden.catalogue_version,
            cases=len(golden.cases),
            held_out_cases=sum(item.split.value == "held_out" for item in golden.cases),
            provider=self._provider,
            provider_name=self._settings.llm_provider.value,
            floors=floors,
        )

    def run(self, options: GoldenRunOptions, progress: ProgressReport) -> GoldenRunResult:
        golden = self._golden()
        catalogue = self._read(CATALOGUE_FILE)
        repetitions = []
        model = ""
        for number in range(1, options.repeats + 1):
            stage = f"Run {number} of {options.repeats}"
            progress(JobProgress(stage, 0, len(golden.cases)))
            done = 0

            def advance(_: CaseResult, stage: str = stage) -> None:
                nonlocal done
                done += 1
                progress(JobProgress(stage, done, len(golden.cases)))

            report = self._pass(golden, catalogue, options, advance)
            model = report.model
            repetitions.append(repetition(report))
        return GoldenRunResult(
            provider=self._provider,
            model=model,
            golden_set_version=golden.version,
            catalogue_version=golden.catalogue_version,
            completed_at=self._clock.now(),
            repetitions=tuple(repetitions),
        )

    def _pass(
        self,
        golden: GoldenSet,
        catalogue: bytes,
        options: GoldenRunOptions,
        advance: Callable[[CaseResult], None],
    ) -> EvaluationReport:
        evaluation = build_mapping_evaluation(self._settings, self._clock)
        try:
            release = evaluation.publish.execute(CATALOGUE_FILE.name, catalogue)
            if missing := unknown_ids(golden, release):
                raise GoldenSetUnavailableError("The catalogue lacks: " + "; ".join(missing))
            if options.precedents is GoldenPrecedents.LEAVE_ONE_OUT:
                evaluation.seed_precedents.execute(golden, release.id)
            evaluate = (
                evaluation.evaluate
                if options.mapper.value == "assess"
                else evaluation.evaluate_match
            )
            return evaluate.execute(golden, release.id, advance)
        finally:
            evaluation.close()
