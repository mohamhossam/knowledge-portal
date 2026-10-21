"""Two systems of record for one entity, each saying its share (ADR-0123)."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.diff import ChangeKind, diff_releases
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    MasteryNote,
    SystemDefinition,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
BASE = "/architecture-knowledge/releases"
CUSTOMER = "entity-customer"
LEGACY = MasteryNote(CUSTOMER, "Customers not yet migrated to Netcracker")
MIGRATED = MasteryNote(CUSTOMER, "Customers migrated to Netcracker")


def _catalogue() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def _noted(release: ArchitectureKnowledge) -> ArchitectureKnowledge:
    notes = {"cbcm": (LEGACY,), "nc-crm": (MIGRATED,)}
    return replace(
        release,
        systems=tuple(
            replace(item, mastery_notes=notes.get(item.id, ())) for item in release.systems
        ),
    )


def test_the_committed_catalogue_shares_customer_between_two_systems_of_record() -> None:
    masters = [item.id for item in _catalogue().systems if CUSTOMER in item.masters]

    assert masters == ["cbcm", "nc-crm"]


def test_a_note_names_an_entity_the_system_masters_once() -> None:
    with pytest.raises(InvalidKnowledgeError, match="which it does not master"):
        SystemDefinition("crm", "CRM", mastery_notes=(LEGACY,))
    with pytest.raises(InvalidKnowledgeError, match="one mastery note per entity"):
        SystemDefinition("crm", "CRM", masters=(CUSTOMER,), mastery_notes=(LEGACY, MIGRATED))
    with pytest.raises(InvalidKnowledgeError, match="Mastery note"):
        MasteryNote(CUSTOMER, " ")
    assert SystemDefinition("crm", "CRM", masters=(CUSTOMER,), mastery_notes=(LEGACY,))


def test_the_diff_names_a_changed_note() -> None:
    base = replace(_catalogue(), id="base")

    changes = diff_releases(base, replace(_noted(base), id="draft")).changes

    assert sorted((item.change, item.key, item.fields) for item in changes) == [
        (ChangeKind.CHANGED, "cbcm", ("mastery_notes",)),
        (ChangeKind.CHANGED, "nc-crm", ("mastery_notes",)),
    ]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_file_format_carries_the_notes(file_format: CatalogueFileFormat) -> None:
    noted = _noted(_catalogue())

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, noted))

    assert {item.id: item.mastery_notes for item in read.systems if item.mastery_notes} == {
        "cbcm": (LEGACY,),
        "nc-crm": (MIGRATED,),
    }


def test_a_maintainer_writes_a_note_through_the_api(client: TestClient) -> None:
    draft = client.post(BASE, json={"name": "Mastery"}, headers=OWNER).json()
    imported = client.post(
        f"{BASE}/{draft['id']}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": ("catalogue.yaml", CATALOGUE.read_bytes(), "application/yaml")},
        headers=OWNER,
    ).json()
    cbcm = next(item for item in imported["systems"] if item["id"] == "cbcm")
    note = {"entity_id": CUSTOMER, "note": LEGACY.note}

    saved = client.put(
        f"{BASE}/{draft['id']}/systems/cbcm",
        json={
            "expected_revision": imported["revision"],
            "system": cbcm | {"mastery_notes": [note]},
        },
        headers=OWNER,
    )
    refused = client.put(
        f"{BASE}/{draft['id']}/systems/cbcm",
        json={
            "expected_revision": saved.json()["revision"],
            "system": cbcm | {"mastery_notes": [note | {"entity_id": "entity-party"}]},
        },
        headers=OWNER,
    )

    assert saved.status_code == 200, saved.text
    system = next(item for item in saved.json()["systems"] if item["id"] == "cbcm")
    assert system["mastery_notes"] == [note]
    assert refused.status_code == 422
    assert "which it does not master" in refused.text
