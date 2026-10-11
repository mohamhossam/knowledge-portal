"""FastAPI dependency providers.

Each provider pulls a use case out of the container held on the application
state, which is built once during startup by `interfaces.api.main`.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from smb_kernel.http.service_auth import CALLER_SCOPE_KEY
from smb_kernel.identity.ports import IdentityCredential
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import AuthenticationRequiredError
from knowledge_portal.application.ports.identity import Actor
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
from knowledge_portal.application.use_cases.catalog_plans import ReadCatalogPlans
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
)
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.historic_requirements import HistoricImports
from knowledge_portal.application.use_cases.identity_access import SearchKnownActors
from knowledge_portal.application.use_cases.knowledge_reviews import (
    ConfirmLibraryReview,
    ReviewReminders,
    SystemReviews,
)
from knowledge_portal.application.use_cases.library_admin import AdministerLibraryDocument
from knowledge_portal.application.use_cases.library_bulk import BulkRetryLibrary
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.application.use_cases.organisation_catalogue import (
    ManageOrganisationCatalogue,
)
from knowledge_portal.application.use_cases.precedents import ReadPrecedentSummaries
from knowledge_portal.application.use_cases.reference_knowledge import ReferenceKnowledge
from knowledge_portal.application.use_cases.requirement_corpus import (
    ActOnRequirementCorpus,
    NudgeFindingOwners,
    ReadRequirementCorpus,
)
from knowledge_portal.application.use_cases.source_impact import DocumentSourceImpact
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.infrastructure.config.options import IdentityProvider
from knowledge_portal.interfaces.api.container import Container
from knowledge_portal.interfaces.api.error_handlers import status_code_for


def get_container(request: Request) -> Container:
    """Return the container built at application startup."""
    container: Container = request.app.state.container
    return container


ContainerDep = Annotated[Container, Depends(get_container)]
bearer_scheme = HTTPBearer(auto_error=False, bearerFormat="JWT")


def get_current_actor(
    container: ContainerDep,
    credential: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    actor_hint: Annotated[str | None, Header(alias="X-Fake-Actor-Id")] = None,
) -> ActorProfile:
    """The signed-in knowledge admin; anyone else is refused (requirement-portal ADR-0099)."""
    bearer = credential.credentials if credential is not None else None
    if container.settings.identity_provider is IdentityProvider.OIDC and actor_hint:
        raise AuthenticationRequiredError("Fake actor headers are disabled in OIDC mode.")
    return container.resolve_current_actor.execute(IdentityCredential(bearer, actor_hint))


CurrentActorDep = Annotated[ActorProfile, Depends(get_current_actor)]


def get_signed_in_actor(
    container: ContainerDep,
    credential: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    actor_hint: Annotated[str | None, Header(alias="X-Fake-Actor-Id")] = None,
) -> ActorProfile:
    """Anyone signed in, admin or not: only the explorer's read routes take this
    (requirement-portal ADR-0101)."""
    bearer = credential.credentials if credential is not None else None
    if container.settings.identity_provider is IdentityProvider.OIDC and actor_hint:
        raise AuthenticationRequiredError("Fake actor headers are disabled in OIDC mode.")
    return container.resolve_signed_in_actor.execute(IdentityCredential(bearer, actor_hint))


SignedInActorDep = Annotated[ActorProfile, Depends(get_signed_in_actor)]


def require_service_caller(request: Request) -> str:
    """The platform service the middleware authenticated on an /internal route.

    The second wall: a route that somehow ran without the middleware's check
    still refuses, rather than answering as nobody.
    """
    caller = request.scope.get(CALLER_SCOPE_KEY)
    if not isinstance(caller, str) or not caller:
        raise HTTPException(status_code=401, detail="An internal request needs a service token.")
    return caller


def require_authenticated_actor(actor: CurrentActorDep) -> None:
    return None


# Refusals that always precede any provider call: the budget is given back.
# A 409 is not here, because a conflict can surface at commit after a model
# call has already been paid for.
_REFUNDED_STATUSES = frozenset({401, 403, 404, 422})


def limit_provider_calls(container: ContainerDep, actor: CurrentActorDep) -> Iterator[None]:
    """Count one provider-calling operation against the caller's per-minute budget.

    Attach to every route that calls an AI provider, synchronously or by queueing
    a job. A request refused before it could reach a provider is refunded.
    """
    ticket = container.provider_call_rate_limit.acquire(actor)
    try:
        yield
    except Exception as exc:
        if ticket is not None and _refused_before_provider(exc):
            container.provider_call_rate_limit.refund(ticket)
        raise


def _refused_before_provider(exc: Exception) -> bool:
    if isinstance(exc, RequestValidationError):
        return True
    return status_code_for(exc) in _REFUNDED_STATUSES


def get_knowledge_actor(actor: CurrentActorDep) -> Actor:
    """The role-bearing actor that architecture knowledge authorizes against."""
    return Actor(actor.id.value, actor.roles)


KnowledgeActorDep = Annotated[Actor, Depends(get_knowledge_actor)]


def get_clock(container: ContainerDep) -> ClockPort:
    return container.clock


def get_search_known_actors(container: ContainerDep) -> SearchKnownActors:
    return container.search_known_actors


def get_document_library(container: ContainerDep) -> DocumentLibrary:
    return container.document_library


def get_library_governance(container: ContainerDep) -> LibraryGovernance:
    return container.library_governance


def get_library_admin(container: ContainerDep) -> AdministerLibraryDocument:
    return container.library_admin


def get_library_retry(container: ContainerDep) -> BulkRetryLibrary:
    return container.library_retry


def get_library_review(container: ContainerDep) -> ConfirmLibraryReview:
    return container.library_review


def get_system_reviews(container: ContainerDep) -> SystemReviews:
    return container.system_reviews


def get_review_reminders(container: ContainerDep) -> ReviewReminders:
    return container.review_reminders


def get_reference_knowledge(container: ContainerDep) -> ReferenceKnowledge:
    return container.reference_knowledge


def get_document_source_impact(container: ContainerDep) -> DocumentSourceImpact:
    return container.document_source_impact


def get_explore_architecture(container: ContainerDep) -> ExploreArchitecture:
    return container.explore_architecture


def get_catalog_plans(container: ContainerDep) -> ReadCatalogPlans:
    return container.catalog_plans


def get_manage_architecture_knowledge(container: ContainerDep) -> ManageArchitectureKnowledge:
    return container.manage_architecture_knowledge


def get_manage_organisation_catalogue(container: ContainerDep) -> ManageOrganisationCatalogue:
    return container.manage_organisation_catalogue


def get_decide_catalogue_candidates(container: ContainerDep) -> DecideCatalogueCandidate:
    return container.decide_catalogue_candidates


def get_historic_imports(container: ContainerDep) -> HistoricImports:
    return container.historic_imports


def get_architecture_jobs(container: ContainerDep) -> ArchitectureJobs:
    return container.architecture_jobs


def get_upload_knowledge_document(container: ContainerDep) -> UploadKnowledgeDocument:
    return container.upload_knowledge_document


def get_upload_architecture_documents(container: ContainerDep) -> UploadArchitectureDocuments:
    return container.upload_architecture_documents


def get_read_knowledge_document(container: ContainerDep) -> ReadKnowledgeDocument:
    return container.read_knowledge_document


def get_preview_architecture_impact(container: ContainerDep) -> PreviewArchitectureImpact:
    return container.preview_architecture_impact


def get_manage_sample_requirements(container: ContainerDep) -> ManageSampleRequirements:
    return container.manage_sample_requirements


def get_compare_architecture_impact(container: ContainerDep) -> CompareArchitectureImpact:
    return container.compare_architecture_impact


def get_precedent_summaries(container: ContainerDep) -> ReadPrecedentSummaries:
    return container.precedent_summaries


def get_report_mapping_impact(container: ContainerDep) -> ReportMappingImpact:
    return container.report_mapping_impact


def get_read_requirement_corpus(container: ContainerDep) -> ReadRequirementCorpus:
    return container.read_requirement_corpus


def get_nudge_finding_owners(container: ContainerDep) -> NudgeFindingOwners:
    return container.nudge_finding_owners


def get_act_on_requirement_corpus(container: ContainerDep) -> ActOnRequirementCorpus:
    return container.act_on_requirement_corpus
