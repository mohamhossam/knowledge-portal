"""Reranking an assessment's passages (ontology plan Phase 5).

The lexical reranker is the default and the fakes' reranker; the HTTP one asks a
cross-encoder and, whatever it answers, never fails the assessment.
"""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

import httpx
import pytest

from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.infrastructure.architecture.passage_reranking import (
    HttpPassageReranker,
    IndexOrder,
    LexicalPassageReranker,
)
from knowledge_portal.infrastructure.config.options import (
    ConfigurationError,
    RerankerApi,
    RerankerProvider,
)
from knowledge_portal.interfaces.api.composition.llm import build_llm_adapters
from tests.conftest import FAKE_PROVIDER_SETTINGS

PASSAGES = (
    EvidenceChunk("c1", "Target state", "section 1", "Billing runs every month for every account."),
    EvidenceChunk("c2", "Target state", "section 2", "Field installation books an engineer visit."),
    EvidenceChunk("c3", "Target state", "section 3", "The engineer visit is booked in WFMS."),
)


def _ids(ranked: Any) -> list[str]:
    return [item.chunk.id for item in ranked]


def test_the_lexical_reranker_puts_the_passages_about_the_facet_first() -> None:
    ranked = LexicalPassageReranker().rerank("book an engineer visit", PASSAGES)

    assert _ids(ranked)[2] == "c1"
    assert ranked[0].score > ranked[2].score == 0.0
    # Words that say nothing keep the index's order.
    assert _ids(LexicalPassageReranker().rerank("the and of", PASSAGES)) == ["c1", "c2", "c3"]
    assert _ids(IndexOrder().rerank("visit", PASSAGES)) == ["c1", "c2", "c3"]


def _http(api: RerankerApi, handler: Any) -> HttpPassageReranker:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return HttpPassageReranker(client, "http://reranker/rerank", "bge-reranker-v2-m3", api, "key")


def test_a_rerank_api_orders_the_passages_by_relevance() -> None:
    sent: list[dict[str, Any]] = []

    def answer(request: httpx.Request) -> httpx.Response:
        sent.append({"body": json.loads(request.content), "auth": request.headers["authorization"]})
        return httpx.Response(
            200,
            json={
                "results": [
                    {"index": 2, "relevance_score": 0.9},
                    {"index": 0, "relevance_score": 0.1},
                    {"index": 1, "relevance_score": 0.5},
                ]
            },
        )

    ranked = _http(RerankerApi.RERANK, answer).rerank("engineer visit", PASSAGES)

    assert _ids(ranked) == ["c3", "c2", "c1"]
    assert sent == [
        {
            "body": {
                "model": "bge-reranker-v2-m3",
                "query": "engineer visit",
                "documents": [item.text for item in PASSAGES],
                "top_n": 3,
                "return_documents": False,
            },
            "auth": "Bearer key",
        }
    ]


def test_a_text_embeddings_inference_reranker_is_read_too() -> None:
    def answer(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["texts"] == [item.text for item in PASSAGES]
        return httpx.Response(
            200,
            json=[{"index": 1, "score": 2.0}, {"index": 0, "score": 1.0}, {"index": 2, "score": 1}],
        )

    ranked = _http(RerankerApi.TEI, answer).rerank("engineer visit", PASSAGES)

    # Equal scores keep the index's order.
    assert _ids(ranked) == ["c2", "c1", "c3"]


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(503),
        httpx.Response(200, json={"results": [{"index": 0, "relevance_score": 0.5}]}),
        httpx.Response(200, json={"results": [{"index": 7, "relevance_score": 0.5}]}),
        httpx.Response(200, json={"results": "none"}),
        httpx.Response(200, text="not json"),
    ],
)
def test_a_reranker_that_fails_leaves_the_index_s_order(response: httpx.Response) -> None:
    ranked = _http(RerankerApi.RERANK, lambda _: response).rerank("visit", PASSAGES)

    assert _ids(ranked) == ["c1", "c2", "c3"]


def test_a_single_passage_is_never_sent() -> None:
    def refuse(_: httpx.Request) -> httpx.Response:
        raise AssertionError("Nothing to rerank.")

    assert _ids(_http(RerankerApi.RERANK, refuse).rerank("visit", PASSAGES[:1])) == ["c1"]


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"reranker_provider": RerankerProvider.HTTP}, "RERANKER_URL"),
        (
            {"reranker_provider": RerankerProvider.HTTP, "reranker_url": "reranker:80"},
            "RERANKER_URL",
        ),
        ({"reranker_timeout_seconds": 0}, "RERANKER_TIMEOUT_SECONDS"),
    ],
)
def test_reranker_settings_are_checked_at_startup(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(ConfigurationError, match=message):
        replace(FAKE_PROVIDER_SETTINGS, **changes)


def test_the_configured_reranker_is_built() -> None:
    from smb_kernel.observability.metrics import Metrics

    for changes, model in (
        ({}, "lexical-bm25-v1"),
        ({"reranker_provider": RerankerProvider.NONE}, "index-order"),
        (
            {
                "reranker_provider": RerankerProvider.HTTP,
                "reranker_url": "http://reranker/rerank",
                "reranker_model": "bge-reranker-v2-m3",
            },
            "bge-reranker-v2-m3",
        ),
    ):
        adapters = build_llm_adapters(replace(FAKE_PROVIDER_SETTINGS, **changes), Metrics())
        try:
            assert adapters.passage_reranker.model == model
        finally:
            adapters.close()
