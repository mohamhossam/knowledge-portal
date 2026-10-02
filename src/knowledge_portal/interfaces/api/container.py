"""Composition root.

The single place where concrete adapters are chosen and use cases are wired.
Nothing here is created at import time: a container is built explicitly from
`Settings`, so configuration errors surface at startup and tests can build an
isolated graph per test instead of sharing process-wide singletons.
"""

from __future__ import annotations

import multiprocessing
from collections.abc import Callable, Mapping
from contextlib import ExitStack
from dataclasses import dataclass, replace
from typing import Protocol

import httpx
from smb_kernel.diagnostics import DebugTrace
from smb_kernel.documents.bounded_extractor import (
    BoundedSubprocessDocumentExtractor,
    ExtractionLimits,
)
from smb_kernel.documents.ports import DocumentStoragePort
from smb_kernel.documents.process_resources import child_process_resource_limiter
from smb_kernel.documents.scanner import ClamAvDocumentScanner, OfflineDocumentScanner
from smb_kernel.http.client import InternalHttpClient
from smb_kernel.identity.ports import IdentityProviderPort
from smb_kernel.observability.metrics import MeteredTransport, Metrics
from smb_kernel.time.clock import ClockPort
from smb_kernel.time.system import SystemClock

from knowledge_portal.application.ports.actor_directory import ActorDirectoryPort
from knowledge_portal.application.ports.architecture_knowledge import ArchitectureKnowledgePort
from knowledge_portal.application.ports.architecture_mapping_stats import (
    ArchitectureMappingStatsPort,
)
from knowledge_portal.application.ports.knowledge_events import KnowledgeEventOutboxPort
from knowledge_portal.application.ports.requirement_dependents import RequirementDependentsPort
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.use_cases.architecture_comparison import (
    CompareArchitectureImpact,
    ManageSampleRequirements,
)
from knowledge_portal.application.use_cases.architecture_documents import (
    ReadKnowledgeDocument,
    UploadKnowledgeDocument,
)
from knowledge_portal.application.use_cases.architecture_jobs import ArchitectureJobs
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.architecture_mapping_impact import (
    ReportMappingImpact,
)
from knowledge_portal.application.use_cases.architecture_preview import (
    PreviewArchitectureImpact,
)
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
)
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.identity_access import (
    ResolveCurrentActor,
    SearchKnownActors,
)
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.application.use_cases.organisation_catalogue import (
    ManageOrganisationCatalogue,
)
from knowledge_portal.application.use_cases.provider_call_rate import ProviderCallRateLimit
from knowledge_portal.application.use_cases.reference_knowledge import (
    ReferenceKnowledge,
    StructureAwareChunks,
)
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.infrastructure.config.options import IdentityProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.documents.library_worker import DocumentIngestionWorker
from knowledge_portal.infrastructure.identity.fake_identity import FAKE_ACTORS
from knowledge_portal.infrastructure.persistence.reference_index import Utf8BudgetCounter
from knowledge_portal.infrastructure.requirement_client import (
    FakeArchitectureMappingStats,
    FakeRequirementDependents,
    HttpArchitectureMappingStats,
    HttpRequirementDependents,
)
from knowledge_portal.interfaces.api.composition.architecture import (
    build_architecture,
    build_architecture_retrieval,
)
from knowledge_portal.interfaces.api.composition.identity import build_identity
from knowledge_portal.interfaces.api.composition.llm import build_llm_adapters
from knowledge_portal.interfaces.api.composition.persistence import build_persistence

# One large library extraction at a time, each with generous bounds.
_LIBRARY_EXTRACTION_SECONDS = 600
_LIBRARY_EXTRACTION_MEMORY_BYTES = 4 * 1024 * 1024 * 1024


class BackgroundWorker(Protocol):
    """A thread-owning component started and stopped with its process."""

    @property
    def healthy(self) -> bool: ...
    def start(self) -> None: ...
    def stop(self) -> bool:
        """Stop and report whether in-flight work drained within its grace period."""
        ...

    def wait_until_stopped(self) -> None: ...


@dataclass(frozen=True)
class Container:
    settings: Settings
    clock: ClockPort
    metrics: Metrics
    debug_trace: DebugTrace
    close_resources: Callable[[], None]
    readiness_check: Callable[[], bool]
    transaction_manager: TransactionManagerPort
    identity_provider: IdentityProviderPort
    actor_directory: ActorDirectoryPort
    # The sign-in picker's personas in offline identity mode; empty with OIDC.
    offline_personas: tuple[ActorProfile, ...]
    resolve_current_actor: ResolveCurrentActor
    search_known_actors: SearchKnownActors
    provider_call_rate_limit: ProviderCallRateLimit
    document_storage: DocumentStoragePort
    knowledge_events: KnowledgeEventOutboxPort
    document_library: DocumentLibrary
    library_governance: LibraryGovernance
    reference_knowledge: ReferenceKnowledge
    architecture_knowledge: ArchitectureKnowledgePort
    manage_architecture_knowledge: ManageArchitectureKnowledge
    manage_organisation_catalogue: ManageOrganisationCatalogue
    preview_architecture_impact: PreviewArchitectureImpact
    manage_sample_requirements: ManageSampleRequirements
    compare_architecture_impact: CompareArchitectureImpact
    report_mapping_impact: ReportMappingImpact
    upload_knowledge_document: UploadKnowledgeDocument
    read_knowledge_document: ReadKnowledgeDocument
    decide_catalogue_candidates: DecideCatalogueCandidate
    architecture_jobs: ArchitectureJobs
    background_workers: Mapping[str, BackgroundWorker]


@dataclass(frozen=True)
class RequirementWork:
    """What this service reads from requirement work, over HTTP or from fakes."""

    dependents: RequirementDependentsPort
    mapping_stats: ArchitectureMappingStatsPort


def build_container(
    settings: Settings | None = None,
    *,
    clock: ClockPort | None = None,
    identity_provider: IdentityProviderPort | None = None,
    requirement_work: RequirementWork | None = None,
) -> Container:
    with ExitStack() as resources:
        container = _build_container(
            settings if settings is not None else Settings.from_env(),
            clock if clock is not None else SystemClock(),
            identity_provider,
            requirement_work,
            resources,
        )
        owned = resources.pop_all()
        return replace(container, close_resources=owned.close)


def _build_container(
    settings: Settings,
    clock: ClockPort,
    identity_override: IdentityProviderPort | None,
    requirement_override: RequirementWork | None,
    resources: ExitStack,
) -> Container:
    metrics = Metrics()
    llm = build_llm_adapters(settings, metrics)
    resources.callback(llm.close)
    retrieval = build_architecture_retrieval(llm.knowledge_embedding)
    persistence = build_persistence(
        settings, resources, clock, retrieval.embeddings, retrieval.tokenizer
    )
    identity = build_identity(settings, resources, persistence.actor_directory, identity_override)
    requirement_work = requirement_override or _requirement_work(settings, resources, metrics)
    architecture = build_architecture(
        settings, persistence, retrieval, llm, llm.architecture_reasoner, clock
    )
    reference_knowledge = ReferenceKnowledge(
        persistence.library_repository,
        persistence.reference_index,
        llm.knowledge_embedding,
        StructureAwareChunks(Utf8BudgetCounter()),
        persistence.transaction_manager,
        clock,
        _embedding_identity(settings),
    )
    library = DocumentLibrary(
        persistence.library_repository,
        persistence.document_storage,
        _library_extractor(settings),
        OfflineDocumentScanner()
        if settings.library_scan_mode == "offline"
        else ClamAvDocumentScanner(settings.library_scanner_host, settings.library_scanner_port),
        persistence.transaction_manager,
        clock,
        settings.document_max_file_bytes,
    )
    workers: dict[str, BackgroundWorker] = {
        "document_worker": DocumentIngestionWorker(library, reference_knowledge)
    }
    if architecture.worker is not None:
        workers["architecture_job_worker"] = architecture.worker
    return Container(
        settings=settings,
        clock=clock,
        metrics=metrics,
        debug_trace=llm.debug_trace,
        close_resources=resources.close,
        readiness_check=persistence.readiness_check,
        transaction_manager=persistence.transaction_manager,
        identity_provider=identity,
        actor_directory=persistence.actor_directory,
        offline_personas=FAKE_ACTORS if settings.identity_provider is IdentityProvider.FAKE else (),
        resolve_current_actor=ResolveCurrentActor(identity, persistence.actor_directory),
        search_known_actors=SearchKnownActors(persistence.actor_directory),
        provider_call_rate_limit=ProviderCallRateLimit(
            settings.provider_rate_limit_per_minute, clock
        ),
        document_storage=persistence.document_storage,
        knowledge_events=persistence.knowledge_events,
        document_library=library,
        library_governance=LibraryGovernance(
            persistence.library_repository,
            persistence.actor_directory,
            persistence.transaction_manager,
            clock,
            requirement_work.dependents,
        ),
        reference_knowledge=reference_knowledge,
        architecture_knowledge=architecture.knowledge,
        manage_architecture_knowledge=architecture.manage,
        manage_organisation_catalogue=ManageOrganisationCatalogue(
            persistence.organisation_repository, persistence.architecture_repository
        ),
        preview_architecture_impact=architecture.preview_impact,
        manage_sample_requirements=ManageSampleRequirements(persistence.sample_requirements, clock),
        compare_architecture_impact=CompareArchitectureImpact(
            architecture.manage, architecture.preview_impact, architecture.knowledge
        ),
        report_mapping_impact=ReportMappingImpact(
            persistence.architecture_repository, requirement_work.mapping_stats
        ),
        upload_knowledge_document=architecture.upload_document,
        read_knowledge_document=architecture.read_document,
        decide_catalogue_candidates=architecture.decide_candidates,
        architecture_jobs=architecture.jobs,
        background_workers=workers,
    )


def _requirement_work(
    settings: Settings, resources: ExitStack, metrics: Metrics
) -> RequirementWork:
    """Requirement work's internal API when configured; otherwise deterministic fakes."""
    if settings.requirement_api_base_url is None or settings.knowledge_service_token is None:
        return RequirementWork(FakeRequirementDependents(), FakeArchitectureMappingStats())
    http = resources.enter_context(
        httpx.Client(transport=MeteredTransport(metrics, "requirements", httpx.HTTPTransport()))
    )
    client = InternalHttpClient(
        settings.requirement_api_base_url,
        settings.knowledge_service_token,
        service="requirements",
        http=http,
    )
    return RequirementWork(HttpRequirementDependents(client), HttpArchitectureMappingStats(client))


def _library_extractor(settings: Settings) -> BoundedSubprocessDocumentExtractor:
    return BoundedSubprocessDocumentExtractor(
        concurrency=1,
        waiting_requests=1,
        deadline_seconds=_LIBRARY_EXTRACTION_SECONDS,
        memory_bytes=_LIBRARY_EXTRACTION_MEMORY_BYTES,
        limits=ExtractionLimits(
            ocr_artifacts_path=settings.library_ocr_artifacts_path,
            office_preview_executable=settings.document_office_preview_executable,
            pdf_pages=settings.document_max_pdf_pages,
            characters=settings.document_max_extracted_characters,
            xml_nodes=settings.document_max_xml_nodes,
            image_pixels=settings.document_max_image_pixels,
            spreadsheet_cells=settings.document_max_spreadsheet_cells,
        ),
        resource_limiter=child_process_resource_limiter(),
        process_context=multiprocessing.get_context("spawn"),
    )


def _embedding_identity(settings: Settings) -> str:
    """Which embedding space stored vectors belong to; a change forces re-indexing."""
    if settings.llm_profiles:
        return str(settings.llm_profiles.selected_embedding.identity)
    return (
        f"{settings.llm_provider.value}:{settings.openai_embedding_model}:"
        f"{settings.local_embedding_model}:"
        f"{settings.local_llm_base_url}:{settings.openrouter_embedding_model}:"
        f"{settings.openrouter_base_url}"
    )
