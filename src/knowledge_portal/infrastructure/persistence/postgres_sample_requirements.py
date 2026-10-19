"""Durable sample requirement list: one serialised row, replaced under a revision check."""

from __future__ import annotations

from psycopg.types.json import Jsonb
from pydantic import TypeAdapter, ValidationError

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.domain.architecture.knowledge import KnowledgeConflictError
from knowledge_portal.domain.architecture.samples import SampleRequirementSet
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

_ADAPTER: TypeAdapter[SampleRequirementSet] = TypeAdapter(SampleRequirementSet)


def _samples(raw: object) -> SampleRequirementSet:
    try:
        return _ADAPTER.validate_python(raw)
    except ValidationError as exc:
        raise PersistenceError("Stored sample requirements are invalid.") from exc


class PostgresSampleRequirements:
    def __init__(self, store: PostgresStore) -> None:
        self._store = store

    def load(self) -> SampleRequirementSet:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM architecture_sample_requirements WHERE set_id = 1"
            ).fetchone()
        return SampleRequirementSet() if row is None else _samples(row[0])

    def save(self, updated: SampleRequirementSet, expected_revision: int) -> None:
        payload = Jsonb(_ADAPTER.dump_python(updated, mode="json"))
        with self._store.connection() as connection:
            connection.execute(
                "INSERT INTO architecture_sample_requirements (set_id, payload) "
                "VALUES (1, %s) ON CONFLICT DO NOTHING",
                (Jsonb(_ADAPTER.dump_python(SampleRequirementSet(), mode="json")),),
            )
            row = connection.execute(
                "SELECT payload FROM architecture_sample_requirements "
                "WHERE set_id = 1 FOR UPDATE"
            ).fetchone()
            if row is None:
                raise PersistenceError("Sample requirements row is missing.")
            if _samples(row[0]).revision != expected_revision:
                raise KnowledgeConflictError("The sample list changed; reload before saving.")
            connection.execute(
                "UPDATE architecture_sample_requirements SET payload = %s, updated_at = now() "
                "WHERE set_id = 1",
                (payload,),
            )
