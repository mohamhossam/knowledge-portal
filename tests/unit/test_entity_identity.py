"""Stable identity for offerings and journeys: a rename keeps the old id, the version's
references follow, the diff says "renamed", and what still names the old id finds it."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.precedents import PrecedentMatch
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.assessment_lanes import precedent_candidates
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.identity import current_id
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.precedents import (
    Precedent,
    PrecedentDecision,
    PrecedentSystem,
)
from knowledge_portal.domain.architecture.products import find_offering
from knowledge_portal.domain.architecture.verdicts import ProductVerdict
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from tests.catalogue_seed import seeded_repository

MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))
CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
OFFERING = "business-pro-plus"
RELEASES = "/architecture-knowledge/releases"


def _catalogue() -> tuple[ManageArchitectureKnowledge, ArchitectureKnowledge]:
    manage = ManageArchitectureKnowledge(
        seeded_repository(),
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
        OfflineDocumentScanner(),
    )
    draft = manage.create_draft(MAINTAINER, "Renames")
    draft = manage.apply_file_import(
        draft.id, draft.revision, CATALOGUE.name, CATALOGUE.read_bytes(), MAINTAINER
    )
    return manage, draft


def test_renaming_an_offering_keeps_its_old_id_and_moves_every_reference() -> None:
    manage, draft = _catalogue()
    journeys = {item.id for item in draft.journeys if item.product_id == OFFERING}
    assert journeys
    renamed = manage.rename_offering(draft.id, draft.revision, OFFERING, "bpp", MAINTAINER)
    (offering,) = renamed.products
    assert offering.id == "bpp" and offering.former_ids == (OFFERING,)
    assert {item.id for item in renamed.journeys if item.product_id == "bpp"} == journeys
    assert not any(scope.product_id == OFFERING for c in renamed.conflicts for scope in c.scope)
    assert current_id(renamed.products, OFFERING) == "bpp"
    assert find_offering(renamed.products, OFFERING) == offering

    diff = diff_releases(draft, renamed)
    product_changes = [item for item in diff.changes if item.item is ChangedItem.PRODUCT]
    assert [(item.change, item.key) for item in product_changes] == [(ChangeKind.CHANGED, "bpp")]
    assert product_changes[0].fields[0] == "id"


def test_a_rename_can_be_undone() -> None:
    manage, draft = _catalogue()
    renamed = manage.rename_offering(draft.id, draft.revision, OFFERING, "bpp", MAINTAINER)
    back = manage.rename_offering(renamed.id, renamed.revision, "bpp", OFFERING, MAINTAINER)
    (offering,) = back.products
    assert offering.id == OFFERING and offering.former_ids == ("bpp",)
    assert {item.product_id for item in back.journeys} >= {OFFERING}

    journey = back.journeys[0].id
    there = manage.rename_journey(back.id, back.revision, journey, "renamed", MAINTAINER)
    again = manage.rename_journey(there.id, there.revision, "renamed", journey, MAINTAINER)
    assert again.journeys[0].id == journey and again.journeys[0].former_ids == ("renamed",)


def test_an_id_names_one_offering_whether_current_or_former() -> None:
    manage, draft = _catalogue()
    renamed = manage.rename_offering(draft.id, draft.revision, OFFERING, "bpp", MAINTAINER)
    (offering,) = renamed.products
    other = replace(
        offering, id="other", code=None, name="Another offering", former_ids=(OFFERING,)
    )
    with pytest.raises(InvalidKnowledgeError, match="held by both"):
        manage.update(renamed.id, renamed.revision, MAINTAINER, products=(offering, other))
    with pytest.raises(InvalidKnowledgeError, match="former id of itself"):
        replace(offering, former_ids=("bpp",))
    with pytest.raises(InvalidKnowledgeError, match="already"):
        manage.rename_offering(renamed.id, renamed.revision, "bpp", "bpp", MAINTAINER)
    with pytest.raises(InvalidKnowledgeError, match="No offering"):
        manage.rename_offering(renamed.id, renamed.revision, "nowhere", "x", MAINTAINER)


def test_renaming_a_journey_keeps_its_old_id_and_the_diff_says_so() -> None:
    manage, draft = _catalogue()
    first = draft.journeys[0]
    renamed = manage.rename_journey(draft.id, draft.revision, first.id, "renamed", MAINTAINER)
    assert renamed.journeys[0].id == "renamed"
    assert renamed.journeys[0].former_ids == (first.id,)
    changes = [
        item for item in diff_releases(draft, renamed).changes if item.item is ChangedItem.JOURNEY
    ]
    assert [(item.change, item.key, item.fields[0]) for item in changes] == [
        (ChangeKind.CHANGED, "renamed", "id")
    ]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_former_ids_travel_through_every_catalogue_file(file_format: CatalogueFileFormat) -> None:
    manage, draft = _catalogue()
    renamed = manage.rename_offering(draft.id, draft.revision, OFFERING, "bpp", MAINTAINER)
    renamed = manage.rename_journey(
        renamed.id, renamed.revision, renamed.journeys[0].id, "renamed", MAINTAINER
    )
    adapter = CatalogueFileAdapter()
    content = adapter.read(file_format, adapter.write(file_format, renamed))
    assert content.products[0].former_ids == (OFFERING,)
    assert next(item for item in content.journeys if item.id == "renamed").former_ids


def test_offerings_and_journeys_are_renamed_over_the_api(client: TestClient) -> None:
    draft = client.post(RELEASES, json={"name": "Next"}).json()
    root = f"{RELEASES}/{draft['id']}"
    imported = client.post(
        f"{root}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": (CATALOGUE.name, CATALOGUE.read_bytes(), "application/yaml")},
    )
    assert imported.status_code == 200, imported.text
    release = imported.json()

    renamed = client.post(
        f"{root}/offerings/{OFFERING}/rename",
        json={"expected_revision": release["revision"], "new_id": "bpp"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["products"][0]["former_ids"] == [OFFERING]

    journey = renamed.json()["journeys"][0]["id"]
    moved = client.post(
        f"{root}/journeys/{journey}/rename",
        json={"expected_revision": renamed.json()["revision"], "new_id": "renamed"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["journeys"][0]["former_ids"] == [journey]

    stale = client.post(
        f"{root}/journeys/renamed/rename",
        json={"expected_revision": renamed.json()["revision"], "new_id": "again"},
    )
    assert stale.status_code == 409
    unknown = client.post(
        f"{root}/offerings/nowhere/rename",
        json={"expected_revision": moved.json()["revision"], "new_id": "x"},
    )
    assert unknown.status_code == 422


def test_precedents_that_name_the_old_id_still_lend_their_systems() -> None:
    manage, draft = _catalogue()
    renamed = manage.rename_offering(draft.id, draft.revision, OFFERING, "bpp", MAINTAINER)
    (offering,) = renamed.products
    concept = next(item for part in offering.components for item in part.capability_ids)
    system = next(item.id for item in renamed.systems if item.id == "wfms")

    def decided(number: int) -> PrecedentMatch:
        return PrecedentMatch(
            Precedent(
                id=f"analysis-{number}",
                requirement_id=f"req-{number}",
                version=f"analysis-{number}@1",
                release_id=draft.id,
                text="An earlier requirement",
                suggested_verdict=ProductVerdict.CHANGE_EXISTING_OFFERING,
                verdict=ProductVerdict.CHANGE_EXISTING_OFFERING,
                decision=PrecedentDecision.ACCEPTED,
                offering_id=OFFERING,  # decided before the rename
                concept_ids=(concept,),
                systems=(PrecedentSystem(system),),
                decided_at=datetime(2026, 10, 1, tzinfo=UTC),
                received_at=datetime(2026, 10, 1, tzinfo=UTC),
            ),
            0.9,
        )

    lent = precedent_candidates(renamed, (decided(1), decided(2)), "bpp", frozenset({concept}), ())
    assert [item.system_id for item in lent] == [system]
