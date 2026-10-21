"""Citations that name no registered source: listed before publishing, grouped by what they
cite, so a curator registers the source or corrects the citation."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.citations import cited_source, unregistered_citations
from knowledge_portal.domain.architecture.governance import KnowledgeSource, SourceLevel
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)

MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))
CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
RELEASES = "/architecture-knowledge/releases"


def _smb() -> ArchitectureKnowledge:
    manage = ManageArchitectureKnowledge(
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
        OfflineDocumentScanner(),
    )
    draft = manage.create_draft(MAINTAINER, "Citations")
    return manage.apply_file_import(
        draft.id, draft.revision, CATALOGUE.name, CATALOGUE.read_bytes(), MAINTAINER
    )


def test_the_smb_catalogue_lists_what_it_cites_but_does_not_register() -> None:
    found = unregistered_citations(_smb())
    assert [(item.cited, item.facts) for item in found] == [
        ("Ontology plan Phase 8", 68),
        ("Ontology plan Phase 1", 38),
        ("Ontology plan Phase 6", 35),
        ("Catalogue curation", 3),
    ]
    assert len(found[0].examples) == 3
    assert found[1].examples[0] == "Business capability Assisted order capture"


def test_registering_a_source_takes_its_citations_off_the_list() -> None:
    release = _smb()
    registered = replace(
        release,
        sources=(
            *release.sources,
            KnowledgeSource(
                "ontology-8", "Ontology plan", SourceLevel.L3, short="Ontology plan Phase 8"
            ),
        ),
    )
    assert "Ontology plan Phase 8" not in {
        item.cited for item in unregistered_citations(registered)
    }


def test_citations_that_differ_only_in_case_are_one_source() -> None:
    release = _smb()
    (offering,) = release.products
    shouted = replace(
        release,
        products=(
            replace(
                offering,
                plans=tuple(
                    replace(plan, source="ONTOLOGY PLAN PHASE 8 · §plans")
                    for plan in offering.plans
                ),
            ),
        ),
    )
    found = {item.cited.casefold(): item for item in unregistered_citations(shouted)}
    assert found["ontology plan phase 8"].cited == "Ontology plan Phase 8"
    assert found["ontology plan phase 8"].facts == 68 + len(offering.plans)


def test_a_citation_names_a_source_by_its_id_or_short_name_as_a_whole_word() -> None:
    sources = (
        KnowledgeSource("sdd", "Solution design", SourceLevel.L2, short="SDD v2.3"),
        KnowledgeSource("ref", "Reference", SourceLevel.L1),
    )
    assert cited_source("SDD v2.3 · §P1", sources) is sources[0]
    assert cited_source("sdd V2.3", sources) is sources[0]
    assert cited_source("ref", sources) is sources[1]
    # A whole word only: "references" does not cite "ref".
    assert cited_source("references to it", sources) is None
    # A point and a digit carry on a version: "SDD v2.3" is not a citation of "SDD v2".
    older = (KnowledgeSource("sdd-2", "Solution design", SourceLevel.L2, short="SDD v2"),)
    assert cited_source("SDD v2.3 · §P1", older) is None
    assert cited_source("SDD v2. §P1", older) is older[0]
    assert cited_source("   ", sources) is None


def test_the_endpoint_lists_them_for_maintainers_only(client: TestClient) -> None:
    draft = client.post(RELEASES, json={"name": "Next"}).json()
    root = f"{RELEASES}/{draft['id']}"
    assert client.get(f"{root}/citations").json() == []
    imported = client.post(
        f"{root}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": (CATALOGUE.name, CATALOGUE.read_bytes(), "application/yaml")},
    )
    assert imported.status_code == 200, imported.text

    listed = client.get(f"{root}/citations")
    assert listed.status_code == 200
    first = listed.json()[0]
    assert first["cited"] == "Ontology plan Phase 8" and first["facts"] == 68
    assert len(first["examples"]) == 3

    refused = client.get(f"{root}/citations", headers={"X-Fake-Actor-Id": "fake-reviewer"})
    assert refused.status_code == 403
    assert client.get(f"{RELEASES}/nowhere/citations").status_code == 404
