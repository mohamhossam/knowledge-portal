"""Decided verdicts in PostgreSQL, searched by pgvector (ontology plan Phase 5)."""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb
from pydantic import TypeAdapter, ValidationError
from smb_kernel.persistence.connector import PostgresConnector

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.precedents import PrecedentMatch
from knowledge_portal.domain.architecture.precedents import (
    Precedent,
    PrecedentSummary,
    summarise,
)
from knowledge_portal.infrastructure.persistence.in_memory_precedents import newest_first

_ITEM: TypeAdapter[Precedent] = TypeAdapter(Precedent)


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
    def __init__(self, connector: PostgresConnector) -> None:
        self._connector = connector

    def record(self, precedent: Precedent, embedding_model: str, vector: tuple[float, ...]) -> bool:
        try:
            with self._connector.connection() as connection:
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
        except psycopg.Error as exc:
            raise PersistenceError("The precedent could not be kept.") from exc
        return True

    def get(self, precedent_id: str) -> Precedent | None:
        try:
            with self._connector.connection() as connection:
                row = connection.execute(
                    "SELECT payload FROM architecture_precedents WHERE precedent_id = %s",
                    (precedent_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise PersistenceError("The precedent could not be read.") from exc
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
        try:
            with self._connector.connection() as connection:
                rows = connection.execute(
                    "SELECT payload, 1 - (embedding <=> %s::vector) AS similarity "
                    "FROM architecture_precedents "
                    "WHERE embedding_model = %s AND verdict IS NOT NULL "
                    "AND requirement_id IS DISTINCT FROM %s "
                    "ORDER BY embedding <=> %s::vector, precedent_id LIMIT %s",
                    (literal, embedding_model, exclude_requirement, literal, limit),
                ).fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Precedents could not be searched.") from exc
        return tuple(PrecedentMatch(_item(row[0]), _similarity(row[1])) for row in rows)

    def summaries(self) -> tuple[PrecedentSummary, ...]:
        try:
            with self._connector.connection() as connection:
                rows = connection.execute("SELECT payload FROM architecture_precedents").fetchall()
        except psycopg.Error as exc:
            raise PersistenceError("Precedents could not be read.") from exc
        precedents = tuple(_item(row[0]) for row in rows)
        return newest_first(
            summarise(release_id, precedents)
            for release_id in {item.release_id for item in precedents}
        )
