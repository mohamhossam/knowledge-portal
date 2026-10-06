"""Stable, transport-neutral descriptions for expected application failures."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.application.errors import (
    ActorNotFoundError,
    ArchitectureJobNotFoundError,
    AuthenticationRequiredError,
    CitationNotCurrentError,
    DocumentContextTooLargeError,
    DocumentExtractionBusyError,
    DocumentExtractionError,
    DocumentExtractionTimeoutError,
    DocumentNotFoundError,
    DocumentStorageError,
    DocumentVersionConflictError,
    IdentityProviderUnavailableError,
    KnowledgeGenerationError,
    ModelTransportError,
    PersistenceError,
    ProviderRateLimitExceededError,
    ServiceResponseError,
    ServiceUnavailableError,
    UnsupportedDocumentError,
)
from knowledge_portal.application.ports.ado_work_items import (
    AdoNotConfiguredError,
    AdoUnavailableError,
)
from knowledge_portal.application.ports.architecture_rag import ArchitectureEvidenceError
from knowledge_portal.application.ports.catalogue_extractor import (
    CatalogueAnswerUnusableError,
    CatalogueCitationError,
    CatalogueExtractionError,
    CatalogueExtractionUnsupportedError,
)
from knowledge_portal.application.ports.change_requests import ChangeRequestConflictError
from knowledge_portal.application.ports.historic_requirements import (
    HistoricRequirementConflictError,
    HistoricRequirementNotFoundError,
)
from knowledge_portal.application.ports.requirement_corpus import (
    RequirementCorpusConflictError,
    RequirementFindingConflictError,
    RequirementFindingNotFoundError,
    RequirementNotInCorpusError,
)
from knowledge_portal.application.ports.system_matcher import SystemMatchingError
from knowledge_portal.application.use_cases.architecture_knowledge import (
    KnowledgeNotFoundError,
)
from knowledge_portal.application.use_cases.change_requests import ChangeRequestNotFoundError
from knowledge_portal.domain.architecture.candidates import (
    CandidateDecisionConflictError,
    CandidateDependencyError,
    CandidateNotFoundError,
)
from knowledge_portal.domain.architecture.change_requests import ChangeRequestStateError
from knowledge_portal.domain.architecture.errors import InvalidArchitectureContentError
from knowledge_portal.domain.architecture.knowledge import (
    InvalidKnowledgeError as InvalidArchitectureKnowledgeError,
)
from knowledge_portal.domain.architecture.knowledge import KnowledgeConflictError
from knowledge_portal.domain.document.errors import (
    DocumentInclusionError,
    InvalidDocumentError,
)
from knowledge_portal.domain.historic.errors import (
    HistoricRequirementStateError,
    InvalidHistoricRequirementError,
)
from knowledge_portal.domain.identity.errors import (
    AuthorizationDeniedError,
    InvalidIdentityError,
    RequirementAccessConflictError,
)
from knowledge_portal.domain.organisation.catalogue import (
    InvalidOrganisationError,
    OrganisationConflictError,
    OrganisationNotFoundError,
)
from knowledge_portal.domain.shared.errors import InvalidGeneratedContentError


class FailureCategory(StrEnum):
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    INVALID_INPUT = "invalid_input"
    PROVIDER = "provider"
    UNAVAILABLE = "unavailable"
    RATE_LIMITED = "rate_limited"
    INTERNAL = "internal"


@dataclass(frozen=True)
class PublicError:
    code: str
    message: str
    category: FailureCategory
    retryable: bool


# Ordered most-specific first. This is the single catalogue consumed by HTTP
# delivery and durable job execution.
ERROR_CATALOGUE: tuple[tuple[type[Exception], str, FailureCategory], ...] = (
    (CitationNotCurrentError, "citation_not_current", FailureCategory.CONFLICT),
    (AuthenticationRequiredError, "authentication_required", FailureCategory.AUTHENTICATION),
    (AuthorizationDeniedError, "authorization_denied", FailureCategory.AUTHORIZATION),
    (ActorNotFoundError, "actor_not_found", FailureCategory.NOT_FOUND),
    (ProviderRateLimitExceededError, "provider_rate_limited", FailureCategory.RATE_LIMITED),
    (RequirementAccessConflictError, "requirement_access_conflict", FailureCategory.CONFLICT),
    (InvalidIdentityError, "invalid_identity", FailureCategory.INVALID_INPUT),
    (
        IdentityProviderUnavailableError,
        "identity_provider_unavailable",
        FailureCategory.UNAVAILABLE,
    ),
    (
        KnowledgeNotFoundError,
        "architecture_knowledge_not_found",
        FailureCategory.NOT_FOUND,
    ),
    (
        ArchitectureJobNotFoundError,
        "architecture_job_not_found",
        FailureCategory.NOT_FOUND,
    ),
    (
        KnowledgeConflictError,
        "architecture_knowledge_conflict",
        FailureCategory.CONFLICT,
    ),
    (
        InvalidArchitectureKnowledgeError,
        "invalid_architecture_knowledge",
        FailureCategory.INVALID_INPUT,
    ),
    (
        ArchitectureEvidenceError,
        "architecture_evidence_generation",
        FailureCategory.PROVIDER,
    ),
    (OrganisationNotFoundError, "organisation_not_found", FailureCategory.NOT_FOUND),
    (CandidateNotFoundError, "catalogue_suggestion_not_found", FailureCategory.NOT_FOUND),
    (ChangeRequestNotFoundError, "change_request_not_found", FailureCategory.NOT_FOUND),
    (
        RequirementFindingNotFoundError,
        "requirement_finding_not_found",
        FailureCategory.NOT_FOUND,
    ),
    (
        RequirementFindingConflictError,
        "requirement_finding_conflict",
        FailureCategory.CONFLICT,
    ),
    (RequirementNotInCorpusError, "requirement_not_in_corpus", FailureCategory.NOT_FOUND),
    (RequirementCorpusConflictError, "requirement_corpus_conflict", FailureCategory.CONFLICT),
    (ChangeRequestConflictError, "change_request_conflict", FailureCategory.CONFLICT),
    (
        HistoricRequirementNotFoundError,
        "historic_requirement_not_found",
        FailureCategory.NOT_FOUND,
    ),
    (
        HistoricRequirementConflictError,
        "historic_requirement_conflict",
        FailureCategory.CONFLICT,
    ),
    (HistoricRequirementStateError, "historic_requirement_state", FailureCategory.CONFLICT),
    (
        InvalidHistoricRequirementError,
        "invalid_historic_requirement",
        FailureCategory.INVALID_INPUT,
    ),
    # Said to the curator as it is: nothing about the connection is secret.
    (AdoNotConfiguredError, "ado_not_configured", FailureCategory.CONFLICT),
    (AdoUnavailableError, "ado_unavailable", FailureCategory.UNAVAILABLE),
    (ChangeRequestStateError, "change_request_state", FailureCategory.CONFLICT),
    (
        CandidateDecisionConflictError,
        "catalogue_suggestion_conflict",
        FailureCategory.CONFLICT,
    ),
    (
        CandidateDependencyError,
        "catalogue_suggestion_dependency",
        FailureCategory.CONFLICT,
    ),
    # The specific reasons first: the first matching entry wins.
    (CatalogueAnswerUnusableError, "catalogue_extraction_unusable", FailureCategory.PROVIDER),
    (CatalogueCitationError, "catalogue_extraction_uncited", FailureCategory.PROVIDER),
    (CatalogueExtractionError, "catalogue_extraction", FailureCategory.PROVIDER),
    (SystemMatchingError, "catalogue_matching", FailureCategory.PROVIDER),
    (
        CatalogueExtractionUnsupportedError,
        "catalogue_extraction_unsupported",
        FailureCategory.INVALID_INPUT,
    ),
    (OrganisationConflictError, "organisation_conflict", FailureCategory.CONFLICT),
    (InvalidOrganisationError, "invalid_organisation", FailureCategory.INVALID_INPUT),
    (InvalidArchitectureContentError, "invalid_architecture_content", FailureCategory.INTERNAL),
    (DocumentNotFoundError, "document_not_found", FailureCategory.NOT_FOUND),
    (UnsupportedDocumentError, "unsupported_document", FailureCategory.INVALID_INPUT),
    (DocumentExtractionError, "document_extraction", FailureCategory.INVALID_INPUT),
    (DocumentExtractionBusyError, "document_extraction_busy", FailureCategory.UNAVAILABLE),
    (DocumentExtractionTimeoutError, "document_extraction_timeout", FailureCategory.UNAVAILABLE),
    (DocumentContextTooLargeError, "document_context_too_large", FailureCategory.INVALID_INPUT),
    (DocumentInclusionError, "document_inclusion", FailureCategory.CONFLICT),
    (InvalidDocumentError, "invalid_document", FailureCategory.INVALID_INPUT),
    (DocumentStorageError, "document_storage", FailureCategory.INTERNAL),
    (DocumentVersionConflictError, "document_version_conflict", FailureCategory.CONFLICT),
    (KnowledgeGenerationError, "knowledge_generation", FailureCategory.PROVIDER),
    (ModelTransportError, "model_transport", FailureCategory.PROVIDER),
    # A platform service (ADR-0099) could not be reached, or refused the request.
    (ServiceUnavailableError, "platform_service_unavailable", FailureCategory.UNAVAILABLE),
    (ServiceResponseError, "platform_service_refused", FailureCategory.PROVIDER),
    (InvalidGeneratedContentError, "invalid_generated_content", FailureCategory.INTERNAL),
    (PersistenceError, "persistence", FailureCategory.INTERNAL),
)


def describe_public_error(exc: Exception) -> PublicError:
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, ModelTransportError):
            return PublicError(
                "model_" + current.kind,
                str(current),
                FailureCategory.PROVIDER,
                current.kind not in {"authentication", "configuration", "index_required"},
            )
        current = current.__cause__
    for error_type, code, category in ERROR_CATALOGUE:
        if isinstance(exc, error_type):
            safe = category not in {
                FailureCategory.INTERNAL,
                FailureCategory.PROVIDER,
                FailureCategory.UNAVAILABLE,
            }
            return PublicError(
                code,
                str(exc) if safe else "The service could not complete the request.",
                category,
                category
                in {
                    FailureCategory.PROVIDER,
                    FailureCategory.UNAVAILABLE,
                    FailureCategory.RATE_LIMITED,
                },
            )
    return PublicError(
        "internal", "The service could not complete the request.", FailureCategory.INTERNAL, False
    )
