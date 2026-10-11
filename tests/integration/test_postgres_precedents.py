"""Decided verdicts in PostgreSQL (ontology plan Phase 5): kept once per analysis, the
later decision winning, and searched by pgvector among those of the same model."""

from __future__ import annotations

import math
import os
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from smb_kernel.persistence.connector import DirectPostgresConnector

from knowledge_portal.domain.architecture.precedents import (
    Precedent,
    PrecedentDecision,
    PrecedentSystem,
)
from knowledge_portal.domain.architecture.verdicts import ProductVerdict
from knowledge_portal.infrastructure.persistence.migration_runner import run_migrations
from knowledge_portal.infrastructure.persistence.postgres_precedents import PostgresPrecedents

DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not configured")
NOW = datetime(2026, 10, 11, 9, tzinfo=UTC)
DIMENSIONS = 768


def _vector(*leading: float) -> tuple[float, ...]:
    return (*leading, *([0.0] * (DIMENSIONS - len(leading))))


def _precedent(release: str, number: int, **changes: Any) -> Precedent:
    item: dict[str, Any] = {
        "id": f"{release}-ana-{number}",
        "requirement_id": f"{release}-REQ-{number}",
        "version": f"ana-{number}@1",
        "release_id": release,
        "text": "Let Business Pro Plus customers add a second access point.",
        "suggested_verdict": ProductVerdict.CHANGE_EXISTING_OFFERING,
        "verdict": ProductVerdict.CHANGE_EXISTING_OFFERING,
        "decision": PrecedentDecision.ACCEPTED,
        "offering_id": "business-pro-plus",
        "concept_ids": ("cap-wifi-access",),
        "systems": (PrecedentSystem("cwom", "primary", "modify"),),
        "decided_at": NOW,
        "received_at": NOW,
    }
    return Precedent(**{**item, **changes})


def test_precedents_are_kept_once_and_searched_by_their_model() -> None:
    assert DATABASE_URL is not None
    run_migrations(DATABASE_URL)
    store = PostgresPrecedents(DirectPostgresConnector(DATABASE_URL))
    release = f"r-{uuid4().hex}"
    model = f"model-{uuid4().hex}"
    first = _precedent(release, 1)

    assert store.record(first, model, _vector(1.0))
    assert not store.record(first, model, _vector(1.0))
    later = _precedent(
        release,
        1,
        decision=PrecedentDecision.OVERRIDDEN,
        verdict=ProductVerdict.NEW_PLAN,
        decided_at=NOW + timedelta(hours=1),
    )
    assert store.record(later, model, _vector(1.0))
    assert not store.record(first, model, _vector(1.0))
    assert store.get(first.id) == later

    store.record(_precedent(release, 2), model, _vector(0.8, 0.6))
    store.record(
        _precedent(release, 3, decision=PrecedentDecision.UNKNOWN, verdict=None),
        model,
        _vector(1.0),
    )
    store.record(_precedent(release, 4), f"{model}-other", _vector(1.0))

    found = store.nearest(model, _vector(1.0), 5)
    assert [item.precedent.id for item in found] == [later.id, f"{release}-ana-2"]
    assert math.isclose(found[0].similarity, 1.0) and math.isclose(
        found[1].similarity, 0.8, rel_tol=1e-6
    )
    excluded = store.nearest(model, _vector(1.0), 5, exclude_requirement=later.requirement_id)
    assert [item.precedent.id for item in excluded] == [f"{release}-ana-2"]

    (summary,) = [item for item in store.summaries() if item.release_id == release]
    assert (summary.accepted, summary.overridden, summary.unknown) == (2, 1, 1)
