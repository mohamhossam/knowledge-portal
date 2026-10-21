"""Durable AI-proposed catalogue changes; decisions are conditional on being undecided."""

from __future__ import annotations

from dataclasses import replace

from psycopg.types.json import Jsonb
from pydantic import TypeAdapter, ValidationError

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.application.ports.catalogue_candidates import ExtractionRun
from knowledge_portal.domain.architecture.candidates import (
    CandidateDecisionConflictError,
    CandidateStatus,
    CatalogueCandidate,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore
from knowledge_portal.infrastructure.persistence.stored_timings import stored_timings

_CANDIDATE: TypeAdapter[CatalogueCandidate] = TypeAdapter(CatalogueCandidate)
_RUN: TypeAdapter[ExtractionRun] = TypeAdapter(ExtractionRun)


def _candidate(raw: object) -> CatalogueCandidate:
    try:
        return _CANDIDATE.validate_python(stored_timings(raw))
    except ValidationError as exc:
        raise PersistenceError("A stored catalogue suggestion is invalid.") from exc


class PostgresCatalogueCandidates:
    def __init__(self, store: PostgresStore) -> None:
        self._store = store

    def replace_proposals(
        self, run: ExtractionRun, candidates: tuple[CatalogueCandidate, ...]
    ) -> None:
        with self._store.connection() as connection:
            connection.execute(
                "DELETE FROM architecture_catalogue_candidates "
                "WHERE release_id = %s AND document_version_id = %s AND status = 'proposed'",
                (run.release_id, run.document_version_id),
            )
            for item in candidates:
                connection.execute(
                    "INSERT INTO architecture_catalogue_candidates "
                    "(candidate_id, release_id, document_version_id, status, payload, "
                    "created_at) VALUES (%s, %s, %s, %s, %s, %s)",
                    (
                        item.id,
                        item.release_id,
                        item.document_version_id,
                        item.status.value,
                        Jsonb(_CANDIDATE.dump_python(item, mode="json")),
                        item.created_at,
                    ),
                )
            connection.execute(
                "INSERT INTO architecture_extraction_runs "
                "(run_id, release_id, document_version_id, payload, created_at) "
                "VALUES (%s, %s, %s, %s, %s)",
                (
                    run.id,
                    run.release_id,
                    run.document_version_id,
                    Jsonb(_RUN.dump_python(run, mode="json")),
                    run.created_at,
                ),
            )

    def runs(self, release_id: str) -> tuple[ExtractionRun, ...]:
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM architecture_extraction_runs WHERE release_id = %s "
                "ORDER BY created_at",
                (release_id,),
            ).fetchall()
        try:
            return tuple(_RUN.validate_python(row[0]) for row in rows)
        except ValidationError as exc:
            raise PersistenceError("Extraction runs could not be read.") from exc

    def list(self, release_id: str) -> tuple[CatalogueCandidate, ...]:
        with self._store.connection() as connection:
            rows = connection.execute(
                "SELECT payload FROM architecture_catalogue_candidates WHERE release_id = %s "
                "ORDER BY created_at, candidate_id",
                (release_id,),
            ).fetchall()
        return tuple(_candidate(row[0]) for row in rows)

    def get(self, candidate_id: str) -> CatalogueCandidate | None:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM architecture_catalogue_candidates WHERE candidate_id = %s",
                (candidate_id,),
            ).fetchone()
        return None if row is None else _candidate(row[0])

    def save_decision(self, candidate: CatalogueCandidate) -> None:
        with self._store.connection() as connection:
            row = connection.execute(
                "UPDATE architecture_catalogue_candidates SET status = %s, payload = %s "
                "WHERE candidate_id = %s AND status = 'proposed' RETURNING candidate_id",
                (
                    candidate.status.value,
                    Jsonb(_CANDIDATE.dump_python(candidate, mode="json")),
                    candidate.id,
                ),
            ).fetchone()
        if row is None:
            raise CandidateDecisionConflictError("This suggestion was already decided.")

    def reopen(self, candidate_id: str) -> None:
        current = self.get(candidate_id)
        if current is None:
            return
        reopened = replace(
            current,
            status=CandidateStatus.PROPOSED,
            edited=False,
            decided_by=None,
            decided_at=None,
        )
        with self._store.connection() as connection:
            connection.execute(
                "UPDATE architecture_catalogue_candidates SET status = 'proposed', "
                "payload = %s WHERE candidate_id = %s",
                (Jsonb(_CANDIDATE.dump_python(reopened, mode="json")), candidate_id),
            )

    def revise(self, candidates: tuple[CatalogueCandidate, ...]) -> None:
        # One transaction: a suggestion decided meanwhile rolls the whole revision back.
        with self._store.connection() as connection:
            for item in candidates:
                row = connection.execute(
                    "INSERT INTO architecture_catalogue_candidates "
                    "(candidate_id, release_id, document_version_id, status, payload, "
                    "created_at) VALUES (%s, %s, %s, 'proposed', %s, %s) "
                    "ON CONFLICT (candidate_id) DO UPDATE SET payload = EXCLUDED.payload "
                    "WHERE architecture_catalogue_candidates.status = 'proposed' "
                    "RETURNING candidate_id",
                    (
                        item.id,
                        item.release_id,
                        item.document_version_id,
                        Jsonb(_CANDIDATE.dump_python(item, mode="json")),
                        item.created_at,
                    ),
                ).fetchone()
                if row is None:
                    raise CandidateDecisionConflictError("This suggestion was already decided.")
