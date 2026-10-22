"""Application configuration read from the environment.

Configuration is an infrastructure concern: nothing in the domain or the
application layer reads environment variables.  Settings are resolved and
validated once, at startup, so a misconfigured deployment fails loudly on boot
instead of returning a provider error on the first analysis request.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from smb_kernel.llm.profiles import (
    LLMProfileConfiguration,
    ProfileConfigurationError,
    load_profiles,
)

from knowledge_portal.infrastructure.config.options import (
    DEFAULT_ADO_IMPORT_MAX_ITEMS,
    DEFAULT_AI_JOB_POLL_INTERVAL_SECONDS,
    DEFAULT_AI_JOB_SHUTDOWN_GRACE_SECONDS,
    DEFAULT_CATALOGUE_READING_CONCURRENCY,
    DEFAULT_DATABASE_POOL_MAX_SIZE,
    DEFAULT_DATABASE_POOL_MIN_SIZE,
    DEFAULT_DATABASE_POOL_TIMEOUT_SECONDS,
    DEFAULT_DEBUG_TRACE_PATH,
    DEFAULT_DOCUMENT_EXTRACTION_CONCURRENCY,
    DEFAULT_DOCUMENT_EXTRACTION_MEMORY_BYTES,
    DEFAULT_DOCUMENT_EXTRACTION_QUEUE,
    DEFAULT_DOCUMENT_EXTRACTION_TIMEOUT_SECONDS,
    DEFAULT_DOCUMENT_MAX_EXTRACTED_CHARACTERS,
    DEFAULT_DOCUMENT_MAX_FILE_BYTES,
    DEFAULT_DOCUMENT_MAX_IMAGE_PIXELS,
    DEFAULT_DOCUMENT_MAX_PDF_PAGES,
    DEFAULT_DOCUMENT_MAX_SPREADSHEET_CELLS,
    DEFAULT_DOCUMENT_MAX_XML_NODES,
    DEFAULT_KNOWLEDGE_REVIEW_CYCLE_DAYS,
    DEFAULT_LOCAL_LLM_BASE_URL,
    DEFAULT_LOCAL_LLM_CONTEXT_WINDOW_TOKENS,
    DEFAULT_LOCAL_LLM_MAX_OUTPUT_TOKENS,
    DEFAULT_LOCAL_LLM_TIMEOUT_SECONDS,
    DEFAULT_OIDC_JWKS_TTL_SECONDS,
    DEFAULT_OIDC_UNKNOWN_KEY_CACHE_SIZE,
    DEFAULT_OIDC_UNKNOWN_KEY_TTL_SECONDS,
    DEFAULT_OPENAI_EMBEDDING_MODEL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_OPENAI_TIMEOUT_SECONDS,
    DEFAULT_OPENROUTER_BASE_URL,
    DEFAULT_OPENROUTER_DATA_COLLECTION,
    DEFAULT_OPENROUTER_EMBEDDING_MODEL,
    DEFAULT_OPENROUTER_MAX_OUTPUT_TOKENS,
    DEFAULT_OPENROUTER_MODEL,
    DEFAULT_OPENROUTER_TIMEOUT_SECONDS,
    DEFAULT_PRODUCT_CATALOG_CACHE_SECONDS,
    DEFAULT_PROVIDER_RATE_LIMIT_PER_MINUTE,
    DEFAULT_REQUEST_MAX_BODY_BYTES,
    DEFAULT_RERANKER_TIMEOUT_SECONDS,
    AdoProvider,
    ConfigurationError,
    IdentityProvider,
    LLMProvider,
    LogFormat,
    PersistenceProvider,
    ProductCatalogProvider,
    RerankerApi,
    RerankerProvider,
)
from knowledge_portal.infrastructure.config.settings_validation import validate_settings

# The repository root: the golden set, its floors and the catalogue it was labelled against
# live there, beside the code. A container image copies the same layout and points
# EVALUATION_ROOT at it.
DEFAULT_EVALUATION_ROOT = Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class PersistenceSettings:
    """Persistence-only configuration for operational database commands."""

    provider: PersistenceProvider = PersistenceProvider.MEMORY
    database_url: str | None = None

    def __post_init__(self) -> None:
        if self.provider is PersistenceProvider.POSTGRES and not self.database_url:
            raise ConfigurationError(
                "PERSISTENCE_PROVIDER=postgres requires DATABASE_URL. Start PostgreSQL and set "
                "DATABASE_URL, or use PERSISTENCE_PROVIDER=memory."
            )

    @classmethod
    def from_env(cls) -> PersistenceSettings:
        """Resolve persistence without validating unrelated provider settings."""
        load_dotenv()
        raw_provider = (
            os.getenv("PERSISTENCE_PROVIDER", PersistenceProvider.MEMORY.value).strip().lower()
        )
        try:
            provider = PersistenceProvider(raw_provider)
        except ValueError as exc:
            supported = ", ".join(sorted(item.value for item in PersistenceProvider))
            raise ConfigurationError(
                f"Unsupported PERSISTENCE_PROVIDER {raw_provider!r}. Supported: {supported}."
            ) from exc
        return cls(
            provider=provider,
            database_url=os.getenv("DATABASE_URL", "").strip() or None,
        )


@dataclass(frozen=True)
class Settings:
    """Resolved runtime configuration."""

    llm_provider: LLMProvider = LLMProvider.OPENAI
    llm_config_path: str | None = None
    llm_profiles: LLMProfileConfiguration | None = field(default=None, repr=False)
    openai_api_key: str | None = field(default=None, repr=False)
    openai_model: str = DEFAULT_OPENAI_MODEL
    openai_timeout_seconds: float = DEFAULT_OPENAI_TIMEOUT_SECONDS
    openai_embedding_model: str = DEFAULT_OPENAI_EMBEDDING_MODEL
    openrouter_api_key: str | None = field(default=None, repr=False)
    openrouter_model: str = DEFAULT_OPENROUTER_MODEL
    openrouter_embedding_model: str = DEFAULT_OPENROUTER_EMBEDDING_MODEL
    openrouter_base_url: str = DEFAULT_OPENROUTER_BASE_URL
    openrouter_timeout_seconds: float = DEFAULT_OPENROUTER_TIMEOUT_SECONDS
    openrouter_max_output_tokens: int = DEFAULT_OPENROUTER_MAX_OUTPUT_TOKENS
    openrouter_data_collection: str = DEFAULT_OPENROUTER_DATA_COLLECTION
    local_llm_base_url: str = DEFAULT_LOCAL_LLM_BASE_URL
    local_llm_model: str = ""
    local_embedding_model: str = ""
    local_llm_timeout_seconds: float = DEFAULT_LOCAL_LLM_TIMEOUT_SECONDS
    local_llm_reasoning_effort: str | None = None
    local_llm_context_window_tokens: int = DEFAULT_LOCAL_LLM_CONTEXT_WINDOW_TOKENS
    local_llm_max_output_tokens: int = DEFAULT_LOCAL_LLM_MAX_OUTPUT_TOKENS
    local_llm_vision_enabled: bool = False
    persistence_provider: PersistenceProvider = PersistenceProvider.MEMORY
    database_url: str | None = None
    database_pool_min_size: int = DEFAULT_DATABASE_POOL_MIN_SIZE
    database_pool_max_size: int = DEFAULT_DATABASE_POOL_MAX_SIZE
    database_pool_timeout_seconds: float = DEFAULT_DATABASE_POOL_TIMEOUT_SECONDS
    api_background_workers: bool = True
    document_max_file_bytes: int = DEFAULT_DOCUMENT_MAX_FILE_BYTES
    document_extraction_concurrency: int = DEFAULT_DOCUMENT_EXTRACTION_CONCURRENCY
    catalogue_reading_concurrency: int = DEFAULT_CATALOGUE_READING_CONCURRENCY
    document_extraction_queue: int = DEFAULT_DOCUMENT_EXTRACTION_QUEUE
    document_extraction_timeout_seconds: float = DEFAULT_DOCUMENT_EXTRACTION_TIMEOUT_SECONDS
    document_extraction_memory_bytes: int = DEFAULT_DOCUMENT_EXTRACTION_MEMORY_BYTES
    document_max_pdf_pages: int = DEFAULT_DOCUMENT_MAX_PDF_PAGES
    document_max_extracted_characters: int = DEFAULT_DOCUMENT_MAX_EXTRACTED_CHARACTERS
    document_max_xml_nodes: int = DEFAULT_DOCUMENT_MAX_XML_NODES
    document_max_image_pixels: int = DEFAULT_DOCUMENT_MAX_IMAGE_PIXELS
    document_max_spreadsheet_cells: int = DEFAULT_DOCUMENT_MAX_SPREADSHEET_CELLS
    app_environment: str = "development"
    identity_provider: IdentityProvider = IdentityProvider.FAKE
    oidc_issuer_url: str = ""
    oidc_audience: str = ""
    oidc_client_id: str = ""
    oidc_scopes: str = "openid profile email"
    oidc_company_sso_enabled: bool = True
    oidc_company_sso_alias: str = "company-sso"
    oidc_password_login_enabled: bool = True
    oidc_allowed_algorithms: tuple[str, ...] = ("RS256", "ES256")
    oidc_jwks_ttl_seconds: float = DEFAULT_OIDC_JWKS_TTL_SECONDS
    oidc_unknown_key_ttl_seconds: float = DEFAULT_OIDC_UNKNOWN_KEY_TTL_SECONDS
    oidc_unknown_key_cache_size: int = DEFAULT_OIDC_UNKNOWN_KEY_CACHE_SIZE
    oidc_roles_claim: str = "roles"
    knowledge_evaluation_approved: bool = False
    ai_job_poll_interval_seconds: float = DEFAULT_AI_JOB_POLL_INTERVAL_SECONDS
    ai_job_shutdown_grace_seconds: float = DEFAULT_AI_JOB_SHUTDOWN_GRACE_SECONDS
    debug_trace_enabled: bool = False
    debug_trace_path: str = DEFAULT_DEBUG_TRACE_PATH
    library_scan_mode: str = "clamav"
    library_scanner_host: str = "127.0.0.1"
    library_scanner_port: int = 3310
    library_ocr_artifacts_path: str = ""
    document_office_preview_executable: str = ""
    provider_rate_limit_per_minute: int = DEFAULT_PROVIDER_RATE_LIMIT_PER_MINUTE
    log_level: str = "INFO"
    log_format: LogFormat = LogFormat.TEXT
    metrics_port: int | None = None
    metrics_host: str = "127.0.0.1"
    request_max_body_bytes: int = DEFAULT_REQUEST_MAX_BODY_BYTES
    # The apps that may read the knowledge base under /apps (ADR-0126), each admitted under
    # its own name: by a shared token of its own (name -> token), and/or by its client at the
    # OIDC issuer, whose granted tokens for the audience knowledge-apps are admitted (named
    # after the client id). With neither, the app API is not served at all.
    app_tokens: Mapping[str, str] = field(default_factory=dict, repr=False)
    app_client_ids: tuple[str, ...] = ()
    # The product catalog plans and prices are read from, live (ADR-0101): none, the
    # offline sample, or a TMF620 Product Catalog Management API.
    product_catalog_provider: ProductCatalogProvider = ProductCatalogProvider.NONE
    product_catalog_url: str | None = None
    product_catalog_token: str | None = field(default=None, repr=False)
    # The productOffering field an offering's code is looked up by; "id" fetches it by id.
    product_catalog_code_field: str = "id"
    product_catalog_cache_seconds: int = DEFAULT_PRODUCT_CATALOG_CACHE_SECONDS
    # Days after its last confirmation that a document or system is due for review again.
    knowledge_review_cycle_days: int = DEFAULT_KNOWLEDGE_REVIEW_CYCLE_DAYS
    # Where historic Requirements' breakdowns are read from, read-only (ADR-0102).
    ado_provider: AdoProvider = AdoProvider.NONE
    ado_import_max_items: int = DEFAULT_ADO_IMPORT_MAX_ITEMS
    # Where the golden set report finds its golden set, floors and catalogue.
    evaluation_root: Path = DEFAULT_EVALUATION_ROOT
    # What reorders an assessment's passages per facet (ontology plan Phase 5).
    reranker_provider: RerankerProvider = RerankerProvider.LEXICAL
    reranker_url: str | None = None
    reranker_model: str | None = None
    reranker_api: RerankerApi = RerankerApi.RERANK
    reranker_api_key: str | None = field(default=None, repr=False)
    reranker_timeout_seconds: float = DEFAULT_RERANKER_TIMEOUT_SECONDS

    def __post_init__(self) -> None:
        validate_settings(self)

    @classmethod
    def from_env(cls, *, config_path: str | None = None) -> Settings:
        """Build settings from the process environment, loading .env if present.

        Each section has its own reader; they run in turn, and the first malformed
        value fails the boot.
        """
        load_dotenv()
        llm_config_path, llm_profiles = _llm_profiles_from_env(config_path)
        llm_provider = _llm_provider_from_env(llm_profiles)
        return cls(
            llm_provider=llm_provider,
            llm_config_path=llm_config_path,
            llm_profiles=llm_profiles,
            **_openai_from_env(),
            **_local_llm_from_env(),
            **_openrouter_from_env(llm_provider),
            **_persistence_from_env(),
            **_identity_from_env(),
            **_debug_trace_from_env(),
            **_ai_jobs_from_env(),
            **_deployment_from_env(),
            **_documents_from_env(),
            **_library_from_env(),
            **_operability_from_env(),
            **_apps_from_env(),
            **_product_catalog_from_env(),
            knowledge_review_cycle_days=_review_cycle_from_env(),
            **_ado_from_env(),
            evaluation_root=_evaluation_root_from_env(),
            **_reranker_from_env(),
        )


def _flag_from_env(name: str, *, default: bool) -> bool:
    """A true/false switch; any other value fails the boot."""
    raw = os.getenv(name, "true" if default else "false").strip().lower()
    if raw not in {"true", "false"}:
        raise ConfigurationError(f"{name} must be true or false.")
    return raw == "true"


def _llm_profiles_from_env(
    config_path: str | None,
) -> tuple[str | None, LLMProfileConfiguration | None]:
    """The LLM profiles file, from the caller or LLM_CONFIG_PATH, and what it configures."""
    llm_config_path = config_path or os.getenv("LLM_CONFIG_PATH", "").strip() or None
    llm_profiles = None
    if llm_config_path:
        try:
            llm_profiles = load_profiles(llm_config_path, dict(os.environ))
        except ProfileConfigurationError as exc:
            raise ConfigurationError(str(exc)) from exc
    return llm_config_path, llm_profiles


def _llm_provider_from_env(llm_profiles: LLMProfileConfiguration | None) -> LLMProvider:
    """Profiles, when a profiles file configures them; otherwise LLM_PROVIDER."""
    raw_provider = (
        "profiles"
        if llm_profiles
        else os.getenv("LLM_PROVIDER", LLMProvider.OPENAI.value).strip().lower()
    )
    try:
        return LLMProvider(raw_provider)
    except ValueError as exc:
        supported = ", ".join(sorted(p.value for p in LLMProvider))
        raise ConfigurationError(
            f"Unsupported LLM_PROVIDER {raw_provider!r}. Supported values: {supported}."
        ) from exc


def _openai_from_env() -> dict[str, Any]:
    raw_openai_timeout = os.getenv("OPENAI_TIMEOUT_SECONDS", "").strip()
    try:
        openai_timeout = (
            float(raw_openai_timeout) if raw_openai_timeout else DEFAULT_OPENAI_TIMEOUT_SECONDS
        )
    except ValueError as exc:
        raise ConfigurationError("OPENAI_TIMEOUT_SECONDS must be a number.") from exc
    return {
        "openai_api_key": os.getenv("OPENAI_API_KEY") or None,
        "openai_model": os.getenv("OPENAI_MODEL", "").strip() or DEFAULT_OPENAI_MODEL,
        "openai_timeout_seconds": openai_timeout,
        "openai_embedding_model": (
            os.getenv("OPENAI_EMBEDDING_MODEL", "").strip() or DEFAULT_OPENAI_EMBEDDING_MODEL
        ),
    }


def _local_llm_from_env() -> dict[str, Any]:
    """An OpenAI-compatible server on the operator's own hardware."""
    vision_enabled = _flag_from_env("LOCAL_LLM_VISION_ENABLED", default=False)
    raw_local_timeout = os.getenv("LOCAL_LLM_TIMEOUT_SECONDS", "").strip()
    raw_context_window = os.getenv("LOCAL_LLM_CONTEXT_WINDOW_TOKENS", "").strip()
    raw_max_output = os.getenv("LOCAL_LLM_MAX_OUTPUT_TOKENS", "").strip()
    try:
        local_timeout = (
            float(raw_local_timeout) if raw_local_timeout else DEFAULT_LOCAL_LLM_TIMEOUT_SECONDS
        )
    except ValueError as exc:
        raise ConfigurationError("LOCAL_LLM_TIMEOUT_SECONDS must be a number.") from exc
    try:
        context_window = (
            int(raw_context_window)
            if raw_context_window
            else DEFAULT_LOCAL_LLM_CONTEXT_WINDOW_TOKENS
        )
        max_output = int(raw_max_output) if raw_max_output else DEFAULT_LOCAL_LLM_MAX_OUTPUT_TOKENS
    except ValueError as exc:
        raise ConfigurationError(
            "LOCAL_LLM_CONTEXT_WINDOW_TOKENS and LOCAL_LLM_MAX_OUTPUT_TOKENS must be integers."
        ) from exc
    return {
        "local_llm_base_url": (
            os.getenv("LOCAL_LLM_BASE_URL", "").strip() or DEFAULT_LOCAL_LLM_BASE_URL
        ),
        "local_llm_model": os.getenv("LOCAL_LLM_MODEL", "").strip(),
        "local_embedding_model": os.getenv("LOCAL_EMBEDDING_MODEL", "").strip(),
        "local_llm_timeout_seconds": local_timeout,
        "local_llm_reasoning_effort": (os.getenv("LOCAL_LLM_REASONING_EFFORT", "").strip() or None),
        "local_llm_context_window_tokens": context_window,
        "local_llm_max_output_tokens": max_output,
        "local_llm_vision_enabled": vision_enabled,
    }


def _openrouter_from_env(provider: LLMProvider) -> dict[str, Any]:
    """OpenRouter; its timeout and output limit are parsed only when it is the provider."""
    raw_openrouter_timeout = os.getenv("OPENROUTER_TIMEOUT_SECONDS", "").strip()
    raw_openrouter_max_output = os.getenv("OPENROUTER_MAX_OUTPUT_TOKENS", "").strip()
    openrouter_timeout = DEFAULT_OPENROUTER_TIMEOUT_SECONDS
    if provider is LLMProvider.OPENROUTER and raw_openrouter_timeout:
        try:
            openrouter_timeout = float(raw_openrouter_timeout)
        except ValueError as exc:
            raise ConfigurationError("OPENROUTER_TIMEOUT_SECONDS must be a number.") from exc
    openrouter_max_output = DEFAULT_OPENROUTER_MAX_OUTPUT_TOKENS
    if provider is LLMProvider.OPENROUTER and raw_openrouter_max_output:
        try:
            openrouter_max_output = int(raw_openrouter_max_output)
        except ValueError as exc:
            raise ConfigurationError("OPENROUTER_MAX_OUTPUT_TOKENS must be an integer.") from exc
    return {
        "openrouter_api_key": os.getenv("OPENROUTER_API_KEY", "").strip() or None,
        "openrouter_model": os.getenv("OPENROUTER_MODEL", "").strip() or DEFAULT_OPENROUTER_MODEL,
        "openrouter_embedding_model": (
            os.getenv("OPENROUTER_EMBEDDING_MODEL", "").strip()
            or DEFAULT_OPENROUTER_EMBEDDING_MODEL
        ),
        "openrouter_base_url": (
            os.getenv("OPENROUTER_BASE_URL", "").strip() or DEFAULT_OPENROUTER_BASE_URL
        ),
        "openrouter_timeout_seconds": openrouter_timeout,
        "openrouter_max_output_tokens": openrouter_max_output,
        "openrouter_data_collection": (
            os.getenv("OPENROUTER_DATA_COLLECTION", "").strip().lower()
            or DEFAULT_OPENROUTER_DATA_COLLECTION
        ),
    }


def _persistence_from_env() -> dict[str, Any]:
    """Where durable state lives, and the pool of connections to it."""
    persistence_settings = PersistenceSettings.from_env()
    raw_pool_min = os.getenv("DATABASE_POOL_MIN_SIZE", "").strip()
    raw_pool_max = os.getenv("DATABASE_POOL_MAX_SIZE", "").strip()
    raw_pool_timeout = os.getenv("DATABASE_POOL_TIMEOUT_SECONDS", "").strip()
    try:
        pool_min = int(raw_pool_min) if raw_pool_min else DEFAULT_DATABASE_POOL_MIN_SIZE
        pool_max = int(raw_pool_max) if raw_pool_max else DEFAULT_DATABASE_POOL_MAX_SIZE
        pool_timeout = (
            float(raw_pool_timeout) if raw_pool_timeout else DEFAULT_DATABASE_POOL_TIMEOUT_SECONDS
        )
    except ValueError as exc:
        raise ConfigurationError("DATABASE_POOL_* settings must be numeric.") from exc
    return {
        "persistence_provider": persistence_settings.provider,
        "database_url": persistence_settings.database_url,
        "database_pool_min_size": pool_min,
        "database_pool_max_size": pool_max,
        "database_pool_timeout_seconds": pool_timeout,
    }


def _identity_from_env() -> dict[str, Any]:
    """Who signs people in: the offline fake, or an OIDC issuer and its login choices."""
    company_sso_enabled = _flag_from_env("OIDC_COMPANY_SSO_ENABLED", default=True)
    password_login_enabled = _flag_from_env("OIDC_PASSWORD_LOGIN_ENABLED", default=True)
    raw_identity = os.getenv("IDENTITY_PROVIDER", IdentityProvider.FAKE.value).strip().lower()
    try:
        identity_provider = IdentityProvider(raw_identity)
    except ValueError as exc:
        supported = ", ".join(item.value for item in IdentityProvider)
        raise ConfigurationError(
            f"Unsupported IDENTITY_PROVIDER {raw_identity!r}. Supported: {supported}."
        ) from exc
    allowed_algorithms = tuple(
        item.strip()
        for item in os.getenv("OIDC_ALLOWED_ALGORITHMS", "RS256,ES256").split(",")
        if item.strip()
    )
    raw_oidc_jwks_ttl = os.getenv("OIDC_JWKS_TTL_SECONDS", "").strip()
    raw_oidc_unknown_ttl = os.getenv("OIDC_UNKNOWN_KEY_TTL_SECONDS", "").strip()
    raw_oidc_unknown_cache = os.getenv("OIDC_UNKNOWN_KEY_CACHE_SIZE", "").strip()
    try:
        oidc_jwks_ttl = (
            float(raw_oidc_jwks_ttl) if raw_oidc_jwks_ttl else DEFAULT_OIDC_JWKS_TTL_SECONDS
        )
        oidc_unknown_ttl = (
            float(raw_oidc_unknown_ttl)
            if raw_oidc_unknown_ttl
            else DEFAULT_OIDC_UNKNOWN_KEY_TTL_SECONDS
        )
        oidc_unknown_cache = (
            int(raw_oidc_unknown_cache)
            if raw_oidc_unknown_cache
            else DEFAULT_OIDC_UNKNOWN_KEY_CACHE_SIZE
        )
    except ValueError as exc:
        raise ConfigurationError("OIDC key cache settings must be numeric.") from exc
    return {
        "identity_provider": identity_provider,
        "oidc_issuer_url": os.getenv("OIDC_ISSUER_URL", "").strip().rstrip("/"),
        "oidc_audience": os.getenv("OIDC_AUDIENCE", "").strip(),
        "oidc_client_id": os.getenv("OIDC_CLIENT_ID", "").strip(),
        "oidc_scopes": os.getenv("OIDC_SCOPES", "").strip() or "openid profile email",
        "oidc_company_sso_enabled": company_sso_enabled,
        "oidc_company_sso_alias": (
            os.getenv("OIDC_COMPANY_SSO_ALIAS", "").strip() or "company-sso"
        ),
        "oidc_password_login_enabled": password_login_enabled,
        "oidc_allowed_algorithms": allowed_algorithms,
        "oidc_jwks_ttl_seconds": oidc_jwks_ttl,
        "oidc_unknown_key_ttl_seconds": oidc_unknown_ttl,
        "oidc_unknown_key_cache_size": oidc_unknown_cache,
        "oidc_roles_claim": os.getenv("OIDC_ROLES_CLAIM", "roles").strip(),
    }


def _debug_trace_from_env() -> dict[str, Any]:
    """The opt-in development trace."""
    return {
        "debug_trace_enabled": _flag_from_env("DEBUG_TRACE_ENABLED", default=False),
        "debug_trace_path": os.getenv("DEBUG_TRACE_PATH", "").strip() or DEFAULT_DEBUG_TRACE_PATH,
    }


def _ai_jobs_from_env() -> dict[str, Any]:
    """Durable model-backed work: whether the API runs the workers, and their pace."""
    api_background_workers = _flag_from_env("API_BACKGROUND_WORKERS", default=True)
    raw_job_poll = os.getenv("AI_JOB_POLL_INTERVAL_SECONDS", "").strip()
    raw_job_shutdown_grace = os.getenv("AI_JOB_SHUTDOWN_GRACE_SECONDS", "").strip()
    try:
        job_poll = float(raw_job_poll) if raw_job_poll else DEFAULT_AI_JOB_POLL_INTERVAL_SECONDS
        job_shutdown_grace = (
            float(raw_job_shutdown_grace)
            if raw_job_shutdown_grace
            else DEFAULT_AI_JOB_SHUTDOWN_GRACE_SECONDS
        )
    except ValueError as exc:
        raise ConfigurationError("AI job worker settings must be numeric.") from exc
    return {
        "api_background_workers": api_background_workers,
        "ai_job_poll_interval_seconds": job_poll,
        "ai_job_shutdown_grace_seconds": job_shutdown_grace,
    }


def _deployment_from_env() -> dict[str, Any]:
    """Which environment this is, and whether production may map architecture yet."""
    return {
        "knowledge_evaluation_approved": _flag_from_env(
            "KNOWLEDGE_EVALUATION_APPROVED", default=False
        ),
        "app_environment": os.getenv("APP_ENV", "development").strip().lower(),
    }


def _documents_from_env() -> dict[str, Any]:
    """How large and complex an uploaded document may be, and how many are read at once."""
    raw_document_max = os.getenv("DOCUMENT_MAX_FILE_BYTES", "").strip()
    raw_extraction_timeout = os.getenv("DOCUMENT_EXTRACTION_TIMEOUT_SECONDS", "").strip()
    try:
        document_max = (
            int(raw_document_max) if raw_document_max else DEFAULT_DOCUMENT_MAX_FILE_BYTES
        )
        document_extraction_concurrency = int(
            os.getenv("DOCUMENT_EXTRACTION_CONCURRENCY", "")
            or DEFAULT_DOCUMENT_EXTRACTION_CONCURRENCY
        )
        catalogue_reading_concurrency = int(
            os.getenv("CATALOGUE_READING_CONCURRENCY", "") or DEFAULT_CATALOGUE_READING_CONCURRENCY
        )
        document_extraction_queue = int(
            os.getenv("DOCUMENT_EXTRACTION_QUEUE", "") or DEFAULT_DOCUMENT_EXTRACTION_QUEUE
        )
        document_extraction_memory_bytes = int(
            os.getenv("DOCUMENT_EXTRACTION_MEMORY_BYTES", "")
            or DEFAULT_DOCUMENT_EXTRACTION_MEMORY_BYTES
        )
        document_max_pdf_pages = int(
            os.getenv("DOCUMENT_MAX_PDF_PAGES", "") or DEFAULT_DOCUMENT_MAX_PDF_PAGES
        )
        document_max_extracted_characters = int(
            os.getenv("DOCUMENT_MAX_EXTRACTED_CHARACTERS", "")
            or DEFAULT_DOCUMENT_MAX_EXTRACTED_CHARACTERS
        )
        document_max_xml_nodes = int(
            os.getenv("DOCUMENT_MAX_XML_NODES", "") or DEFAULT_DOCUMENT_MAX_XML_NODES
        )
        document_max_image_pixels = int(
            os.getenv("DOCUMENT_MAX_IMAGE_PIXELS", "") or DEFAULT_DOCUMENT_MAX_IMAGE_PIXELS
        )
        document_max_spreadsheet_cells = int(
            os.getenv("DOCUMENT_MAX_SPREADSHEET_CELLS", "")
            or DEFAULT_DOCUMENT_MAX_SPREADSHEET_CELLS
        )
        document_extraction_timeout = (
            float(raw_extraction_timeout)
            if raw_extraction_timeout
            else DEFAULT_DOCUMENT_EXTRACTION_TIMEOUT_SECONDS
        )
    except ValueError as exc:
        raise ConfigurationError(
            "Document size, complexity, concurrency, and timeout settings must be numeric."
        ) from exc
    return {
        "document_max_file_bytes": document_max,
        "document_extraction_concurrency": document_extraction_concurrency,
        "catalogue_reading_concurrency": catalogue_reading_concurrency,
        "document_extraction_queue": document_extraction_queue,
        "document_extraction_timeout_seconds": document_extraction_timeout,
        "document_extraction_memory_bytes": document_extraction_memory_bytes,
        "document_max_pdf_pages": document_max_pdf_pages,
        "document_max_extracted_characters": document_max_extracted_characters,
        "document_max_xml_nodes": document_max_xml_nodes,
        "document_max_image_pixels": document_max_image_pixels,
        "document_max_spreadsheet_cells": document_max_spreadsheet_cells,
    }


def _library_from_env() -> dict[str, Any]:
    """Library and catalogue uploads: the malware scanner, OCR models and office previews."""
    return {
        "library_scan_mode": os.getenv("LIBRARY_SCAN_MODE", "clamav").strip(),
        "library_ocr_artifacts_path": os.getenv("LIBRARY_OCR_ARTIFACTS_PATH", "").strip(),
        "document_office_preview_executable": os.getenv(
            "DOCUMENT_OFFICE_PREVIEW_EXECUTABLE", ""
        ).strip(),
        "library_scanner_host": os.getenv("LIBRARY_SCANNER_HOST", "127.0.0.1").strip(),
        "library_scanner_port": _library_scanner_port(),
    }


def _library_scanner_port() -> int:
    try:
        return int(os.getenv("LIBRARY_SCANNER_PORT", "3310"))
    except ValueError as exc:
        raise ConfigurationError("LIBRARY_SCANNER_PORT must be an integer.") from exc


def _operability_from_env() -> dict[str, Any]:
    """Rate limiting, logging and metrics: the knobs an operator tunes per deployment."""
    raw_limit = os.getenv("PROVIDER_RATE_LIMIT_PER_MINUTE", "").strip()
    raw_format = os.getenv("LOG_FORMAT", LogFormat.TEXT.value).strip().lower()
    raw_port = os.getenv("METRICS_PORT", "").strip()
    raw_body = os.getenv("REQUEST_MAX_BODY_BYTES", "").strip()
    try:
        limit = int(raw_limit) if raw_limit else DEFAULT_PROVIDER_RATE_LIMIT_PER_MINUTE
        port = int(raw_port) if raw_port else None
        body = int(raw_body) if raw_body else DEFAULT_REQUEST_MAX_BODY_BYTES
    except ValueError as exc:
        raise ConfigurationError(
            "PROVIDER_RATE_LIMIT_PER_MINUTE, METRICS_PORT and REQUEST_MAX_BODY_BYTES "
            "must be whole numbers."
        ) from exc
    try:
        log_format = LogFormat(raw_format)
    except ValueError as exc:
        raise ConfigurationError("LOG_FORMAT must be text or json.") from exc
    return {
        "provider_rate_limit_per_minute": limit,
        "log_level": os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO",
        "log_format": log_format,
        "metrics_port": port,
        "metrics_host": os.getenv("METRICS_HOST", "127.0.0.1").strip(),
        "request_max_body_bytes": body,
    }


# Settings of the link with requirement work that ADR-0126 renamed, and what replaced them.
_RENAMED = {
    "REQUIREMENT_SERVICE_TOKEN": "APP_TOKENS=<app name>=<token>",
    "REQUIREMENT_SERVICE_CLIENT_ID": "APP_CLIENT_IDS=<client id>",
    "REQUIREMENT_API_BASE_URL": "nothing: the knowledge base calls no app",
    "KNOWLEDGE_SERVICE_TOKEN": "nothing: the knowledge base calls no app",
    "KNOWLEDGE_SERVICE_CLIENT_ID": "nothing: the knowledge base calls no app",
    "KNOWLEDGE_SERVICE_CLIENT_SECRET": "nothing: the knowledge base calls no app",
}


def _apps_from_env() -> dict[str, Any]:
    """The apps that may read the knowledge base (ADR-0126).

    APP_TOKENS is a comma-separated list of name=token; APP_CLIENT_IDS a comma-separated
    list of client ids. A setting of the old link with requirement work fails the boot with
    its replacement, so a deployment never silently loses an app.
    """
    for old, replacement in _RENAMED.items():
        if os.getenv(old, "").strip():
            raise ConfigurationError(f"{old} is no longer read; use {replacement} (ADR-0126).")
    tokens: dict[str, str] = {}
    for entry in _listed(os.getenv("APP_TOKENS", "")):
        name, separator, token = entry.partition("=")
        if not separator or not name.strip() or not token.strip():
            raise ConfigurationError("APP_TOKENS lists name=token pairs, separated by commas.")
        if name.strip() in tokens:
            raise ConfigurationError(f"APP_TOKENS names {name.strip()} twice.")
        tokens[name.strip()] = token.strip()
    return {
        "app_tokens": tokens,
        "app_client_ids": tuple(_listed(os.getenv("APP_CLIENT_IDS", ""))),
    }


def _listed(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _reranker_from_env() -> dict[str, Any]:
    """The reranker of an assessment's passages (ontology plan Phase 5)."""
    raw_provider = os.getenv("RERANKER_PROVIDER", "lexical").strip().lower() or "lexical"
    raw_api = os.getenv("RERANKER_API", "rerank").strip().lower() or "rerank"
    raw_timeout = os.getenv("RERANKER_TIMEOUT_SECONDS", "").strip()
    try:
        provider = RerankerProvider(raw_provider)
    except ValueError as exc:
        raise ConfigurationError("RERANKER_PROVIDER must be lexical, none or http.") from exc
    try:
        api = RerankerApi(raw_api)
    except ValueError as exc:
        raise ConfigurationError("RERANKER_API must be rerank or tei.") from exc
    try:
        timeout = float(raw_timeout) if raw_timeout else DEFAULT_RERANKER_TIMEOUT_SECONDS
    except ValueError as exc:
        raise ConfigurationError("RERANKER_TIMEOUT_SECONDS must be a number.") from exc
    return {
        "reranker_provider": provider,
        "reranker_url": os.getenv("RERANKER_URL", "").strip() or None,
        "reranker_model": os.getenv("RERANKER_MODEL", "").strip() or None,
        "reranker_api": api,
        "reranker_api_key": os.getenv("RERANKER_API_KEY", "").strip() or None,
        "reranker_timeout_seconds": timeout,
    }


def _ado_from_env() -> dict[str, Any]:
    """Knowledge Center E: the read-only Azure DevOps source of historic breakdowns."""
    raw_provider = os.getenv("ADO_PROVIDER", "none").strip().lower() or "none"
    raw_max = os.getenv("ADO_IMPORT_MAX_ITEMS", "").strip()
    try:
        provider = AdoProvider(raw_provider)
    except ValueError as exc:
        raise ConfigurationError("ADO_PROVIDER must be none or fake.") from exc
    try:
        max_items = int(raw_max) if raw_max else DEFAULT_ADO_IMPORT_MAX_ITEMS
    except ValueError as exc:
        raise ConfigurationError("ADO_IMPORT_MAX_ITEMS must be a whole number.") from exc
    return {"ado_provider": provider, "ado_import_max_items": max_items}


def _evaluation_root_from_env() -> Path:
    raw = os.getenv("EVALUATION_ROOT", "").strip()
    return Path(raw) if raw else DEFAULT_EVALUATION_ROOT


def _review_cycle_from_env() -> int:
    raw = os.getenv("KNOWLEDGE_REVIEW_CYCLE_DAYS", "").strip()
    try:
        return int(raw) if raw else DEFAULT_KNOWLEDGE_REVIEW_CYCLE_DAYS
    except ValueError as exc:
        raise ConfigurationError("KNOWLEDGE_REVIEW_CYCLE_DAYS must be a whole number.") from exc


def _product_catalog_from_env() -> dict[str, Any]:
    """Where plans and prices come from; unset, the explorer says no catalog is read."""
    raw_provider = os.getenv("PRODUCT_CATALOG_PROVIDER", "none").strip().lower() or "none"
    raw_cache = os.getenv("PRODUCT_CATALOG_CACHE_SECONDS", "").strip()
    try:
        provider = ProductCatalogProvider(raw_provider)
    except ValueError as exc:
        raise ConfigurationError("PRODUCT_CATALOG_PROVIDER must be none, fake or tmf620.") from exc
    try:
        cache = int(raw_cache) if raw_cache else DEFAULT_PRODUCT_CATALOG_CACHE_SECONDS
    except ValueError as exc:
        raise ConfigurationError("PRODUCT_CATALOG_CACHE_SECONDS must be a whole number.") from exc
    return {
        "product_catalog_provider": provider,
        "product_catalog_url": os.getenv("PRODUCT_CATALOG_URL", "").strip() or None,
        "product_catalog_token": os.getenv("PRODUCT_CATALOG_TOKEN", "").strip() or None,
        "product_catalog_code_field": os.getenv("PRODUCT_CATALOG_CODE_FIELD", "id").strip() or "id",
        "product_catalog_cache_seconds": cache,
    }
