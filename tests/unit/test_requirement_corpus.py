"""The Requirement corpus on the Knowledge Center front page (A′).

Requirement work answers counts over its internal API; the portal passes them to knowledge
admins as they are, and says so plainly when requirement work cannot answer.
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from smb_kernel.errors import ServiceUnavailableError

from knowledge_portal.application.ports.requirement_corpus import CorpusSummary, OpenFindingAges
from knowledge_portal.infrastructure.requirement_client import (
    FakeArchitectureMappingStats,
    FakeRequirementDependents,
    FakeRequirementImpact,
)
from knowledge_portal.interfaces.api.container import RequirementWork, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

ADMIN = {"X-Fake-Actor-Id": "fake-owner"}
AT = datetime(2026, 10, 6, 9, 0, tzinfo=UTC)


class StubCorpus:
    def __init__(self, answer: CorpusSummary | Exception) -> None:
        self.answer = answer

    def summary(self) -> CorpusSummary:
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def _client(corpus: StubCorpus) -> Generator[TestClient, None, None]:
    work = RequirementWork(
        FakeRequirementDependents(), FakeArchitectureMappingStats(), FakeRequirementImpact(), corpus
    )
    container = build_container(FAKE_PROVIDER_SETTINGS, requirement_work=work)
    with TestClient(create_app(lambda: container)) as client:
        yield client


@pytest.fixture
def answering() -> Generator[TestClient, None, None]:
    yield from _client(
        StubCorpus(CorpusSummary(12, 1, 9, 2, 1, False, OpenFindingAges(3, 1, 2), AT))
    )


@pytest.fixture
def unreachable() -> Generator[TestClient, None, None]:
    yield from _client(StubCorpus(ServiceUnavailableError("Requirement work is unavailable.")))


def test_a_knowledge_admin_reads_the_corpus_in_counts(answering: TestClient) -> None:
    response = answering.get("/knowledge-center/requirement-corpus", headers=ADMIN)

    assert response.status_code == 200, response.text
    assert response.json() == {
        "requirements": 12,
        "duplicates": 1,
        "current": 9,
        "waiting": 2,
        "failed": 1,
        "rebuild_required": False,
        "open_findings": {"under_7_days": 3, "from_7_to_30_days": 1, "over_30_days": 2},
        "as_of": "2026-10-06T09:00:00Z",
    }


def test_requirement_work_being_unreachable_is_a_503_not_an_empty_corpus(
    unreachable: TestClient,
) -> None:
    response = unreachable.get("/knowledge-center/requirement-corpus", headers=ADMIN)

    assert response.status_code == 503
    assert "requirements" not in response.json()


def test_offline_the_corpus_reads_as_empty(client: TestClient) -> None:
    body = client.get("/knowledge-center/requirement-corpus", headers=ADMIN).json()

    assert (body["requirements"], body["waiting"], body["failed"]) == (0, 0, 0)
