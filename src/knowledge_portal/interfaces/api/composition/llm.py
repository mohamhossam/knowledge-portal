"""Model provider selection: one decision, every focused adapter built from it."""

from __future__ import annotations

from contextlib import ExitStack
from dataclasses import dataclass, replace

import httpx as httpx
import httpx2
from openai import DefaultHttpxClient, OpenAI
from smb_kernel.diagnostics import DebugTrace, build_debug_trace
from smb_kernel.llm.compatible_transport import (
    CompatibleStructuredOutputClient,
    ConfiguredKnowledgeEmbedding,
)
from smb_kernel.llm.local_structured_output import LocalStructuredOutputClient
from smb_kernel.llm.openai_structured_output import OpenAIStructuredOutputClient
from smb_kernel.llm.openrouter_structured_output import OpenRouterStructuredOutputClient
from smb_kernel.llm.structured_output import StructuredOutputClient
from smb_kernel.observability.metrics import MeteredTransport, MeteredTransport2, Metrics

from knowledge_portal.application.ports.architecture_rag import ArchitectureReasonerPort
from knowledge_portal.application.ports.catalogue_extractor import CatalogueExtractorPort
from knowledge_portal.application.ports.embedding import KnowledgeEmbeddingPort
from knowledge_portal.application.ports.system_matcher import SystemMatcherPort
from knowledge_portal.infrastructure.architecture.embeddings import ArchitectureEmbeddings
from knowledge_portal.infrastructure.architecture.reasoning import (
    FakeArchitectureReasoner,
    StructuredArchitectureReasoner,
)
from knowledge_portal.infrastructure.config.options import ConfigurationError, LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.llm.catalogue_extraction import (
    FakeCatalogueExtractor,
    StructuredCatalogueExtractor,
)
from knowledge_portal.infrastructure.llm.catalogue_matching import (
    FakeSystemMatcher,
    StructuredSystemMatcher,
)
from knowledge_portal.infrastructure.llm.embeddings import (
    FakeKnowledgeEmbedding,
    LocalKnowledgeEmbedding,
    OpenAIKnowledgeEmbedding,
    OpenRouterKnowledgeEmbedding,
)

# Hosted models configured without a profile declare no context window; this is
# conservative for current OpenAI and OpenRouter models.
HOSTED_MODEL_INPUT_TOKENS = 100_000


@dataclass(frozen=True)
class LLMAdapters:
    """Every model-backed adapter, from one provider decision."""

    knowledge_embedding: KnowledgeEmbeddingPort
    catalogue_extractor: CatalogueExtractorPort
    system_matcher: SystemMatcherPort
    architecture_reasoner: ArchitectureReasonerPort
    debug_trace: DebugTrace
    # Owns the HTTP clients the adapters share; closed with the container.
    resources: ExitStack

    def close(self) -> None:
        self.resources.close()


@dataclass(frozen=True)
class _Models:
    """One provider's catalogue and knowledge clients and their limits."""

    catalogue: StructuredOutputClient
    knowledge: StructuredOutputClient
    embedding: KnowledgeEmbeddingPort
    catalogue_images: bool
    catalogue_input_tokens: int
    catalogue_output_tokens: int | None
    knowledge_input_tokens: int


def build_llm_adapters(settings: Settings, metrics: Metrics) -> LLMAdapters:
    with ExitStack() as resources:
        result = _build_llm_adapters(settings, resources, metrics)
        return replace(result, resources=resources.pop_all())


def _build_llm_adapters(settings: Settings, resources: ExitStack, metrics: Metrics) -> LLMAdapters:
    """Select the configured provider once and construct its focused adapters."""
    debug_trace = build_debug_trace(
        enabled=settings.debug_trace_enabled,
        path=settings.debug_trace_path,
        secrets=tuple(
            value
            for value in (
                settings.openai_api_key,
                settings.openrouter_api_key,
                settings.database_url,
                settings.requirement_service_token,
                settings.knowledge_service_token,
                settings.knowledge_service_client_secret,
                *(settings.llm_profiles.secrets if settings.llm_profiles else ()),
            )
            if value
        ),
    )
    resources.callback(debug_trace.close)
    if settings.llm_provider is LLMProvider.FAKE:
        return LLMAdapters(
            knowledge_embedding=FakeKnowledgeEmbedding(),
            catalogue_extractor=FakeCatalogueExtractor(),
            system_matcher=FakeSystemMatcher(),
            architecture_reasoner=FakeArchitectureReasoner(),
            debug_trace=debug_trace,
            resources=resources,
        )
    models = _models(settings, resources, debug_trace, metrics)
    return LLMAdapters(
        knowledge_embedding=models.embedding,
        catalogue_extractor=StructuredCatalogueExtractor(
            models.catalogue,
            supports_images=models.catalogue_images,
            max_input_tokens=models.catalogue_input_tokens,
            **(
                {"max_output_tokens": models.catalogue_output_tokens}
                if models.catalogue_output_tokens is not None
                else {}
            ),
        ),
        system_matcher=StructuredSystemMatcher(
            models.catalogue,
            ArchitectureEmbeddings(models.embedding),
            max_input_tokens=models.catalogue_input_tokens,
        ),
        architecture_reasoner=StructuredArchitectureReasoner(
            models.knowledge, max_input_tokens=models.knowledge_input_tokens
        ),
        debug_trace=debug_trace,
        resources=resources,
    )


def _models(
    settings: Settings, resources: ExitStack, debug_trace: DebugTrace, metrics: Metrics
) -> _Models:
    if settings.llm_provider is LLMProvider.PROFILES:
        config = settings.llm_profiles
        if config is None:  # Enforced by Settings for LLM_PROVIDER=profiles.
            raise ConfigurationError("LLM_PROVIDER=profiles requires LLM_CONFIG_PATH.")
        http = resources.enter_context(
            httpx.Client(transport=MeteredTransport(metrics, "profiles", httpx.HTTPTransport()))
        )
        catalogue = config.for_task("catalogue")
        knowledge = config.for_task("knowledge")
        debug_trace.record("models.configured", profiles=config.summary())
        return _Models(
            catalogue=CompatibleStructuredOutputClient(catalogue, http, debug_trace),
            knowledge=CompatibleStructuredOutputClient(knowledge, http, debug_trace),
            embedding=ConfiguredKnowledgeEmbedding(config.selected_embedding, http, debug_trace),
            catalogue_images=catalogue.images,
            catalogue_input_tokens=catalogue.context_tokens - catalogue.output_tokens,
            catalogue_output_tokens=catalogue.output_tokens,
            knowledge_input_tokens=knowledge.context_tokens - knowledge.output_tokens,
        )
    if settings.llm_provider is LLMProvider.LOCAL:
        http_client = resources.enter_context(
            httpx.Client(transport=MeteredTransport(metrics, "local", httpx.HTTPTransport()))
        )
        local = LocalStructuredOutputClient(
            http_client=http_client,
            base_url=settings.local_llm_base_url,
            model=settings.local_llm_model,
            timeout_seconds=settings.local_llm_timeout_seconds,
            reasoning_effort=settings.local_llm_reasoning_effort,
            context_window_tokens=settings.local_llm_context_window_tokens,
            max_output_tokens=settings.local_llm_max_output_tokens,
            debug_trace=debug_trace,
        )
        input_tokens = (
            settings.local_llm_context_window_tokens - settings.local_llm_max_output_tokens
        )
        return _Models(
            catalogue=local,
            knowledge=local,
            embedding=LocalKnowledgeEmbedding(
                settings.local_llm_base_url,
                settings.local_embedding_model,
                settings.local_llm_timeout_seconds,
                http_client,
            ),
            catalogue_images=settings.local_llm_vision_enabled,
            catalogue_input_tokens=input_tokens,
            catalogue_output_tokens=settings.local_llm_max_output_tokens,
            knowledge_input_tokens=input_tokens,
        )
    if settings.llm_provider is LLMProvider.OPENROUTER:
        if settings.openrouter_api_key is None:  # guarded by Settings, keeps mypy explicit
            raise AssertionError("OpenRouter settings require OPENROUTER_API_KEY.")
        http_client = resources.enter_context(
            httpx.Client(transport=MeteredTransport(metrics, "openrouter", httpx.HTTPTransport()))
        )
        openrouter = OpenRouterStructuredOutputClient(
            http_client=http_client,
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
            timeout_seconds=settings.openrouter_timeout_seconds,
            max_output_tokens=settings.openrouter_max_output_tokens,
            data_collection=settings.openrouter_data_collection,
            debug_trace=debug_trace,
        )
        return _Models(
            catalogue=openrouter,
            knowledge=openrouter,
            embedding=OpenRouterKnowledgeEmbedding(
                base_url=settings.openrouter_base_url,
                http_client=http_client,
                api_key=settings.openrouter_api_key,
                model=settings.openrouter_embedding_model,
                timeout_seconds=settings.openrouter_timeout_seconds,
                data_collection=settings.openrouter_data_collection,
            ),
            catalogue_images=True,
            catalogue_input_tokens=HOSTED_MODEL_INPUT_TOKENS,
            catalogue_output_tokens=settings.openrouter_max_output_tokens,
            knowledge_input_tokens=HOSTED_MODEL_INPUT_TOKENS,
        )
    if settings.openai_api_key is None:  # guarded by Settings, keeps mypy explicit
        raise AssertionError("OpenAI settings require OPENAI_API_KEY.")
    client = resources.enter_context(
        OpenAI(
            api_key=settings.openai_api_key,
            http_client=DefaultHttpxClient(
                transport=MeteredTransport2(metrics, "openai", httpx2.HTTPTransport())
            ),
        )
    )
    openai = OpenAIStructuredOutputClient(
        client, model=settings.openai_model, timeout_seconds=settings.openai_timeout_seconds
    )
    return _Models(
        catalogue=openai,
        knowledge=openai,
        embedding=OpenAIKnowledgeEmbedding(client, settings.openai_embedding_model),
        catalogue_images=True,
        catalogue_input_tokens=HOSTED_MODEL_INPUT_TOKENS,
        catalogue_output_tokens=None,
        knowledge_input_tokens=HOSTED_MODEL_INPUT_TOKENS,
    )
