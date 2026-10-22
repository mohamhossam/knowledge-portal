"""Reviewed means seen: an approval keeps how much of the version its approver looked at."""

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.library import ReviewCoverage
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.main import create_app


@pytest.mark.parametrize(
    ("passages", "seen", "flagged", "flagged_seen"),
    [
        (0, 0, 0, 0),  # nothing to look at
        (3, 4, 0, 0),  # more seen than there are
        (3, -1, 0, 0),
        (3, 3, 4, 0),  # more flagged than there are
        (3, 1, 2, 2),  # more flagged seen than seen
        (3, 3, 1, 2),  # more flagged seen than flagged
    ],
)
def test_coverage_refuses_counts_that_cannot_be(
    passages: int, seen: int, flagged: int, flagged_seen: int
) -> None:
    with pytest.raises(InvalidDocumentError):
        ReviewCoverage(passages, seen, flagged, flagged_seen)


def test_coverage_accepts_none_seen_and_all_seen() -> None:
    assert ReviewCoverage(4, 0).seen == 0
    assert ReviewCoverage(4, 4, 2, 2).flagged_seen == 2


def _ready(client: TestClient, key: str) -> tuple[str, dict[str, Any]]:
    uploaded = client.post(
        "/library/ingestions",
        data={"title": "Coverage", "idempotency_key": key},
        files={"file": ("policy.txt", b"XGPON coverage is required.", "text/plain")},
    )
    assert uploaded.status_code == 202
    path = f"/library/documents/{uploaded.json()['id']}"
    view = uploaded.json()
    for _ in range(100):
        view = client.get(path).json()
        if view["versions"][0]["stage"] == "ready_for_review":
            break
        time.sleep(0.05)
    version = view["versions"][0]
    review = client.post(
        f"{path}/versions/{version['id']}/review",
        json={
            "expected_version": view["version"],
            "explanation": "Reviewed original",
            "passages": [
                {"block_id": b["id"], "text": b["text"], "included": True, "exclusion_reason": ""}
                for b in version["blocks"]
            ],
        },
    )
    assert review.status_code == 200
    return f"{path}/versions/{version['id']}/approval", review.json()


def _approval(saved: dict[str, Any], **extra: object) -> dict[str, object]:
    return {
        "expected_version": saved["version"],
        "revision_id": saved["versions"][0]["revisions"][-1]["id"],
        "fingerprint": saved["review_fingerprint"],
        **extra,
    }


def test_an_approval_keeps_the_coverage_its_reviewer_sent() -> None:
    container = build_container(
        Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline")
    )
    with TestClient(create_app(lambda: container)) as client:
        approval, saved = _ready(client, "coverage-kept")
        coverage = {"passages": 3, "seen": 2, "flagged": 1, "flagged_seen": 1}

        response = client.post(approval, json=_approval(saved, coverage=coverage))

        assert response.status_code == 200
        assert response.json()["publications"][-1]["coverage"] == coverage


def test_an_approval_without_coverage_records_none() -> None:
    container = build_container(
        Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline")
    )
    with TestClient(create_app(lambda: container)) as client:
        approval, saved = _ready(client, "coverage-absent")

        response = client.post(approval, json=_approval(saved))

        assert response.status_code == 200
        assert response.json()["publications"][-1]["coverage"] is None


def test_an_approval_with_impossible_coverage_is_refused_and_publishes_nothing() -> None:
    container = build_container(
        Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline")
    )
    with TestClient(create_app(lambda: container)) as client:
        approval, saved = _ready(client, "coverage-impossible")

        response = client.post(approval, json=_approval(saved, coverage={"passages": 2, "seen": 5}))

        assert response.status_code == 422
        document = client.get(approval.split("/versions/")[0]).json()
        assert document["publications"] == []
