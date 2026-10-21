"""Stable identity for offerings and journeys: a rename keeps the old id, the version's
references follow, the diff says "renamed", and what still names the old id finds it."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from smb_kernel.documents.scanner import OfflineDocumentScanner

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
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)

MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))
CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
OFFERING = "business-pro-plus"


def _catalogue() -> tuple[ManageArchitectureKnowledge, ArchitectureKnowledge]:
    manage = ManageArchitectureKnowledge(
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
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


def test_an_id_names_one_offering_whether_current_or_former() -> None:
    manage, draft = _catalogue()
    renamed = manage.rename_offering(draft.id, draft.revision, OFFERING, "bpp", MAINTAINER)
    (offering,) = renamed.products
    with pytest.raises(InvalidKnowledgeError, match="held by both"):
        manage.upsert_offering(
            renamed.id,
            renamed.revision,
            replace(offering, id="other", former_ids=(OFFERING,)),
            MAINTAINER,
        )
    with pytest.raises(InvalidKnowledgeError, match="former id of itself"):
        replace(offering, former_ids=("bpp",))


def test_renaming_a_journey_and_editing_one_at_a_time() -> None:
    manage, draft = _catalogue()
    first = draft.journeys[0]
    renamed = manage.rename_journey(draft.id, draft.revision, first.id, "renamed", MAINTAINER)
    assert renamed.journeys[0].id == "renamed"
    assert renamed.journeys[0].former_ids == (first.id,)
    edited = manage.upsert_journey(
        renamed.id,
        renamed.revision,
        replace(renamed.journeys[0], description="Edited on its own"),
        MAINTAINER,
    )
    assert edited.journeys[0].description == "Edited on its own"
    assert edited.journeys[1:] == renamed.journeys[1:]
    removed = manage.remove_journey(edited.id, edited.revision, "renamed", MAINTAINER)
    assert len(removed.journeys) == len(edited.journeys) - 1


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


def test_offerings_and_journeys_are_edited_one_at_a_time_over_the_api(client: TestClient) -> None:
    draft = client.post("/architecture-knowledge/releases", json={"name": "Next"}).json()
    root = f"/architecture-knowledge/releases/{draft['id']}"
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
    offering = renamed.json()["products"][0]
    assert offering["former_ids"] == [OFFERING]
    offering["proposition"] = "Edited alone"
    put = client.put(
        f"{root}/offerings/bpp",
        json={"expected_revision": renamed.json()["revision"], "offering": offering},
    )
    assert put.status_code == 200, put.text
    assert put.json()["products"][0]["proposition"] == "Edited alone"
    mismatch = client.put(
        f"{root}/offerings/other",
        json={"expected_revision": put.json()["revision"], "offering": offering},
    )
    assert mismatch.status_code == 422


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
