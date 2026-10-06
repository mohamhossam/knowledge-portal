"""The Requirement knowledge table on the Knowledge Center (A′ and B2).

Requirement work answers counts, rows and findings over its internal API, and sends the nudges;
the portal passes them to knowledge admins as they are, and says so plainly when requirement
work cannot answer or refuses.
"""

from __future__ import annotations

from collections.abc import Generator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from smb_kernel.errors import ServiceUnavailableError

from knowledge_portal.application.ports.requirement_corpus import (
    CorpusFinding,
    CorpusFindingsPage,
    CorpusQuery,
    CorpusRequirement,
    CorpusRequirementsPage,
    CorpusState,
    CorpusSummary,
    FindingAge,
    FindingKind,
    FindingQuery,
    FindingSide,
    IndexState,
    MembershipResult,
    NudgeMark,
    NudgeReceipt,
    OpenFindingAges,
    PersonName,
    ReindexResult,
    ReindexScope,
    RequirementCorpusConflictError,
    RequirementFindingConflictError,
    RequirementFindingNotFoundError,
    RequirementNotInCorpusError,
    RetiredMark,
)
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


AMINA = PersonName("fake-owner", "Amina Owner")
ROW = CorpusRequirement("REQ-1", "XGPON bundles", False, AMINA, IndexState.FAILED, None, 2)
FINDING = CorpusFinding(
    "kf-1",
    FindingKind.POSSIBLE_CONTRADICTION,
    "One allows CPP orders, the other forbids them.",
    AT - timedelta(days=40),
    FindingAge.OVER_30_DAYS,
    FindingSide("REQ-2", "XGPON for offices", None),
    FindingSide("REQ-1", "XGPON bundles", AMINA),
    NudgeMark(AT - timedelta(days=2), "Ravi Reviewer"),
    AT + timedelta(days=5),
)


class StubCorpus:
    def __init__(
        self, answer: CorpusSummary | Exception, nudged: NudgeReceipt | Exception | None = None
    ) -> None:
        self.answer = answer
        self.nudged = nudged
        self.acted: Exception | None = None
        self.calls: list[tuple[Any, ...]] = []

    def _answer[T](self, value: T) -> T:
        if isinstance(self.answer, Exception):
            raise self.answer
        return value

    def summary(self) -> CorpusSummary:
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer

    def requirements(self, query: CorpusQuery, offset: int, limit: int) -> CorpusRequirementsPage:
        self.calls.append(("requirements", query, offset, limit))
        return self._answer(CorpusRequirementsPage((ROW,), offset + limit))

    def findings(self, query: FindingQuery, offset: int, limit: int) -> CorpusFindingsPage:
        self.calls.append(("findings", query, offset, limit))
        return self._answer(CorpusFindingsPage((FINDING,), None))

    def nudge(self, finding_id: str, actor_id: str, actor_name: str) -> NudgeReceipt:
        self.calls.append(("nudge", finding_id, actor_id, actor_name))
        if isinstance(self.nudged, Exception):
            raise self.nudged
        assert self.nudged is not None
        return self.nudged

    def retire(
        self, requirement_id: str, actor_id: str, actor_name: str, reason: str
    ) -> MembershipResult:
        self.calls.append(("retire", requirement_id, actor_id, actor_name, reason))
        if isinstance(self.acted, Exception):
            raise self.acted
        return MembershipResult(requirement_id, CorpusState.RETIRED, AT, 1, "Ravi Reviewer")

    def reinstate(
        self, requirement_id: str, actor_id: str, actor_name: str, reason: str
    ) -> MembershipResult:
        self.calls.append(("reinstate", requirement_id, actor_id, actor_name, reason))
        if isinstance(self.acted, Exception):
            raise self.acted
        return MembershipResult(requirement_id, CorpusState.ACTIVE, AT, 0, None)

    def reindex(
        self, scope: ReindexScope, requirement_ids: tuple[str, ...], actor_id: str, actor_name: str
    ) -> ReindexResult:
        self.calls.append(("reindex", scope, requirement_ids, actor_id, actor_name))
        return ReindexResult(len(requirement_ids) or 2)


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
def stub() -> StubCorpus:
    return StubCorpus(
        CorpusSummary(12, 1, 9, 2, 1, False, OpenFindingAges(3, 1, 2), AT),
        NudgeReceipt("kf-1", AT, ("Amina Owner",), AT + timedelta(days=7)),
    )


@pytest.fixture
def browsing(stub: StubCorpus) -> Generator[TestClient, None, None]:
    yield from _client(stub)


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
        "retired": 0,
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


def test_a_knowledge_admin_browses_the_corpus_with_filters(
    browsing: TestClient, stub: StubCorpus
) -> None:
    response = browsing.get(
        "/knowledge-center/requirement-corpus/requirements",
        params={
            "index_state": "failed",
            "owner_id": "fake-owner",
            "q": "xgpon",
            "open_findings_only": "true",
            "not_screened_for_days": 30,
            "offset": 50,
            "limit": 25,
        },
        headers=ADMIN,
    )

    assert response.status_code == 200, response.text
    assert stub.calls == [
        (
            "requirements",
            CorpusQuery(IndexState.FAILED, "fake-owner", "xgpon", True, 30, False),
            50,
            25,
        )
    ]
    assert response.json() == {
        "items": [
            {
                "requirement_id": "REQ-1",
                "title": "XGPON bundles",
                "duplicate": False,
                "owner": {"id": "fake-owner", "display_name": "Amina Owner"},
                "index_state": "failed",
                "last_screened_at": None,
                "open_findings": 2,
                "retired": None,
            }
        ],
        "next_offset": 75,
    }


def test_a_knowledge_admin_reads_findings_with_their_rationale(
    browsing: TestClient, stub: StubCorpus
) -> None:
    response = browsing.get(
        "/knowledge-center/requirement-corpus/findings",
        params={"kind": "possible_contradiction", "age": "over_30_days"},
        headers=ADMIN,
    )

    assert response.status_code == 200, response.text
    assert stub.calls == [
        (
            "findings",
            FindingQuery(FindingKind.POSSIBLE_CONTRADICTION, FindingAge.OVER_30_DAYS),
            0,
            50,
        )
    ]
    (item,) = response.json()["items"]
    assert item["rationale"] == FINDING.rationale
    assert item["subject"]["owner"] is None
    assert item["last_nudge"] == {"at": "2026-10-04T09:00:00Z", "by": "Ravi Reviewer"}
    assert item["next_nudge_at"] == "2026-10-11T09:00:00Z"


def test_a_nudge_is_sent_in_the_admin_s_name(browsing: TestClient, stub: StubCorpus) -> None:
    response = browsing.post(
        "/knowledge-center/requirement-corpus/findings/kf-1/nudge",
        headers={"X-Fake-Actor-Id": "fake-reviewer"},
    )

    assert response.status_code == 200, response.text
    assert stub.calls == [("nudge", "kf-1", "fake-reviewer", "Ravi Reviewer")]
    assert response.json()["recipients"] == ["Amina Owner"]


@pytest.mark.parametrize(
    ("refusal", "status"),
    [
        (RequirementFindingConflictError("It can be nudged again from 13 Oct 2026."), 409),
        (RequirementFindingNotFoundError("This finding no longer exists."), 404),
        (ServiceUnavailableError("Requirement work is unavailable."), 503),
    ],
)
def test_requirement_work_s_refusal_reaches_the_admin(
    stub: StubCorpus, refusal: Exception, status: int
) -> None:
    stub.nudged = refusal
    for client in _client(stub):
        response = client.post(
            "/knowledge-center/requirement-corpus/findings/kf-1/nudge", headers=ADMIN
        )

    assert response.status_code == status
    if status == 409:
        assert response.json()["message"] == "It can be nudged again from 13 Oct 2026."


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/knowledge-center/requirement-corpus/requirements"),
        ("get", "/knowledge-center/requirement-corpus/findings"),
        ("post", "/knowledge-center/requirement-corpus/findings/kf-1/nudge"),
    ],
)
def test_only_a_knowledge_admin_may_browse_or_nudge(
    browsing: TestClient, stub: StubCorpus, method: str, path: str
) -> None:
    response = getattr(browsing, method)(path, headers={"X-Fake-Actor-Id": "fake-observer"})

    assert response.status_code == 403
    assert stub.calls == []


def test_unreachable_rows_are_a_503_not_an_empty_table(unreachable: TestClient) -> None:
    for path in ("requirements", "findings"):
        response = unreachable.get(f"/knowledge-center/requirement-corpus/{path}", headers=ADMIN)
        assert response.status_code == 503
        assert "items" not in response.json()


def test_offline_the_rows_are_empty(client: TestClient) -> None:
    for path in ("requirements", "findings"):
        body = client.get(f"/knowledge-center/requirement-corpus/{path}", headers=ADMIN).json()
        assert body == {"items": [], "next_offset": None}


def test_a_knowledge_admin_retires_and_reinstates_in_their_name(
    browsing: TestClient, stub: StubCorpus
) -> None:
    retired = browsing.post(
        "/knowledge-center/requirement-corpus/requirements/REQ-1/retirement",
        json={"reason": "Cancelled."},
        headers={"X-Fake-Actor-Id": "fake-reviewer"},
    )
    reinstated = browsing.post(
        "/knowledge-center/requirement-corpus/requirements/REQ-1/reinstatement",
        json={"reason": "Back on."},
        headers=ADMIN,
    )

    assert retired.status_code == 200, retired.text
    assert retired.json() == {
        "requirement_id": "REQ-1",
        "state": "retired",
        "changed_at": "2026-10-06T09:00:00Z",
        "closed_findings": 1,
        "notified": "Ravi Reviewer",
    }
    assert reinstated.status_code == 200 and reinstated.json()["state"] == "active"
    assert stub.calls == [
        ("retire", "REQ-1", "fake-reviewer", "Ravi Reviewer", "Cancelled."),
        ("reinstate", "REQ-1", "fake-owner", "Amina Owner", "Back on."),
    ]


def test_reindex_sends_the_scope_and_choice(browsing: TestClient, stub: StubCorpus) -> None:
    failed = browsing.post(
        "/knowledge-center/requirement-corpus/reindex", json={"scope": "failed"}, headers=ADMIN
    )
    chosen = browsing.post(
        "/knowledge-center/requirement-corpus/reindex",
        json={"scope": "requirements", "requirement_ids": ["REQ-1", "REQ-2", "REQ-3"]},
        headers=ADMIN,
    )
    bad = browsing.post(
        "/knowledge-center/requirement-corpus/reindex", json={"scope": "all"}, headers=ADMIN
    )

    assert (failed.json(), chosen.json()) == ({"requirements": 2}, {"requirements": 3})
    assert stub.calls[1] == (
        "reindex",
        ReindexScope.REQUIREMENTS,
        ("REQ-1", "REQ-2", "REQ-3"),
        "fake-owner",
        "Amina Owner",
    )
    assert bad.status_code == 422


@pytest.mark.parametrize(
    ("refusal", "status"),
    [
        (RequirementCorpusConflictError("This Requirement is not retired."), 409),
        (RequirementNotInCorpusError("Requirement work has no such requirement."), 404),
        (ServiceUnavailableError("Requirement work is unavailable."), 503),
    ],
)
def test_a_refused_corpus_action_reaches_the_admin(
    stub: StubCorpus, refusal: Exception, status: int
) -> None:
    stub.acted = refusal
    for client in _client(stub):
        response = client.post(
            "/knowledge-center/requirement-corpus/requirements/REQ-1/reinstatement",
            json={"reason": "Back on."},
            headers=ADMIN,
        )

    assert response.status_code == status
    if status == 409:
        assert response.json()["message"] == "This Requirement is not retired."


@pytest.mark.parametrize(
    "path",
    [
        "/knowledge-center/requirement-corpus/requirements/REQ-1/retirement",
        "/knowledge-center/requirement-corpus/requirements/REQ-1/reinstatement",
        "/knowledge-center/requirement-corpus/reindex",
    ],
)
def test_only_a_knowledge_admin_may_act_on_the_corpus(
    browsing: TestClient, stub: StubCorpus, path: str
) -> None:
    response = browsing.post(
        path,
        json={"reason": "x", "scope": "failed"},
        headers={"X-Fake-Actor-Id": "fake-observer"},
    )

    assert response.status_code == 403
    assert stub.calls == []


def test_a_retirement_needs_a_reason(browsing: TestClient, stub: StubCorpus) -> None:
    response = browsing.post(
        "/knowledge-center/requirement-corpus/requirements/REQ-1/retirement",
        json={"reason": ""},
        headers=ADMIN,
    )

    assert response.status_code == 422
    assert stub.calls == []


def test_retired_rows_carry_who_retired_them(stub: StubCorpus) -> None:
    retired = replace(ROW, retired=RetiredMark(AT, "Omar Observer", "Cancelled."))
    stub.requirements = lambda query, offset, limit: CorpusRequirementsPage((retired,), None)  # type: ignore[method-assign]
    for client in _client(stub):
        body = client.get(
            "/knowledge-center/requirement-corpus/requirements",
            params={"retired_only": "true"},
            headers=ADMIN,
        ).json()

    assert body["items"][0]["retired"] == {
        "at": "2026-10-06T09:00:00Z",
        "by": "Omar Observer",
        "reason": "Cancelled.",
    }
