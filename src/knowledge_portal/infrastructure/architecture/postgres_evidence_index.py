"""PostgreSQL lexical and exact-vector retrieval for released evidence."""

from __future__ import annotations

import hashlib

import psycopg
from smb_kernel.persistence.connector import PostgresConnector

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.architecture_rag import (
    ChunkConceptLink,
    ChunkEntityLink,
    ConceptBasis,
    ConceptMatch,
    EmbeddingPort,
    EntityRole,
    EvidenceChunk,
    IndexCoverage,
    IndexLinks,
    LinkedEntity,
)
from knowledge_portal.application.ports.architecture_tokenizer import ArchitectureTokenizerPort
from knowledge_portal.infrastructure.architecture.evidence_index import INDEX_VERSION, readable


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class PostgresEvidenceIndex:
    def __init__(
        self,
        connector: PostgresConnector,
        embeddings: EmbeddingPort,
        tokenizer: ArchitectureTokenizerPort,
    ) -> None:
        self._connector = connector
        self._embeddings = embeddings
        self._tokenizer = tokenizer

    @property
    def embedding_model(self) -> str:
        return self._embeddings.model

    @property
    def profile(self) -> str:
        return f"{self._embeddings.model}:{self._tokenizer.profile}:{INDEX_VERSION}"

    def reads(self, profile: str | None) -> bool:
        return readable(profile, self.profile)

    @staticmethod
    def _vector(values: tuple[float, ...]) -> str:
        return "[" + ",".join(str(value) for value in values) + "]"

    def _cached(self, texts: tuple[str, ...]) -> dict[str, str]:
        """Each text's vector literal by content hash, embedding and caching only what this
        model has not embedded before."""
        model = self._embeddings.model
        hashes = {_hash(text): text for text in texts}
        try:
            with self._connector.connection() as connection:
                rows = connection.execute(
                    "SELECT content_hash, embedding::text FROM architecture_embedding_cache "
                    "WHERE model = %s AND content_hash = ANY(%s)",
                    (model, list(hashes)),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture embedding cache read failed.") from exc
        cached = {str(row[0]): str(row[1]) for row in rows}
        missing = {key: text for key, text in hashes.items() if key not in cached}
        if not missing:
            return cached
        embedded = dict(
            zip(
                missing,
                (
                    self._vector(vector)
                    for vector in self._embeddings.embed(tuple(missing.values()))
                ),
                strict=True,
            )
        )
        try:
            with self._connector.connection() as connection:
                for key, vector in embedded.items():
                    connection.execute(
                        "INSERT INTO architecture_embedding_cache (model, content_hash, embedding) "
                        "VALUES (%s, %s, %s::vector) ON CONFLICT DO NOTHING",
                        (model, key, vector),
                    )
        except psycopg.Error as exc:
            raise PersistenceError("Architecture embedding cache write failed.") from exc
        return cached | embedded

    def vectors(self, texts: tuple[str, ...]) -> tuple[tuple[float, ...], ...]:
        cached = self._cached(texts)
        return tuple(
            tuple(float(value) for value in cached[_hash(text)].strip("[]").split(","))
            for text in texts
        )

    def store(self, release_id: str, index_id: str, chunks: tuple[EvidenceChunk, ...]) -> None:
        """Store an index, embedding only passage texts this model has not embedded before."""
        vectors = self._cached(tuple(chunk.text for chunk in chunks))
        try:
            with self._connector.connection() as connection:
                connection.execute(
                    "INSERT INTO architecture_knowledge_indexes (index_id, release_id) "
                    "VALUES (%s, %s)",
                    (index_id, release_id),
                )
                for chunk in chunks:
                    connection.execute(
                        "INSERT INTO architecture_knowledge_chunks "
                        "(index_id, chunk_id, document_version_id, source_label, location, "
                        "content, embedding) VALUES (%s, %s, %s, %s, %s, %s, %s::vector)",
                        (
                            index_id,
                            chunk.id,
                            chunk.document_version_id,
                            chunk.source_label,
                            chunk.location,
                            chunk.text,
                            vectors[_hash(chunk.text)],
                        ),
                    )
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence indexing failed.") from exc

    def retrieve(self, index_id: str, query: str, limit: int) -> tuple[EvidenceChunk, ...]:
        vector = self._vector(self._embeddings.embed((query,))[0])
        try:
            with self._connector.connection() as connection:
                rows = connection.execute(
                    """
                    WITH lexical AS (
                      SELECT chunk_id, row_number() OVER (
                        ORDER BY ts_rank_cd(search_text, plainto_tsquery('simple', %s)) DESC
                      ) AS rank
                      FROM architecture_knowledge_chunks
                      WHERE index_id = %s
                        AND search_text @@ plainto_tsquery('simple', %s)
                      ORDER BY ts_rank_cd(search_text, plainto_tsquery('simple', %s)) DESC
                      LIMIT 20
                    ), semantic AS (
                      SELECT chunk_id, row_number() OVER (ORDER BY embedding <=> %s::vector) AS rank
                      FROM architecture_knowledge_chunks WHERE index_id = %s
                      ORDER BY embedding <=> %s::vector LIMIT 20
                    ), ranked AS (
                      SELECT chunk_id, sum(score) AS score FROM (
                        SELECT chunk_id, 1.0 / (60 + rank) AS score FROM lexical
                        UNION ALL
                        SELECT chunk_id, 1.0 / (60 + rank) AS score FROM semantic
                      ) results GROUP BY chunk_id
                    )
                    SELECT c.chunk_id, c.source_label, c.location, c.content,
                           c.document_version_id
                    FROM ranked r JOIN architecture_knowledge_chunks c
                      ON c.index_id = %s AND c.chunk_id = r.chunk_id
                    ORDER BY r.score DESC LIMIT %s
                    """,
                    (
                        query,
                        index_id,
                        query,
                        query,
                        vector,
                        index_id,
                        vector,
                        index_id,
                        limit,
                    ),
                ).fetchall()
            return tuple(
                EvidenceChunk(
                    str(row[0]),
                    str(row[1]),
                    str(row[2]),
                    str(row[3]),
                    str(row[4]) if row[4] is not None else None,
                )
                for row in rows
            )
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence retrieval failed.") from exc

    def get(self, index_id: str, chunk_id: str) -> EvidenceChunk | None:
        try:
            with self._connector.connection() as connection:
                row = connection.execute(
                    "SELECT chunk_id, source_label, location, content, document_version_id "
                    "FROM architecture_knowledge_chunks WHERE index_id = %s AND chunk_id = %s",
                    (index_id, chunk_id),
                ).fetchone()
            if row is None:
                return None
            return EvidenceChunk(
                str(row[0]),
                str(row[1]),
                str(row[2]),
                str(row[3]),
                str(row[4]) if row[4] is not None else None,
            )
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc

    def system_chunk(self, index_id: str, system_id: str) -> EvidenceChunk | None:
        try:
            with self._connector.connection() as connection:
                row = connection.execute(
                    "SELECT chunk_id, source_label, location, content, document_version_id "
                    "FROM architecture_knowledge_chunks WHERE index_id = %s "
                    "AND document_version_id IS NULL "
                    "AND (location = %s OR starts_with(location, %s)) "
                    "ORDER BY length(location), location LIMIT 1",
                    (index_id, f"system {system_id}", f"system {system_id},"),
                ).fetchone()
            if row is None:
                return None
            return EvidenceChunk(str(row[0]), str(row[1]), str(row[2]), str(row[3]), None)
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc

    def link(self, index_id: str, links: IndexLinks) -> None:
        vectors = self._cached(tuple(item.text for item in links.scheme))
        try:
            with self._connector.connection() as connection:
                marked = connection.execute(
                    "UPDATE architecture_knowledge_indexes SET linked_at = now() "
                    "WHERE index_id = %s AND linked_at IS NULL RETURNING index_id",
                    (index_id,),
                ).fetchone()
                if marked is None:
                    raise PersistenceError("Only a stored, unlinked index can be linked.")
                for concept in links.scheme:
                    connection.execute(
                        "INSERT INTO architecture_concepts (index_id, concept_id, pref_label, "
                        "labels, path, domain_id, content, embedding) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)",
                        (
                            index_id,
                            concept.concept_id,
                            concept.pref_label,
                            list(concept.labels),
                            concept.path,
                            concept.domain_id,
                            concept.text,
                            vectors[_hash(concept.text)],
                        ),
                    )
                for entity in links.entities:
                    connection.execute(
                        "INSERT INTO architecture_chunk_entities "
                        "(index_id, chunk_id, entity_kind, entity_id, role) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (
                            index_id,
                            entity.chunk_id,
                            entity.entity.value,
                            entity.entity_id,
                            entity.role.value,
                        ),
                    )
                for item in links.concepts:
                    connection.execute(
                        "INSERT INTO architecture_chunk_concepts "
                        "(index_id, chunk_id, concept_id, basis, score) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (index_id, item.chunk_id, item.concept_id, item.basis.value, item.score),
                    )
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence linking failed.") from exc

    def links(
        self, index_id: str, chunk_ids: tuple[str, ...]
    ) -> tuple[tuple[ChunkEntityLink, ...], tuple[ChunkConceptLink, ...]]:
        try:
            with self._connector.connection() as connection:
                entities = connection.execute(
                    "SELECT chunk_id, entity_kind, entity_id, role "
                    "FROM architecture_chunk_entities WHERE index_id = %s AND chunk_id = ANY(%s) "
                    "ORDER BY chunk_id, role DESC, entity_kind, entity_id",
                    (index_id, list(chunk_ids)),
                ).fetchall()
                concepts = connection.execute(
                    "SELECT chunk_id, concept_id, basis, score FROM architecture_chunk_concepts "
                    "WHERE index_id = %s AND chunk_id = ANY(%s) "
                    "ORDER BY chunk_id, score DESC, concept_id",
                    (index_id, list(chunk_ids)),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc
        return (
            tuple(
                ChunkEntityLink(
                    str(row[0]), LinkedEntity(str(row[1])), str(row[2]), EntityRole(str(row[3]))
                )
                for row in entities
            ),
            tuple(
                ChunkConceptLink(
                    str(row[0]), str(row[1]), ConceptBasis(str(row[2])), float(str(row[3]))
                )
                for row in concepts
            ),
        )

    def match_concepts(self, index_id: str, query: str, limit: int) -> tuple[ConceptMatch, ...]:
        vector = self._vector(self._embeddings.embed((query,))[0])
        try:
            with self._connector.connection() as connection:
                rows = connection.execute(
                    """
                    WITH terms AS (
                      -- Any of the words, not all: a requirement says more than a label.
                      SELECT replace(plainto_tsquery('simple', %s)::text, '&', '|')::tsquery
                        AS query
                    ), lexical AS (
                      SELECT concept_id, row_number() OVER (
                        ORDER BY ts_rank_cd(search_text, terms.query) DESC
                      ) AS rank
                      FROM architecture_concepts, terms
                      WHERE index_id = %s AND search_text @@ terms.query
                      ORDER BY ts_rank_cd(search_text, terms.query) DESC
                      LIMIT 20
                    ), semantic AS (
                      SELECT concept_id, row_number() OVER (
                        ORDER BY embedding <=> %s::vector
                      ) AS rank
                      FROM architecture_concepts WHERE index_id = %s
                      ORDER BY embedding <=> %s::vector LIMIT 20
                    )
                    SELECT concept_id, sum(1.0 / (60 + rank)) AS score FROM (
                      SELECT concept_id, rank FROM lexical
                      UNION ALL
                      SELECT concept_id, rank FROM semantic
                    ) results GROUP BY concept_id ORDER BY score DESC, concept_id LIMIT %s
                    """,
                    (query, index_id, vector, index_id, vector, limit),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture concept matching failed.") from exc
        return tuple(ConceptMatch(str(row[0]), round(float(str(row[1])), 6)) for row in rows)

    def concept_chunks(
        self, index_id: str, query: str, concept_ids: tuple[str, ...], limit: int
    ) -> tuple[EvidenceChunk, ...]:
        vector = self._vector(self._embeddings.embed((query,))[0])
        try:
            with self._connector.connection() as connection:
                rows = connection.execute(
                    """
                    WITH linked AS (
                      SELECT DISTINCT c.chunk_id, c.search_text, c.embedding
                      FROM architecture_knowledge_chunks c
                      JOIN architecture_chunk_concepts l
                        ON l.index_id = c.index_id AND l.chunk_id = c.chunk_id
                      WHERE c.index_id = %s AND l.concept_id = ANY(%s)
                    ), lexical AS (
                      SELECT chunk_id, row_number() OVER (
                        ORDER BY ts_rank_cd(search_text, plainto_tsquery('simple', %s)) DESC
                      ) AS rank
                      FROM linked WHERE search_text @@ plainto_tsquery('simple', %s)
                      ORDER BY ts_rank_cd(search_text, plainto_tsquery('simple', %s)) DESC
                      LIMIT 20
                    ), semantic AS (
                      SELECT chunk_id, row_number() OVER (ORDER BY embedding <=> %s::vector) AS rank
                      FROM linked ORDER BY embedding <=> %s::vector LIMIT 20
                    ), ranked AS (
                      SELECT chunk_id, sum(1.0 / (60 + rank)) AS score FROM (
                        SELECT chunk_id, rank FROM lexical
                        UNION ALL
                        SELECT chunk_id, rank FROM semantic
                      ) results GROUP BY chunk_id
                    )
                    SELECT c.chunk_id, c.source_label, c.location, c.content,
                           c.document_version_id
                    FROM ranked r JOIN architecture_knowledge_chunks c
                      ON c.index_id = %s AND c.chunk_id = r.chunk_id
                    ORDER BY r.score DESC LIMIT %s
                    """,
                    (
                        index_id,
                        list(concept_ids),
                        query,
                        query,
                        query,
                        vector,
                        vector,
                        index_id,
                        limit,
                    ),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence retrieval failed.") from exc
        return tuple(
            EvidenceChunk(
                str(row[0]),
                str(row[1]),
                str(row[2]),
                str(row[3]),
                str(row[4]) if row[4] is not None else None,
            )
            for row in rows
        )

    def coverage(self, index_id: str) -> IndexCoverage | None:
        try:
            with self._connector.connection() as connection:
                linked = connection.execute(
                    "SELECT linked_at IS NOT NULL FROM architecture_knowledge_indexes "
                    "WHERE index_id = %s",
                    (index_id,),
                ).fetchone()
                if linked is None or not linked[0]:
                    return None
                counts = connection.execute(
                    """
                    SELECT count(*), count(*) FILTER (WHERE NOT EXISTS (
                      SELECT 1 FROM architecture_chunk_concepts l
                      WHERE l.index_id = c.index_id AND l.chunk_id = c.chunk_id
                    ))
                    FROM architecture_knowledge_chunks c WHERE c.index_id = %s
                    """,
                    (index_id,),
                ).fetchone() or (0, 0)
                concepts = connection.execute(
                    """
                    SELECT k.concept_id, EXISTS (
                      SELECT 1 FROM architecture_chunk_concepts l
                      WHERE l.index_id = k.index_id AND l.concept_id = k.concept_id
                    )
                    FROM architecture_concepts k WHERE k.index_id = %s ORDER BY k.concept_id
                    """,
                    (index_id,),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc
        return IndexCoverage(
            int(str(counts[0])),
            int(str(counts[1])),
            len(concepts),
            tuple(str(row[0]) for row in concepts if not row[1]),
        )
