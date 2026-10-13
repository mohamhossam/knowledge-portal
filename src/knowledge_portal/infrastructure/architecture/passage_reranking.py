"""Rerankers of an assessment's passages (ontology plan Phase 5).

- `LexicalPassageReranker` scores each passage by the facet's words it holds, BM25 over the
  passages it is given; deterministic, and the default.
- `IndexOrder` keeps the evidence index's own order.
- `HttpPassageReranker` asks a cross-encoder served over HTTP. When it fails or answers
  unusably, the passages keep the order they came in: a reranker never fails an assessment.
"""

from __future__ import annotations

import logging
import math
import re
from collections import Counter
from typing import Any

import httpx

from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.application.ports.passage_reranker import RankedPassage
from knowledge_portal.infrastructure.config.options import RerankerApi

LOGGER = logging.getLogger(__name__)

# Words too common to say which passage answers a facet.
_STOPWORDS = frozenset(
    "a an and are as at be by can for from has have in into is it its let of on or so that "
    "the their them then they this to was we when where which while who will with without "
    "would should could must may each every all any our your new add adds added".split()
)
_K1 = 1.2
_B = 0.75


def _words(text: str) -> list[str]:
    return [
        word
        for word in re.findall(r"\w+", text.casefold())
        if len(word) > 1 and word not in _STOPWORDS
    ]


def _in_order(passages: tuple[EvidenceChunk, ...]) -> tuple[RankedPassage, ...]:
    """The passages as given, scored by their rank alone."""
    return tuple(
        RankedPassage(chunk, 1.0 / (position + 1)) for position, chunk in enumerate(passages)
    )


class IndexOrder:
    @property
    def model(self) -> str:
        return "index-order"

    def rerank(self, query: str, passages: tuple[EvidenceChunk, ...]) -> tuple[RankedPassage, ...]:
        return _in_order(passages)


class LexicalPassageReranker:
    """BM25 of the facet's words over the passages given, ties kept in the index's order."""

    @property
    def model(self) -> str:
        return "lexical-bm25-v1"

    def rerank(self, query: str, passages: tuple[EvidenceChunk, ...]) -> tuple[RankedPassage, ...]:
        terms = set(_words(query))
        if not passages or not terms:
            return _in_order(passages)
        documents = [Counter(_words(chunk.text)) for chunk in passages]
        lengths = [sum(item.values()) for item in documents]
        average = sum(lengths) / len(lengths) or 1.0
        frequency = Counter(term for item in documents for term in set(item) if term in terms)
        count = len(documents)
        scored: list[tuple[float, int, EvidenceChunk]] = []
        for position, (chunk, words, length) in enumerate(
            zip(passages, documents, lengths, strict=True)
        ):
            score = 0.0
            for term in terms:
                tf = words.get(term, 0)
                if not tf:
                    continue
                df = frequency[term]
                idf = math.log(1 + (count - df + 0.5) / (df + 0.5))
                score += idf * tf * (_K1 + 1) / (tf + _K1 * (1 - _B + _B * length / average))
            scored.append((score, position, chunk))
        scored.sort(key=lambda item: (-item[0], item[1]))
        return tuple(RankedPassage(chunk, score) for score, _, chunk in scored)


class HttpPassageReranker:
    """A cross-encoder behind an HTTP rerank endpoint, such as BAAI/bge-reranker-v2-m3 served
    by Text Embeddings Inference (``RERANKER_API=tei``) or a Cohere-style ``/rerank``."""

    def __init__(
        self,
        client: httpx.Client,
        url: str,
        model: str,
        api: RerankerApi,
        api_key: str | None = None,
    ) -> None:
        self._client = client
        self._url = url
        self._model = model
        self._api = api
        self._headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    @property
    def model(self) -> str:
        return self._model

    def rerank(self, query: str, passages: tuple[EvidenceChunk, ...]) -> tuple[RankedPassage, ...]:
        if len(passages) < 2:
            return _in_order(passages)
        texts = [chunk.text for chunk in passages]
        body: dict[str, Any] = (
            {"query": query, "texts": texts, "truncate": True}
            if self._api is RerankerApi.TEI
            else {
                "model": self._model,
                "query": query,
                "documents": texts,
                "top_n": len(texts),
                "return_documents": False,
            }
        )
        try:
            response = self._client.post(self._url, json=body, headers=self._headers)
            response.raise_for_status()
            scores = self._scores(response.json(), len(passages))
        except (httpx.HTTPError, ValueError) as exc:
            LOGGER.warning("The reranker failed; passages keep the index's order: %s", exc)
            return _in_order(passages)
        ranked = sorted(range(len(passages)), key=lambda position: (-scores[position], position))
        return tuple(RankedPassage(passages[position], scores[position]) for position in ranked)

    def _scores(self, payload: object, size: int) -> list[float]:
        """Each passage's score by its position; refuses an answer that leaves one out."""
        rows = payload.get("results") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise ValueError("The reranker answered without results.")
        key = "score" if self._api is RerankerApi.TEI else "relevance_score"
        found: dict[int, float] = {}
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("The reranker answered an unreadable result.")
            index, score = row.get("index"), row.get(key)
            if (
                not isinstance(index, int)
                or isinstance(index, bool)
                or not 0 <= index < size
                or not isinstance(score, int | float)
                or isinstance(score, bool)
                or not math.isfinite(score)
            ):
                raise ValueError("The reranker answered an unreadable result.")
            found[index] = float(score)
        if len(found) != size:
            raise ValueError("The reranker left passages unscored.")
        return [found[position] for position in range(size)]
