"""A document owner's view of where its changes need review (requirement-portal ADR-0099)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.source_impact import (
    CitingDependency,
    DependencyImpact,
    DependencyImpactPage,
    ImpactDecision,
    ImpactDecisionKind,
    SourceLineage,
)
from knowledge_portal.domain.document.reference import PublishedReference
from knowledge_portal.domain.identity.entities import ActorId, ActorSnapshot
from knowledge_portal.infrastructure.requirement_client import (
    FakeArchitectureMappingStats,
    FakeRequirementDependents,
)
from knowledge_portal.interfaces.api.container import RequirementWork, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
OTHER_ADMIN = {"X-Fake-Actor-Id": "fake-reviewer"}
HASH = "a" * 64
CITATION = PublishedReference(
    "doc-1", "Policy", "ver-1", 1, "rev-1", "pub-1", HASH, "b-1", "Line 1", "XGPON", 0, 5, HASH
)
IMPACT = DependencyImpact(
    CitingDependency(
        "dep-1",
        "req-1",
        "Fibre bundles",
        "proposal",
        "prop-1",
        "Bundles require XGPON coverage.",
        HASH,
        SourceLineage(CITATION),
        True,
    ),
    False,
    "withdrawn",
    True,
    (
        ImpactDecision(
            "dep-1",
            "published",
            ImpactDecisionKind.RETAIN,
            "Still applies.",
            ActorSnapshot(ActorId("fake-reviewer"), "Ravi"),
            datetime(2026, 10, 2, 9, tzinfo=UTC),
            1,
        ),
    ),
)


class RecordingImpact:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, ...]] = []

    def document_impact(
        self,
        actor_id: ActorId,
        document_id: str,
        *,
        active_only: bool,
        query: str,
        offset: int,
        limit: int,
    ) -> DependencyImpactPage:
        self.calls.append((actor_id, document_id, active_only, query, offset, limit))
        return DependencyImpactPage((IMPACT,), None)


@pytest.fixture
def served() -> Iterator[tuple[RecordingImpact, TestClient, str]]:
    impact = RecordingImpact()
    work = RequirementWork(FakeRequirementDependents(), FakeArchitectureMappingStats(), impact)
    container = build_container(FAKE_PROVIDER_SETTINGS, requirement_work=work)
    with TestClient(create_app(lambda: container)) as client:
        uploaded = client.post(
            "/library/ingestions",
            data={"title": "Coverage", "idempotency_key": "impact-upload"},
            files={"file": ("policy.txt", b"XGPON coverage is required.", "text/plain")},
            headers=OWNER,
        )
        assert uploaded.status_code == 202, uploaded.text
        yield impact, client, str(uploaded.json()["id"])


def test_the_owner_sees_where_review_is_needed(
    served: tuple[RecordingImpact, TestClient, str],
) -> None:
    impact, client, document_id = served

    response = client.get(
        f"/library/documents/{document_id}/source-impact",
        params={"active_only": "true", "query": " XGPON "},
        headers=OWNER,
    )

    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "private, no-store"
    assert impact.calls == [(ActorId("fake-owner"), document_id, True, "XGPON", 0, 20)]
    (item,) = response.json()["items"]
    assert item["needs_review"] is True and item["publication_state"] == "withdrawn"
    assert item["dependency"]["requirement_title"] == "Fibre bundles"
    assert item["decisions"][0]["decision"] == "retain_historical"


def test_another_admin_is_refused_before_requirement_work_is_asked(
    served: tuple[RecordingImpact, TestClient, str],
) -> None:
    impact, client, document_id = served

    response = client.get(f"/library/documents/{document_id}/source-impact", headers=OTHER_ADMIN)

    assert response.status_code == 403
    assert impact.calls == []


def test_an_unknown_document_is_not_found(
    served: tuple[RecordingImpact, TestClient, str],
) -> None:
    impact, client, _ = served

    assert client.get("/library/documents/missing/source-impact").status_code == 404
    assert client.get("/library/documents/x/source-impact?limit=101").status_code == 422
    assert impact.calls == []


def test_offline_nothing_needs_review(client: TestClient) -> None:
    uploaded = client.post(
        "/library/ingestions",
        data={"title": "Coverage", "idempotency_key": "offline-impact"},
        files={"file": ("policy.txt", b"Coverage.", "text/plain")},
    )
    document_id = uploaded.json()["id"]

    response = client.get(f"/library/documents/{document_id}/source-impact")

    assert response.json() == {"items": [], "next_offset": None}
