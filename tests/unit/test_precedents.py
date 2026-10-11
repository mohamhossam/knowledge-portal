"""Decided verdicts kept as precedents (ontology plan Phase 5).

A precedent is what a Requirement Owner did with the verdict the assessment suggested:
accepted, overridden or left unknown. requirement-portal sends it to the internal route;
it is kept once per analysis, the later decision winning, and counted per release for a
knowledge admin.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.precedents import (
    PrecedentRequest,
    PrecedentSystemRequest,
)
from knowledge_portal.application.use_cases.architecture_knowledge import KnowledgeNotFoundError
from knowledge_portal.application.use_cases.precedents import (
    ReadPrecedentSummaries,
    RecordPrecedent,
)
from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError
from knowledge_portal.domain.architecture.precedents import (
    TEXT_LIMIT,
    ConceptOverrides,
    Precedent,
    PrecedentDecision,
    PrecedentSystem,
    summarise,
)
from knowledge_portal.domain.architecture.verdicts import ProductVerdict
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_precedents import InMemoryPrecedents
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

NOW = datetime(2026, 10, 11, 9, tzinfo=UTC)
SEED = "smb-source-reference-v1"
CHANGE = ProductVerdict.CHANGE_EXISTING_OFFERING
NEW_PLAN = ProductVerdict.NEW_PLAN


def _precedent(**changes: Any) -> Precedent:
    item: dict[str, Any] = {
        "id": "ana-1",
        "requirement_id": "REQ-1",
        "version": "ana-1@3",
        "release_id": "r1",
        "text": "Let Business Pro Plus customers add a second access point.",
        "suggested_verdict": CHANGE,
        "verdict": CHANGE,
        "decision": PrecedentDecision.ACCEPTED,
        "offering_id": "business-pro-plus",
        "concept_ids": ("cap-wifi-access",),
        "systems": (PrecedentSystem("cwom", "primary", "modify"),),
        "decided_at": NOW,
        "received_at": NOW,
    }
    return Precedent(**{**item, **changes})


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"verdict": NEW_PLAN}, "accepted verdict is the suggested one"),
        ({"verdict": None}, "accepted verdict is the suggested one"),
        ({"decision": PrecedentDecision.OVERRIDDEN}, "another verdict"),
        ({"decision": PrecedentDecision.UNKNOWN}, "no verdict"),
        ({"decided_at": datetime(2026, 10, 11)}, "time zone"),
        ({"text": "x" * (TEXT_LIMIT + 1)}, "at most"),
        ({"text": "  "}, "Precedent text"),
        (
            {"systems": (PrecedentSystem("cwom"), PrecedentSystem("cwom", "consumer"))},
            "named twice",
        ),
    ],
)
def test_a_precedent_keeps_its_decision_consistent(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        _precedent(**changes)


def test_an_overridden_or_unknown_decision_reads_as_given() -> None:
    overridden = _precedent(decision=PrecedentDecision.OVERRIDDEN, verdict=NEW_PLAN)
    unknown = _precedent(decision=PrecedentDecision.UNKNOWN, verdict=None)

    assert overridden.decided and overridden.verdict is NEW_PLAN
    assert not unknown.decided
    # A concept named twice is kept once.
    assert _precedent(concept_ids=("a", "a", "b")).concept_ids == ("a", "b")


def test_a_later_decision_replaces_the_earlier_and_the_same_one_changes_nothing() -> None:
    first = _precedent()
    later = _precedent(
        decided_at=NOW + timedelta(hours=1),
        decision=PrecedentDecision.OVERRIDDEN,
        verdict=NEW_PLAN,
    )

    assert later.replaces(first)
    assert not first.replaces(later)
    assert not replace(first, received_at=NOW + timedelta(days=1)).replaces(first)
    # The same moment with other content is a corrected delivery.
    assert _precedent(text="Add two access points.").replaces(first)


def test_a_release_s_summary_counts_decisions_and_the_concepts_most_overridden() -> None:
    items = (
        _precedent(id="a", concept_ids=("wifi", "billing")),
        _precedent(
            id="b",
            concept_ids=("wifi",),
            decision=PrecedentDecision.OVERRIDDEN,
            verdict=NEW_PLAN,
            decided_at=NOW + timedelta(hours=2),
        ),
        _precedent(id="c", decision=PrecedentDecision.UNKNOWN, verdict=None),
        _precedent(id="d", release_id="r0"),
    )

    summary = summarise("r1", items)

    assert (summary.accepted, summary.overridden, summary.unknown) == (1, 1, 1)
    assert summary.decided == 2 and summary.total == 3
    assert summary.override_rate == pytest.approx(0.5)
    assert summary.last_decided_at == NOW + timedelta(hours=2)
    # A decision left unknown counts for no concept.
    assert summary.concepts == (
        ConceptOverrides("wifi", 2, 1),
        ConceptOverrides("billing", 1, 0),
    )
    assert summarise("r9", items).override_rate is None
    # Overridden as often, the concept decided less often goes first: its rate is higher.
    tied = (
        _precedent(
            id="e",
            concept_ids=("wifi", "billing"),
            decision=PrecedentDecision.OVERRIDDEN,
            verdict=NEW_PLAN,
        ),
        _precedent(id="f", concept_ids=("wifi",)),
    )
    assert [item.concept_id for item in summarise("r1", tied).concepts] == ["billing", "wifi"]


def _request(**changes: Any) -> PrecedentRequest:
    item: dict[str, Any] = {
        "precedent_id": "ana-1",
        "requirement_id": "REQ-1",
        "version": "ana-1@3",
        "release_id": SEED,
        "text": ("Let SMB App customers see their orders.", "  ", "In the app."),
        "decision": PrecedentDecision.ACCEPTED,
        "decided_at": NOW,
        "suggested_verdict": CHANGE,
        "verdict": CHANGE,
        "offering_id": "no-such-offering",
        "concept_ids": ("no-such-concept",),
        "systems": (
            PrecedentSystemRequest("smb-app", "primary", "modify"),
            PrecedentSystemRequest("retired-system", "consumer", "consume_only"),
        ),
    }
    return PrecedentRequest(**{**item, **changes})


@pytest.fixture
def recording() -> tuple[RecordPrecedent, InMemoryPrecedents, InMemoryEvidenceIndex]:
    store = InMemoryPrecedents()
    index = InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer())
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    return RecordPrecedent(repository, index, store, FixedClock(NOW)), store, index


def test_a_decision_is_kept_with_what_its_release_holds(
    recording: tuple[RecordPrecedent, InMemoryPrecedents, InMemoryEvidenceIndex],
) -> None:
    record, store, index = recording

    receipt = record.execute(_request())

    assert receipt.recorded and receipt.dropped_systems == ("retired-system",)
    kept = store.get("ana-1")
    assert kept is not None
    assert kept.text == "Let SMB App customers see their orders.\nIn the app."
    assert kept.systems == (PrecedentSystem("smb-app", "primary", "modify"),)
    # The seed release holds no offering or concept: unknown ones are left out, not refused.
    assert kept.offering_id is None and kept.concept_ids == ()
    assert kept.received_at == NOW
    # Its text is searchable with the model the evidence index uses, and only that one.
    vector = index.vectors((kept.text,))[0]
    assert [item.precedent.id for item in store.nearest(index.embedding_model, vector, 3)] == [
        "ana-1"
    ]
    assert store.nearest("another-model", vector, 3) == ()


def test_a_decision_delivered_again_or_late_changes_nothing(
    recording: tuple[RecordPrecedent, InMemoryPrecedents, InMemoryEvidenceIndex],
) -> None:
    record, store, _ = recording
    later = _request(
        decided_at=NOW + timedelta(hours=1),
        decision=PrecedentDecision.OVERRIDDEN,
        verdict=NEW_PLAN,
    )

    assert record.execute(_request()).recorded
    assert not record.execute(_request()).recorded
    assert record.execute(later).recorded
    assert not record.execute(_request()).recorded
    kept = store.get("ana-1")
    assert kept is not None and kept.verdict is NEW_PLAN


def test_a_decision_on_an_unknown_release_is_refused(
    recording: tuple[RecordPrecedent, InMemoryPrecedents, InMemoryEvidenceIndex],
) -> None:
    record, store, _ = recording

    with pytest.raises(KnowledgeNotFoundError):
        record.execute(_request(release_id="no-such-release"))
    assert store.get("ana-1") is None


def test_the_nearest_precedents_are_decided_and_never_the_requirement_s_own() -> None:
    store = InMemoryPrecedents()
    near = (1.0, 0.0)
    store.record(_precedent(id="mine", requirement_id="REQ-9"), "m", near)
    store.record(_precedent(id="other", requirement_id="REQ-2"), "m", (0.8, 0.6))
    store.record(
        _precedent(
            id="unknown",
            requirement_id="REQ-3",
            decision=PrecedentDecision.UNKNOWN,
            verdict=None,
        ),
        "m",
        near,
    )

    found = store.nearest("m", near, 5, exclude_requirement="REQ-9")

    assert [(item.precedent.id, round(item.similarity, 2)) for item in found] == [("other", 0.8)]
    assert [item.precedent.id for item in store.nearest("m", near, 5)] == ["mine", "other"]


def test_summaries_name_their_release_and_need_a_maintainer() -> None:
    store = InMemoryPrecedents()
    store.record(_precedent(release_id=SEED, concept_ids=("wifi",)), "m", (1.0,))
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    read = ReadPrecedentSummaries(repository, store)

    (item,) = read.execute(Actor("owner", frozenset({"knowledge_maintainer"})))

    assert item.release_name == seed_knowledge().name
    assert item.summary.accepted == 1
    # A concept the release no longer holds is named by its id.
    assert [(c.concept_id, c.label) for c in item.concepts] == [("wifi", "wifi")]
    with pytest.raises(PermissionError):
        read.execute(Actor("reader", frozenset()))


TOKEN = "r" * 40
REQUIREMENTS = {"Authorization": f"Bearer {TOKEN}"}
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
READER = {"X-Fake-Actor-Id": "fake-reviewer"}
ROUTE = "/internal/architecture/precedents"
SUMMARY = "/architecture-knowledge/precedents/summary"
BODY: dict[str, Any] = {
    "precedent_id": "ana-1",
    "requirement_id": "REQ-1",
    "version": "ana-1@3",
    "release_id": SEED,
    "text": ["Let SMB App customers see their orders."],
    "decision": "overridden",
    "decided_at": "2026-10-11T09:00:00Z",
    "suggested_verdict": "change_existing_offering",
    "verdict": "new_plan",
    "systems": [{"id": "smb-app", "role": "primary", "change_type": "modify"}],
}


@pytest.fixture
def served() -> Any:
    container: Container = build_container(
        replace(FAKE_PROVIDER_SETTINGS, requirement_service_token=TOKEN)
    )
    with TestClient(create_app(lambda: container)) as client:
        yield client


def test_requirement_work_sends_decisions_through_the_internal_route(served: TestClient) -> None:
    assert served.post(ROUTE, json=BODY).status_code == 401

    first = served.post(ROUTE, json=BODY, headers=REQUIREMENTS)
    again = served.post(ROUTE, json=BODY, headers=REQUIREMENTS)

    assert first.status_code == 201, first.text
    assert first.json() == {"precedent_id": "ana-1", "recorded": True, "dropped_systems": []}
    assert again.status_code == 200
    assert again.json()["recorded"] is False
    unknown = served.post(ROUTE, json={**BODY, "release_id": "nowhere"}, headers=REQUIREMENTS)
    assert unknown.status_code == 404


@pytest.mark.parametrize(
    "changes",
    [
        {"verdict": "change_existing_offering"},
        {"decided_at": "2026-10-11T09:00:00"},
        {"text": []},
        {"decision": "maybe"},
    ],
)
def test_an_inconsistent_decision_is_refused(served: TestClient, changes: dict[str, Any]) -> None:
    answered = served.post(ROUTE, json={**BODY, **changes}, headers=REQUIREMENTS)

    assert answered.status_code == 422, answered.text


def test_a_knowledge_admin_reads_the_override_rate_per_release(served: TestClient) -> None:
    served.post(ROUTE, json=BODY, headers=REQUIREMENTS)
    accepted = {
        **BODY,
        "precedent_id": "ana-2",
        "requirement_id": "REQ-2",
        "decision": "accepted",
        "verdict": "change_existing_offering",
    }
    served.post(ROUTE, json=accepted, headers=REQUIREMENTS)

    read = served.get(SUMMARY, headers=OWNER)

    assert read.status_code == 200, read.text
    (release,) = read.json()["releases"]
    assert release["release_id"] == SEED
    assert (release["accepted"], release["overridden"], release["unknown"]) == (1, 1, 0)
    assert release["override_rate"] == pytest.approx(0.5)
    assert "text" not in release
    assert served.get(SUMMARY, headers=READER).status_code == 403
