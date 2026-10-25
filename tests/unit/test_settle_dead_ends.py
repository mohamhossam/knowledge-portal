"""Every dead end on Decide has an answer: an order type, a channel or a specification can be
added, suggested, or said to be one the draft has."""

from __future__ import annotations

from datetime import UTC, datetime
from threading import RLock

import pytest
from pydantic import ValidationError

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.catalogue_candidates import (
    DecideCatalogueCandidate,
    SettledSubject,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CandidateNotFoundError,
    CandidateStatus,
    CatalogueCandidate,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.journeys import Activity, Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.products import (
    OrderType,
    ProductOffering,
    RealisationLayer,
)
from knowledge_portal.domain.architecture.realisations import RealisationRecord
from knowledge_portal.domain.architecture.settling import order_type_code
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
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import SettleSubjectRequest
from tests.catalogue_seed import seeded_repository

NOW = datetime(2026, 10, 25, 9, 0, tzinfo=UTC)
MAINTAINER = Actor("amina", frozenset({"knowledge_maintainer"}))
QUOTE = CandidateCitation("table 2, row 4", "As the design says")
BPP = ProductOffering(
    "business-pro-plus", "Business Pro Plus", order_types=(OrderType("CESSATION", "Cessation"),)
)


class _Desk:
    def __init__(self) -> None:
        repository = seeded_repository()
        self.manage = ManageArchitectureKnowledge(
            repository,
            CatalogueFileAdapter(),
            InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
            10_000,
            OfflineDocumentScanner(),
        )
        self.candidates = InMemoryCatalogueCandidates()
        self.decide = DecideCatalogueCandidate(
            self.manage, repository, self.candidates, InMemoryTransactionManager(RLock())
        )
        draft = self.manage.create_draft(MAINTAINER, "Next version")
        self.draft = self.manage.update(
            draft.id,
            draft.revision,
            MAINTAINER,
            products=(BPP,),
            channels=(Channel("b2b-web", "Business Web"),),
            realisations=(RealisationRecord("rfs-ports", RealisationLayer.RFS, "RFS_PORTS"),),
        )

    def waiting(self, *contents: CandidateContent) -> None:
        self.candidates.revise(
            tuple(
                CatalogueCandidate(
                    f"c{n}", self.draft.id, "doc", content, (QUOTE,), "fake", "v1", NOW
                )
                for n, content in enumerate(contents)
            )
        )

    def proposed(self) -> list[CatalogueCandidate]:
        return [
            item
            for item in self.candidates.list(self.draft.id)
            if item.status is CandidateStatus.PROPOSED
        ]

    def release(self) -> ArchitectureKnowledge:
        return self.manage.get(self.draft.id)


def _journey(order_type: str | None = None, channels: tuple[str, ...] = ()) -> CandidateContent:
    journey = Journey(
        "wf-1",
        "Change the password",
        product_id="Business Pro Plus",
        order_type_code=order_type,
        activities=(Activity("10", "Take the order", channels=channels),),
    )
    return CandidateContent(CandidateKind.JOURNEY, journey.id, name=journey.name, journey=journey)


def _rule(subject: str) -> CandidateContent:
    return CandidateContent(CandidateKind.SPECIFICATION_RULE, subject, text="It refers to a Place")


def test_an_order_type_a_journey_needs_is_added_to_its_offering() -> None:
    desk = _Desk()
    desk.waiting(_journey("Modify Password"))

    assert desk.decide.add_order_type(
        desk.draft.id, "Business Pro Plus", "Modify Password", MAINTAINER, NOW
    ) == SettledSubject(1, 1)

    (offering,) = desk.release().products
    assert [(item.code, item.name) for item in offering.order_types] == [
        ("CESSATION", "Cessation"),
        ("MODIFY_PASSWORD", "Modify Password"),
    ]
    with pytest.raises(InvalidKnowledgeError, match="already has the order type"):
        desk.decide.add_order_type(
            desk.draft.id, "business-pro-plus", "modify password", MAINTAINER, NOW
        )
    assert order_type_code("Modify Password", ("MODIFY_PASSWORD",)) == "MODIFY_PASSWORD_2"


def test_an_order_type_a_journey_needs_can_be_one_its_offering_has() -> None:
    desk = _Desk()
    desk.waiting(_journey("Disconnect"))

    assert desk.decide.settle_order_type(
        desk.draft.id, "Business Pro Plus", "Disconnect", "Cessation", MAINTAINER, NOW
    ) == SettledSubject(1, 0)

    (journey,) = desk.proposed()
    assert journey.content.journey is not None
    assert journey.content.journey.order_type_code == "CESSATION"
    with pytest.raises(CandidateNotFoundError):
        desk.decide.settle_order_type(
            desk.draft.id, "Business Pro Plus", "Disconnect", "CESSATION", MAINTAINER, NOW
        )


def test_a_channel_suggestions_name_is_suggested_once_citing_them() -> None:
    desk = _Desk()
    desk.waiting(_journey("Cessation", channels=("b2b portal",)))

    assert desk.decide.suggest_channel(
        desk.draft.id, "b2b portal", "B2B Portal", MAINTAINER, NOW
    ) == SettledSubject(0, 1)
    assert desk.decide.suggest_channel(
        desk.draft.id, "b2b portal", "B2B Portal", MAINTAINER, NOW
    ) == SettledSubject(0, 0)

    channel = next(item for item in desk.proposed() if item.content.kind is CandidateKind.CHANNEL)
    assert (channel.content.system_id, channel.content.name) == ("b2b-portal", "B2B Portal")
    assert channel.citations == (QUOTE,)


def test_a_channel_suggestions_name_can_be_one_the_draft_has() -> None:
    desk = _Desk()
    desk.waiting(_journey("Cessation", channels=("b2b portal",)))

    assert desk.decide.settle_channel(
        desk.draft.id, "b2b portal", "b2b-web", MAINTAINER, NOW
    ) == SettledSubject(1, 0)

    (journey,) = desk.proposed()
    assert journey.content.journey is not None
    assert journey.content.journey.activities[0].channels == ("b2b-web",)
    with pytest.raises(InvalidKnowledgeError, match="already has the channel"):
        desk.decide.suggest_channel(desk.draft.id, "Business Web", "", MAINTAINER, NOW)


def test_a_specification_rules_wait_for_is_suggested_or_one_the_draft_has() -> None:
    desk = _Desk()
    desk.waiting(_rule("place"), _rule("ports"))

    with pytest.raises(InvalidKnowledgeError, match="not a resource"):
        desk.decide.suggest_specification(
            desk.draft.id, "place", "Place", RealisationLayer.RESOURCE, MAINTAINER, NOW
        )
    assert desk.decide.suggest_specification(
        desk.draft.id, "place", "PLACE", RealisationLayer.RFS, MAINTAINER, NOW
    ) == SettledSubject(0, 1)
    record = next(
        item for item in desk.proposed() if item.content.kind is CandidateKind.REALISATION_RECORD
    )
    assert record.content.realisation is not None
    assert (record.content.realisation.id, record.content.realisation.layer) == (
        "rfs-place",
        RealisationLayer.RFS,
    )

    assert desk.decide.settle_as_specification(
        desk.draft.id, "ports", "ports", "rfs-ports", MAINTAINER, NOW
    ) == SettledSubject(1, 0)
    moved = next(item for item in desk.proposed() if item.id == "c1")
    assert moved.content.system_id == "rfs-ports"


def test_each_kind_takes_its_own_field_only() -> None:
    def request(**fields: object) -> SettleSubjectRequest:
        return SettleSubjectRequest.model_validate({"system_id": "x", **fields})

    assert request(kind="existing_channel", existing_id="b2b-web").existing_id == "b2b-web"
    assert request(kind="new_specification", layer="rfs").layer is RealisationLayer.RFS
    assert request(kind="order_type", name="Modify Password").name == "Modify Password"
    for wrong in (
        {"kind": "existing_channel"},
        {"kind": "existing_order_type"},
        {"kind": "new_specification"},
        {"kind": "order_type"},
        {"kind": "channel", "existing_id": "b2b-web"},
        {"kind": "system", "layer": "cfs"},
    ):
        with pytest.raises(ValidationError):
            request(**wrong)
