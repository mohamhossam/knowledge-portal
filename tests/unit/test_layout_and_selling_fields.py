"""Facts the catalogue lab once guessed from names and keywords, held as fields: an audience
point's aspect, an offering's contract terms, the channels customers buy through, where the
landscape map draws each layer, and each bundle part's kind."""

from __future__ import annotations

from pathlib import Path

import pytest
from smb_kernel.documents.scanner import OfflineDocumentScanner

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    LandscapeDomain,
    LandscapePlacement,
)
from knowledge_portal.domain.architecture.products import OfferingAspect, OfferingPoint
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


def _draft() -> ArchitectureKnowledge:
    manage = ManageArchitectureKnowledge(
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
        OfflineDocumentScanner(),
    )
    draft = manage.create_draft(MAINTAINER, "Fields")
    return manage.apply_file_import(
        draft.id, draft.revision, CATALOGUE.name, CATALOGUE.read_bytes(), MAINTAINER
    )


def test_the_smb_catalogue_states_what_the_lab_used_to_guess() -> None:
    draft = _draft()
    (offering,) = draft.products
    assert offering.contract_terms == ("No contract", "1 year", "2 years")
    assert all(point.aspect for point in offering.audiences)
    assert {point.name for point in offering.audiences if point.aspect is OfferingAspect.WHO} == {
        "Segment"
    }
    assert {channel.id for channel in draft.channels if channel.selling} == {
        "bcrm",
        "b2b-web",
        "smb-app",
        "cim",
    }
    placed = {domain.id: domain.placement for domain in draft.landscape_domains}
    assert placed["integration"] is LandscapePlacement.BUS
    assert placed["engaged-party"] is placed["enterprise"] is LandscapePlacement.SIDE
    kinds = {term.id for term in draft.vocabulary if term.scheme.value == "component_kind"}
    assert {part.kind_id for part in offering.components} <= kinds
    assert all(part.kind_id for part in offering.components)


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_the_fields_travel_through_every_catalogue_file(file_format: CatalogueFileFormat) -> None:
    draft = _draft()
    adapter = CatalogueFileAdapter()
    content = adapter.read(file_format, adapter.write(file_format, draft))
    assert content.products == draft.products
    assert content.channels == draft.channels
    assert content.landscape_domains == draft.landscape_domains


def test_an_aspect_and_a_placement_are_ones_the_catalogue_knows() -> None:
    with pytest.raises(InvalidKnowledgeError, match="who, where, terms or how"):
        OfferingPoint("Segment", aspect="budget")  # type: ignore[arg-type]
    with pytest.raises(InvalidKnowledgeError, match="layer, bus or side"):
        LandscapeDomain("integration", "Integration", placement="ceiling")  # type: ignore[arg-type]
