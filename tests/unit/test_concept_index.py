"""The concept-aware evidence index (ontology plan Phase 2, ADR-0114).

Each chunk of a build carries a context header, is linked to the catalogue entities
its record belongs to, and to the concepts it speaks of; the index keeps the concept
scheme to match requirements against, and reports what the links do not reach.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor

from knowledge_portal.application.ports.architecture_rag import (
    ChunkEntityLink,
    ConceptBasis,
    EntityRole,
    EvidenceChunk,
    IndexLinks,
    LinkedEntity,
)
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.concepts import BusinessCapability, labels_in
from knowledge_portal.domain.architecture.journeys import Activity, Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    CapabilityDomain,
    KnowledgeCapability,
    KnowledgeConflictError,
    KnowledgeDocumentVersion,
    KnowledgeReleaseStatus,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
    OfferingComponent,
    OrderType,
    ProductOffering,
)
from knowledge_portal.domain.document.value_objects import DocumentVersionId
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.tokenizer import ApproximateTokenizer
from knowledge_portal.infrastructure.persistence.document_storage import (
    InMemoryDocumentStorage,
)
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)

MAINTAINER = Actor("amina", frozenset({"knowledge_maintainer"}))
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
READER = {"X-Fake-Actor-Id": "fake-reviewer"}
NOW = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)

CONCEPTS = (
    BusinessCapability(
        "cap-billing", "Billing", ("invoicing",), "Charging customers.", domain_id="customer"
    ),
    BusinessCapability("cap-sdwan", "SD-WAN service", ("SD-WAN",), domain_id="service"),
    BusinessCapability("cap-firewall", "Managed firewall", ("firewall",), domain_id="service"),
    BusinessCapability(
        "cap-static-ip", "Static IP addressing", ("static IP",), domain_id="service"
    ),
    BusinessCapability("cap-wifi", "Managed Wi-Fi access points", ("access point",), "cap-sdwan"),
    BusinessCapability(
        "cap-site-security",
        "Branch site security",
        definition="The security policy per site for managed devices.",
        domain_id="service",
    ),
)


def test_labels_are_found_as_whole_words_however_they_are_spelt() -> None:
    text = "The WiFi access point and the SD WAN edge; billings are separate."

    assert labels_in(text, CONCEPTS) == ("cap-sdwan", "cap-wifi")
    assert labels_in("Invoicing runs monthly.", CONCEPTS) == ("cap-billing",)
    assert labels_in("A firewalled site.", CONCEPTS) == ()


class _Recording(InMemoryEvidenceIndex):
    def __init__(self) -> None:
        super().__init__(FakeEmbeddings(), ApproximateTokenizer())
        self.chunks: tuple[EvidenceChunk, ...] = ()

    def store(self, release_id: str, index_id: str, chunks: tuple[EvidenceChunk, ...]) -> None:
        self.chunks = chunks
        super().store(release_id, index_id, chunks)


PASSAGES = (
    # Names SD-WAN, and the embedding check agrees the passage is about it.
    "# Overlay\n\nThe SD-WAN overlay links every branch; SD-WAN policies are set per site.\n\n"
    # Names billing in passing, but the passage is about the firewall and static IP.
    "# Security\n\nManaged firewall and static IP addressing: the firewall policy allows the "
    "static IP range; a managed firewall per site with static IP addressing. The billing team "
    "is told.\n"
)


def _release() -> ArchitectureKnowledge:
    systems = (
        SystemDefinition(
            "bscs",
            "BSCS",
            capabilities=(
                KnowledgeCapability("billing", "Billing", ("invoice",), concept_id="cap-billing"),
            ),
        ),
        SystemDefinition("fortinet", "Fortinet"),
        SystemDefinition("cwom", "CWOM"),
    )
    offering = ProductOffering(
        "bpp",
        "Business Pro Plus",
        order_types=(OrderType("NEW", "New activation"),),
        components=(
            OfferingComponent(
                "sdwan",
                "SD-WAN",
                responsibilities=(
                    ComponentResponsibility("fortinet", "configures", "Sets up the edge."),
                ),
                capability_ids=("cap-sdwan",),
            ),
        ),
    )
    journey = Journey(
        "bpp-new",
        "New activation",
        "bpp",
        "NEW",
        activities=(
            Activity("10", "Accept the order", performing_system_id="cwom"),
            Activity("20", "Configure the edge", performing_system_id="fortinet"),
        ),
    )
    return ArchitectureKnowledge(
        "concepts",
        1,
        systems,
        (),
        capability_domains=(
            CapabilityDomain("customer", "Customer"),
            CapabilityDomain("service", "Service"),
        ),
        products=(offering,),
        journeys=(journey,),
        business_capabilities=CONCEPTS,
    )


def _build(release: ArchitectureKnowledge) -> tuple[_Recording, ArchitectureKnowledge]:
    """Build a draft holding the release's catalogue and one document of PASSAGES."""
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    recording = _Recording()
    manage = ManageArchitectureKnowledge(repository, CatalogueFileAdapter(), recording, 10_000_000)
    draft = manage.create_draft(MAINTAINER, "Concepts")
    storage = InMemoryDocumentStorage()
    storage.put(DocumentVersionId("notes"), PASSAGES.encode())
    notes = KnowledgeDocumentVersion(
        "notes", "Design notes", "reference", "text/markdown", "en", "sum", "notes", "amina", NOW
    )
    repository.save(
        draft.updated(
            systems=release.systems,
            relationships=(),
            capability_domains=release.capability_domains,
            products=release.products,
            journeys=release.journeys,
            business_capabilities=release.business_capabilities,
            documents=(notes,),
        ),
        draft.revision,
        "amina",
        "upload",
    )
    current = manage.get(draft.id)
    built = BuildArchitectureIndex(
        manage,
        recording,
        storage,
        LocatedDocumentExtractor(SafeDocumentTextExtractor()),
        ApproximateTokenizer(),
    ).execute(current.id, current.revision, "amina", fence=lambda: None)
    return recording, built


def _chunk(index: _Recording, location: str) -> EvidenceChunk:
    return next(item for item in index.chunks if item.location == location)


def test_every_catalogue_window_says_whose_record_it_is() -> None:
    index, _ = _build(_release())

    assert _chunk(index, "system bscs").text.startswith(
        "Catalogue system: BSCS · capabilities: Billing\nBSCS\n"
    )
    assert _chunk(index, "product bpp").text.startswith(
        "Catalogue offering: Business Pro Plus · capabilities: SD-WAN service\n"
    )
    assert _chunk(index, "journey bpp-new").text.startswith("Catalogue journey: New activation\n")
    # A system with no linked capability says only whose record it is.
    assert _chunk(index, "system cwom").text.startswith("Catalogue system: CWOM\nCWOM")


def test_catalogue_records_link_exactly_to_their_entities_and_concepts() -> None:
    index, built = _build(_release())
    assert built.index_id is not None
    offering, journey, bscs = (
        _chunk(index, "product bpp"),
        _chunk(index, "journey bpp-new"),
        _chunk(index, "system bscs"),
    )

    entities, concepts = index.links(built.index_id, (offering.id, journey.id, bscs.id))

    assert set(entities) == {
        ChunkEntityLink(offering.id, LinkedEntity.OFFERING, "bpp", EntityRole.RECORD),
        ChunkEntityLink(offering.id, LinkedEntity.SYSTEM, "fortinet", EntityRole.NAMES),
        ChunkEntityLink(journey.id, LinkedEntity.JOURNEY, "bpp-new", EntityRole.RECORD),
        ChunkEntityLink(journey.id, LinkedEntity.OFFERING, "bpp", EntityRole.NAMES),
        ChunkEntityLink(journey.id, LinkedEntity.SYSTEM, "cwom", EntityRole.NAMES),
        ChunkEntityLink(journey.id, LinkedEntity.SYSTEM, "fortinet", EntityRole.NAMES),
        ChunkEntityLink(bscs.id, LinkedEntity.SYSTEM, "bscs", EntityRole.RECORD),
    }
    exact = {(item.chunk_id, item.concept_id) for item in concepts if item.score == 1.0}
    assert exact == {(offering.id, "cap-sdwan"), (bscs.id, "cap-billing")}
    assert all(item.basis is ConceptBasis.CATALOGUE for item in concepts if item.score == 1.0)


def test_a_passage_links_to_a_concept_it_names_and_is_about() -> None:
    index, built = _build(_release())
    assert built.index_id is not None
    sdwan, security = (item for item in index.chunks if item.document_version_id == "notes")

    _, concepts = index.links(built.index_id, (sdwan.id, security.id))
    linked = {(item.chunk_id, item.concept_id): item for item in concepts}

    assert linked[(sdwan.id, "cap-sdwan")].basis is ConceptBasis.LABEL
    assert 0 < linked[(sdwan.id, "cap-sdwan")].score < 1
    assert {key[1] for key in linked if key[0] == security.id} == {
        "cap-firewall",
        "cap-static-ip",
    }
    # "billing" is in the passage, but the passage is not about billing.
    assert (security.id, "cap-billing") not in linked
    assert labels_in(security.text, CONCEPTS) == ("cap-billing", "cap-firewall", "cap-static-ip")


def test_the_index_reports_what_its_links_do_not_reach() -> None:
    index, built = _build(_release())
    assert built.index_id is not None

    coverage = index.coverage(built.index_id)

    assert coverage is not None
    assert coverage.chunks == len(index.chunks)
    # The CWOM and Fortinet records and the journey name no concept.
    assert coverage.chunks_without_concept == 3
    assert coverage.concepts == len(CONCEPTS)
    assert coverage.concepts_without_chunk == ("cap-site-security", "cap-wifi")


def test_requirements_are_matched_against_the_concept_scheme() -> None:
    index, built = _build(_release())
    assert built.index_id is not None

    matches = index.match_concepts(built.index_id, "Open a static IP range", 3)
    assert matches[0].concept_id == "cap-static-ip"
    assert matches[0].score > matches[-1].score

    linked = index.concept_chunks(built.index_id, "branch overlay policy", ("cap-sdwan",), 5)
    # The overlay passage, then the offering whose component realises SD-WAN.
    assert [item.location for item in linked] == ["line 3", "product bpp"]
    assert index.concept_chunks(built.index_id, "anything", ("cap-wifi",), 5) == ()


def test_a_release_without_concepts_still_builds_with_entity_links() -> None:
    release = _release()
    bscs = replace(
        release.systems[0],
        capabilities=(replace(release.systems[0].capabilities[0], concept_id=None),),
    )
    offering = release.products[0]
    sdwan = replace(offering.components[0], capability_ids=())
    index, built = _build(
        replace(
            release,
            systems=(bscs, *release.systems[1:]),
            products=(replace(offering, components=(sdwan,)),),
            business_capabilities=(),
        )
    )
    assert built.index_id is not None

    coverage = index.coverage(built.index_id)

    assert coverage is not None and coverage.concepts == 0
    assert coverage.chunks_without_concept == coverage.chunks
    assert index.match_concepts(built.index_id, "billing", 3) == ()
    entities, _ = index.links(built.index_id, (_chunk(index, "system bscs").id,))
    assert [item.role for item in entities] == [EntityRole.RECORD]


def test_an_index_from_before_links_is_still_read_but_reports_no_coverage() -> None:
    index = InMemoryEvidenceIndex(FakeEmbeddings(), ApproximateTokenizer())
    index.store("release", "old", (EvidenceChunk("c1", "BSCS", "system bscs", "BSCS"),))

    assert index.coverage("old") is None
    assert index.links("old", ("c1",)) == ((), ())
    previous = index.profile.replace("section-v3", "section-v2")
    assert index.reads(previous) and index.reads(index.profile)
    assert not index.reads(previous.replace("fake-architecture", "other"))
    assert not index.reads(None)
    index.link("old", IndexLinks())
    with pytest.raises(ValueError, match="immutable"):
        index.link("old", IndexLinks())


def test_a_release_indexed_before_links_stays_in_service_until_rebuilt() -> None:
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    index = InMemoryEvidenceIndex(FakeEmbeddings(), ApproximateTokenizer())
    manage = ManageArchitectureKnowledge(repository, CatalogueFileAdapter(), index, 10_000_000)
    draft = manage.create_draft(MAINTAINER, "Old build")
    previous = index.profile.replace("section-v3", "section-v2")
    built = manage.mark_built(draft.id, draft.revision, previous, "hash", "amina", "old-index")

    # A draft built before links must be rebuilt before it is published ...
    with pytest.raises(KnowledgeConflictError, match="rebuild"):
        manage.publish(built.id, built.revision, MAINTAINER, NOW, "Reviewed")
    # ... but a release already published with it can still be put back in service.
    repository.save(
        replace(
            built, status=KnowledgeReleaseStatus.PUBLISHED, published_at=NOW, published_by="amina"
        ),
        built.revision,
        "amina",
        "publish",
    )
    assert manage.activate(built.id, MAINTAINER, "Back in service").id == built.id


def test_the_index_coverage_is_read_through_the_api(client: TestClient) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Coverage"}, headers=OWNER
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    assert client.get(f"{base}/index-coverage", headers=READER).status_code == 403
    assert client.get(f"{base}/index-coverage", headers=OWNER).json() == {
        "linked": False,
        "chunks": 0,
        "chunks_without_concept": 0,
        "concepts": 0,
        "concepts_without_chunk": [],
    }
    saved = client.put(
        base,
        json={
            "expected_revision": draft["revision"],
            "systems": draft["systems"],
            "relationships": draft["relationships"],
            "business_capabilities": [
                {"id": "cap-billing", "pref_label": "Billing"},
                {"id": "cap-telepathy", "pref_label": "Telepathic ordering"},
            ],
        },
        headers=OWNER,
    ).json()
    built = client.post(
        f"{base}/build", json={"expected_revision": saved["revision"]}, headers=OWNER
    )
    assert built.status_code == 202 and built.json()["status"] == "succeeded", built.text

    coverage = client.get(f"{base}/index-coverage", headers=OWNER).json()

    assert coverage["linked"] is True
    assert coverage["chunks"] == len(saved["systems"])
    assert 0 < coverage["chunks_without_concept"] < coverage["chunks"]
    assert coverage["concepts"] == 2
    assert coverage["concepts_without_chunk"] == [
        {"id": "cap-telepathy", "pref_label": "Telepathic ordering"}
    ]
