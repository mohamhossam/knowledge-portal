"""Named versions, one draft at a time, bulk rejection and passages.

Ported from requirement-portal when the catalogue moved here.
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.interfaces.api.container import Container
from tests.spreadsheet_fixtures import XLSX_MIME, spreadsheet_document
from tests.word_table_fixtures import DOCX_MIME, word_document, word_paragraph

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
READER = {"X-Fake-Actor-Id": "fake-reviewer"}
RELEASES = "/architecture-knowledge/releases"
SEED = "smb-source-reference-v1"


def _start(client: TestClient, name: str = "October integration update") -> dict[str, object]:
    response = client.post(RELEASES, json={"name": name}, headers=OWNER)
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_a_version_is_named_and_only_one_can_be_in_progress(client: TestClient) -> None:
    draft = _start(client, "  October   integration update ")

    assert (draft["name"], draft["created_by"]) == ("October integration update", "fake-owner")
    second = client.post(RELEASES, json={"name": "Another"}, headers=OWNER)
    assert second.status_code == 409
    assert "'October integration update' is already in progress" in second.text
    assert "fake-owner" in second.text
    assert client.post(RELEASES, json={"name": "  "}, headers=OWNER).status_code == 422
    listed = client.get(RELEASES, headers=OWNER).json()
    assert {item["id"]: item["name"] for item in listed}[SEED] == "Initial catalogue"


def test_a_draft_is_renamed_without_losing_its_build(client: TestClient) -> None:
    draft = _start(client)
    base = f"{RELEASES}/{draft['id']}"
    client.post(f"{base}/build", json={"expected_revision": draft["revision"]}, headers=OWNER)
    built = client.get(base, headers=OWNER).json()
    assert built["built_revision"] == built["revision"]

    renamed = client.put(
        f"{base}/name",
        json={"expected_revision": built["revision"], "name": "Q4 update"},
        headers=OWNER,
    )

    body = renamed.json()
    assert renamed.status_code == 200
    assert body["name"] == "Q4 update"
    assert body["built_revision"] == body["revision"] == built["revision"] + 1
    stale = client.put(
        f"{base}/name",
        json={"expected_revision": built["revision"], "name": "Late"},
        headers=OWNER,
    )
    assert stale.status_code == 409
    seed = client.put(
        f"{RELEASES}/{SEED}/name",
        json={"expected_revision": 1, "name": "Renamed seed"},
        headers=OWNER,
    )
    assert seed.status_code == 409


def test_a_discarded_draft_is_gone_and_a_new_one_can_start(client: TestClient) -> None:
    draft = _start(client)
    base = f"{RELEASES}/{draft['id']}"

    assert (
        client.request("DELETE", base, json={"expected_revision": 99}, headers=OWNER).status_code
        == 409
    )
    discarded = client.request(
        "DELETE", base, json={"expected_revision": draft["revision"]}, headers=OWNER
    )

    assert discarded.status_code == 204
    assert client.get(base, headers=OWNER).status_code == 404
    assert _start(client, "Second attempt")["name"] == "Second attempt"
    active = client.request(
        "DELETE", f"{RELEASES}/{SEED}", json={"expected_revision": 1}, headers=OWNER
    )
    assert active.status_code == 409
    assert (
        client.request("DELETE", base, json={"expected_revision": 1}, headers=READER).status_code
        == 403
    )


def _suggestions(client: TestClient) -> tuple[str, dict[str, object], list[dict[str, object]]]:
    draft = _start(client)
    base = f"{RELEASES}/{draft['id']}"
    content = (
        "System: Order Hub\nSystem: Billing Gateway\nConstraint: Order Hub only runs at night\n"
    )
    uploaded = client.post(
        f"{base}/documents",
        data={"title": "Design", "expected_revision": str(draft["revision"])},
        files={"file": ("design.txt", content.encode(), "text/plain")},
        headers=OWNER,
    ).json()
    version_id = uploaded["documents"][-1]["id"]
    client.post(f"{base}/documents/{version_id}/extractions", headers=OWNER)
    overview = client.get(f"{base}/suggestions", headers=OWNER).json()
    return base, uploaded, overview["suggestions"]


def test_waiting_suggestions_are_rejected_together(client: TestClient) -> None:
    base, uploaded, suggestions = _suggestions(client)
    ids = [str(item["id"]) for item in suggestions]
    assert len(ids) >= 2
    first = client.post(
        f"{base}/suggestions/{ids[0]}/decision",
        json={"expected_revision": uploaded["revision"], "accept": False},
        headers=OWNER,
    )
    assert first.status_code == 200

    rejected = client.post(
        f"{base}/suggestions/rejection",
        json={"expected_revision": uploaded["revision"], "suggestion_ids": [*ids, "unknown"]},
        headers=OWNER,
    )

    assert rejected.json() == {"rejected": len(ids) - 1}
    statuses = {
        item["status"]
        for item in client.get(f"{base}/suggestions", headers=OWNER).json()["suggestions"]
    }
    assert statuses == {"rejected"}
    stale = client.post(
        f"{base}/suggestions/rejection",
        json={"expected_revision": 1, "suggestion_ids": ids},
        headers=OWNER,
    )
    assert stale.status_code == 409


def _docx() -> bytes:
    return word_document(
        "".join(
            word_paragraph(text)
            for text in ("One.", "Two.", "Three: Order Hub runs nightly.", "Four.", "Five.", "Six.")
        )
    )


def test_a_cited_passage_is_shown_with_its_neighbours(client: TestClient) -> None:
    draft = _start(client)
    base = f"{RELEASES}/{draft['id']}"
    uploaded = client.post(
        f"{base}/documents",
        data={"title": "Design", "expected_revision": str(draft["revision"])},
        files={"file": ("design.docx", _docx(), DOCX_MIME)},
        headers=OWNER,
    ).json()
    passage = f"{base}/documents/{uploaded['documents'][-1]['id']}/passage"

    found = client.get(passage, params={"location": "paragraph 3 (part 1 of 2)"}, headers=OWNER)

    body = found.json()
    assert found.status_code == 200
    assert body["passage"] == {"location": "paragraph 3", "text": "Three: Order Hub runs nightly."}
    assert [item["location"] for item in body["before"]] == ["paragraph 1", "paragraph 2"]
    assert [item["location"] for item in body["after"]] == ["paragraph 4", "paragraph 5"]
    assert body["mime_type"] == DOCX_MIME
    assert (
        client.get(passage, params={"location": "paragraph 99"}, headers=OWNER).status_code == 404
    )
    assert (
        client.get(passage, params={"location": "paragraph 3"}, headers=READER).status_code == 403
    )
    missing = f"{base}/documents/nope/passage"
    assert client.get(missing, params={"location": "paragraph 1"}, headers=OWNER).status_code == 404


def test_a_markdown_citation_from_before_passages_followed_headings_still_opens(
    client: TestClient,
) -> None:
    """Suggestions read under 40-line windows cite "lines 1-40"; its first passage opens."""
    draft = _start(client)
    base = f"{RELEASES}/{draft['id']}"
    uploaded = client.post(
        f"{base}/documents",
        data={"title": "Notes", "expected_revision": str(draft["revision"])},
        files={
            "file": (
                "notes.md",
                b"# Systems\n\n| System | Owner |\n|---|---|\n| Order Hub | Sales |\n",
                "text/markdown",
            )
        },
        headers=OWNER,
    ).json()
    passage = f"{base}/documents/{uploaded['documents'][-1]['id']}/passage"

    row = client.get(passage, params={"location": "line 5"}, headers=OWNER).json()
    window = client.get(passage, params={"location": "lines 1-40"}, headers=OWNER).json()

    assert row["passage"] == {"location": "line 5", "text": "System: Order Hub | Owner: Sales"}
    assert window["passage"]["location"] == "line 1"
    assert [item["location"] for item in window["after"]] == ["line 5"]
    assert (
        client.get(passage, params={"location": "lines 90-120"}, headers=OWNER).status_code == 404
    )


def test_a_cited_spreadsheet_row_is_shown_with_its_neighbours(client: TestClient) -> None:
    draft = _start(client)
    base = f"{RELEASES}/{draft['id']}"
    workbook = spreadsheet_document(
        {"A1": "System", "A2": "Order Hub", "A3": "BCRM", "A4": "Billing", "A5": "CRM"}
    )
    form = {"title": "Inventory", "expected_revision": str(draft["revision"])}
    mislabelled = client.post(
        f"{base}/documents",
        data=form,
        files={"file": ("inventory.csv", workbook, XLSX_MIME)},
        headers=OWNER,
    )
    assert mislabelled.status_code == 422
    uploaded = client.post(
        f"{base}/documents",
        data=form,
        files={"file": ("inventory.xlsx", workbook, XLSX_MIME)},
        headers=OWNER,
    )
    assert uploaded.status_code == 201, uploaded.text
    passage = f"{base}/documents/{uploaded.json()['documents'][-1]['id']}/passage"

    body = client.get(passage, params={"location": "sheet 1, row 3"}, headers=OWNER).json()

    assert body["passage"] == {"location": "sheet 1, row 3", "text": "A3=BCRM"}
    assert [item["location"] for item in body["before"]] == ["sheet 1, row 1", "sheet 1, row 2"]
    assert [item["location"] for item in body["after"]] == ["sheet 1, row 4", "sheet 1, row 5"]


def test_a_csv_is_accepted_as_a_source(client: TestClient) -> None:
    draft = _start(client)
    uploaded = client.post(
        f"{RELEASES}/{draft['id']}/documents",
        data={"title": "Links", "expected_revision": str(draft["revision"])},
        files={"file": ("links.csv", b"From,To\nOrder Hub,BCRM\n", "text/csv")},
        headers=OWNER,
    )

    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["documents"][-1]["mime_type"] == "text/csv"


def test_an_image_has_no_passage_to_show(client: TestClient) -> None:
    draft = _start(client)
    base = f"{RELEASES}/{draft['id']}"
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(buffer, format="PNG")
    uploaded = client.post(
        f"{base}/documents",
        data={"title": "Diagram", "expected_revision": str(draft["revision"])},
        files={"file": ("diagram.png", buffer.getvalue(), "image/png")},
        headers=OWNER,
    )
    assert uploaded.status_code == 201, uploaded.text
    version_id = uploaded.json()["documents"][-1]["id"]

    shown = client.get(
        f"{base}/documents/{version_id}/passage", params={"location": "image"}, headers=OWNER
    )

    assert shown.status_code == 422
    assert "Images have no text passages" in shown.text


def test_the_seed_release_keeps_its_name() -> None:
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())

    assert repository.active().name == "Initial catalogue"


def test_a_job_queued_for_a_removed_draft_fails_instead_of_waiting(container: Container) -> None:
    actor = Actor("maintainer", frozenset({"knowledge_maintainer"}))
    draft = container.manage_architecture_knowledge.create_draft(actor, "Removed before building")
    queued = container.architecture_jobs.enqueue_build(draft.id, draft.revision, actor)
    assert queued.status == "queued"

    container.manage_architecture_knowledge.discard_draft(draft.id, draft.revision, actor)
    finished = container.architecture_jobs.run_once()

    assert finished is not None and finished.id == queued.id
    assert finished.status == "failed"
    assert container.architecture_jobs.run_once() is None
