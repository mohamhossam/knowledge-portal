"""Several files into a catalogue draft at once, each added or refused on its own (C)."""

from __future__ import annotations

from fastapi.testclient import TestClient

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _draft(client: TestClient) -> tuple[str, int]:
    draft = client.post("/architecture-knowledge/releases", json={"name": "Next version"}).json()
    return f"/architecture-knowledge/releases/{draft['id']}", draft["revision"]


def test_each_file_is_added_or_refused_with_its_reason(client: TestClient) -> None:
    root, revision = _draft(client)
    response = client.post(
        f"{root}/documents/batch",
        data={"language": "en", "expected_revision": str(revision)},
        files=[
            ("files", ("billing.md", b"# Billing\nBRM rates usage.", "text/markdown")),
            ("files", ("legacy.doc", b"\xd0\xcf\x11\xe0legacy", "application/msword")),
            ("files", ("crm notes.txt", b"BCRM owns the customer.", "text/plain")),
            # The same content again is refused; the first copy stays.
            ("files", ("billing copy.md", b"# Billing\nBRM rates usage.", "text/markdown")),
        ],
    )
    assert response.status_code == 201
    body = response.json()
    outcomes = [(r["filename"], r["outcome"]) for r in body["results"]]
    assert outcomes == [
        ("billing.md", "added"),
        ("legacy.doc", "refused"),
        ("crm notes.txt", "added"),
        ("billing copy.md", "refused"),
    ]
    added, legacy, crm, copy = body["results"]
    assert added["title"] == "billing" and crm["title"] == "crm notes"
    assert "save it as .docx" in legacy["reason"]
    assert copy["reason"] == "This document content is already in the draft."
    assert [d["id"] for d in body["release"]["documents"]] == [
        added["version_id"],
        crm["version_id"],
    ]
    assert body["release"]["revision"] == revision + 2


def test_a_stale_draft_or_too_many_files_refuses_the_whole_upload(client: TestClient) -> None:
    root, revision = _draft(client)
    one = [("files", ("a.txt", b"Alpha system.", "text/plain"))]
    stale = client.post(
        f"{root}/documents/batch",
        data={"language": "en", "expected_revision": str(revision - 1)},
        files=one,
    )
    assert stale.status_code == 409
    many = [("files", (f"{n}.txt", f"System {n}.".encode(), "text/plain")) for n in range(21)]
    too_many = client.post(
        f"{root}/documents/batch",
        data={"language": "en", "expected_revision": str(revision)},
        files=many,
    )
    assert too_many.status_code == 422
    assert client.get(root).json()["documents"] == []
