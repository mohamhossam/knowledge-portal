"""Re-confirming knowledge on a cycle, and reminding whoever answers for it (Knowledge Center D)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.errors import DocumentNotFoundError, DocumentVersionConflictError
from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.application.ports.library_admin import LibraryAdminAction
from knowledge_portal.application.use_cases.cited_passages import PassageCitation
from knowledge_portal.application.use_cases.documents import UploadDocumentInput
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.reference import ReferenceDocumentState
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError
from knowledge_portal.domain.shared.review import ReviewState, standing
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.unit.test_document_library import approve_fixture, owner

# The packaged catalogue was published on 1 Jan 2026; its systems fall due on 30 Jun 2026.
SEED_PUBLISHED = datetime(2026, 1, 1, tzinfo=UTC)
NOW = datetime(2026, 3, 1, 9, tzinfo=UTC)
ADMIN = ActorProfile(ActorId("ada-admin"), "Ada Admin", roles=frozenset({"knowledge_admin"}))
MAINTAINER = ActorProfile(
    ActorId("max-maintainer"),
    "Max Maintainer",
    roles=frozenset({"knowledge_admin", "knowledge_maintainer"}),
)
CYCLE = timedelta(days=180)


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(NOW)


@pytest.fixture
def container(clock: FixedClock) -> Container:
    return build_container(
        Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline"), clock=clock
    )


def _published(container: Container) -> str:
    """A document of the owner's, approved and in service now: its review clock starts today."""
    document = approve_fixture(container.document_library)
    assert container.reference_knowledge.index_next()
    return document.id


def test_standing_falls_due_on_the_day_and_reminds_two_weeks_before() -> None:
    reviewer = owner().snapshot()
    due = NOW + CYCLE
    assert standing(NOW, reviewer, CYCLE, due - timedelta(days=15)).state is ReviewState.CURRENT
    assert standing(NOW, reviewer, CYCLE, due - timedelta(days=14)).state is ReviewState.DUE_SOON
    assert standing(NOW, reviewer, CYCLE, due - timedelta(seconds=1)).state is ReviewState.DUE_SOON
    assert standing(NOW, reviewer, CYCLE, due).state is ReviewState.OVERDUE
    assert standing(NOW, reviewer, CYCLE, NOW).due_on == date(2026, 8, 28)


def test_approving_counts_as_a_review_and_the_owner_confirms_it_again(
    container: Container, clock: FixedClock
) -> None:
    document_id = _published(container)
    view = container.document_library.get(document_id, owner())
    assert view.review is not None
    assert view.review.last_reviewed_at == NOW and view.review.state is ReviewState.CURRENT
    clock.set(NOW + CYCLE + timedelta(days=1))
    assert container.document_library.get(document_id, owner()).review.state is ReviewState.OVERDUE  # type: ignore[union-attr]
    confirmed = container.library_review.execute(document_id, owner(), note="Still the policy.")
    assert confirmed.reviews[-1].note == "Still the policy."
    again = container.document_library.get(document_id, owner()).review
    assert again is not None and again.state is ReviewState.CURRENT
    assert again.last_reviewed_at == clock.now() and again.reviewer == owner().snapshot()


def test_an_admin_confirms_for_the_owner_only_with_a_reason(container: Container) -> None:
    document_id = _published(container)
    with pytest.raises(InvalidDocumentError, match="Say why"):
        container.library_review.execute(document_id, ADMIN)
    stranger = ActorProfile(ActorId("sam"), "Sam")
    with pytest.raises(AuthorizationDeniedError):
        container.library_review.execute(document_id, stranger, reason="Because.")
    confirmed = container.library_review.execute(document_id, ADMIN, reason="Amina is away.")
    review = confirmed.reviews[-1]
    assert review.reviewer == ADMIN.snapshot()
    assert review.on_behalf is not None and review.on_behalf.reason == "Amina is away."
    (entry,) = container.library_admin.history(document_id, ADMIN)
    assert entry.action is LibraryAdminAction.CONFIRM_REVIEW and entry.reason == "Amina is away."


def test_nothing_in_service_has_nothing_to_confirm(container: Container) -> None:
    document = container.document_library.submit(
        "Draft", UploadDocumentInput("d.txt", "text/plain", b"Draft text."), "draft", owner()
    )
    with pytest.raises(DocumentVersionConflictError):
        container.library_review.execute(document.id, owner())
    with pytest.raises(DocumentNotFoundError):
        container.library_review.execute("missing", owner())
    assert container.document_library.get(document.id, owner()).review is None


def test_requirement_work_learns_when_a_document_falls_due(
    container: Container, clock: FixedClock
) -> None:
    document_id = _published(container)
    events = container.knowledge_events.after(0, 100)
    state = ReferenceDocumentState.from_payload(events[-1].payload)
    assert state.document_id == document_id and state.review_due_on == (NOW + CYCLE).date()
    # Older events, written before Knowledge Center D, carry no due date and still read.
    payload = events[-1].payload
    assert isinstance(payload, dict)
    legacy = {key: value for key, value in payload.items() if key != "review_due_on"}
    assert ReferenceDocumentState.from_payload(legacy).review_due_on is None
    clock.set(NOW + timedelta(days=30))
    container.library_review.execute(document_id, owner())
    latest = ReferenceDocumentState.from_payload(
        container.knowledge_events.after(0, 100)[-1].payload
    )
    assert latest.review_due_on == (NOW + timedelta(days=30) + CYCLE).date()
    view = container.document_library.get(document_id, owner())
    publication = view.publications[-1]
    version = view.versions[-1]
    passage = container.cited_passages.read(
        PassageCitation(
            document_id,
            publication.id,
            version.id,
            publication.revision_id,
            version.blocks[0].id,
        )
    )
    assert passage.review_due_on == latest.review_due_on


def test_systems_count_from_the_versions_publication_and_maintainers_confirm_them(
    container: Container, clock: FixedClock
) -> None:
    standings = container.system_reviews.standings()
    assert len(standings) == 31
    assert all(item.standing.last_reviewed_at == SEED_PUBLISHED for item in standings)
    assert all(item.standing.state is ReviewState.CURRENT for item in standings)
    clock.set(SEED_PUBLISHED + CYCLE + timedelta(days=1))
    first = standings[0].system_id
    (confirmed,) = container.system_reviews.confirm((first,), MAINTAINER, note="Checked.")
    assert confirmed.standing.state is ReviewState.CURRENT and confirmed.note == "Checked."
    states = {item.system_id: item.standing.state for item in container.system_reviews.standings()}
    assert states[first] is ReviewState.CURRENT
    assert sum(state is ReviewState.OVERDUE for state in states.values()) == 30
    # An admin who is not a maintainer confirms only with a reason; "all" names every system.
    with pytest.raises(InvalidDocumentError, match="Say why"):
        container.system_reviews.confirm(None, ADMIN)
    everything = container.system_reviews.confirm(None, ADMIN, reason="Annual sign-off.")
    assert len(everything) == 31 and all(item.on_behalf for item in everything)
    with pytest.raises(DocumentNotFoundError):
        container.system_reviews.confirm(("no-such-system",), MAINTAINER)
    history = container.system_reviews.history(first)
    assert [item.reviewer for item in history] == [ADMIN.snapshot(), MAINTAINER.snapshot()]


def test_reminders_are_the_persons_own_documents_and_for_maintainers_every_system(
    container: Container, clock: FixedClock
) -> None:
    document_id = _published(container)
    clock.set(NOW + CYCLE - timedelta(days=3))
    mine = container.review_reminders.for_actor(owner())
    assert [(item.kind.value, item.id) for item in mine.items] == [("document", document_id)]
    assert (mine.overdue, mine.due_soon) == (0, 1)
    # A maintainer who owns nothing sees every system, all overdue by now.
    systems = container.review_reminders.for_actor(MAINTAINER)
    assert systems.overdue == 31 and systems.due_soon == 0
    assert {item.kind.value for item in systems.items} == {"system"}
    assert container.review_reminders.for_actor(ADMIN).items == ()


def test_a_systems_own_evidence_says_when_it_falls_due(container: Container) -> None:
    system = container.system_reviews.standings()[0]
    record = EvidenceChunk("c1", "Catalogue", f"system {system.system_id}", "BRM rates usage.")
    assert (
        container.system_reviews.with_review(record).system_review_due_on == system.standing.due_on
    )
    part = replace(record, location=f"system {system.system_id}, capability billing")
    assert container.system_reviews.with_review(part).system_review_due_on == system.standing.due_on
    document = replace(record, document_version_id="v1")
    assert container.system_reviews.with_review(document).system_review_due_on is None


def test_the_routes(container: Container) -> None:
    document_id = _published(container)
    with TestClient(create_app(lambda: container)) as client:
        # The default persona is a knowledge admin who is not the document's owner.
        no_reason = client.post(f"/library/documents/{document_id}/review", json={})
        assert no_reason.status_code == 422
        done = client.post(
            f"/library/documents/{document_id}/review", json={"reason": "Owner away."}
        )
        assert done.status_code == 200 and done.json()["review"]["state"] == "current"
        assert client.post("/library/documents/x/review", json={"reason": "r"}).status_code == 404
        assert (
            client.post(
                f"/library/documents/{document_id}/review", json={"note": "n" * 501}
            ).status_code
            == 422
        )
        standings = client.get("/architecture-knowledge/systems/reviews").json()
        assert len(standings) == 31
        confirmed = client.post(
            "/architecture-knowledge/systems/reviews",
            json={"system_ids": [standings[0]["system_id"]], "note": "Checked."},
        )
        assert confirmed.status_code == 200 and len(confirmed.json()) == 1
        assert (
            client.post(
                "/architecture-knowledge/systems/reviews", json={"system_ids": []}
            ).status_code
            == 422
        )
        history = client.get(
            f"/architecture-knowledge/systems/{standings[0]['system_id']}/reviews"
        ).json()
        assert history[0]["note"] == "Checked."
        reminders = client.get("/reviews/reminders").json()
        assert set(reminders) == {"overdue", "due_soon", "items"}
        observer = {"X-Fake-Actor-Id": "fake-observer"}
        assert client.get("/reviews/reminders", headers=observer).status_code == 403


def test_the_review_cycle_is_a_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    from knowledge_portal.infrastructure.config.options import ConfigurationError

    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("KNOWLEDGE_REVIEW_CYCLE_DAYS", "90")
    assert Settings.from_env().knowledge_review_cycle_days == 90
    monkeypatch.setenv("KNOWLEDGE_REVIEW_CYCLE_DAYS", "0")
    with pytest.raises(ConfigurationError, match="at least one day"):
        Settings.from_env()
    monkeypatch.setenv("KNOWLEDGE_REVIEW_CYCLE_DAYS", "half a year")
    with pytest.raises(ConfigurationError, match="whole number"):
        Settings.from_env()
    monkeypatch.delenv("KNOWLEDGE_REVIEW_CYCLE_DAYS")
    assert Settings.from_env().knowledge_review_cycle_days == 180
