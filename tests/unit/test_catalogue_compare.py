"""Any two catalogue versions compare, in either order (Knowledge Center C)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_any_two_versions_compare_either_way(client: TestClient) -> None:
    active = client.get("/architecture-knowledge/releases/active").json()
    draft = client.post("/architecture-knowledge/releases", json={"name": "Next version"}).json()
    root = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(
        f"{root}/documents",
        data={"title": "Notes", "language": "en", "expected_revision": draft["revision"]},
        files={"file": ("notes.txt", b"BRM rates usage.", "text/plain")},
    )
    default = client.get(f"{root}/changes").json()
    named = client.get(f"{root}/changes", params={"base": active["id"]}).json()
    assert default == named
    assert [(c["item"], c["change"]) for c in named["changes"]] == [("document", "added")]

    backwards = client.get(
        f"/architecture-knowledge/releases/{active['id']}/changes", params={"base": draft["id"]}
    ).json()
    assert backwards["base_release_id"] == draft["id"]
    assert backwards["draft_release_id"] == active["id"]
    assert [(c["item"], c["change"]) for c in backwards["changes"]] == [("document", "removed")]

    assert client.get(f"{root}/changes", params={"base": "missing"}).status_code == 404
    assert client.get(f"{root}/changes", params={"base": ""}).status_code == 422
