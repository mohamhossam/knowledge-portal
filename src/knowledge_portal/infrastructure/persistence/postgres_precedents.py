"""Decided verdicts in PostgreSQL, searched by pgvector (ontology plan Phase 5)."""

from __future__ import annotations

from psycopg.types.json import Jsonb
from pydantic import TypeAdapter, ValidationError

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.precedents import PrecedentMatch
from knowledge_portal.domain.architecture.precedents import (
    AssessedNeeds,
    Precedent,
    PrecedentSummary,
    summarise,
)
from knowledge_portal.infrastructure.persistence.in_memory_precedents import newest_first
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

_ITEM: TypeAdapter[Precedent] = TypeAdapter(Precedent)
_NEEDS: TypeAdapter[AssessedNeeds] = TypeAdapter(AssessedNeeds)


def _item(raw: object) -> Precedent:
    try:
        return _ITEM.validate_python(raw)
    except (ValidationError, ValueError) as exc:
        raise PersistenceError("A stored precedent is invalid.") from exc


def _similarity(value: object) -> float:
    return float(value) if isinstance(value, int | float) else 0.0


def _vector(values: tuple[float, ...]) -> str:
    return "[" + ",".join(repr(float(item)) for item in values) + "]"


class PostgresPrecedents:
    def __init__(self, store: PostgresStore) -> None:
        self._store = store

    def record(self, precedent: Precedent, embedding_model: str, vector: tuple[float, ...]) -> bool:
        with self._store.connection() as connection:
            with connection.transaction():
                row = connection.execute(
                    "SELECT payload FROM architecture_precedents WHERE precedent_id = %s "
                    "FOR UPDATE",
                    (precedent.id,),
                ).fetchone()
                if row is not None and not precedent.replaces(_item(row[0])):
                    return False
                connection.execute(
                    "INSERT INTO architecture_precedents (precedent_id, requirement_id, "
                    "release_id, decision, verdict, decided_at, payload, embedding_model, "
                    "embedding, received_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector, %s) "
                    "ON CONFLICT (precedent_id) DO UPDATE SET "
                    "requirement_id = excluded.requirement_id, "
                    "release_id = excluded.release_id, decision = excluded.decision, "
                    "verdict = excluded.verdict, decided_at = excluded.decided_at, "
                    "payload = excluded.payload, embedding_model = excluded.embedding_model, "
                    "embedding = excluded.embedding, received_at = excluded.received_at",
                    (
                        precedent.id,
                        precedent.requirement_id,
                        precedent.release_id,
                        precedent.decision.value,
                        precedent.verdict.value if precedent.verdict else None,
                        precedent.decided_at,
                        Jsonb(_ITEM.dump_python(precedent, mode="json")),
                        embedding_model,
                        _vector(vector),
                        precedent.received_at,
                    ),
                )
        return True

    def get(self, precedent_id: str) -> Precedent | None:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM architecture_precedents WHERE precedent_id = %s",
                (precedent_id,),
            ).fetchone()
        return None if row is None else _item(row[0])

    def nearest(
        self,
        embedding_model: str,
        vector: tuple[float, ...],
        limit: int,
        *,
        exclude_requirement: str | None = None,
    ) -> tuple[PrecedentMatch, ...]:
        literal = _vector(vector)
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT payload, 1 - (embedding <=> %s::vector) AS similarity "
                "FROM architecture_precedents "
                "WHERE embedding_model = %s AND verdict IS NOT NULL "
                "AND requirement_id IS DISTINCT FROM %s "
                "ORDER BY embedding <=> %s::vector, precedent_id LIMIT %s",
                (literal, embedding_model, exclude_requirement, literal, limit),
            ).fetchall()
        return tuple(PrecedentMatch(_item(row[0]), _similarity(row[1])) for row in rows)

    def keep_needs(self, needs: AssessedNeeds) -> None:
        with self._store.connection() as connection:
            connection.execute(
                "INSERT INTO architecture_requirement_needs "
                "(requirement_id, release_id, reader_model, needs, assessed_at) "
                "VALUES (%s, %s, %s, %s, now()) "
                "ON CONFLICT (requirement_id) DO UPDATE SET "
                "release_id = excluded.release_id, reader_model = excluded.reader_model, "
                "needs = excluded.needs, assessed_at = excluded.assessed_at",
                (needs.requirement_id, needs.release_id, needs.reader_model, Jsonb(needs.needs)),
            )

    def assessed_needs(self, requirement_id: str) -> AssessedNeeds | None:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT requirement_id, release_id, reader_model, needs "
                "FROM architecture_requirement_needs WHERE requirement_id = %s",
                (requirement_id,),
            ).fetchone()
        if row is None:
            return None
        try:
            return _NEEDS.validate_python(
                {
                    "requirement_id": row[0],
                    "release_id": row[1],
                    "reader_model": row[2],
                    "needs": row[3],
                }
            )
        except (ValidationError, ValueError) as exc:
            raise PersistenceError("Stored assessed needs are invalid.") from exc

    def summaries(self) -> tuple[PrecedentSummary, ...]:
        with self._store.connection() as connection:
            rows = connection.execute("SELECT payload FROM architecture_precedents").fetchall()
        precedents = tuple(_item(row[0]) for row in rows)
        return newest_first(
            summarise(release_id, precedents)
            for release_id in {item.release_id for item in precedents}
        )
