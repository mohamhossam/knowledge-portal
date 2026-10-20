"""PostgreSQL lexical and exact-vector retrieval for released evidence."""

from __future__ import annotations

import hashlib

import psycopg
from smb_kernel.persistence.connector import DbConnection, PostgresConnector

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.architecture_rag import (
    ChunkConceptLink,
    ChunkEntityLink,
    ChunkRole,
    ConceptBasis,
    ConceptMatch,
    EmbeddingPort,
    EntityRole,
    EvidenceChunk,
    IndexCoverage,
    IndexLinks,
    IndexVersion,
    LinkedEntity,
)
from knowledge_portal.application.ports.architecture_tokenizer import ArchitectureTokenizerPort
from knowledge_portal.infrastructure.architecture.evidence_index import index_profile, readable

# Unread chunk sets are kept this long, so a build that has just found one can still name it.
SET_GRACE_MINUTES = 60

_COLUMNS = (
    "chunk_id, source_label, location, content, document_version_id, role, parent_id, aliases"
)


def _chunk(row: tuple[object, ...]) -> EvidenceChunk:
    return EvidenceChunk(
        str(row[0]),
        str(row[1]),
        str(row[2]),
        str(row[3]),
        str(row[4]) if row[4] is not None else None,
        role=ChunkRole(str(row[5])),
        parent_id=str(row[6]) if row[6] is not None else None,
        aliases=tuple(str(item) for item in row[7]) if isinstance(row[7], list) else (),
    )


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class PostgresEvidenceIndex:
    def __init__(
        self,
        connector: PostgresConnector,
        embeddings: EmbeddingPort,
        tokenizer: ArchitectureTokenizerPort,
        version: IndexVersion = IndexVersion.SECTION_V3,
        set_grace_minutes: int = SET_GRACE_MINUTES,
    ) -> None:
        self._connector = connector
        self._set_grace_minutes = set_grace_minutes
        self._embeddings = embeddings
        self._tokenizer = tokenizer
        self._version = version

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

    def _insert(
        self, connection: DbConnection, index_id: str, chunks: tuple[EvidenceChunk, ...]
    ) -> None:
        # A parent is read, never searched, so it is stored without an embedding.
        vectors = self._cached(
            tuple(chunk.text for chunk in chunks if chunk.role is not ChunkRole.PARENT)
        )
        for position, chunk in enumerate(chunks):
            connection.execute(
                "INSERT INTO architecture_knowledge_chunks "
                "(index_id, chunk_id, document_version_id, source_label, location, "
                "content, embedding, role, parent_id, aliases, position) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s, %s, %s, %s)",
                (
                    index_id,
                    chunk.id,
                    chunk.document_version_id,
                    chunk.source_label,
                    chunk.location,
                    chunk.text,
                    None if chunk.role is ChunkRole.PARENT else vectors[_hash(chunk.text)],
                    chunk.role.value,
                    chunk.parent_id,
                    list(chunk.aliases),
                    position,
                ),
            )

    def store(
        self,
        release_id: str,
        index_id: str,
        chunks: tuple[EvidenceChunk, ...],
        members: tuple[str, ...] = (),
        outdated: tuple[str, ...] = (),
    ) -> None:
        """Store an index, embedding only passage texts this model has not embedded before."""
        try:
            with self._connector.connection() as connection:
                connection.execute(
                    "INSERT INTO architecture_knowledge_indexes (index_id, release_id) "
                    "VALUES (%s, %s)",
                    (index_id, release_id),
                )
                self._insert(connection, index_id, chunks)
                for member in members:
                    connection.execute(
                        "INSERT INTO architecture_index_members (index_id, member_id) "
                        "VALUES (%s, %s)",
                        (index_id, member),
                    )
                for chunk_id in dict.fromkeys(outdated):
                    connection.execute(
                        "INSERT INTO architecture_index_outdated (index_id, chunk_id) "
                        "VALUES (%s, %s)",
                        (index_id, chunk_id),
                    )
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence indexing failed.") from exc

    def chunk_set(self, key: str) -> tuple[EvidenceChunk, ...] | None:
        try:
            with self._connector.connection() as connection:
                found = connection.execute(
                    "SELECT 1 FROM architecture_knowledge_indexes "
                    "WHERE index_id = %s AND kind = 'set'",
                    (key,),
                ).fetchone()
                if found is None:
                    return None
                rows = connection.execute(
                    f"SELECT {_COLUMNS} FROM architecture_knowledge_chunks "
                    "WHERE index_id = %s ORDER BY position",
                    (key,),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc
        return tuple(_chunk(row) for row in rows)

    def store_set(self, key: str, chunks: tuple[EvidenceChunk, ...]) -> None:
        """The set row and its chunks commit together, so a set is never half stored."""
        try:
            with self._connector.connection() as connection:
                created = connection.execute(
                    "INSERT INTO architecture_knowledge_indexes (index_id, release_id, kind) "
                    "VALUES (%s, NULL, 'set') ON CONFLICT (index_id) DO NOTHING "
                    "RETURNING index_id",
                    (key,),
                ).fetchone()
                if created is not None:
                    self._insert(connection, key, chunks)
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence indexing failed.") from exc

    def prune(self, release_id: str, keep: str) -> None:
        earlier = (
            "SELECT index_id FROM architecture_knowledge_indexes "
            "WHERE release_id = %s AND index_id <> %s"
        )
        try:
            with self._connector.connection() as connection:
                connection.execute(
                    f"DELETE FROM architecture_knowledge_chunks WHERE index_id IN ({earlier})",
                    (release_id, keep),
                )
                connection.execute(
                    "DELETE FROM architecture_knowledge_indexes "
                    "WHERE release_id = %s AND index_id <> %s",
                    (release_id, keep),
                )
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence clean-up failed.") from exc

    def collect(self) -> int:
        unread = (
            "SELECT i.index_id FROM architecture_knowledge_indexes i WHERE i.kind = 'set' "
            "AND i.created_at <= now() - make_interval(mins => %s) "
            "AND NOT EXISTS (SELECT 1 FROM architecture_index_members m "
            "WHERE m.member_id = i.index_id)"
        )
        try:
            with self._connector.connection() as connection:
                connection.execute(
                    f"DELETE FROM architecture_knowledge_chunks WHERE index_id IN ({unread})",
                    (self._set_grace_minutes,),
                )
                deleted = connection.execute(
                    f"DELETE FROM architecture_knowledge_indexes WHERE index_id IN ({unread}) "
                    "RETURNING index_id",
                    (self._set_grace_minutes,),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence clean-up failed.") from exc
        return len(deleted)

    @staticmethod
    def _scope(connection: DbConnection, index_id: str) -> list[str]:
        """The index and the chunk sets it reads: where its chunks are."""
        rows = connection.execute(
            "SELECT member_id FROM architecture_index_members WHERE index_id = %s",
            (index_id,),
        ).fetchall()
        return [index_id, *(str(row[0]) for row in rows)]

    @staticmethod
    def _outdated(connection: DbConnection, index_id: str) -> list[str]:
        rows = connection.execute(
            "SELECT chunk_id FROM architecture_index_outdated WHERE index_id = %s",
            (index_id,),
        ).fetchall()
        return [str(row[0]) for row in rows]

    def passages(self, index_id: str) -> tuple[EvidenceChunk, ...]:
        try:
            with self._connector.connection() as connection:
                rows = connection.execute(
                    f"SELECT {_COLUMNS} FROM architecture_knowledge_chunks "
                    "WHERE index_id = ANY(%s) AND document_version_id IS NOT NULL "
                    "AND role <> 'child' ORDER BY index_id, position, chunk_id",
                    (self._scope(connection, index_id),),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc
        return tuple(_chunk(row) for row in rows)

    def retrieve(self, index_id: str, query: str, limit: int) -> tuple[EvidenceChunk, ...]:
        vector = self._vector(self._embeddings.embed((query,))[0])
        try:
            with self._connector.connection() as connection:
                scope = self._scope(connection, index_id)
                outdated = self._outdated(connection, index_id)
                rows = connection.execute(
                    """
                    WITH lexical AS (
                      SELECT chunk_id, row_number() OVER (
                        ORDER BY ts_rank_cd(search_text, plainto_tsquery('simple', %s)) DESC
                      ) AS rank
                      FROM architecture_knowledge_chunks
                      WHERE index_id = ANY(%s) AND role <> 'parent'
                        AND NOT (chunk_id = ANY(%s) OR coalesce(parent_id, '') = ANY(%s))
                        AND search_text @@ plainto_tsquery('simple', %s)
                      ORDER BY ts_rank_cd(search_text, plainto_tsquery('simple', %s)) DESC
                      LIMIT 20
                    ), semantic AS (
                      SELECT chunk_id, row_number() OVER (ORDER BY embedding <=> %s::vector) AS rank
                      FROM architecture_knowledge_chunks
                      WHERE index_id = ANY(%s) AND role <> 'parent'
                        AND NOT (chunk_id = ANY(%s) OR coalesce(parent_id, '') = ANY(%s))
                      ORDER BY embedding <=> %s::vector LIMIT 20
                    ), ranked AS (
                      SELECT chunk_id, sum(score) AS score FROM (
                        SELECT chunk_id, 1.0 / (60 + rank) AS score FROM lexical
                        UNION ALL
                        SELECT chunk_id, 1.0 / (60 + rank) AS score FROM semantic
                      ) results GROUP BY chunk_id
                    )
                    SELECT c.chunk_id, c.source_label, c.location, c.content,
                           c.document_version_id, c.role, c.parent_id, c.aliases
                    FROM ranked r JOIN architecture_knowledge_chunks c
                      ON c.index_id = ANY(%s) AND c.chunk_id = r.chunk_id
                    ORDER BY r.score DESC LIMIT %s
                    """,
                    (
                        query,
                        scope,
                        outdated,
                        outdated,
                        query,
                        query,
                        vector,
                        scope,
                        outdated,
                        outdated,
                        vector,
                        scope,
                        limit,
                    ),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence retrieval failed.") from exc
        return tuple(_chunk(row) for row in rows)

    def get(self, index_id: str, chunk_id: str) -> EvidenceChunk | None:
        try:
            with self._connector.connection() as connection:
                row = connection.execute(
                    f"SELECT {_COLUMNS} FROM architecture_knowledge_chunks "
                    "WHERE index_id = ANY(%s) AND chunk_id = %s LIMIT 1",
                    (self._scope(connection, index_id), chunk_id),
                ).fetchone()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc
        return None if row is None else _chunk(row)

    def system_chunk(self, index_id: str, system_id: str) -> EvidenceChunk | None:
        try:
            with self._connector.connection() as connection:
                row = connection.execute(
                    f"SELECT {_COLUMNS} FROM architecture_knowledge_chunks "
                    "WHERE index_id = ANY(%s) AND document_version_id IS NULL "
                    "AND (location = %s OR starts_with(location, %s)) "
                    "ORDER BY length(location), location LIMIT 1",
                    (
                        self._scope(connection, index_id),
                        f"system {system_id}",
                        f"system {system_id},",
                    ),
                ).fetchone()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence read failed.") from exc
        return None if row is None else _chunk(row)

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
                linked = list(
                    {item.chunk_id for item in links.entities}
                    | {item.chunk_id for item in links.concepts}
                )
                source = {
                    str(row[0]): str(row[1])
                    for row in connection.execute(
                        "SELECT chunk_id, index_id FROM architecture_knowledge_chunks "
                        "WHERE index_id = ANY(%s) AND chunk_id = ANY(%s)",
                        (self._scope(connection, index_id), linked),
                    ).fetchall()
                }
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
                        "(index_id, chunk_id, entity_kind, entity_id, role, source_id) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (
                            index_id,
                            entity.chunk_id,
                            entity.entity.value,
                            entity.entity_id,
                            entity.role.value,
                            source[entity.chunk_id],
                        ),
                    )
                for item in links.concepts:
                    connection.execute(
                        "INSERT INTO architecture_chunk_concepts "
                        "(index_id, chunk_id, concept_id, basis, score, source_id) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (
                            index_id,
                            item.chunk_id,
                            item.concept_id,
                            item.basis.value,
                            item.score,
                            source[item.chunk_id],
                        ),
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
                scope = self._scope(connection, index_id)
                outdated = self._outdated(connection, index_id)
                rows = connection.execute(
                    """
                    WITH linked AS (
                      SELECT DISTINCT c.chunk_id, c.search_text, c.embedding
                      FROM architecture_knowledge_chunks c
                      JOIN architecture_chunk_concepts l
                        ON l.source_id = c.index_id AND l.chunk_id = c.chunk_id
                      WHERE l.index_id = %s AND c.role <> 'parent' AND l.concept_id = ANY(%s)
                        AND NOT (c.chunk_id = ANY(%s) OR coalesce(c.parent_id, '') = ANY(%s))
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
                           c.document_version_id, c.role, c.parent_id, c.aliases
                    FROM ranked r JOIN architecture_knowledge_chunks c
                      ON c.index_id = ANY(%s) AND c.chunk_id = r.chunk_id
                    ORDER BY r.score DESC LIMIT %s
                    """,
                    (
                        index_id,
                        list(concept_ids),
                        outdated,
                        outdated,
                        query,
                        query,
                        query,
                        vector,
                        vector,
                        scope,
                        limit,
                    ),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Architecture evidence retrieval failed.") from exc
        return tuple(_chunk(row) for row in rows)

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
                      WHERE l.index_id = %s AND l.source_id = c.index_id
                        AND l.chunk_id = c.chunk_id
                    ))
                    FROM architecture_knowledge_chunks c
                    WHERE c.index_id = ANY(%s) AND c.role <> 'parent'
                    """,
                    (index_id, self._scope(connection, index_id)),
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
