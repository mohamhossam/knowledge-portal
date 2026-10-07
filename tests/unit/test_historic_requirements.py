"""Historic Requirements: old BRDs with their Azure DevOps lineage (Knowledge Center E)."""

from __future__ import annotations

import inspect
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from smb_kernel.documents.model import DocumentEvidenceBlock, EvidenceBlockKind
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.ado_work_items import AdoWorkItemSourcePort
from knowledge_portal.application.ports.historic_requirements import (
    HistoricRequirementConflictError,
    HistoricRequirementNotFoundError,
)
from knowledge_portal.application.ports.knowledge_events import HISTORIC_REQUIREMENT_CHANGED
from knowledge_portal.application.use_cases.architecture_documents import (
    IncomingFile,
    UploadOutcome,
)
from knowledge_portal.domain.historic.errors import (
    HistoricPublicationSupersededError,
    HistoricRequirementStateError,
    InvalidHistoricRequirementError,
)
from knowledge_portal.domain.historic.historic_requirement import (
    BrdStage,
    ContentPart,
    HistoricStatus,
    RunStatus,
    title_from_filename,
)
from knowledge_portal.domain.historic.id_suggestions import suggest_work_item_ids
from knowledge_portal.domain.historic.work_items import (
    Breakdown,
    ChangeKind,
    ItemProblem,
    WorkItem,
    WorkItemType,
    breakdown_diff,
)
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.infrastructure.ado import fake_work_items, unconfigured
from knowledge_portal.infrastructure.ado.fake_work_items import FakeAdoWorkItemSource
from knowledge_portal.infrastructure.ado.html_text import plain_text
from knowledge_portal.infrastructure.config.options import (
    AdoProvider,
    ConfigurationError,
    IdentityProvider,
    LLMProvider,
    PersistenceProvider,
)
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.word_table_fixtures import DOCX_MIME, word_document, word_paragraph

NOW = datetime(2026, 10, 6, 9, tzinfo=UTC)
CURATOR = ActorProfile(ActorId("ada-admin"), "Ada Admin", roles=frozenset({"knowledge_admin"}))


def word(*paragraphs: str) -> bytes:
    return word_document("".join(word_paragraph(text) for text in paragraphs))


def brd(name: str = "XGPON_bundles.docx", *lines: str) -> IncomingFile:
    text = lines or ("Business customers order XGPON bundles.", "Delivered as Epic 48213.")
    return IncomingFile(name, DOCX_MIME, word(*text))


def drain(container: Container) -> None:
    while container.historic_jobs.run_once() is not None:
        pass


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(NOW)


@pytest.fixture
def container(clock: FixedClock) -> Container:
    return build_container(
        Settings(
            llm_provider=LLMProvider.FAKE,
            library_scan_mode="offline",
            ado_provider=AdoProvider.FAKE,
        ),
        clock=clock,
    )


def _started(container: Container, *files: IncomingFile) -> str:
    (result, *_) = container.historic_imports.import_files(files or (brd(),), CURATOR)
    assert result.outcome is UploadOutcome.ADDED and result.version_id
    drain(container)
    return result.version_id


def _linked(container: Container, roots: tuple[int, ...] = (48213,)) -> str:
    historic_id = _started(container)
    record = container.historic_imports.get(historic_id)
    container.historic_imports.link(historic_id, roots, record.version, CURATOR)
    drain(container)
    return historic_id


# --- The domain ----------------------------------------------------------------------------


def _block(text: str, label: str = "paragraph 1") -> DocumentEvidenceBlock:
    return DocumentEvidenceBlock(
        "b-" + label, EvidenceBlockKind.PARAGRAPH, 1, (), label, "a" * 64, text=text
    )


def test_ids_in_a_brd_are_suggested_with_where_they_were_found() -> None:
    found = suggest_work_item_ids(
        (
            _block("Delivered as Epic 48213 and AB#48220.", "paragraph 4"),
            _block(
                "See https://dev.azure.com/o/p/_workitems/edit/48231 and story #48240.",
                "table 2, row 3",
            ),
            # Section numbers, colours and short numbers are not work items.
            _block("Section #2, colour #fff, entity &#1234; and Epic 48213 again.", "paragraph 9"),
        )
    )
    assert [(s.work_item_id, s.label) for s in found] == [
        (48213, "paragraph 4"),
        (48220, "paragraph 4"),
        (48231, "table 2, row 3"),
        (48240, "table 2, row 3"),
    ]
    assert "Epic 48213" in found[0].quote


def _item(
    id: int, kind: WorkItemType, parent: int | None, *children: int, state: str = "Closed"
) -> WorkItem:
    return WorkItem(
        id, kind, f"Item {id}", state, 1, f"u/{id}", parent_id=parent, child_ids=children
    )


def test_the_lineage_runs_epic_to_feature_to_story_and_a_refresh_says_what_changed() -> None:
    before = Breakdown(
        (1,),
        (
            _item(1, WorkItemType.EPIC, None, 2),
            _item(2, WorkItemType.FEATURE, 1, 3, 4),
            _item(3, WorkItemType.USER_STORY, 2),
            _item(4, WorkItemType.USER_STORY, 2),
        ),
        NOW,
    )
    (epic,) = before.lineage()
    assert epic.item.id == 1 and [s.item.id for s in epic.children[0].children] == [3, 4]
    after = Breakdown(
        (1,),
        (
            _item(1, WorkItemType.EPIC, None, 2),
            _item(2, WorkItemType.FEATURE, 1, 3, 5),
            _item(3, WorkItemType.USER_STORY, 2, state="Removed"),
            _item(5, WorkItemType.USER_STORY, 2),
        ),
        NOW,
    )
    changes = {(c.kind, c.work_item_id): c.fields for c in breakdown_diff(before, after)}
    assert changes == {
        (ChangeKind.CHANGED, 2): ("child_ids",),
        (ChangeKind.CHANGED, 3): ("state",),
        (ChangeKind.ADDED, 5): (),
        (ChangeKind.REMOVED, 4): (),
    }


def test_rich_text_from_azure_devops_is_kept_as_plain_text() -> None:
    assert plain_text("<p>Rates <b>usage</b></p><ul><li>BCRM</li><li>BRM &amp; ODS</li></ul>") == (
        "Rates usage\n- BCRM\n- BRM & ODS"
    )
    assert plain_text("<script>alert(1)</script>ok") == "ok"
    assert plain_text(None) == ""


def test_a_draft_takes_its_title_from_its_file() -> None:
    assert (
        title_from_filename("BRD-2025-014_XGPON bundles v2.docx") == "BRD-2025-014 XGPON bundles v2"
    )


# --- Importing -----------------------------------------------------------------------------


def test_a_batch_starts_a_draft_per_brd_and_refuses_what_it_cannot_read(
    container: Container,
) -> None:
    results = container.historic_imports.import_files(
        (
            brd(),
            IncomingFile("legacy.doc", "application/msword", b"\xd0\xcf"),
            IncomingFile("notes.txt", "text/plain", b"plain"),
            # Browsers often send Word as octet-stream; the extension decides then.
            IncomingFile("roaming.docx", "application/octet-stream", word("Gulf roaming packs.")),
            brd(),  # The same file again.
        ),
        CURATOR,
    )
    assert [r.outcome for r in results] == [
        UploadOutcome.ADDED,
        UploadOutcome.REFUSED,
        UploadOutcome.REFUSED,
        UploadOutcome.ADDED,
        UploadOutcome.REFUSED,
    ]
    assert "save it as .docx" in (results[1].reason or "")
    assert "already imported" in (results[4].reason or "")
    drain(container)
    record = container.historic_imports.get(results[0].version_id or "")
    assert record.title == "XGPON bundles" and record.brds[0].stage is BrdStage.READ
    assert [s.work_item_id for s in record.suggestions] == [48213]
    assert record.blockers() == ("Its breakdown has not been read from Azure DevOps.",)
    with pytest.raises(InvalidHistoricRequirementError):
        container.historic_imports.import_files((), CURATOR)


def test_reading_the_breakdown_reports_progress_and_each_item_it_could_not_import(
    container: Container,
) -> None:
    historic_id = _linked(container, (48213, 41000, 99999))
    record = container.historic_imports.get(historic_id)
    assert record.run is not None and record.run.status is RunStatus.SUCCEEDED
    assert record.run.done == record.run.total == 8
    assert {(e.work_item_id, e.problem) for e in record.run.item_errors} == {
        (41000, ItemProblem.NOT_PERMITTED),
        (99999, ItemProblem.NOT_FOUND),
    }
    breakdown = record.breakdown
    assert breakdown is not None
    assert (breakdown.count(WorkItemType.EPIC), breakdown.count(WorkItemType.FEATURE)) == (1, 2)
    assert breakdown.count(WorkItemType.USER_STORY) == 5
    assert breakdown.not_imported == (("Bug", 1), ("Task", 1))
    assert record.blockers() == ()


def test_an_import_reads_no_more_than_its_bound(container: Container) -> None:
    tree = FakeAdoWorkItemSource().read_tree((48213,), 3, lambda done, total: None)
    assert len(tree.items) == 3
    assert any(e.problem is ItemProblem.OVER_LIMIT for e in tree.errors)


def test_without_an_ado_connection_brds_read_but_no_breakdown_can_be(clock: FixedClock) -> None:
    container = build_container(
        Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline"), clock=clock
    )
    historic_id = _started(container)
    record = container.historic_imports.get(historic_id)
    container.historic_imports.link(historic_id, (48213,), record.version, CURATOR)
    drain(container)
    run = container.historic_imports.get(historic_id).run
    assert run is not None and run.status is RunStatus.FAILED
    assert run.failure == "ado_not_configured"


def test_publishing_refreshing_and_withdrawing_each_tell_requirement_work(
    container: Container, clock: FixedClock
) -> None:
    historic_id = _linked(container)
    imports = container.historic_imports
    record = imports.get(historic_id)
    with pytest.raises(HistoricRequirementConflictError):
        imports.publish(historic_id, record.version - 1, CURATOR)
    published = imports.publish(historic_id, record.version, CURATOR)
    assert published.status is HistoricStatus.PUBLISHED
    event = container.knowledge_events.after(0, 100)[-1]
    assert (event.kind, event.subject_id) == (HISTORIC_REQUIREMENT_CHANGED, historic_id)
    state = event.payload
    assert isinstance(state, dict) and state["published"]["publication"] == 1
    # The event names the publication; its content is read a page at a time.
    assert "brds" not in state["published"] and "items" not in state["published"]
    counts = state["published"]["counts"]
    assert counts["brds"] == 1 and counts["passages"] >= 1 and counts["items"] >= 3
    passages = imports.content(historic_id, 1, ContentPart.PASSAGES, 0, 200)
    assert str(passages.entries[0]["text"]).startswith("Business")
    assert passages.fingerprint == state["published"]["fingerprint"]
    items = imports.content(historic_id, 1, ContentPart.ITEMS, 0, 2)
    assert len(items.entries) == 2 and items.next_offset == 2
    rest = imports.content(historic_id, 1, ContentPart.ITEMS, 2, 200)
    ids = {entry["id"] for entry in (*items.entries, *rest.entries)}
    assert ids >= {48213, 48214, 48216} and len(ids) == counts["items"]
    assert rest.next_offset is None
    with pytest.raises(HistoricRequirementStateError):
        imports.rename(historic_id, "Another", published.version)

    # The fake's backlog moves on after its first read, as Azure DevOps would.
    imports.refresh(historic_id, published.version, CURATOR)
    drain(container)
    waiting = imports.get(historic_id)
    assert waiting.pending_refresh is not None
    assert [(c.kind, c.work_item_id, c.fields) for c in waiting.pending_refresh.changes] == [
        (ChangeKind.CHANGED, 48218, ("state",))
    ]
    assert imports.refresh_waiting() == 1
    accepted = imports.accept_refresh(historic_id, waiting.version, CURATOR)
    assert len(accepted.publications) == 2 and accepted.pending_refresh is None
    assert imports.refresh_waiting() == 0
    republished = container.knowledge_events.after(0, 100)[-1].payload
    assert isinstance(republished, dict) and republished["published"]["publication"] == 2
    # Requirement work asking for the first publication is told a newer one is in use.
    with pytest.raises(HistoricPublicationSupersededError):
        imports.content(historic_id, 1, ContentPart.ITEMS, 0, 200)

    with pytest.raises(InvalidHistoricRequirementError):
        imports.withdraw(historic_id, "  ", accepted.version, CURATOR)
    withdrawn = imports.withdraw(
        historic_id, "Superseded by the 2026 BRD.", accepted.version, CURATOR
    )
    assert withdrawn.status is HistoricStatus.WITHDRAWN
    gone = container.knowledge_events.after(0, 100)[-1].payload
    assert isinstance(gone, dict) and gone["published"] is None
    with pytest.raises(HistoricRequirementNotFoundError):
        imports.content(historic_id, 2, ContentPart.PASSAGES, 0, 200)


def test_a_draft_cannot_be_published_until_it_has_been_read_and_linked(
    container: Container,
) -> None:
    historic_id = _started(container)
    record = container.historic_imports.get(historic_id)
    with pytest.raises(HistoricRequirementStateError, match="breakdown has not been read"):
        container.historic_imports.publish(historic_id, record.version, CURATOR)
    # A breakdown whose roots all failed is not a breakdown to publish.
    container.historic_imports.link(historic_id, (99999,), record.version, CURATOR)
    drain(container)
    record = container.historic_imports.get(historic_id)
    with pytest.raises(HistoricRequirementStateError, match="None of its root"):
        container.historic_imports.publish(historic_id, record.version, CURATOR)
    container.historic_imports.discard(historic_id, record.version)
    assert container.historic_imports.list(None, "", 0, 10).items == ()


def test_a_brd_that_could_not_be_read_is_read_again_on_request(container: Container) -> None:
    (result,) = container.historic_imports.import_files(
        (IncomingFile("empty.pdf", "application/pdf", b"%PDF-1.4 not really"),), CURATOR
    )
    drain(container)
    record = container.historic_imports.get(result.version_id or "")
    assert record.brds[0].stage is BrdStage.FAILED and record.brds[0].error
    again = container.historic_imports.read_again(
        record.id, record.brds[0].id, record.version, CURATOR
    )
    assert again.brds[0].stage is BrdStage.QUEUED
    drain(container)
    assert container.historic_imports.get(record.id).brds[0].stage is BrdStage.FAILED


def test_nothing_can_write_to_azure_devops() -> None:
    """ADR-0102: the port and every adapter of it only read."""
    write_words = ("create", "update", "delete", "patch", "post", "put", "write", "save", "link")
    for kind in (
        AdoWorkItemSourcePort,
        fake_work_items.FakeAdoWorkItemSource,
        unconfigured.UnconfiguredAdoWorkItemSource,
    ):
        methods = [name for name, _ in inspect.getmembers(kind, inspect.isfunction)]
        public = [name for name in methods if not name.startswith("_")]
        assert public == ["read_tree"], kind
        assert not any(word in name for name in methods for word in write_words), kind


def test_production_refuses_the_fake_backlog() -> None:
    with pytest.raises(ConfigurationError, match="ADO_PROVIDER=fake"):
        Settings(
            llm_provider=LLMProvider.FAKE,
            app_environment="production",
            persistence_provider=PersistenceProvider.POSTGRES,
            database_url="postgresql://x/y",
            identity_provider=IdentityProvider.OIDC,
            ado_provider=AdoProvider.FAKE,
        )
    with pytest.raises(ConfigurationError, match="ADO_IMPORT_MAX_ITEMS"):
        Settings(llm_provider=LLMProvider.FAKE, ado_import_max_items=0)


def test_ado_settings_are_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("ADO_PROVIDER", "fake")
    monkeypatch.setenv("ADO_IMPORT_MAX_ITEMS", "500")
    settings = Settings.from_env()
    assert (settings.ado_provider, settings.ado_import_max_items) == (AdoProvider.FAKE, 500)
    monkeypatch.setenv("ADO_PROVIDER", "rest")
    with pytest.raises(ConfigurationError, match="none or fake"):
        Settings.from_env()


# --- The routes ----------------------------------------------------------------------------


def test_the_routes(container: Container) -> None:
    with TestClient(create_app(lambda: container)) as client:
        created = client.post(
            "/historic-requirements/batch",
            files=[
                ("files", ("XGPON_bundles.docx", word("Delivered as Epic 48213."), DOCX_MIME)),
                ("files", ("old.doc", b"\xd0\xcf", "application/msword")),
            ],
        )
        assert created.status_code == 201
        first, refused = created.json()["results"]
        assert (first["outcome"], refused["outcome"]) == ("added", "refused")
        historic_id = first["version_id"]
        drain(container)
        detail = client.get(f"/historic-requirements/{historic_id}").json()
        assert [s["work_item_id"] for s in detail["suggestions"]] == [48213]
        assert detail["brd_files"][0]["passages"][0]["text"] == "Delivered as Epic 48213."

        def put(roots: list[int], version: int) -> int:
            return client.put(
                f"/historic-requirements/{historic_id}/work-items",
                json={"root_ids": roots, "expected_version": version},
            ).status_code

        assert put([], detail["version"]) == 422
        assert put([0], detail["version"]) == 422
        assert put(list(range(1, 52)), detail["version"]) == 422
        assert put([48213], detail["version"] - 1) == 409
        assert put([48213], detail["version"]) == 200
        drain(container)
        detail = client.get(f"/historic-requirements/{historic_id}").json()
        (epic,) = detail["breakdown"]["lineage"]
        assert epic["item"]["type"] == "epic" and len(epic["children"]) == 2
        published = client.post(
            f"/historic-requirements/{historic_id}/publication",
            json={"expected_version": detail["version"]},
        )
        assert published.status_code == 200 and published.json()["blockers"] == []
        listed = client.get("/historic-requirements", params={"status": "published"}).json()
        assert [item["id"] for item in listed["items"]] == [historic_id]
        assert listed["counts"] == {
            "draft": 0,
            "published": 1,
            "withdrawn": 0,
            "refresh_waiting": 0,
        }
        # A second BRD naming the same Epic is told the Epic is already another record's root.
        (second,) = client.post(
            "/historic-requirements/batch",
            files=[("files", ("XGPON_v2.docx", word("Also Epic 48213."), DOCX_MIME))],
        ).json()["results"]
        drain(container)
        shared = client.get(f"/historic-requirements/{second['version_id']}/shared-roots")
        assert shared.json()["items"] == [
            {
                "work_item_id": 48213,
                "historic_id": historic_id,
                "title": "XGPON bundles",
                "status": "published",
            }
        ]
        assert client.get(f"/historic-requirements/{historic_id}/shared-roots").json() == {
            "items": []
        }
        assert client.get("/historic-requirements", params={"status": "nope"}).status_code == 422
        assert client.get("/historic-requirements/missing").status_code == 404
        assert (
            client.post(
                f"/historic-requirements/{historic_id}/withdrawal",
                json={"reason": "", "expected_version": published.json()["version"]},
            ).status_code
            == 422
        )
        assert (
            client.delete(
                f"/historic-requirements/{historic_id}",
                params={"expected_version": published.json()["version"]},
            ).status_code
            == 422
        )
        observer = {"X-Fake-Actor-Id": "fake-observer"}
        assert client.get("/historic-requirements", headers=observer).status_code == 403
        assert (
            client.get(
                f"/historic-requirements/{historic_id}/shared-roots", headers=observer
            ).status_code
            == 403
        )


# --- What requirement work reads (ADR-0102, amendment 1) -----------------------------------

SERVICE = {"Authorization": f"Bearer {'r' * 40}"}
EXAMPLE = (
    Path(__file__).resolve().parents[2] / "contracts" / "historic-requirement-changed.example.json"
)


def _served(clock: FixedClock) -> Container:
    return build_container(
        Settings(
            llm_provider=LLMProvider.FAKE,
            library_scan_mode="offline",
            ado_provider=AdoProvider.FAKE,
            requirement_service_token="r" * 40,
        ),
        clock=clock,
    )


def test_requirement_work_reads_a_publication_a_page_at_a_time(clock: FixedClock) -> None:
    container = _served(clock)
    historic_id = _linked(container)
    record = container.historic_imports.get(historic_id)
    container.historic_imports.publish(historic_id, record.version, CURATOR)
    base = f"/internal/historic-requirements/{historic_id}"
    with TestClient(create_app(lambda: container)) as client:
        assert client.get(f"{base}/items?publication=1").status_code == 401
        first = client.get(f"{base}/items?publication=1&limit=2", headers=SERVICE)
        assert first.status_code == 200, first.text
        page = first.json()
        assert page["publication"] == 1 and len(page["entries"]) == 2
        assert page["next_offset"] == 2 and page["entries"][0]["type"] in {"epic", "feature"}
        passages = client.get(f"{base}/passages?publication=1", headers=SERVICE).json()
        assert passages["entries"][0]["filename"].endswith(".docx")
        assert passages["fingerprint"] == page["fingerprint"]
        assert client.get(f"{base}/items?publication=2", headers=SERVICE).status_code == 409
        assert (
            client.get(f"{base}/items?publication=1&limit=201", headers=SERVICE).status_code == 422
        )
        assert client.get(f"{base}/items?publication=0", headers=SERVICE).status_code == 422
        missing = "/internal/historic-requirements/missing/items?publication=1"
        assert client.get(missing, headers=SERVICE).status_code == 404


def test_a_draft_is_not_read_by_requirement_work(clock: FixedClock) -> None:
    container = _served(clock)
    historic_id = _linked(container)
    with TestClient(create_app(lambda: container)) as client:
        answer = client.get(
            f"/internal/historic-requirements/{historic_id}/passages?publication=1",
            headers=SERVICE,
        )
        assert answer.status_code == 404


def test_the_event_payload_is_pinned_for_requirement_work(container: Container) -> None:
    """requirement-portal keeps a copy of this file and parses it (ADR-0102, amendment 1)."""
    historic_id = _linked(container)
    record = container.historic_imports.get(historic_id)
    container.historic_imports.publish(historic_id, record.version, CURATOR)
    payload = container.knowledge_events.after(0, 100)[-1].payload
    # Ids vary run to run; the example keeps their shape with stable values.
    assert isinstance(payload, dict) and isinstance(payload["published"], dict)
    example = {
        **payload,
        "historic_requirement_id": "11111111-2222-3333-4444-555555555555",
        "published": {**payload["published"], "fingerprint": "f" * 64},
    }
    text = json.dumps(example, indent=2, sort_keys=True) + "\n"
    assert len(text.encode()) < 2048, "a historic event stays small"
    if not EXAMPLE.exists() or EXAMPLE.read_text(encoding="utf-8") != text:
        EXAMPLE.write_text(text, encoding="utf-8")
        pytest.fail(f"{EXAMPLE.name} was stale and has been rewritten; commit it.")
