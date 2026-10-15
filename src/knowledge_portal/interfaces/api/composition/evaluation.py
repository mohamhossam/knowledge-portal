"""The golden-set evaluations' object graphs: the impact mapper's (ontology plan, Phases 0
and 3) and the reference library's retrieval (RAG review, E1).

They use the configured models, so the same run scores fake models in CI and live ones by
hand, but keep every release, document, index and squad record in memory: an evaluation never
reads or writes the portal's database.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from threading import RLock

from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.observability.metrics import Metrics
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.assess_requirement import AssessRequirement
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.library_evaluation import (
    EvaluateLibraryRetrieval,
    SeedLibraryForEvaluation,
)
from knowledge_portal.application.use_cases.mapping_evaluation import (
    AssessedImpact,
    EvaluateImpactMapping,
    MatchedImpact,
    PublishCatalogueForEvaluation,
    SeedGoldenPrecedents,
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
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.yaml_knowledge import (
    YamlArchitectureKnowledge,
    default_knowledge_path,
)
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
    InMemoryReferenceIndex,
    Utf8BudgetCounter,
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
    index = InMemoryEvidenceIndex(retrieval.embeddings, retrieval.tokenizer)
    manage = ManageArchitectureKnowledge(
        repository, CatalogueFileAdapter(), index, settings.document_max_file_bytes
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
        StructureAwareChunks(Utf8BudgetCounter()),
        transactions,
        clock,
        llm.knowledge_embedding.model,
    )
    return LibraryEvaluation(
        seed=SeedLibraryForEvaluation(library, knowledge),
        evaluate=EvaluateLibraryRetrieval(knowledge, llm.knowledge_embedding.model),
        close=llm.close,
    )
