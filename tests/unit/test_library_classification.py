"""A library document's type and topics, from the catalogue in service (ADR-0123)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.use_cases.library_classification import (
    ClassificationOption,
    LibraryClassification,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.library import LibraryDocument, LibraryVersion
from knowledge_portal.domain.identity.entities import ActorId, ActorSnapshot
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces.api.container import build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.catalogue_seed import seed_knowledge

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
REVIEWER = {"X-Fake-Actor-Id": "fake-reviewer"}


class _InService:
    def __init__(self, release: ArchitectureKnowledge) -> None:
        self._release = release

    def active(self) -> ArchitectureKnowledge:
        return self._release


def _classification(release: ArchitectureKnowledge) -> LibraryClassification:
    library = build_container(
        Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline"),
        in_service=seed_knowledge(),
    ).document_library
    return LibraryClassification(library, _InService(release))  # type: ignore[arg-type]


def test_the_choices_are_the_catalogues_document_types_and_concepts_in_service() -> None:
    catalogue = knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))
    retired = replace(
        catalogue,
        business_capabilities=tuple(
            replace(item, deprecated=True) if item.id == "cap-wifi-access" else item
            for item in catalogue.business_capabilities
        ),
    )

    options = _classification(retired).options()

    assert [item.label for item in options.document_types] == [
        "Contract",
        "Guide",
        "High-level design",
        "Other",
        "Policy",
        "Process book",
        "Product specification",
        "Solution design",
    ]
    assert ClassificationOption("doctype-solution-design", "Solution design") in (
        options.document_types
    )
    assert options.topics
    assert "cap-wifi-access" not in {item.id for item in options.topics}


def test_only_what_the_catalogue_offers_is_accepted() -> None:
    classification = _classification(knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8")))
    topic = classification.options().topics[0].id

    classification.check("doctype-contract", (topic,))
    with pytest.raises(InvalidDocumentError, match="not a document type"):
        classification.check("doctype-poem", ())
    with pytest.raises(InvalidDocumentError, match="not a concept"):
        classification.check(None, ("cap-telepathy",))


def _ready(client: TestClient, **form: str) -> dict[str, object]:
    uploaded = client.post(
        "/library/ingestions",
        data={"title": "Coverage", "idempotency_key": "classified", **form},
        files={"file": ("policy.txt", b"XGPON coverage is required.", "text/plain")},
    )
    assert uploaded.status_code == 202, uploaded.text
    return dict(uploaded.json())


def test_an_owner_classifies_a_document_at_upload_and_after() -> None:
    container = build_container(
        Settings(llm_provider=LLMProvider.FAKE, library_scan_mode="offline"),
        in_service=seed_knowledge(),
    )
    with TestClient(create_app(lambda: container)) as client:
        options = client.get("/library/classification-options").json()
        assert {"id": "doctype-policy", "label": "Policy"} in options["document_types"]
        refused = client.post(
            "/library/ingestions",
            data={"title": "X", "idempotency_key": "bad", "document_type": "doctype-poem"},
            files={"file": ("x.txt", b"x", "text/plain")},
        )
        assert refused.status_code == 422
        assert refused.json()["code"] == "invalid_document"

        view = _ready(client, document_type="doctype-policy")
        assert (view["document_type"], view["topics"]) == ("doctype-policy", [])
        path = f"/library/documents/{view['id']}/classification"

        changed = client.put(
            path,
            json={"expected_version": view["version"], "document_type": "doctype-guide"},
        )
        assert changed.status_code == 200, changed.text
        assert changed.json()["document_type"] == "doctype-guide"
        stale = client.put(path, json={"expected_version": view["version"]})
        assert stale.status_code == 409
        not_owner = client.put(
            path, json={"expected_version": changed.json()["version"]}, headers=REVIEWER
        )
        assert not_owner.status_code == 403
        no_topic = client.put(
            path,
            json={"expected_version": changed.json()["version"], "topics": ["cap-telepathy"]},
        )
        assert no_topic.status_code == 422


def test_a_document_refuses_blank_or_repeated_classification() -> None:
    owner = ActorSnapshot(ActorId("fake-owner"), "Amina")
    version = LibraryVersion(
        "v1",
        1,
        "policy.txt",
        "text/plain",
        1,
        "0" * 64,
        datetime(2026, 10, 21, tzinfo=UTC),
        owner,
        "k",
    )
    document = LibraryDocument("d1", "Coverage", owner, (version,))

    assert document.classified("doctype-guide", ("cap-a",)).version == document.version + 1
    with pytest.raises(InvalidDocumentError, match="repeated"):
        document.classified(None, ("cap-a", "cap-a"))
    with pytest.raises(InvalidDocumentError, match="must not be blank"):
        document.classified(" ", ())
