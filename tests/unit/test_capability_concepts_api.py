"""Building the concept scheme and its links through the API, and the linking model (ADR-0114)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, TypeVar

import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic import BaseModel

from knowledge_portal.application.ports.capability_link_suggester import (
    CapabilityLinkingError,
    ConceptChoice,
    LinkableComponent,
)
from knowledge_portal.infrastructure.llm.capability_links import (
    FakeCapabilityLinkSuggester,
    LinkingOutput,
    LinkOutput,
    StructuredCapabilityLinkSuggester,
)

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "catalogues" / "smb-architecture.yaml"
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
READER = {"X-Fake-Actor-Id": "fake-reviewer"}
BASE = "/architecture-knowledge/releases"


def _draft(client: TestClient) -> dict[str, Any]:
    response = client.post(BASE, json={"name": "Concepts"}, headers=OWNER)
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_the_backfill_suggests_concepts_a_maintainer_accepts(client: TestClient) -> None:
    draft = _draft(client)
    base = f"{BASE}/{draft['id']}"
    assert client.post(f"{base}/concept-proposals", headers=READER).status_code == 403

    run = client.post(f"{base}/concept-proposals", headers=OWNER)
    assert run.status_code == 201, run.text
    assert run.json()["reading"] == "concept_backfill"
    assert run.json()["candidate_count"] == 31
    again = client.post(f"{base}/concept-proposals", headers=OWNER).json()

    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    concepts = [item for item in listing["suggestions"] if item["content"]["kind"] == "concept"]
    # A second backfill replaces the undecided suggestions of the first.
    assert len(concepts) == 31
    assert {item["document_version_id"] for item in concepts} == {"concept_backfill"}
    assert listing["runs"][-1]["id"] == again["id"]
    billing = next(
        item for item in concepts if item["content"]["concept"]["pref_label"] == "Billing"
    )
    assert billing["match"] == "new"
    assert billing["citations"][0]["location"].startswith("Catalogue › ")
    assert billing["content"]["capability_refs"]

    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    )
    assert accepted.status_code == 200, accepted.text
    release = accepted.json()["release"]
    assert accepted.json()["remaining"] == 0
    assert len(release["business_capabilities"]) == 31
    assert all(
        capability["concept_id"]
        for system in release["systems"]
        for capability in system["capabilities"]
    )
    changes = client.get(f"{base}/changes", headers=OWNER).json()["changes"]
    assert sum(item["item"] == "concept" for item in changes) == 31
    after = client.post(f"{base}/concept-proposals", headers=OWNER).json()
    assert after["candidate_count"] == 0
    assert after["warnings"]


def test_concepts_are_edited_with_the_draft(client: TestClient) -> None:
    draft = _draft(client)
    body = {
        "expected_revision": draft["revision"],
        "systems": draft["systems"],
        "relationships": draft["relationships"],
        "business_capabilities": [
            {"id": "cap-billing", "pref_label": "Billing", "alt_labels": ["invoicing"]}
        ],
    }
    saved = client.put(f"{BASE}/{draft['id']}", json=body, headers=OWNER)
    assert saved.status_code == 200, saved.text
    assert saved.json()["business_capabilities"][0]["alt_labels"] == ["invoicing"]
    # Clients that predate concepts keep the draft's own.
    kept = client.put(
        f"{BASE}/{draft['id']}",
        json={k: v for k, v in body.items() if k != "business_capabilities"}
        | {"expected_revision": saved.json()["revision"]},
        headers=OWNER,
    )
    assert kept.json()["business_capabilities"][0]["id"] == "cap-billing"
    clash = body | {
        "expected_revision": kept.json()["revision"],
        "business_capabilities": [
            {"id": "cap-a", "pref_label": "Billing"},
            {"id": "cap-b", "pref_label": "billing"},
        ],
    }
    refused = client.put(f"{BASE}/{draft['id']}", json=clash, headers=OWNER)
    assert refused.status_code == 422
    assert "already names Billing" in refused.text


def _unlinked_catalogue() -> bytes:
    raw = yaml.safe_load(CATALOGUE.read_text(encoding="utf-8"))
    for offering in raw["products"]:
        for part in offering["components"]:
            part.pop("capabilities", None)
    return yaml.safe_dump(raw, allow_unicode=True).encode()


def test_component_links_are_suggested_and_accepted_one_by_one(client: TestClient) -> None:
    draft = _draft(client)
    base = f"{BASE}/{draft['id']}"
    imported = client.post(
        f"{base}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": ("catalogue.yaml", _unlinked_catalogue(), "application/yaml")},
        headers=OWNER,
    )
    assert imported.status_code == 200, imported.text

    run = client.post(f"{base}/component-link-suggestions", headers=OWNER)
    assert run.status_code == 201, run.text
    assert run.json()["reading"] == "component_links"
    assert run.json()["model"] == "fake-capability-linker"
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    links = {
        item["content"]["component_id"]: item
        for item in listing["suggestions"]
        if item["content"]["kind"] == "component_link"
    }
    wifi = links["ap"]
    assert wifi["basis"] == "inferred" and wifi["rationale"]
    assert wifi["content"]["concept_ids"] == ["cap-wifi-access"]
    assert wifi["match"] == "new"

    # Inferred, so never accepted in bulk.
    bulk = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()
    assert bulk["remaining"] == len(links)
    decided = client.post(
        f"{base}/suggestions/{wifi['id']}/decision",
        json={"expected_revision": listing["release_revision"], "accept": True},
        headers=OWNER,
    )
    assert decided.status_code == 200, decided.text
    parts = {part["id"]: part for part in decided.json()["products"][0]["components"]}
    assert parts["ap"]["capability_ids"] == ["cap-wifi-access"]


def test_link_suggestions_need_concepts_first(client: TestClient) -> None:
    draft = _draft(client)
    run = client.post(f"{BASE}/{draft['id']}/component-link-suggestions", headers=OWNER).json()
    assert run["candidate_count"] == 0
    assert run["warnings"] == ["This draft has no capability concepts to link components to yet."]


# The linking model --------------------------------------------------------------------------

Schema = TypeVar("Schema", bound=BaseModel)
PART = LinkableComponent(
    "bpp", "Business Pro Plus", "ap", "Access point", "Managed WiFi.", None, ("CWOM",)
)
CHOICES = (
    ConceptChoice("cap-wifi", "Managed Wi-Fi", ("access point",), None, "Service › Managed Wi-Fi"),
    ConceptChoice("cap-billing", "Billing", (), None, "Customer › Billing"),
)


class _Client:
    model = "stub-model"

    def __init__(self, output: LinkingOutput) -> None:
        self.output = output
        self.prompts: list[str] = []

    def parse(self, *, system_prompt: str, user_prompt: str, schema_type: type[Schema]) -> Schema:
        self.prompts.append(user_prompt)
        return self.output  # type: ignore[return-value]


def test_the_model_s_links_are_kept_to_listed_concepts() -> None:
    client = _Client(
        LinkingOutput(
            links=[
                LinkOutput(number=1, concept_ids=["cap-wifi", "cap-ghost"], reason="Wi-Fi AP."),
                LinkOutput(number=9, concept_ids=["cap-billing"], reason="Not asked."),
            ]
        )
    )
    suggester = StructuredCapabilityLinkSuggester(client)  # type: ignore[arg-type]

    result = suggester.suggest((PART,), CHOICES)

    assert [(item.component_id, item.concept_ids) for item in result.suggestions] == [
        ("ap", ("cap-wifi",))
    ]
    assert '"delivered_by": ["CWOM"]' in client.prompts[0]
    assert suggester.prompt_version == "capability-links-v1"


def test_an_answer_naming_nothing_listed_is_unusable() -> None:
    client = _Client(
        LinkingOutput(links=[LinkOutput(number=1, concept_ids=["cap-ghost"], reason="Guess.")])
    )
    with pytest.raises(CapabilityLinkingError):
        StructuredCapabilityLinkSuggester(client).suggest((PART,), CHOICES)  # type: ignore[arg-type]


def test_the_fake_links_by_whole_labels_only() -> None:
    result = FakeCapabilityLinkSuggester().suggest((PART,), CHOICES)
    assert [item.concept_ids for item in result.suggestions] == [("cap-wifi",)]
