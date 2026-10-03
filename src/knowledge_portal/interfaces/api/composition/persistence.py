"""Persistence selection: one in-memory graph or one PostgreSQL database."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import ExitStack
from dataclasses import dataclass
from threading import RLock

from smb_kernel.documents.ports import DocumentStoragePort
from smb_kernel.persistence.connector import POOL_MAX_IDLE_SECONDS, PooledPostgresConnector
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.actor_directory import ActorDirectoryPort
from knowledge_portal.application.ports.architecture_jobs import ArchitectureJobRepositoryPort
from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    EmbeddingPort,
)
from knowledge_portal.application.ports.architecture_tokenizer import ArchitectureTokenizerPort
from knowledge_portal.application.ports.catalogue_candidates import (
    CatalogueCandidateRepositoryPort,
)
from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.application.ports.knowledge_events import KnowledgeEventOutboxPort
from knowledge_portal.application.ports.organisation_repository import OrganisationRepositoryPort
from knowledge_portal.application.ports.reference_index import ReferenceIndexPort
from knowledge_portal.application.ports.sample_requirements import SampleRequirementsPort
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.postgres_evidence_index import (
    PostgresEvidenceIndex,
)
from knowledge_portal.infrastructure.config.options import PersistenceProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.persistence.actor_directory import (
    InMemoryActorDirectory,
    PostgresActorDirectory,
)
from knowledge_portal.infrastructure.persistence.document_library import (
    InMemoryDocumentLibrary,
    PostgresDocumentLibrary,
    PublishingDocumentLibrary,
)
from knowledge_portal.infrastructure.persistence.document_storage import (
    InMemoryDocumentStorage,
    PostgresDocumentStorage,
)
from knowledge_portal.infrastructure.persistence.in_memory_architecture_jobs import (
    InMemoryArchitectureJobs,
)
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_catalogue_candidates import (
    InMemoryCatalogueCandidates,
)
from knowledge_portal.infrastructure.persistence.in_memory_organisation import (
    InMemoryOrganisationRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_sample_requirements import (
    InMemorySampleRequirements,
)
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from knowledge_portal.infrastructure.persistence.knowledge_events import (
    InMemoryKnowledgeEvents,
    PostgresKnowledgeEvents,
)
from knowledge_portal.infrastructure.persistence.postgres_architecture_jobs import (
    PostgresArchitectureJobs,
)
from knowledge_portal.infrastructure.persistence.postgres_architecture_knowledge import (
    PostgresArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.postgres_catalogue_candidates import (
    PostgresCatalogueCandidates,
)
from knowledge_portal.infrastructure.persistence.postgres_organisation import (
    PostgresOrganisationRepository,
)
from knowledge_portal.infrastructure.persistence.postgres_sample_requirements import (
    PostgresSampleRequirements,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore
from knowledge_portal.infrastructure.persistence.reference_index import (
    InMemoryReferenceIndex,
    PostgresReferenceIndex,
)


@dataclass(frozen=True)
class PersistenceAdapters:
    document_storage: DocumentStoragePort
    actor_directory: ActorDirectoryPort
    architecture_repository: ArchitectureKnowledgeRepositoryPort
    organisation_repository: OrganisationRepositoryPort
    sample_requirements: SampleRequirementsPort
    catalogue_candidates: CatalogueCandidateRepositoryPort
    architecture_evidence_index: ArchitectureEvidenceIndexPort
    architecture_job_repository: ArchitectureJobRepositoryPort
    library_repository: DocumentLibraryPort
    knowledge_events: KnowledgeEventOutboxPort
    reference_index: ReferenceIndexPort
    transaction_manager: TransactionManagerPort
    readiness_check: Callable[[], bool]


def build_persistence(
    settings: Settings,
    resources: ExitStack,
    clock: ClockPort,
    architecture_embeddings: EmbeddingPort,
    architecture_tokenizer: ArchitectureTokenizerPort,
) -> PersistenceAdapters:
    if settings.persistence_provider is PersistenceProvider.POSTGRES:
        return _postgres(
            settings, resources, clock, architecture_embeddings, architecture_tokenizer
        )
    return _memory(clock, architecture_embeddings, architecture_tokenizer)


def _postgres(
    settings: Settings,
    resources: ExitStack,
    clock: ClockPort,
    architecture_embeddings: EmbeddingPort,
    architecture_tokenizer: ArchitectureTokenizerPort,
) -> PersistenceAdapters:
    if settings.database_url is None:  # Enforced by Settings for PERSISTENCE_PROVIDER=postgres.
        raise AssertionError("PostgreSQL persistence requires DATABASE_URL.")
    connector = PooledPostgresConnector(
        settings.database_url,
        min_size=settings.database_pool_min_size,
        max_size=settings.database_pool_max_size,
        acquire_timeout_seconds=settings.database_pool_timeout_seconds,
        max_idle_seconds=POOL_MAX_IDLE_SECONDS,
        name="knowledge-portal",
    )
    connector.open()
    # Registered first so it closes last, after every adapter and worker.
    resources.callback(connector.close)
    postgres = PostgresStore(connector)
    knowledge_events = PostgresKnowledgeEvents(postgres)
    return PersistenceAdapters(
        document_storage=PostgresDocumentStorage(postgres),
        actor_directory=PostgresActorDirectory(postgres),
        architecture_repository=PostgresArchitectureKnowledgeRepository(
            connector, seed_knowledge()
        ),
        organisation_repository=PostgresOrganisationRepository(connector, clock),
        sample_requirements=PostgresSampleRequirements(connector),
        catalogue_candidates=PostgresCatalogueCandidates(connector),
        architecture_evidence_index=PostgresEvidenceIndex(
            connector, architecture_embeddings, architecture_tokenizer
        ),
        architecture_job_repository=PostgresArchitectureJobs(connector),
        library_repository=PublishingDocumentLibrary(
            PostgresDocumentLibrary(postgres), knowledge_events
        ),
        knowledge_events=knowledge_events,
        reference_index=PostgresReferenceIndex(postgres),
        transaction_manager=postgres,
        readiness_check=postgres.readiness,
    )


def _memory(
    clock: ClockPort,
    architecture_embeddings: EmbeddingPort,
    architecture_tokenizer: ArchitectureTokenizerPort,
) -> PersistenceAdapters:
    lock = RLock()
    events = InMemoryKnowledgeEvents(lock)
    library = InMemoryDocumentLibrary(lock)
    reference_index = InMemoryReferenceIndex(lock, library)
    storage = InMemoryDocumentStorage(lock=lock)
    actors = InMemoryActorDirectory(lock=lock)
    transactions = InMemoryTransactionManager(lock)
    transactions.enroll(library, events, reference_index, storage, actors)
    return PersistenceAdapters(
        document_storage=storage,
        actor_directory=actors,
        architecture_repository=InMemoryArchitectureKnowledgeRepository(seed_knowledge(), events),
        organisation_repository=InMemoryOrganisationRepository(clock),
        sample_requirements=InMemorySampleRequirements(),
        catalogue_candidates=InMemoryCatalogueCandidates(),
        architecture_evidence_index=InMemoryEvidenceIndex(
            architecture_embeddings, architecture_tokenizer
        ),
        architecture_job_repository=InMemoryArchitectureJobs(),
        library_repository=PublishingDocumentLibrary(library, events),
        knowledge_events=events,
        reference_index=reference_index,
        transaction_manager=transactions,
        readiness_check=_always_ready,
    )


def _always_ready() -> bool:
    return True
