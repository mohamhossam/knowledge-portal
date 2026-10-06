"""Architecture catalogue: retrieval, reasoning, curation and its background jobs."""

from __future__ import annotations

from dataclasses import dataclass

from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureKnowledgePort
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureReasonerPort,
    EmbeddingPort,
)
from knowledge_portal.application.ports.architecture_tokenizer import ArchitectureTokenizerPort
from knowledge_portal.application.ports.embedding import KnowledgeEmbeddingPort
from knowledge_portal.application.use_cases.architecture_documents import (
    ReadKnowledgeDocument,
    UploadArchitectureDocuments,
    UploadKnowledgeDocument,
)
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_jobs import (
    ArchitectureJobExecution,
    ArchitectureJobs,
)
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.architecture_preview import (
    PreviewArchitectureImpact,
)
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
    ProposeCatalogueChanges,
)
from knowledge_portal.application.use_cases.change_requests import (
    DismissChangeRequest,
    ListChangeRequests,
    ReadChangeRequestIntoDraft,
    ReceiveChangeRequest,
)
from knowledge_portal.application.use_cases.resolve_architecture_knowledge import (
    ResolveArchitectureKnowledge,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.catalogue_tables import (
    CatalogueTableReader,
    TableFirstCatalogueExtractor,
)
from knowledge_portal.infrastructure.architecture.embeddings import ArchitectureEmbeddings
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.tokenizer import ApproximateTokenizer
from knowledge_portal.infrastructure.architecture.yaml_knowledge import (
    YamlArchitectureKnowledge,
    default_knowledge_path,
)
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.jobs.architecture_job_worker import ArchitectureJobWorker
from knowledge_portal.interfaces.api.composition.llm import LLMAdapters
from knowledge_portal.interfaces.api.composition.persistence import PersistenceAdapters


@dataclass(frozen=True)
class ArchitectureRetrieval:
    """Chunking and embedding for architecture evidence; persistence indexes with it."""

    tokenizer: ArchitectureTokenizerPort
    embeddings: EmbeddingPort


@dataclass(frozen=True)
class ArchitectureWiring:
    knowledge: ArchitectureKnowledgePort
    manage: ManageArchitectureKnowledge
    build_index: BuildArchitectureIndex
    preview_impact: PreviewArchitectureImpact
    upload_document: UploadKnowledgeDocument
    upload_documents: UploadArchitectureDocuments
    read_document: ReadKnowledgeDocument
    decide_candidates: DecideCatalogueCandidate
    # Change requests from Requirement AI (requirement-portal ADR-0101, step 7).
    receive_change_request: ReceiveChangeRequest
    list_change_requests: ListChangeRequests
    read_change_request: ReadChangeRequestIntoDraft
    dismiss_change_request: DismissChangeRequest
    jobs: ArchitectureJobs
    # Present only when jobs are queued; inline jobs finish inside the request.
    worker: ArchitectureJobWorker | None


def build_architecture_retrieval(embeddings: KnowledgeEmbeddingPort) -> ArchitectureRetrieval:
    """Architecture evidence uses the application's configured embedding model."""
    return ArchitectureRetrieval(
        tokenizer=ApproximateTokenizer(), embeddings=ArchitectureEmbeddings(embeddings)
    )


def build_architecture(
    settings: Settings,
    persistence: PersistenceAdapters,
    retrieval: ArchitectureRetrieval,
    llm: LLMAdapters,
    reasoner: ArchitectureReasonerPort,
    clock: ClockPort,
) -> ArchitectureWiring:
    manage = ManageArchitectureKnowledge(
        persistence.architecture_repository,
        CatalogueFileAdapter(),
        persistence.architecture_evidence_index,
        settings.document_max_file_bytes,
    )
    document_extractor = SafeDocumentTextExtractor()
    located_extractor = LocatedDocumentExtractor(document_extractor)
    upload = UploadKnowledgeDocument(
        manage,
        persistence.architecture_repository,
        persistence.document_storage,
        document_extractor,
        settings.document_max_file_bytes,
    )
    build_index = BuildArchitectureIndex(
        manage,
        persistence.architecture_evidence_index,
        persistence.document_storage,
        located_extractor,
        retrieval.tokenizer,
    )
    propose_changes = ProposeCatalogueChanges(
        manage,
        persistence.document_storage,
        located_extractor,
        document_extractor,
        # Every provider reads catalogue tables exactly before its model (ADR-0093).
        TableFirstCatalogueExtractor(llm.catalogue_extractor, CatalogueTableReader()),
        llm.system_matcher,
        persistence.catalogue_candidates,
        clock,
    )
    # Offline fake models complete jobs inside the starting request; real
    # models queue them for the background worker.
    execution = (
        ArchitectureJobExecution.INLINE
        if settings.llm_provider is LLMProvider.FAKE
        else ArchitectureJobExecution.QUEUED
    )
    jobs = ArchitectureJobs(
        persistence.architecture_job_repository,
        persistence.architecture_repository,
        build_index,
        propose_changes,
        execution,
        clock,
    )
    return ArchitectureWiring(
        knowledge=ResolveArchitectureKnowledge(
            persistence.architecture_repository,
            persistence.architecture_evidence_index,
            reasoner,
            YamlArchitectureKnowledge(default_knowledge_path()),
            persistence.organisation_repository,
        ),
        manage=manage,
        build_index=build_index,
        preview_impact=PreviewArchitectureImpact(
            manage, persistence.architecture_evidence_index, reasoner
        ),
        upload_document=upload,
        upload_documents=UploadArchitectureDocuments(upload, manage),
        read_document=ReadKnowledgeDocument(
            manage, persistence.document_storage, located_extractor
        ),
        decide_candidates=DecideCatalogueCandidate(
            manage,
            persistence.architecture_repository,
            persistence.catalogue_candidates,
            persistence.change_requests,
        ),
        receive_change_request=ReceiveChangeRequest(persistence.change_requests, clock),
        list_change_requests=ListChangeRequests(persistence.change_requests),
        read_change_request=ReadChangeRequestIntoDraft(
            persistence.change_requests,
            manage,
            persistence.architecture_repository,
            persistence.catalogue_candidates,
            clock,
        ),
        dismiss_change_request=DismissChangeRequest(persistence.change_requests, clock),
        jobs=jobs,
        worker=ArchitectureJobWorker(
            jobs,
            poll_interval_seconds=settings.ai_job_poll_interval_seconds,
            shutdown_grace_seconds=settings.ai_job_shutdown_grace_seconds,
        )
        if execution is ArchitectureJobExecution.QUEUED
        else None,
    )
