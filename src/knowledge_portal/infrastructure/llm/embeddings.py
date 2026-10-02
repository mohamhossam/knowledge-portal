"""Embedding adapters: one vector space for library passages and catalogue evidence.

Each provider answers 768-dimension vectors; `_validate_embeddings` rejects any
other shape, so a provider change can never mix vector spaces silently.
"""

from __future__ import annotations

import hashlib
import math
import re

import httpx
from openai import OpenAI, OpenAIError
from pydantic import ValidationError
from smb_kernel.embeddings import Embedding

from knowledge_portal.application.errors import KnowledgeGenerationError

EMBEDDING_DIMENSIONS = 768


class OpenAIKnowledgeEmbedding:
    def __init__(self, client: OpenAI, model: str) -> None:
        self._client = client
        self.model = model

    def embed(self, texts: tuple[str, ...]) -> tuple[Embedding, ...]:
        if not texts:
            return ()
        try:
            response = self._client.embeddings.create(
                model=self.model,
                input=list(texts),
                dimensions=EMBEDDING_DIMENSIONS,
            )
        except (OpenAIError, ValidationError) as exc:
            raise KnowledgeGenerationError(f"Knowledge embedding failed: {exc}") from exc
        ordered = sorted(response.data, key=lambda item: item.index)
        return _validate_embeddings(tuple(tuple(item.embedding) for item in ordered), len(texts))


class LocalKnowledgeEmbedding:
    def __init__(
        self, base_url: str, model: str, timeout_seconds: float, http_client: httpx.Client
    ) -> None:
        self._endpoint = f"{base_url.rstrip('/')}/embeddings"
        self._timeout_seconds = timeout_seconds
        self._http = http_client
        self.model = model

    def embed(self, texts: tuple[str, ...]) -> tuple[Embedding, ...]:
        if not texts:
            return ()
        try:
            response = self._http.post(
                self._endpoint,
                json={"model": self.model, "input": list(texts)},
                timeout=self._timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise KnowledgeGenerationError(f"Local knowledge embedding failed: {exc}") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise KnowledgeGenerationError("Local embedding provider returned invalid data.")
        raw = payload["data"]
        values: list[tuple[int, Embedding]] = []
        for item in raw:
            if not isinstance(item, dict) or not isinstance(item.get("embedding"), list):
                raise KnowledgeGenerationError("Local embedding provider returned invalid vectors.")
            try:
                embedding = tuple(float(value) for value in item["embedding"])
                index = int(item.get("index", len(values)))
            except (TypeError, ValueError) as exc:
                raise KnowledgeGenerationError(
                    "Local embedding provider returned non-numeric vectors."
                ) from exc
            values.append((index, embedding))
        return _validate_embeddings(tuple(value for _, value in sorted(values)), len(texts))


class OpenRouterKnowledgeEmbedding:
    def __init__(
        self,
        *,
        base_url: str,
        http_client: httpx.Client,
        api_key: str,
        model: str,
        timeout_seconds: float,
        data_collection: str,
    ) -> None:
        self._endpoint = f"{base_url.rstrip('/')}/embeddings"
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._data_collection = data_collection
        self._http = http_client
        self.model = model

    def embed(self, texts: tuple[str, ...]) -> tuple[Embedding, ...]:
        if not texts:
            return ()
        try:
            response = self._http.post(
                self._endpoint,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "input": list(texts),
                    "dimensions": EMBEDDING_DIMENSIONS,
                    "provider": {"data_collection": self._data_collection},
                },
                timeout=self._timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise KnowledgeGenerationError(f"OpenRouter knowledge embedding failed: {exc}") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise KnowledgeGenerationError("OpenRouter embedding provider returned invalid data.")
        if len(payload["data"]) != len(texts):
            vector_count = len(payload["data"])
            raise KnowledgeGenerationError(
                f"Embedding provider returned {vector_count} vectors for {len(texts)} texts."
            )
        values: list[tuple[int, Embedding]] = []
        for item in payload["data"]:
            if not isinstance(item, dict) or not isinstance(item.get("embedding"), list):
                raise KnowledgeGenerationError(
                    "OpenRouter embedding provider returned invalid vectors."
                )
            index = item.get("index")
            if not isinstance(index, int) or isinstance(index, bool):
                raise KnowledgeGenerationError(
                    "OpenRouter embedding provider returned invalid vector indices."
                )
            try:
                embedding = tuple(float(value) for value in item["embedding"])
            except (TypeError, ValueError) as exc:
                raise KnowledgeGenerationError(
                    "OpenRouter embedding provider returned non-numeric vectors."
                ) from exc
            values.append((index, embedding))
        if sorted(index for index, _ in values) != list(range(len(texts))):
            raise KnowledgeGenerationError(
                "OpenRouter embedding provider returned invalid vector indices."
            )
        return _validate_embeddings(tuple(value for _, value in sorted(values)), len(texts))


def _validate_embeddings(
    values: tuple[Embedding, ...], expected_count: int
) -> tuple[Embedding, ...]:
    if len(values) != expected_count:
        raise KnowledgeGenerationError(
            f"Embedding provider returned {len(values)} vectors for {expected_count} inputs."
        )
    if any(len(item) != EMBEDDING_DIMENSIONS for item in values):
        raise KnowledgeGenerationError(
            f"Knowledge embeddings must contain exactly {EMBEDDING_DIMENSIONS} dimensions."
        )
    if any(not math.isfinite(number) for item in values for number in item):
        raise KnowledgeGenerationError("Knowledge embeddings must contain finite numbers.")
    return values


class FakeKnowledgeEmbedding:
    model = "fake-knowledge-embedding-768"

    def embed(self, texts: tuple[str, ...]) -> tuple[Embedding, ...]:
        return tuple(_embedding(text) for text in texts)


def _embedding(text: str) -> Embedding:
    values = [0.0] * 768
    words = re.findall(r"\w+", text.casefold()) or [text]
    for word in words:
        digest = hashlib.sha256(word.encode("utf-8")).digest()
        index = int.from_bytes(digest[:2], "big") % len(values)
        values[index] += -1.0 if digest[2] & 1 else 1.0
    if not any(values):
        values[0] = 1.0  # Hash collisions must not make the offline vector unusable.
    return tuple(values)
