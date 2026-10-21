"""Catalogue suggestions survive restarts and are decided exactly once."""

from __future__ import annotations

import os
from dataclasses import replace
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from smb_kernel.persistence.connector import (
    DirectPostgresConnector,
)

from knowledge_portal.application.ports.catalogue_candidates import ExtractionRun
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateDecisionConflictError,
    CandidateKind,
    CandidateStatus,
    CatalogueCandidate,
)
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_catalogue_candidates import (
    PostgresCatalogueCandidates,
)
from knowledge_portal.infrastructure.persistence.postgres_store import PostgresStore

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")
NOW = datetime(2026, 9, 29, 9, 0, tzinfo=UTC)


def _candidate(release_id: str, name: str) -> CatalogueCandidate:
    return CatalogueCandidate(
        uuid4().hex,
        release_id,
        "doc-1",
        CandidateContent(CandidateKind.SYSTEM, name.casefold(), name=name),
        (CandidateCitation("paragraph 1", f"{name} is a system"),),
        "model",
        "catalogue-extraction-v1",
        NOW,
    )


def test_suggestions_round_trip_replace_undecided_ones_and_decide_once() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    store = PostgresCatalogueCandidates(PostgresStore(DirectPostgresConnector(DATABASE_URL)))
    release_id = f"draft-{uuid4().hex}"
    first, second = _candidate(release_id, "Alpha"), _candidate(release_id, "Beta")
    run = ExtractionRun(uuid4().hex, release_id, "doc-1", "model", "v1", 2, ("note",), NOW)
    store.replace_proposals(run, (first, second))

    decided = first.decide(True, "amina", NOW)
    store.save_decision(decided)
    with pytest.raises(CandidateDecisionConflictError):
        store.save_decision(decided)
    replacement = _candidate(release_id, "Gamma")
    store.replace_proposals(
        ExtractionRun(uuid4().hex, release_id, "doc-1", "model", "v1", 1, (), NOW),
        (replacement,),
    )

    reloaded = PostgresCatalogueCandidates(PostgresStore(DirectPostgresConnector(DATABASE_URL)))
    stored = {item.id: item for item in reloaded.list(release_id)}
    assert set(stored) == {first.id, replacement.id}
    assert stored[first.id].status is CandidateStatus.ACCEPTED
    assert [item.warnings for item in reloaded.runs(release_id)] == [("note",), ()]
    reloaded.reopen(first.id)
    assert reloaded.get(first.id) == first


def test_a_revision_retypes_undecided_suggestions_adds_new_ones_and_spares_decided_ones() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    store = PostgresCatalogueCandidates(PostgresStore(DirectPostgresConnector(DATABASE_URL)))
    release_id = f"draft-{uuid4().hex}"
    first, second = _candidate(release_id, "Alpha"), _candidate(release_id, "Beta")
    store.replace_proposals(
        ExtractionRun(uuid4().hex, release_id, "doc-1", "model", "v1", 2, (), NOW),
        (first, second),
    )
    rule = CandidateContent(CandidateKind.OFFERING_RULE, "alpha", text="Up to 300 users")
    retyped = replace(first, content=rule)
    added = _candidate(release_id, "Gamma")

    store.revise((retyped, added))

    stored = {item.id: item for item in store.list(release_id)}
    assert stored == {first.id: retyped, second.id: second, added.id: added}
    store.save_decision(second.decide(False, "amina", NOW))
    with pytest.raises(CandidateDecisionConflictError):
        store.revise((replace(added, content=rule), replace(second, content=rule)))
    # Nothing of a refused revision is kept.
    assert store.get(added.id) == added
