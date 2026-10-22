"""FastAPI dependency providers.

Each provider pulls a use case out of the container held on the application
state, which is built once during startup by `interfaces.api.main`. Routes take
these providers, never the container itself (review recommendation 12), so a
route's surface is the use cases it names and a test can see which those are.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from smb_kernel.http.service_auth import CALLER_SCOPE_KEY
from smb_kernel.identity.ports import IdentityCredential
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import AuthenticationRequiredError
from knowledge_portal.application.ports.architecture_knowledge import ArchitectureKnowledgePort
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.knowledge_events import KnowledgeEventOutboxPort
from knowledge_portal.application.ports.requirement_assessment import RequirementAssessmentPort
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
    ReadDeliverySummaries,
    ReceiveChangeRequest,
    ReceiveDelivery,
)
from knowledge_portal.application.use_cases.cited_passages import CitedPassages
from knowledge_portal.application.use_cases.derived_dependencies import SuggestDerivedDependencies
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.golden_runs import GoldenSetRuns
from knowledge_portal.application.use_cases.historic_requirements import HistoricImports
from knowledge_portal.application.use_cases.identity_access import SearchKnownActors
from knowledge_portal.application.use_cases.knowledge_reviews import (
    ConfirmLibraryReview,
    ReviewReminders,
    SystemReviews,
)
from knowledge_portal.application.use_cases.library_admin import AdministerLibraryDocument
from knowledge_portal.application.use_cases.library_bulk import BulkRetryLibrary
from knowledge_portal.application.use_cases.library_classification import (
    LibraryClassification,
)
from knowledge_portal.application.use_cases.library_governance import LibraryGovernance
from knowledge_portal.application.use_cases.organisation_catalogue import (
    ManageOrganisationCatalogue,
)
from knowledge_portal.application.use_cases.precedents import (
    ReadPrecedentSummaries,
    RecordPrecedent,
)
from knowledge_portal.application.use_cases.provider_call_rate import ProviderCallRateLimit
from knowledge_portal.application.use_cases.reference_knowledge import ReferenceKnowledge
from knowledge_portal.application.use_cases.vocabulary_cleanup import CleanUpVocabulary
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.infrastructure.config.options import IdentityProvider
from knowledge_portal.infrastructure.config.settings import Settings
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
    """The signed-in knowledge admin; anyone else is refused (ADR-0099)."""
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
    (ADR-0101)."""
    bearer = credential.credentials if credential is not None else None
    if container.settings.identity_provider is IdentityProvider.OIDC and actor_hint:
        raise AuthenticationRequiredError("Fake actor headers are disabled in OIDC mode.")
    return container.resolve_signed_in_actor.execute(IdentityCredential(bearer, actor_hint))


SignedInActorDep = Annotated[ActorProfile, Depends(get_signed_in_actor)]


def require_app(request: Request) -> str:
    """The app the middleware authenticated on an /apps route, by its registered name.

    The second wall: a route that somehow ran without the middleware's check
    still refuses, rather than answering as nobody.
    """
    caller = request.scope.get(CALLER_SCOPE_KEY)
    if not isinstance(caller, str) or not caller:
        # The catalogue's own error, so the refusal carries a correlation id like any other.
        raise AuthenticationRequiredError("A request from an app needs its token.")
    return caller


AppDep = Annotated[str, Depends(require_app)]


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
    yield from _counted(container.provider_call_rate_limit, actor)


def limit_catalog_reads(container: ContainerDep, actor: SignedInActorDep) -> Iterator[None]:
    """Count one explorer reader's product catalogue lookup against their own per-minute
    budget, apart from AI calls (ADR-0101, Amendment 3)."""
    yield from _counted(container.catalog_read_rate_limit, actor)


def _counted(limit: ProviderCallRateLimit, actor: ActorProfile) -> Iterator[None]:
    ticket = limit.acquire(actor)
    try:
        yield
    except Exception as exc:
        if ticket is not None and _refused_before_provider(exc):
            limit.refund(ticket)
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


def get_library_classification(container: ContainerDep) -> LibraryClassification:
    return container.library_classification


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


def get_golden_set_runs(container: ContainerDep) -> GoldenSetRuns:
    return container.golden_runs


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


def get_delivery_summaries(container: ContainerDep) -> ReadDeliverySummaries:
    return container.delivery_summaries


# What the app routes, the change-request routes, the draft's readings and the sign-in
# configuration need (review recommendation 12): each a use case or port, never the container.


def get_architecture_match(container: ContainerDep) -> ArchitectureKnowledgePort:
    return container.architecture_knowledge


def get_requirement_assessment(container: ContainerDep) -> RequirementAssessmentPort:
    return container.requirement_assessment


def get_record_precedent(container: ContainerDep) -> RecordPrecedent:
    return container.record_precedent


def get_cited_passages(container: ContainerDep) -> CitedPassages:
    return container.cited_passages


def get_receive_change_request(container: ContainerDep) -> ReceiveChangeRequest:
    return container.receive_change_request


def get_receive_delivery(container: ContainerDep) -> ReceiveDelivery:
    return container.receive_delivery


def get_knowledge_events(container: ContainerDep) -> KnowledgeEventOutboxPort:
    return container.knowledge_events


def get_list_change_requests(container: ContainerDep) -> ListChangeRequests:
    return container.list_change_requests


def get_read_change_request(container: ContainerDep) -> ReadChangeRequestIntoDraft:
    return container.read_change_request


def get_dismiss_change_request(container: ContainerDep) -> DismissChangeRequest:
    return container.dismiss_change_request


def get_propose_capability_concepts(container: ContainerDep) -> ProposeCapabilityConcepts:
    return container.propose_capability_concepts


def get_clean_up_vocabulary(container: ContainerDep) -> CleanUpVocabulary:
    return container.clean_up_vocabulary


def get_suggest_derived_dependencies(container: ContainerDep) -> SuggestDerivedDependencies:
    return container.suggest_derived_dependencies


def get_suggest_component_capabilities(
    container: ContainerDep,
) -> SuggestComponentCapabilities:
    return container.suggest_component_capabilities


def get_settings(container: ContainerDep) -> Settings:
    return container.settings


def get_offline_personas(container: ContainerDep) -> tuple[ActorProfile, ...]:
    return container.offline_personas


ArchitectureMatchDep = Annotated[ArchitectureKnowledgePort, Depends(get_architecture_match)]
RequirementAssessmentDep = Annotated[RequirementAssessmentPort, Depends(get_requirement_assessment)]
RecordPrecedentDep = Annotated[RecordPrecedent, Depends(get_record_precedent)]
ReferenceKnowledgeDep = Annotated[ReferenceKnowledge, Depends(get_reference_knowledge)]
CitedPassagesDep = Annotated[CitedPassages, Depends(get_cited_passages)]
ReceiveChangeRequestDep = Annotated[ReceiveChangeRequest, Depends(get_receive_change_request)]
ReceiveDeliveryDep = Annotated[ReceiveDelivery, Depends(get_receive_delivery)]
ManageArchitectureKnowledgeDep = Annotated[
    ManageArchitectureKnowledge, Depends(get_manage_architecture_knowledge)
]
SystemReviewsDep = Annotated[SystemReviews, Depends(get_system_reviews)]
KnowledgeEventsDep = Annotated[KnowledgeEventOutboxPort, Depends(get_knowledge_events)]
HistoricImportsDep = Annotated[HistoricImports, Depends(get_historic_imports)]
ListChangeRequestsDep = Annotated[ListChangeRequests, Depends(get_list_change_requests)]
ReadChangeRequestDep = Annotated[ReadChangeRequestIntoDraft, Depends(get_read_change_request)]
DismissChangeRequestDep = Annotated[DismissChangeRequest, Depends(get_dismiss_change_request)]
ProposeCapabilityConceptsDep = Annotated[
    ProposeCapabilityConcepts, Depends(get_propose_capability_concepts)
]
CleanUpVocabularyDep = Annotated[CleanUpVocabulary, Depends(get_clean_up_vocabulary)]
SuggestDerivedDependenciesDep = Annotated[
    SuggestDerivedDependencies, Depends(get_suggest_derived_dependencies)
]
SuggestComponentCapabilitiesDep = Annotated[
    SuggestComponentCapabilities, Depends(get_suggest_component_capabilities)
]
SettingsDep = Annotated[Settings, Depends(get_settings)]
OfflinePersonasDep = Annotated[tuple[ActorProfile, ...], Depends(get_offline_personas)]
