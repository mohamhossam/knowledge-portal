"""Configuration and composition: what this service runs with, and what it builds."""

from __future__ import annotations

from dataclasses import replace

import pytest

from knowledge_portal.infrastructure.config.options import (
    ConfigurationError,
    IdentityProvider,
    LLMProvider,
    LogFormat,
    PersistenceProvider,
)
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.llm.catalogue_extraction import StructuredCatalogueExtractor
from knowledge_portal.infrastructure.llm.embeddings import (
    LocalKnowledgeEmbedding,
    OpenAIKnowledgeEmbedding,
    OpenRouterKnowledgeEmbedding,
)
from knowledge_portal.infrastructure.requirement_client import (
    FakeArchitectureMappingStats,
    FakeRequirementDependents,
    FakeRequirementImpact,
    HttpArchitectureMappingStats,
    HttpRequirementDependents,
    HttpRequirementImpact,
)
from knowledge_portal.interfaces.api.container import build_container
from tests.conftest import FAKE_PROVIDER_SETTINGS

TOKEN = "t" * 40
PRODUCTION = Settings(
    llm_provider=LLMProvider.FAKE,
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
        (
            {"requirement_api_base_url": "http://requirements", "knowledge_service_token": "s"},
            "KNOWLEDGE_SERVICE_TOKEN must be at least 32",
        ),
        ({"requirement_api_base_url": "http://requirements"}, "set together"),
        ({"knowledge_service_token": TOKEN}, "set together"),
        (
            {"requirement_api_base_url": "requirements:8000", "knowledge_service_token": TOKEN},
            r"http\(s\) URL",
        ),
    ],
)
def test_service_settings_are_checked_at_startup(changes: dict[str, str], message: str) -> None:
    with pytest.raises(ConfigurationError, match=message):
        replace(FAKE_PROVIDER_SETTINGS, **changes)  # type: ignore[arg-type]


def test_production_reaches_requirement_work_over_http() -> None:
    with pytest.raises(ConfigurationError, match="REQUIREMENT_API_BASE_URL"):
        replace(PRODUCTION, app_environment="production", knowledge_evaluation_approved=True)
    connected = replace(
        PRODUCTION,
        app_environment="production",
        knowledge_evaluation_approved=True,
        requirement_api_base_url="http://requirements",
        knowledge_service_token=TOKEN,
    )
    assert connected.requirement_api_base_url == "http://requirements"


def test_service_settings_are_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("REQUIREMENT_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("REQUIREMENT_API_BASE_URL", "http://requirements:8000")
    monkeypatch.setenv("KNOWLEDGE_SERVICE_TOKEN", "k" * 40)

    settings = Settings.from_env()

    assert settings.requirement_service_token == TOKEN
    assert settings.requirement_api_base_url == "http://requirements:8000"
    assert settings.knowledge_service_token == "k" * 40
    # Secrets never reach a log line through the settings' repr.
    assert TOKEN not in repr(settings) and "k" * 40 not in repr(settings)


def test_without_requirement_work_the_fakes_stand_in() -> None:
    container = build_container(FAKE_PROVIDER_SETTINGS)
    try:
        assert isinstance(container.library_governance._dependents, FakeRequirementDependents)
        assert isinstance(container.report_mapping_impact._stats, FakeArchitectureMappingStats)
        assert isinstance(container.document_source_impact._impact, FakeRequirementImpact)
    finally:
        container.close_resources()


def test_with_requirement_work_configured_the_http_adapters_are_used() -> None:
    container = build_container(
        replace(
            FAKE_PROVIDER_SETTINGS,
            requirement_api_base_url="http://requirements",
            knowledge_service_token=TOKEN,
        )
    )
    try:
        assert isinstance(container.library_governance._dependents, HttpRequirementDependents)
        assert isinstance(container.report_mapping_impact._stats, HttpArchitectureMappingStats)
        assert isinstance(container.document_source_impact._impact, HttpRequirementImpact)
    finally:
        container.close_resources()


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
        }
    finally:
        container.close_resources()


def test_fake_models_finish_catalogue_jobs_inside_the_request() -> None:
    container = build_container(FAKE_PROVIDER_SETTINGS)
    try:
        # Historic imports always queue: reading a BRD never runs inside a request.
        assert set(container.background_workers) == {"document_worker", "historic_import_worker"}
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
