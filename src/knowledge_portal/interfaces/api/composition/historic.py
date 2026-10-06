"""Historic Requirements: importing old BRDs with their Azure DevOps lineage (ADR-0102)."""

from __future__ import annotations

from dataclasses import dataclass

from smb_kernel.documents.ports import DocumentExtractorPort, DocumentScannerPort
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.ports.ado_work_items import AdoWorkItemSourcePort
from knowledge_portal.application.ports.requirement_historic_citations import (
    RequirementHistoricCitationsPort,
)
from knowledge_portal.application.use_cases.historic_requirements import (
    HistoricImportJobs,
    HistoricImports,
)
from knowledge_portal.application.use_cases.leased_jobs import ArchitectureJobExecution
from knowledge_portal.infrastructure.ado.fake_work_items import FakeAdoWorkItemSource
from knowledge_portal.infrastructure.ado.unconfigured import UnconfiguredAdoWorkItemSource
from knowledge_portal.infrastructure.config.options import AdoProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.jobs.architecture_job_worker import ArchitectureJobWorker
from knowledge_portal.interfaces.api.composition.persistence import PersistenceAdapters


@dataclass(frozen=True)
class HistoricWiring:
    imports: HistoricImports
    jobs: HistoricImportJobs
    worker: ArchitectureJobWorker


def _ado(settings: Settings) -> AdoWorkItemSourcePort:
    """Read-only: no adapter here has a way to write to Azure DevOps."""
    if settings.ado_provider is AdoProvider.FAKE:
        return FakeAdoWorkItemSource()
    return UnconfiguredAdoWorkItemSource()


def build_historic(
    settings: Settings,
    persistence: PersistenceAdapters,
    clock: ClockPort,
    extractor: DocumentExtractorPort,
    scanner: DocumentScannerPort,
    citations: RequirementHistoricCitationsPort | None = None,
) -> HistoricWiring:
    # Always queued: reading a BRD runs the bounded extractor, never inside a request.
    jobs = HistoricImportJobs(
        persistence.historic_job_repository,
        ArchitectureJobExecution.QUEUED,
        clock,
        persistence.historic_requirements,
        persistence.document_storage,
        scanner,
        extractor,
        _ado(settings),
        persistence.transaction_manager,
        settings.ado_import_max_items,
    )
    imports = HistoricImports(
        persistence.historic_requirements,
        persistence.document_storage,
        jobs,
        persistence.knowledge_events,
        persistence.transaction_manager,
        clock,
        settings.document_max_file_bytes,
        citations=citations,
    )
    worker = ArchitectureJobWorker(
        jobs,
        poll_interval_seconds=settings.ai_job_poll_interval_seconds,
        shutdown_grace_seconds=settings.ai_job_shutdown_grace_seconds,
        name="historic-imports",
    )
    return HistoricWiring(imports, jobs, worker)
