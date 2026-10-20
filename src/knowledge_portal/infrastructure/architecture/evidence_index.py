"""Offline hybrid retrieval over immutable release chunks."""

from __future__ import annotations

from collections.abc import Iterable

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    ChunkConceptLink,
    ChunkEntityLink,
    ChunkRole,
    ConceptMatch,
    EmbeddingPort,
    EvidenceChunk,
    IndexCoverage,
    IndexLinks,
    IndexVersion,
)
from knowledge_portal.application.ports.architecture_tokenizer import ArchitectureTokenizerPort

# v3: catalogue records carry a context header, and chunks link to entities and concepts.
# v4: documents as parents and children (ADR section-v4), chosen by ARCHITECTURE_INDEX_VERSION.
INDEX_VERSION = IndexVersion.SECTION_V3.value
# Every version searches the same way: v2 indexes only lack links, and a v3 or v2 index
# has no parents. So any of them is read whichever version builds new indexes, and
# switching ARCHITECTURE_INDEX_VERSION back needs no rebuild.
READABLE_VERSIONS = ("section-v2", *(item.value for item in IndexVersion))


def readable(profile: str | None, current: str) -> bool:
    """Whether an index built under `profile` reads like one built under `current`: the
    same embedding model and tokenizer, and a version every reader understands."""
    if profile is None:
        return False
    stem, _, version = profile.rpartition(":")
    return version in READABLE_VERSIONS and current.rpartition(":")[0] == stem


def index_profile(model: str, tokenizer: str, version: IndexVersion) -> str:
    return f"{model}:{tokenizer}:{version.value}"


def fuse(*orderings: Iterable[str], depth: int = 20) -> dict[str, float]:
    """Reciprocal rank fusion of ranked ids, as the PostgreSQL index scores them."""
    ranks: dict[str, float] = {}
    for ordering in orderings:
        for rank, key in enumerate(list(ordering)[:depth], 1):
            ranks[key] = ranks.get(key, 0.0) + 1.0 / (60 + rank)
    return ranks


class InMemoryEvidenceIndex(ArchitectureEvidenceIndexPort):
    def __init__(
        self,
        embeddings: EmbeddingPort,
        tokenizer: ArchitectureTokenizerPort,
        version: IndexVersion = IndexVersion.SECTION_V3,
    ) -> None:
        self._embeddings = embeddings
        self._tokenizer = tokenizer
        self._version = version
        self._entries: dict[str, tuple[tuple[EvidenceChunk, tuple[float, ...]], ...]] = {}
        self._links: dict[str, IndexLinks] = {}
        # Vectors by (model, passage text): a rebuild only embeds what changed.
        self._cache: dict[tuple[str, str], tuple[float, ...]] = {}

    @property
    def embedding_model(self) -> str:
        return self._embeddings.model

    @property
    def profile(self) -> str:
        return index_profile(self._embeddings.model, self._tokenizer.profile, self._version)

    @property
    def version(self) -> IndexVersion:
        return self._version

    def reads(self, profile: str | None) -> bool:
        return readable(profile, self.profile)

    def vectors(self, texts: tuple[str, ...]) -> tuple[tuple[float, ...], ...]:
        model = self._embeddings.model
        missing = tuple(dict.fromkeys(text for text in texts if (model, text) not in self._cache))
        if missing:
            self._cache.update(
                ((model, text), vector)
                for text, vector in zip(missing, self._embeddings.embed(missing), strict=True)
            )
        return tuple(self._cache[(model, text)] for text in texts)

    def store(self, release_id: str, index_id: str, chunks: tuple[EvidenceChunk, ...]) -> None:
        if index_id in self._entries:
            raise ValueError("Evidence indexes are immutable.")
        # A parent is read, never searched, so it is not embedded.
        searched = tuple(chunk for chunk in chunks if chunk.role is not ChunkRole.PARENT)
        vectors = dict(
            zip(
                (chunk.id for chunk in searched),
                self.vectors(tuple(chunk.text for chunk in searched)),
                strict=True,
            )
        )
        self._entries[index_id] = tuple((chunk, vectors.get(chunk.id, ())) for chunk in chunks)

    def _ranked(
        self, entries: tuple[tuple[EvidenceChunk, tuple[float, ...]], ...], query: str, limit: int
    ) -> tuple[EvidenceChunk, ...]:
        entries = tuple(row for row in entries if row[0].role is not ChunkRole.PARENT)
        if not entries:
            return ()
        query_vector = self._embeddings.embed((query,))[0]
        terms = set(query.casefold().split())
        lexical = sorted(entries, key=lambda row: -len(terms & set(row[0].text.casefold().split())))
        vector = sorted(
            entries, key=lambda row: -sum(a * b for a, b in zip(query_vector, row[1], strict=True))
        )
        ranks = fuse((row[0].id for row in lexical), (row[0].id for row in vector))
        by_id = {chunk.id: chunk for chunk, _ in entries}
        return tuple(
            by_id[chunk_id]
            for chunk_id in sorted(ranks, key=lambda key: ranks[key], reverse=True)[:limit]
        )

    def retrieve(self, release_id: str, query: str, limit: int) -> tuple[EvidenceChunk, ...]:
        return self._ranked(self._entries.get(release_id, ()), query, limit)

    def get(self, release_id: str, chunk_id: str) -> EvidenceChunk | None:
        return next(
            (chunk for chunk, _ in self._entries.get(release_id, ()) if chunk.id == chunk_id), None
        )

    def system_chunk(self, index_id: str, system_id: str) -> EvidenceChunk | None:
        own = f"system {system_id}"
        return next(
            (
                chunk
                for chunk, _ in self._entries.get(index_id, ())
                if chunk.document_version_id is None
                and (chunk.location == own or chunk.location.startswith(f"{own},"))
            ),
            None,
        )

    def link(self, index_id: str, links: IndexLinks) -> None:
        if index_id not in self._entries:
            raise ValueError("Only a stored index can be linked.")
        if index_id in self._links:
            raise ValueError("Evidence indexes are immutable.")
        self.vectors(tuple(item.text for item in links.scheme))
        self._links[index_id] = links

    def links(
        self, index_id: str, chunk_ids: tuple[str, ...]
    ) -> tuple[tuple[ChunkEntityLink, ...], tuple[ChunkConceptLink, ...]]:
        links = self._links.get(index_id, IndexLinks())
        wanted = set(chunk_ids)
        return (
            tuple(item for item in links.entities if item.chunk_id in wanted),
            tuple(item for item in links.concepts if item.chunk_id in wanted),
        )

    def match_concepts(self, index_id: str, query: str, limit: int) -> tuple[ConceptMatch, ...]:
        scheme = self._links.get(index_id, IndexLinks()).scheme
        if not scheme:
            return ()
        query_vector = self._embeddings.embed((query,))[0]
        terms = set(query.casefold().split())
        model = self._embeddings.model
        lexical = sorted(scheme, key=lambda item: -len(terms & set(item.text.casefold().split())))
        lexical = [item for item in lexical if terms & set(item.text.casefold().split())]
        vector = sorted(
            scheme,
            key=lambda item: (
                -sum(
                    a * b
                    for a, b in zip(query_vector, self._cache[(model, item.text)], strict=True)
                )
            ),
        )
        ranks = fuse((item.concept_id for item in lexical), (item.concept_id for item in vector))
        best = sorted(ranks, key=lambda key: ranks[key], reverse=True)[:limit]
        return tuple(ConceptMatch(key, round(ranks[key], 6)) for key in best)

    def concept_chunks(
        self, index_id: str, query: str, concept_ids: tuple[str, ...], limit: int
    ) -> tuple[EvidenceChunk, ...]:
        wanted = set(concept_ids)
        linked = {
            item.chunk_id
            for item in self._links.get(index_id, IndexLinks()).concepts
            if item.concept_id in wanted
        }
        entries = tuple(row for row in self._entries.get(index_id, ()) if row[0].id in linked)
        return self._ranked(entries, query, limit)

    def coverage(self, index_id: str) -> IndexCoverage | None:
        links = self._links.get(index_id)
        if links is None:
            return None
        chunks = {
            chunk.id for chunk, _ in self._entries[index_id] if chunk.role is not ChunkRole.PARENT
        }
        reached = {item.chunk_id for item in links.concepts}
        spoken = {item.concept_id for item in links.concepts}
        return IndexCoverage(
            len(chunks),
            len(chunks - reached),
            len(links.scheme),
            tuple(sorted({item.concept_id for item in links.scheme} - spoken)),
        )
