"""The vocabulary clean-up and the vocabularies through the API."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "catalogues" / "smb-architecture.yaml"
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
READER = {"X-Fake-Actor-Id": "fake-reviewer"}
BASE = "/architecture-knowledge/releases"


def _smb_draft(client: TestClient) -> dict[str, Any]:
    draft = client.post(BASE, json={"name": "Vocabularies"}, headers=OWNER).json()
    imported = client.post(
        f"{BASE}/{draft['id']}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": ("catalogue.yaml", CATALOGUE.read_bytes(), "application/yaml")},
        headers=OWNER,
    )
    assert imported.status_code == 200, imported.text
    return dict(imported.json())


def test_the_clean_up_maps_values_and_leaves_new_terms_to_decide_alone(
    client: TestClient,
) -> None:
    draft = _smb_draft(client)
    base = f"{BASE}/{draft['id']}"
    assert client.post(f"{base}/vocabulary-cleanup", headers=READER).status_code == 403

    run = client.post(f"{base}/vocabulary-cleanup", headers=OWNER)
    assert run.status_code == 201, run.text
    assert run.json()["reading"] == "vocabulary_cleanup"
    assert run.json()["warnings"] == [
        "7 values match no term yet; each is suggested as a new term to decide one by one."
    ]
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    terms = {
        item["content"]["system_id"]: item
        for item in listing["suggestions"]
        if item["content"]["kind"] == "vocabulary_term"
    }
    orders = terms["etom-order-handling"]
    assert orders["match"] == "updates_existing"
    assert orders["citations"] == [
        {
            "location": "Catalogue › 97 activities' eTOM process",
            "quote": "Fulfillment · Order Handling",
        }
    ]
    assert terms["role-saml"]["match"] == "new"

    bulk = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    )
    assert bulk.status_code == 200, bulk.text
    assert bulk.json()["remaining"] == 7
    release = bulk.json()["release"]
    activities = [step for journey in release["journeys"] for step in journey["activities"]]
    assert all(step["etom_id"] for step in activities if step["etom"])
    assert all(step["role_id"] for step in activities if step["role"])
    assert all(channel["kind_id"] for channel in release["channels"])
    links = [link for journey in release["journeys"] for link in journey["integrations"]]
    assert all(link["open_api_ids"] for link in links if link["tmf_equivalent"])

    # A maintainer merges a flagged verb into the role it means.
    applies = terms["role-applies"]
    edited = applies["content"] | {"term": applies["content"]["term"] | {"id": "role-activate"}}
    decided = client.post(
        f"{base}/suggestions/{applies['id']}/decision",
        json={"expected_revision": release["revision"], "accept": True, "content": edited},
        headers=OWNER,
    )
    assert decided.status_code == 200, decided.text
    activate = next(item for item in decided.json()["vocabulary"] if item["id"] == "role-activate")
    assert "APPLIES" in activate["alt_labels"]
    duties = [
        duty
        for offering in decided.json()["products"]
        for part in offering["components"]
        for duty in part["responsibilities"]
        if duty["role"] == "APPLIES"
    ]
    assert [duty["role_id"] for duty in duties] == ["role-activate", "role-activate"]

    again = client.post(f"{base}/vocabulary-cleanup", headers=OWNER).json()
    assert again["candidate_count"] == 6


def test_terms_are_edited_with_the_draft_and_fields_name_known_ones(client: TestClient) -> None:
    draft = client.post(BASE, json={"name": "Terms"}, headers=OWNER).json()
    body = {
        "expected_revision": draft["revision"],
        "systems": draft["systems"],
        "relationships": draft["relationships"],
        "vocabulary": [
            {
                "id": "api-tmf622",
                "scheme": "open_api",
                "pref_label": "Product Ordering",
                "notation": "TMF622",
            }
        ],
    }
    saved = client.put(f"{BASE}/{draft['id']}", json=body, headers=OWNER)
    assert saved.status_code == 200, saved.text
    assert saved.json()["vocabulary"][0]["notation"] == "TMF622"
    # Clients that predate vocabularies keep the draft's own.
    kept = client.put(
        f"{BASE}/{draft['id']}",
        json={k: v for k, v in body.items() if k != "vocabulary"}
        | {"expected_revision": saved.json()["revision"]},
        headers=OWNER,
    )
    assert kept.json()["vocabulary"][0]["id"] == "api-tmf622"
    clash = body | {
        "expected_revision": kept.json()["revision"],
        "vocabulary": [
            {"id": "api-a", "scheme": "open_api", "pref_label": "Ordering", "notation": "TMF622"},
            {"id": "api-b", "scheme": "open_api", "pref_label": "tmf 622"},
        ],
    }
    refused = client.put(f"{BASE}/{draft['id']}", json=clash, headers=OWNER)
    assert refused.status_code == 422
    assert "already names the Open API Ordering" in refused.text
    unknown = body | {
        "expected_revision": kept.json()["revision"],
        "channels": [{"id": "web", "name": "Web", "kind": "digital", "kind_id": "channel-web"}],
    }
    refused = client.put(f"{BASE}/{draft['id']}", json=unknown, headers=OWNER)
    assert refused.status_code == 422
    assert "not in the channel kind vocabulary" in refused.text


def test_a_clean_draft_has_nothing_to_map(client: TestClient) -> None:
    draft = client.post(BASE, json={"name": "Empty"}, headers=OWNER).json()
    run = client.post(f"{BASE}/{draft['id']}/vocabulary-cleanup", headers=OWNER).json()
    assert run["candidate_count"] == 0
    assert run["warnings"] == ["Every vocabulary value in this draft is linked to a term."]
