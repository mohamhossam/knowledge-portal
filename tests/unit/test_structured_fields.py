"""Facts the screens once read from prose, held as fields: an offering's purpose, a question's
title, the hub component, an order type's customer stage, the system a fallout case is in and
the channel a flow rule is taken for."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from smb_kernel.documents.scanner import OfflineDocumentScanner

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.journeys import FlowRule, FlowRuleKind
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.products import CustomerStage, OrderType
from knowledge_portal.domain.architecture.tracking import FalloutCase
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


def _catalogue() -> tuple[ManageArchitectureKnowledge, ArchitectureKnowledge]:
    manage = ManageArchitectureKnowledge(
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
        OfflineDocumentScanner(),
    )
    draft = manage.create_draft(MAINTAINER, "Fields")
    draft = manage.apply_file_import(
        draft.id, draft.revision, CATALOGUE.name, CATALOGUE.read_bytes(), MAINTAINER
    )
    return manage, draft


def test_the_smb_catalogue_holds_the_fields_its_prose_used_to_carry() -> None:
    _, draft = _catalogue()
    (offering,) = draft.products
    assert offering.purpose and offering.proposition
    assert "\n\n" not in offering.proposition
    assert [part.id for part in offering.components if part.hub] == ["cpe"]
    stages = {order.code: order.stage for order in offering.order_types}
    assert stages["NEW"] is CustomerStage.JOIN and stages["CESSREQ"] is CustomerStage.LEAVE
    assert all(stages.values())
    assert all(question.title for question in offering.questions)
    assert offering.tracking is not None
    assert {case.system_id for case in offering.tracking.fallout} == {"cwom", "ibm-bpm"}


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_the_fields_travel_through_every_catalogue_file(file_format: CatalogueFileFormat) -> None:
    _, draft = _catalogue()
    journey = draft.journeys[0]
    channel = draft.channels[0].id
    first, second = (step.number for step in journey.activities[:2])
    rule = FlowRule(FlowRuleKind.DECISION, first, second, channel_id=channel)
    draft = replace(draft, journeys=(replace(journey, flow_rules=(rule,)), *draft.journeys[1:]))
    adapter = CatalogueFileAdapter()
    content = adapter.read(file_format, adapter.write(file_format, draft))
    assert content.products == draft.products
    assert content.journeys[0].flow_rules[0].channel_id == channel


def test_an_offering_has_one_hub_and_an_order_type_a_known_stage() -> None:
    _, draft = _catalogue()
    (offering,) = draft.products
    with pytest.raises(InvalidKnowledgeError, match="at most one component is its hub"):
        replace(offering, components=tuple(replace(part, hub=True) for part in offering.components))
    with pytest.raises(InvalidKnowledgeError, match="join, change, support or leave"):
        OrderType("NEW", "New", stage="onboard")  # type: ignore[arg-type]


def test_a_fallout_system_and_a_flow_rule_channel_must_be_in_the_catalogue() -> None:
    manage, draft = _catalogue()
    (offering,) = draft.products
    assert offering.tracking is not None
    unknown = replace(
        offering,
        tracking=replace(offering.tracking, fallout=(FalloutCase("Lost", system_id="nowhere"),)),
    )
    with pytest.raises(InvalidKnowledgeError, match="'nowhere'"):
        manage.upsert_offering(draft.id, draft.revision, unknown, MAINTAINER)
    first, second = (step.number for step in draft.journeys[0].activities[:2])
    journey = replace(
        draft.journeys[0],
        flow_rules=(FlowRule(FlowRuleKind.DECISION, first, second, channel_id="pigeon"),),
    )
    with pytest.raises(InvalidKnowledgeError, match="'pigeon'"):
        manage.upsert_journey(draft.id, draft.revision, journey, MAINTAINER)
