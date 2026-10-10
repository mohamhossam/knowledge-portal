"""Composition root.

The single place where concrete adapters are chosen and use cases are wired.
Nothing here is created at import time: a container is built explicitly from
`Settings`, so configuration errors surface at startup and tests can build an
isolated graph per test instead of sharing process-wide singletons.
"""

from __future__ import annotations

import multiprocessing
from collections.abc import Callable, Mapping
from contextlib import ExitStack, closing
from dataclasses import dataclass, field, replace
from datetime import timedelta
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
from smb_kernel.http.client_credentials import ClientCredentialsTokenSource
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
from knowledge_portal.application.ports.product_catalog import ProductCatalogPort
from knowledge_portal.application.ports.requirement_citations import (
    RequirementCitationCountsPort,
)
from knowledge_portal.application.ports.requirement_corpus import RequirementCorpusPort
from knowledge_portal.application.ports.requirement_dependents import RequirementDependentsPort
from knowledge_portal.application.ports.requirement_historic_citations import (
    RequirementHistoricCitationsPort,
)
from knowledge_portal.application.ports.source_impact import RequirementImpactPort
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.use_cases.architecture_comparison import (
    CompareArchitectureImpact,
    ManageSampleRequirements,
)
from knowledge_portal.application.use_cases.architecture_documents import (
    ReadKnowledgeDocument,
    UploadArchitectureDocuments,
    UploadKnowledgeDocument,
)
from knowledge_portal.application.use_cases.architecture_explorer import ExploreArchitecture
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
from knowledge_portal.application.use_cases.capability_concepts import (
    ProposeCapabilityConcepts,
    SuggestComponentCapabilities,
)
from knowledge_portal.application.use_cases.catalog_plans import ReadCatalogPlans
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
)
from knowledge_portal.application.use_cases.change_requests import (
    DismissChangeRequest,
    ListChangeRequests,
    ReadChangeRequestIntoDraft,
    ReceiveChangeRequest,
)
from knowledge_portal.application.use_cases.cited_passages import CitedPassages
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.historic_requirements import (
    HistoricImportJobs,
    HistoricImports,
)
from knowledge_portal.application.use_cases.identity_access import (
    ResolveCurrentActor,
    ResolveSignedInActor,
    SearchKnownActors,
)
from knowledge_portal.application.use_cases.knowledge_reviews import (
    ConfirmLibraryReview,
    ReviewReminders,
    SystemReviews,
)
from knowledge_portal.application.use_cases.library_admin import (
    AdministerLibraryDocument,
    LibraryStewardship,
)
from knowledge_portal.application.use_cases.library_bulk import BulkRetryLibrary
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.application.use_cases.organisation_catalogue import (
    ManageOrganisationCatalogue,
)
from knowledge_portal.application.use_cases.provider_call_rate import ProviderCallRateLimit
from knowledge_portal.application.use_cases.reference_knowledge import (
    ReferenceKnowledge,
    StructureAwareChunks,
)
from knowledge_portal.application.use_cases.requirement_corpus import (
    ActOnRequirementCorpus,
    NudgeFindingOwners,
    ReadRequirementCorpus,
)
from knowledge_portal.application.use_cases.source_impact import DocumentSourceImpact
from knowledge_portal.application.use_cases.vocabulary_cleanup import CleanUpVocabulary
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.infrastructure.config.options import (
    DEFAULT_PRODUCT_CATALOG_TIMEOUT_SECONDS,
    IdentityProvider,
    ProductCatalogProvider,
)
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.documents.library_worker import DocumentIngestionWorker
from knowledge_portal.infrastructure.identity.fake_identity import FAKE_ACTORS
from knowledge_portal.infrastructure.persistence.reference_index import Utf8BudgetCounter
from knowledge_portal.infrastructure.product_catalog import (
    CachedProductCatalog,
    FakeProductCatalog,
    Tmf620ProductCatalog,
)
from knowledge_portal.infrastructure.requirement_client import (
    FakeArchitectureMappingStats,
    FakeRequirementCitationCounts,
    FakeRequirementCorpus,
    FakeRequirementDependents,
    FakeRequirementHistoricCitations,
    FakeRequirementImpact,
    HttpArchitectureMappingStats,
    HttpRequirementCitationCounts,
    HttpRequirementCorpus,
    HttpRequirementDependents,
    HttpRequirementHistoricCitations,
    HttpRequirementImpact,
)
from knowledge_portal.interfaces.api.composition.architecture import (
    build_architecture,
    build_architecture_retrieval,
)
from knowledge_portal.interfaces.api.composition.historic import build_historic
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
    resolve_signed_in_actor: ResolveSignedInActor
    search_known_actors: SearchKnownActors
    provider_call_rate_limit: ProviderCallRateLimit
    document_storage: DocumentStoragePort
    knowledge_events: KnowledgeEventOutboxPort
    document_library: DocumentLibrary
    library_governance: LibraryGovernance
    library_admin: AdministerLibraryDocument
    library_retry: BulkRetryLibrary
    # Re-confirming knowledge on a cycle (Knowledge Center D).
    library_review: ConfirmLibraryReview
    system_reviews: SystemReviews
    review_reminders: ReviewReminders
    document_source_impact: DocumentSourceImpact
    cited_passages: CitedPassages
    reference_knowledge: ReferenceKnowledge
    architecture_knowledge: ArchitectureKnowledgePort
    manage_architecture_knowledge: ManageArchitectureKnowledge
    explore_architecture: ExploreArchitecture
    catalog_plans: ReadCatalogPlans
    manage_organisation_catalogue: ManageOrganisationCatalogue
    preview_architecture_impact: PreviewArchitectureImpact
    manage_sample_requirements: ManageSampleRequirements
    compare_architecture_impact: CompareArchitectureImpact
    report_mapping_impact: ReportMappingImpact
    read_requirement_corpus: ReadRequirementCorpus
    nudge_finding_owners: NudgeFindingOwners
    act_on_requirement_corpus: ActOnRequirementCorpus
    upload_knowledge_document: UploadKnowledgeDocument
    upload_architecture_documents: UploadArchitectureDocuments
    read_knowledge_document: ReadKnowledgeDocument
    decide_catalogue_candidates: DecideCatalogueCandidate
    propose_capability_concepts: ProposeCapabilityConcepts
    clean_up_vocabulary: CleanUpVocabulary
    suggest_component_capabilities: SuggestComponentCapabilities
    # Change requests from Requirement AI (requirement-portal ADR-0101, step 7).
    receive_change_request: ReceiveChangeRequest
    list_change_requests: ListChangeRequests
    read_change_request: ReadChangeRequestIntoDraft
    dismiss_change_request: DismissChangeRequest
    architecture_jobs: ArchitectureJobs
    # Historic Requirements and their import queue (Knowledge Center E, ADR-0102).
    historic_imports: HistoricImports
    historic_jobs: HistoricImportJobs
    background_workers: Mapping[str, BackgroundWorker]


@dataclass(frozen=True)
class RequirementWork:
    """What this service reads from requirement work, over HTTP or from fakes."""

    dependents: RequirementDependentsPort
    mapping_stats: ArchitectureMappingStatsPort
    impact: RequirementImpactPort
    corpus: RequirementCorpusPort = field(default_factory=FakeRequirementCorpus)
    citations: RequirementCitationCountsPort = field(default_factory=FakeRequirementCitationCounts)
    historic_citations: RequirementHistoricCitationsPort = field(
        default_factory=FakeRequirementHistoricCitations
    )


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
    review_cycle = timedelta(days=settings.knowledge_review_cycle_days)
    system_reviews = SystemReviews(
        persistence.architecture_repository,
        persistence.system_reviews,
        persistence.actor_directory,
        persistence.transaction_manager,
        clock,
        review_cycle,
    )
    stewardship = LibraryStewardship(
        persistence.library_admin_grants, persistence.library_admin_record, clock
    )
    reference_knowledge = ReferenceKnowledge(
        persistence.library_repository,
        persistence.reference_index,
        llm.knowledge_embedding,
        StructureAwareChunks(Utf8BudgetCounter()),
        persistence.transaction_manager,
        clock,
        _embedding_identity(settings),
        stewardship,
    )
    # One bounded extractor and one scanner, shared by the library and historic imports.
    extractor = _library_extractor(settings)
    scanner = (
        OfflineDocumentScanner()
        if settings.library_scan_mode == "offline"
        else ClamAvDocumentScanner(settings.library_scanner_host, settings.library_scanner_port)
    )
    library = DocumentLibrary(
        persistence.library_repository,
        persistence.document_storage,
        extractor,
        scanner,
        persistence.transaction_manager,
        clock,
        settings.document_max_file_bytes,
        stewardship,
        requirement_work.citations,
        timedelta(days=settings.knowledge_review_cycle_days),
    )
    historic = build_historic(
        settings, persistence, clock, extractor, scanner, requirement_work.historic_citations
    )
    workers: dict[str, BackgroundWorker] = {
        "document_worker": DocumentIngestionWorker(library, reference_knowledge),
        "historic_import_worker": historic.worker,
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
        resolve_signed_in_actor=ResolveSignedInActor(identity),
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
            stewardship,
        ),
        library_admin=AdministerLibraryDocument(
            persistence.library_repository,
            persistence.library_admin_grants,
            persistence.library_admin_record,
            stewardship,
            persistence.transaction_manager,
            clock,
        ),
        library_retry=BulkRetryLibrary(
            persistence.library_repository, stewardship, persistence.transaction_manager
        ),
        library_review=ConfirmLibraryReview(
            persistence.library_repository, stewardship, persistence.transaction_manager, clock
        ),
        system_reviews=system_reviews,
        review_reminders=ReviewReminders(
            persistence.library_repository,
            system_reviews,
            persistence.transaction_manager,
            clock,
            review_cycle,
        ),
        document_source_impact=DocumentSourceImpact(
            persistence.library_repository,
            requirement_work.impact,
            persistence.transaction_manager,
        ),
        cited_passages=CitedPassages(persistence.library_repository, review_cycle),
        reference_knowledge=reference_knowledge,
        architecture_knowledge=architecture.knowledge,
        manage_architecture_knowledge=architecture.manage,
        explore_architecture=ExploreArchitecture(persistence.architecture_repository),
        catalog_plans=ReadCatalogPlans(
            persistence.architecture_repository,
            _product_catalog(settings, resources, metrics, clock),
        ),
        manage_organisation_catalogue=ManageOrganisationCatalogue(
            persistence.organisation_repository, persistence.architecture_repository
        ),
        preview_architecture_impact=architecture.preview_impact,
        manage_sample_requirements=ManageSampleRequirements(persistence.sample_requirements, clock),
        compare_architecture_impact=CompareArchitectureImpact(
            architecture.manage, architecture.preview_impact, architecture.knowledge
        ),
        read_requirement_corpus=ReadRequirementCorpus(requirement_work.corpus),
        nudge_finding_owners=NudgeFindingOwners(requirement_work.corpus),
        act_on_requirement_corpus=ActOnRequirementCorpus(requirement_work.corpus),
        report_mapping_impact=ReportMappingImpact(
            persistence.architecture_repository, requirement_work.mapping_stats
        ),
        upload_knowledge_document=architecture.upload_document,
        upload_architecture_documents=architecture.upload_documents,
        read_knowledge_document=architecture.read_document,
        decide_catalogue_candidates=architecture.decide_candidates,
        propose_capability_concepts=architecture.propose_concepts,
        clean_up_vocabulary=architecture.clean_up_vocabulary,
        suggest_component_capabilities=architecture.suggest_component_links,
        receive_change_request=architecture.receive_change_request,
        list_change_requests=architecture.list_change_requests,
        read_change_request=architecture.read_change_request,
        dismiss_change_request=architecture.dismiss_change_request,
        architecture_jobs=architecture.jobs,
        historic_imports=historic.imports,
        historic_jobs=historic.jobs,
        background_workers=workers,
    )


def _product_catalog(
    settings: Settings, resources: ExitStack, metrics: Metrics, clock: ClockPort
) -> ProductCatalogPort | None:
    """The product catalog plans and prices are read from, live (requirement-portal ADR-0101)."""
    provider = settings.product_catalog_provider
    catalog: ProductCatalogPort
    if provider is ProductCatalogProvider.NONE:
        return None
    if provider is ProductCatalogProvider.FAKE:
        catalog = FakeProductCatalog(clock)
    else:
        http = resources.enter_context(
            httpx.Client(
                transport=MeteredTransport(metrics, "product_catalog", httpx.HTTPTransport())
            )
        )
        client = InternalHttpClient(
            settings.product_catalog_url or "",
            settings.product_catalog_token or "",
            service="product catalog",
            timeout_seconds=DEFAULT_PRODUCT_CATALOG_TIMEOUT_SECONDS,
            http=http,
        )
        catalog = Tmf620ProductCatalog(client, clock, settings.product_catalog_code_field)
    return CachedProductCatalog(catalog, clock, settings.product_catalog_cache_seconds)


def _requirement_work(
    settings: Settings, resources: ExitStack, metrics: Metrics
) -> RequirementWork:
    """Requirement work's internal API when configured; otherwise deterministic fakes."""
    url = settings.requirement_service_url
    if url is None:
        return RequirementWork(
            FakeRequirementDependents(), FakeArchitectureMappingStats(), FakeRequirementImpact()
        )
    http = resources.enter_context(
        httpx.Client(transport=MeteredTransport(metrics, "requirements", httpx.HTTPTransport()))
    )
    client = InternalHttpClient(
        url,
        _service_token(settings, resources, settings.knowledge_service_token or ""),
        service="requirements",
        http=http,
    )
    return RequirementWork(
        HttpRequirementDependents(client),
        HttpArchitectureMappingStats(client),
        HttpRequirementImpact(client),
        HttpRequirementCorpus(client),
        HttpRequirementCitationCounts(client),
        HttpRequirementHistoricCitations(client),
    )


def _service_token(
    settings: Settings, resources: ExitStack, shared: str
) -> str | Callable[[], str]:
    """How this service proves itself to requirement work (requirement-portal ADR-0104).

    With its own client at the OIDC issuer, the issuer grants it short-lived
    tokens and this service holds no secret of requirement work's; otherwise it
    presents the shared token, `shared`.
    """
    client_id = settings.knowledge_service_client_id
    secret = settings.knowledge_service_client_secret
    if client_id is not None and secret is not None:
        return resources.enter_context(
            closing(
                ClientCredentialsTokenSource(
                    settings.oidc_issuer_url,
                    client_id,
                    secret,
                    client=httpx.Client(timeout=10),
                )
            )
        )
    return shared


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
