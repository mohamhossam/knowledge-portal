"""Configuration and composition: what this service runs with, and what it builds."""

from __future__ import annotations

from dataclasses import replace

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor

from knowledge_portal.infrastructure.config.options import (
    ConfigurationError,
    IdentityProvider,
    LLMProvider,
    LogFormat,
    PersistenceProvider,
    ProductCatalogProvider,
)
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.llm.catalogue_extraction import StructuredCatalogueExtractor
from knowledge_portal.infrastructure.llm.embeddings import (
    LocalKnowledgeEmbedding,
    OpenAIKnowledgeEmbedding,
    OpenRouterKnowledgeEmbedding,
)
from knowledge_portal.interfaces.api.container import build_container
from tests.conftest import FAKE_PROVIDER_SETTINGS

TOKEN = "t" * 40
PRODUCTION = Settings(
    # Production refuses the fake LLM, so the fixture names a real provider.
    llm_provider=LLMProvider.OPENAI,
    openai_api_key="sk-test-not-a-real-key",
    persistence_provider=PersistenceProvider.POSTGRES,
    database_url="postgresql://example/test",
    identity_provider=IdentityProvider.OIDC,
    oidc_issuer_url="https://identity.example/tenant",
    oidc_audience="api://knowledge",
    oidc_client_id="browser",
)


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"requirement_service_token": "short"}, "REQUIREMENT_SERVICE_TOKEN must be at least 32"),
    ],
)
def test_service_settings_are_checked_at_startup(changes: dict[str, str], message: str) -> None:
    with pytest.raises(ConfigurationError, match=message):
        replace(FAKE_PROVIDER_SETTINGS, **changes)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"llm_provider": LLMProvider.FAKE}, "refuses LLM_PROVIDER=fake"),
        (
            {"product_catalog_provider": ProductCatalogProvider.FAKE},
            "refuses PRODUCT_CATALOG_PROVIDER=fake",
        ),
        ({"debug_trace_enabled": True}, "refuses DEBUG_TRACE_ENABLED"),
    ],
)
def test_production_refuses_development_conveniences(
    changes: dict[str, object], message: str
) -> None:
    with pytest.raises(ConfigurationError, match=message):
        replace(
            PRODUCTION,
            app_environment="production",
            knowledge_evaluation_approved=True,
            **changes,  # type: ignore[arg-type]
        )


def test_service_settings_are_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("REQUIREMENT_SERVICE_TOKEN", TOKEN)

    settings = Settings.from_env()

    assert settings.requirement_service_token == TOKEN
    # Secrets never reach a log line through the settings' repr.
    assert TOKEN not in repr(settings)


@pytest.mark.parametrize(
    ("settings", "embedding"),
    [
        (
            Settings(
                llm_provider=LLMProvider.LOCAL, local_llm_model="m", local_embedding_model="e"
            ),
            LocalKnowledgeEmbedding,
        ),
        (
            Settings(llm_provider=LLMProvider.OPENROUTER, openrouter_api_key="or-key"),
            OpenRouterKnowledgeEmbedding,
        ),
        (
            Settings(llm_provider=LLMProvider.OPENAI, openai_api_key="sk-test"),
            OpenAIKnowledgeEmbedding,
        ),
    ],
)
def test_each_provider_builds_its_catalogue_models_and_queues_jobs(
    settings: Settings, embedding: type
) -> None:
    container = build_container(settings)
    try:
        assert isinstance(container.reference_knowledge._embeddings, embedding)
        extractor = container.architecture_jobs._proposer._extractor
        assert isinstance(extractor._model, StructuredCatalogueExtractor)  # type: ignore[attr-defined]
        # Real models run catalogue jobs on the background worker, not in the request.
        assert set(container.background_workers) == {
            "document_worker",
            "architecture_job_worker",
            "historic_import_worker",
            "golden_run_worker",
        }
    finally:
        container.close_resources()


def test_fake_models_finish_catalogue_jobs_inside_the_request() -> None:
    container = build_container(FAKE_PROVIDER_SETTINGS)
    try:
        # Historic imports always queue: reading a BRD never runs inside a request.
        assert set(container.background_workers) == {
            "document_worker",
            "historic_import_worker",
            "golden_run_worker",
        }
    finally:
        container.close_resources()


def test_architecture_documents_are_read_within_the_operator_limits() -> None:
    settings = replace(
        FAKE_PROVIDER_SETTINGS,
        document_max_pdf_pages=11,
        document_max_extracted_characters=22,
        document_max_spreadsheet_cells=33,
        document_max_image_pixels=44,
        document_max_xml_nodes=55,
    )
    container = build_container(settings)
    try:
        extractor = container.upload_knowledge_document._extractor
        assert isinstance(extractor, SafeDocumentTextExtractor)
        assert (
            extractor._max_pdf_pages,
            extractor._max_extracted_characters,
            extractor._max_visited_spreadsheet_cells,
            extractor._max_decoded_image_pixels,
            extractor._max_xml_nodes,
        ) == (11, 22, 33, 44, 55)
    finally:
        container.close_resources()


def test_database_pool_settings_are_read_and_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("DATABASE_POOL_MIN_SIZE", "2")
    monkeypatch.setenv("DATABASE_POOL_MAX_SIZE", "7")
    monkeypatch.setenv("DATABASE_POOL_TIMEOUT_SECONDS", "3.5")
    settings = Settings.from_env()
    assert (
        settings.database_pool_min_size,
        settings.database_pool_max_size,
        settings.database_pool_timeout_seconds,
    ) == (2, 7, 3.5)

    with pytest.raises(ConfigurationError, match="DATABASE_POOL_MIN_SIZE"):
        Settings(llm_provider=LLMProvider.FAKE, database_pool_min_size=8, database_pool_max_size=7)
    with pytest.raises(ConfigurationError, match="DATABASE_POOL_MAX_SIZE must be at least 1"):
        Settings(llm_provider=LLMProvider.FAKE, database_pool_min_size=0, database_pool_max_size=0)
    with pytest.raises(ConfigurationError, match="DATABASE_POOL_TIMEOUT_SECONDS"):
        Settings(llm_provider=LLMProvider.FAKE, database_pool_timeout_seconds=0)
    monkeypatch.setenv("DATABASE_POOL_MAX_SIZE", "many")
    with pytest.raises(ConfigurationError, match="DATABASE_POOL_"):
        Settings.from_env()


def test_http_only_api_requires_a_queue_a_separate_worker_can_see(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ConfigurationError, match="API_BACKGROUND_WORKERS=false requires"):
        Settings(llm_provider=LLMProvider.FAKE, api_background_workers=False)
    http_only = Settings(
        llm_provider=LLMProvider.FAKE,
        persistence_provider=PersistenceProvider.POSTGRES,
        database_url="postgresql://example/test",
        api_background_workers=False,
    )
    assert http_only.api_background_workers is False

    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("API_BACKGROUND_WORKERS", "sometimes")
    with pytest.raises(ConfigurationError, match="API_BACKGROUND_WORKERS must be true or false"):
        Settings.from_env()


@pytest.mark.parametrize(
    ("name", "attribute", "default"),
    [
        ("LOCAL_LLM_VISION_ENABLED", "local_llm_vision_enabled", False),
        ("OIDC_COMPANY_SSO_ENABLED", "oidc_company_sso_enabled", True),
        ("OIDC_PASSWORD_LOGIN_ENABLED", "oidc_password_login_enabled", True),
        ("DEBUG_TRACE_ENABLED", "debug_trace_enabled", False),
        ("API_BACKGROUND_WORKERS", "api_background_workers", True),
        ("KNOWLEDGE_EVALUATION_APPROVED", "knowledge_evaluation_approved", False),
    ],
)
def test_each_switch_reads_true_or_false_and_refuses_anything_else(
    monkeypatch: pytest.MonkeyPatch, name: str, attribute: str, default: bool
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    # PostgreSQL lets API_BACKGROUND_WORKERS be turned off too.
    monkeypatch.setenv("PERSISTENCE_PROVIDER", "postgres")
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/test")
    monkeypatch.delenv(name, raising=False)
    assert getattr(Settings.from_env(), attribute) is default

    monkeypatch.setenv(name, f" {str(not default).upper()} ")
    assert getattr(Settings.from_env(), attribute) is (not default)

    monkeypatch.setenv(name, "sometimes")
    with pytest.raises(ConfigurationError, match=f"{name} must be true or false"):
        Settings.from_env()


class TestOperabilitySettings:
    def test_defaults_log_text_limit_providers_and_export_no_metrics(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "fake")
        for name in ("PROVIDER_RATE_LIMIT_PER_MINUTE", "LOG_LEVEL", "LOG_FORMAT", "METRICS_PORT"):
            monkeypatch.delenv(name, raising=False)

        settings = Settings.from_env()

        assert settings.provider_rate_limit_per_minute == 30
        assert settings.log_level == "INFO"
        assert settings.log_format is LogFormat.TEXT
        assert settings.metrics_port is None

    def test_reads_the_operator_choices(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "fake")
        monkeypatch.setenv("PROVIDER_RATE_LIMIT_PER_MINUTE", "0")
        monkeypatch.setenv("LOG_LEVEL", "warning")
        monkeypatch.setenv("LOG_FORMAT", "JSON")
        monkeypatch.setenv("METRICS_PORT", "9464")
        monkeypatch.setenv("METRICS_HOST", "0.0.0.0")

        settings = Settings.from_env()

        assert settings.provider_rate_limit_per_minute == 0
        assert settings.log_level == "WARNING"
        assert settings.log_format is LogFormat.JSON
        assert (settings.metrics_host, settings.metrics_port) == ("0.0.0.0", 9464)

    @pytest.mark.parametrize(
        ("name", "value", "message"),
        [
            ("PROVIDER_RATE_LIMIT_PER_MINUTE", "-1", "PROVIDER_RATE_LIMIT_PER_MINUTE"),
            ("PROVIDER_RATE_LIMIT_PER_MINUTE", "many", "whole numbers"),
            ("LOG_LEVEL", "LOUD", "LOG_LEVEL"),
            ("LOG_FORMAT", "xml", "LOG_FORMAT"),
            ("METRICS_PORT", "70000", "METRICS_PORT"),
            ("METRICS_HOST", "  ", "METRICS_HOST"),
            ("REQUEST_MAX_BODY_BYTES", "100", "REQUEST_MAX_BODY_BYTES"),
            ("REQUEST_MAX_BODY_BYTES", "big", "whole numbers"),
        ],
    )
    def test_rejects_invalid_values_at_startup(
        self, monkeypatch: pytest.MonkeyPatch, name: str, value: str, message: str
    ) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "fake")
        monkeypatch.setenv(name, value)

        with pytest.raises(ConfigurationError, match=message):
            Settings.from_env()
