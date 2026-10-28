"""Decided verdicts kept as precedents (ontology plan Phase 5).

A precedent is what a Requirement Owner did with the verdict the assessment suggested:
accepted, overridden or left unknown. requirement-portal sends it to the internal route;
it is kept once per analysis, the later decision winning, and counted per release for a
knowledge admin.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceError,
    ArchitectureEvidenceIndexPort,
)
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.precedents import (
    PrecedentRequest,
    PrecedentSystemRequest,
)
from knowledge_portal.application.use_cases.architecture_knowledge import KnowledgeNotFoundError
from knowledge_portal.application.use_cases.assessment_lanes import precedent_lane
from knowledge_portal.application.use_cases.precedents import (
    ReadPrecedentSummaries,
    RecordPrecedent,
)
from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError
from knowledge_portal.domain.architecture.precedents import (
    NEED_LIMIT,
    TEXT_LIMIT,
    ConceptOverrides,
    Precedent,
    PrecedentDecision,
    PrecedentSystem,
    needs_space,
    needs_text,
    precedent_text,
    summarise,
)
from knowledge_portal.domain.architecture.verdicts import ProductVerdict
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.persistence.in_memory_precedents import InMemoryPrecedents
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.catalogue_seed import seed_knowledge, seeded_repository
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
    repository = seeded_repository()
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


class _Index:
    """An evidence index that records the texts the lane embeds, or fails to embed."""

    embedding_model = "m"

    def __init__(self, *, fails: bool = False) -> None:
        self.texts: list[str] = []
        self.calls = 0
        self._fails = fails

    def vectors(self, texts: tuple[str, ...]) -> tuple[tuple[float, ...], ...]:
        if self._fails:
            raise ArchitectureEvidenceError("The embedding service returned unusable output.")
        self.calls += 1
        self.texts.extend(texts)
        return tuple((1.0, 0.0) for _ in texts)


def test_the_lane_compares_the_text_a_precedent_keeps() -> None:
    # Observed 2026-10-28: the lane embedded all 45,189 characters of a requirement, which
    # the embedding model refused, while a precedent keeps only its first TEXT_LIMIT.
    store = InMemoryPrecedents()
    store.record(_precedent(requirement_id="REQ-2"), "m", (1.0, 0.0))
    parts = ("Let Business Pro Plus customers add a second access point.", "line " * TEXT_LIMIT)
    index = _Index()

    found = precedent_lane(
        store, cast(ArchitectureEvidenceIndexPort, index), "\n".join(parts), frozenset(), "REQ-1"
    )

    assert index.texts == [precedent_text(parts)]
    assert len(index.texts[0]) == TEXT_LIMIT
    assert [match.precedent.id for match, _ in found] == ["ana-1"]


def test_a_precedent_is_recorded_with_the_same_text_the_lane_compares(
    recording: tuple[RecordPrecedent, InMemoryPrecedents, InMemoryEvidenceIndex],
) -> None:
    record, store, _ = recording
    parts = ("  Let Business Pro Plus customers add a second access point.  ", "", "line " * 900)

    record.execute(_request(text=parts))

    kept = store.get("ana-1")
    assert kept is not None and kept.text == precedent_text(parts)


def test_an_assessment_whose_precedents_cannot_be_embedded_has_none(
    caplog: pytest.LogCaptureFixture,
) -> None:
    store = InMemoryPrecedents()
    store.record(_precedent(requirement_id="REQ-2"), "m", (1.0, 0.0))

    with caplog.at_level(logging.WARNING):
        found = precedent_lane(
            store,
            cast(ArchitectureEvidenceIndexPort, _Index(fails=True)),
            "Let Business Pro Plus customers add a second access point.",
            frozenset(),
            "REQ-1",
        )

    assert found == ()
    assert "without precedents" in caplog.text
    assert "access point" not in caplog.text


def test_needs_are_compared_as_one_text_whatever_their_order_case_or_spacing() -> None:
    assert (
        needs_text(("Add a  FortiAP", "bill per site", "add a fortiap", "  "))
        == needs_text(("Bill per site", "add a FortiAP"))
        == "add a fortiap\nbill per site"
    )
    assert needs_text(()) == ""
    assert len(needs_text(("need " * TEXT_LIMIT,))) == TEXT_LIMIT
    assert needs_space("m") == "m#needs-v1"


@pytest.mark.parametrize(
    ("needs", "message"),
    [((" ",), "Precedent need"), (tuple(f"need {i}" for i in range(NEED_LIMIT + 1)), "needs")],
)
def test_a_precedent_keeps_a_bounded_list_of_needs(needs: tuple[str, ...], message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        _precedent(needs=needs)


def test_a_decision_with_needs_is_kept_in_the_needs_space(
    recording: tuple[RecordPrecedent, InMemoryPrecedents, InMemoryEvidenceIndex],
) -> None:
    record, store, index = recording
    needs = ("See their orders", " ", "Show them in the app")

    record.execute(_request(needs=needs))

    kept = store.get("ana-1")
    assert kept is not None and kept.needs == ("See their orders", "Show them in the app")
    vector = index.vectors((needs_text(kept.needs),))[0]
    space = needs_space(index.embedding_model)
    assert [item.precedent.id for item in store.nearest(space, vector, 3)] == ["ana-1"]
    # Never beside precedents compared by their text.
    assert store.nearest(index.embedding_model, vector, 3) == ()


def _lane(store: InMemoryPrecedents, needs: tuple[str, ...]) -> tuple[list[str], _Index]:
    index = _Index()
    found = precedent_lane(
        store,
        cast(ArchitectureEvidenceIndexPort, index),
        "Let Business Pro Plus customers add a second access point.",
        frozenset(),
        "REQ-1",
        needs=needs,
    )
    return [match.precedent.id for match, _ in found], index


def test_the_lane_compares_needs_with_needs_once_any_precedent_has_them() -> None:
    store = InMemoryPrecedents()
    store.record(_precedent(id="by-text", requirement_id="REQ-2"), "m", (1.0, 0.0))
    needs = ("add a second access point",)

    assert _lane(store, needs)[0] == ["by-text"]

    store.record(
        _precedent(id="by-needs", requirement_id="REQ-3", needs=needs), needs_space("m"), (1.0, 0.0)
    )
    found, index = _lane(store, needs)

    assert found == ["by-needs"]
    # Both texts in one round trip: the needs first, the text in case no precedent has needs.
    assert index.calls == 1
    assert index.texts == [
        needs_text(needs),
        precedent_text(("Let Business Pro Plus customers add a second access point.",)),
    ]


def test_a_requirement_read_without_needs_is_compared_by_its_text() -> None:
    store = InMemoryPrecedents()
    store.record(
        _precedent(id="by-needs", requirement_id="REQ-3", needs=("x",)), "m#needs-v1", (1.0, 0.0)
    )
    store.record(_precedent(id="by-text", requirement_id="REQ-2"), "m", (1.0, 0.0))

    found, index = _lane(store, ())

    assert found == ["by-text"]
    assert len(index.texts) == 1


def test_requirement_work_may_send_the_needs_it_was_assessed_with(served: TestClient) -> None:
    sent = served.post(
        ROUTE, json={**BODY, "needs": ["See their orders", "In the app"]}, headers=REQUIREMENTS
    )
    too_many = served.post(
        ROUTE,
        json={
            **BODY,
            "precedent_id": "ana-2",
            "needs": [f"need {i}" for i in range(NEED_LIMIT + 1)],
        },
        headers=REQUIREMENTS,
    )

    assert sent.status_code == 201, sent.text
    assert too_many.status_code == 422


def test_summaries_name_their_release_and_need_a_maintainer() -> None:
    store = InMemoryPrecedents()
    store.record(_precedent(release_id=SEED, concept_ids=("wifi",)), "m", (1.0,))
    repository = seeded_repository()
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
        replace(FAKE_PROVIDER_SETTINGS, requirement_service_token=TOKEN),
        in_service=seed_knowledge(),
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
