"""A missing system named only in a journey's steps can still be settled (Decide, dead ends)."""

from __future__ import annotations

from datetime import UTC, datetime
from threading import RLock

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
    SettledSubject,
    SubjectKind,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CandidateMatch,
    CandidateStatus,
    CatalogueCandidate,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.journeys import Activity, Journey
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, SystemDefinition
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
    OfferingComponent,
    OrderType,
    ProductOffering,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.in_memory_catalogue_candidates import (
    InMemoryCatalogueCandidates,
)
from knowledge_portal.infrastructure.persistence.in_memory_transaction import (
    InMemoryTransactionManager,
)
from tests.catalogue_seed import seeded_repository

NOW = datetime(2026, 10, 25, 9, 0, tzinfo=UTC)
MAINTAINER = Actor("amina", frozenset({"knowledge_maintainer"}))


def test_a_system_named_only_in_a_journeys_steps_can_be_suggested() -> None:
    repository = seeded_repository()
    manage = ManageArchitectureKnowledge(
        repository,
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000,
        OfflineDocumentScanner(),
    )
    candidates = InMemoryCatalogueCandidates()
    decide = DecideCatalogueCandidate(
        manage, repository, candidates, InMemoryTransactionManager(RLock())
    )
    draft = manage.create_draft(MAINTAINER, "Next version")
    journey = Journey(
        "wf-1",
        "Order fulfilment",
        activities=(Activity("10", "Check the firewall", performing_system_id="e2eso-fortiguard"),),
    )
    quote = CandidateCitation("table 4, row 2", "E2ESO Fortiguard checks the firewall")
    candidates.revise(
        (
            CatalogueCandidate(
                "c1",
                draft.id,
                "doc",
                CandidateContent(
                    CandidateKind.JOURNEY, journey.id, name=journey.name, journey=journey
                ),
                (quote,),
                "fake",
                "v1",
                NOW,
            ),
        )
    )

    settled = decide.settle_subject(
        draft.id, "e2eso-fortiguard", "E2ESO Fortiguard", SubjectKind.SYSTEM, MAINTAINER, NOW
    )

    assert settled == SettledSubject(0, 1)
    added = next(
        item
        for item in candidates.list(draft.id)
        if item.content.kind is CandidateKind.SYSTEM and item.status is CandidateStatus.PROPOSED
    )
    assert (added.content.system_id, added.content.name) == ("e2eso-fortiguard", "E2ESO Fortiguard")
    assert added.citations == (quote,)


def test_a_name_differing_only_in_case_becomes_one_other_name() -> None:
    repository = seeded_repository()
    manage = ManageArchitectureKnowledge(
        repository,
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000,
        OfflineDocumentScanner(),
    )
    candidates = InMemoryCatalogueCandidates()
    decide = DecideCatalogueCandidate(
        manage, repository, candidates, InMemoryTransactionManager(RLock())
    )
    draft = manage.create_draft(MAINTAINER, "Next version")
    journey = Journey(
        "wf-9",
        "Cessation",
        activities=(Activity("10", "Close the order", performing_system_id="eseso"),),
    )
    candidates.revise(
        (
            CatalogueCandidate(
                "c1",
                draft.id,
                "doc",
                CandidateContent(
                    CandidateKind.JOURNEY, journey.id, name=journey.name, journey=journey
                ),
                (CandidateCitation("row 3", "ESESO closes the order"),),
                "fake",
                "v1",
                NOW,
            ),
        )
    )

    # The documents write it "eseso"; the page names it "Eseso": one name, not two.
    settled = decide.settle_as_existing(draft.id, "eseso", "Eseso", "bcrm", MAINTAINER, NOW)

    assert settled == SettledSubject(1, 0)
    bcrm = next(item for item in manage.get(draft.id).systems if item.id == "bcrm")
    assert [alias for alias in bcrm.aliases if alias.casefold() == "eseso"] == ["Eseso"]


def test_two_names_for_one_system_in_one_role_become_one_responsibility() -> None:
    offering = ProductOffering(
        "saas",
        "SAAS subscription",
        order_types=(OrderType("NEW", "New"), OrderType("MODIFY", "Modify")),
        components=(
            OfferingComponent(
                "o365",
                "SAAS subscription (O365, domains, etc.)",
                responsibilities=(
                    ComponentResponsibility("bcrm", "CAPTURE", "Takes the order", ("NEW",)),
                    ComponentResponsibility(
                        "B2B Sales Channel", "CAPTURE", "Sells it", ("MODIFY",)
                    ),
                    ComponentResponsibility("bscs", "BILLS", "Bills it"),
                ),
            ),
        ),
    )
    content = CandidateContent(
        CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
    )
    aliased = ArchitectureKnowledge(
        "draft",
        1,
        (
            SystemDefinition("bcrm", "BCRM", aliases=("B2B Sales Channel",)),
            SystemDefinition("bscs", "BSCS"),
        ),
        (),
    )

    # Classifying no longer fails, and accepting holds BCRM once in the role, for both orders.
    assert classify(content, aliased) is CandidateMatch.NEW
    accepted = apply_candidate(content, aliased)
    (component,) = next(item for item in accepted.products if item.id == "saas").components
    assert [
        (item.system_id, item.role, item.order_types) for item in component.responsibilities
    ] == [
        ("bcrm", "CAPTURE", ("NEW", "MODIFY")),
        ("bscs", "BILLS", ()),
    ]
