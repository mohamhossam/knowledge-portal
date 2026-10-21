"""What the service works out from a version, and the values it normalises: every link
between systems, citations that name no registered source, a call's timing, a bare point of
no return and a plan's measured values."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from pydantic import ValidationError

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.citations import cited_source, unregistered_citations
from knowledge_portal.domain.architecture.governance import KnowledgeSource, SourceLevel
from knowledge_portal.domain.architecture.interfaces import InterfaceStyle, SystemInterface
from knowledge_portal.domain.architecture.journeys import (
    NO_RETURN,
    Activity,
    ActivityIntegration,
    CallTiming,
    read_timing,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    RelationshipKind,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.links import (
    UNNAMED,
    connections,
    style_kind,
    system_links,
)
from knowledge_portal.domain.architecture.products import PlanCharacteristic
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    ActivityIntegrationSchema,
)

MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))
CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"


def _smb() -> ArchitectureKnowledge:
    manage = ManageArchitectureKnowledge(
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
    )
    draft = manage.create_draft(MAINTAINER, "Derivations")
    return manage.apply_file_import(
        draft.id, draft.revision, CATALOGUE.name, CATALOGUE.read_bytes(), MAINTAINER
    )


def test_the_smb_catalogue_connects_its_systems_without_a_stated_connection() -> None:
    release = _smb()
    assert release.relationships == ()
    links = system_links(release)
    assert len(links) > 40
    assert not any(link.stated for link in links)
    crm = next(
        link
        for link in links
        if link.relationship.source_system_id == "b2b-web"
        and link.relationship.target_system_id == "cbcm"
    )
    assert crm.relationship.kind is RelationshipKind.CALLS_API
    assert {item.system_id for item in crm.interfaces} == {"cbcm"}


def test_a_stated_connection_keeps_its_words_and_takes_a_kind_it_left_unsaid() -> None:
    base = seed_knowledge()
    systems = base.systems[:2]
    first, second = systems[0].id, systems[1].id
    release = replace(
        base,
        systems=systems,
        relationships=(SystemRelationship(first, second, "Reads the customer"),),
        interfaces=(SystemInterface("if-1", "Customer API", second, InterfaceStyle.API, (first,)),),
        journeys=(),
        products=(),
    )
    (link,) = system_links(release)
    assert link.stated
    assert link.relationship.description == "Reads the customer"
    assert link.relationship.kind is RelationshipKind.CALLS_API
    assert connections(release) == (link.relationship,)


def test_each_stated_connection_of_one_pair_stays_a_link_of_its_own() -> None:
    base = seed_knowledge()
    systems = base.systems[:2]
    first, second = systems[0].id, systems[1].id
    reads = SystemRelationship(first, second, "Reads the customer")
    events = SystemRelationship(
        first, second, "Sends order events", RelationshipKind.PUBLISHES_EVENTS_TO
    )
    release = replace(
        base,
        systems=systems,
        relationships=(reads, events),
        interfaces=(SystemInterface("if-1", "Customer API", second, InterfaceStyle.API, (first,)),),
        journeys=(),
        products=(),
    )
    links = system_links(release)
    assert [(link.stated, link.relationship.description) for link in links] == [
        (True, "Reads the customer"),
        (True, "Sends order events"),
    ]
    assert links[0].relationship.kind is RelationshipKind.CALLS_API
    assert [len(link.interfaces) for link in links] == [1, 0]
    assert links[1].relationship == events


def test_a_link_known_by_no_name_says_where_it_comes_from() -> None:
    assert UNNAMED.startswith("Known from")
    assert style_kind("Event / message") is RelationshipKind.PUBLISHES_EVENTS_TO
    assert style_kind("Ticket") is RelationshipKind.UNSPECIFIED


def test_citations_that_name_no_registered_source_are_grouped_by_what_they_cite() -> None:
    found = {item.cited: item for item in unregistered_citations(_smb())}
    assert set(found) == {"Ontology plan Phase 8", "Ontology plan Phase 1", "Ontology plan Phase 6"}
    assert found["Ontology plan Phase 8"].facts == 68
    assert len(found["Ontology plan Phase 8"].examples) == 3
    sources = (
        KnowledgeSource("sdd", "Solution design", SourceLevel.L2, short="SDD v2.3"),
        KnowledgeSource("ref", "Reference", SourceLevel.L1),
    )
    assert cited_source("SDD v2.3 · §P1", sources) is sources[0]
    assert cited_source("ref", sources) is sources[1]
    # A whole word only: "references" does not cite "ref".
    assert cited_source("references to it", sources) is None
    # A point and a digit carry on a version: "SDD v2.3" is not a citation of "SDD v2".
    older = (KnowledgeSource("sdd-2", "Solution design", SourceLevel.L2, short="SDD v2"),)
    assert cited_source("SDD v2.3 · §P1", older) is None
    assert cited_source("SDD v2. §P1", older) is older[0]


def test_a_call_timing_is_sync_or_async_in_any_spelling() -> None:
    call = ActivityIntegration("1", "2", timing="synchronous")  # type: ignore[arg-type]
    assert call.timing is CallTiming.SYNC
    assert ActivityIntegration("1", "2", timing="ASYNC").timing is CallTiming.ASYNC  # type: ignore[arg-type]
    with pytest.raises(InvalidKnowledgeError, match="Sync or Async"):
        ActivityIntegration("1", "2", timing="real time")  # type: ignore[arg-type]
    # A document's table may say anything: what isn't a timing is left unsaid.
    assert read_timing("real time") is None


def test_the_api_reads_a_timing_in_any_spelling_and_refuses_other_words() -> None:
    def timing(value: str) -> CallTiming | None:
        call = {"from_activity": "1", "to_activity": "2", "timing": value}
        return ActivityIntegrationSchema.model_validate(call).timing

    assert timing("synchronous") is CallTiming.SYNC
    assert timing("") is None
    with pytest.raises(ValidationError):
        timing("once a night")


def test_a_bare_point_of_no_return_reads_as_what_it_means() -> None:
    marked = Activity("1", "Hand over", performing_system_id="rtf", point_of_no_return="yes")
    assert marked.point_of_no_return == NO_RETURN
    said = Activity("1", "Hand over", performing_system_id="rtf", point_of_no_return="The callback")
    assert said.point_of_no_return == "The callback"


def test_a_measured_plan_value_carries_its_amount_and_unit() -> None:
    assert PlanCharacteristic("Download", "200 Mbps") == PlanCharacteristic(
        "Download", "200 Mbps", "200", "Mbps"
    )
    assert PlanCharacteristic("Quota", "2,5 GB").amount == "2.5"
    assert PlanCharacteristic("CPE", "Fortinet 90G").amount is None
    quota = PlanCharacteristic("Quota", "1,000 GB")
    assert (quota.amount, quota.unit) == ("1000", "GB")
    assert PlanCharacteristic("Support", "24/7").amount is None
    assert PlanCharacteristic("Uptime", "99.9 %").unit == "%"
    assert PlanCharacteristic("Download", "200 Mbps", amount="200.0", unit="Mbps").amount == "200"
    with pytest.raises(InvalidKnowledgeError, match="disagree"):
        PlanCharacteristic("Download", "300 Mbps", amount="200", unit="Mbps")
    with pytest.raises(InvalidKnowledgeError, match="needs its unit"):
        PlanCharacteristic("Download", "fast", amount="200")
    with pytest.raises(InvalidKnowledgeError, match="not a number"):
        PlanCharacteristic("Download", "fast", amount="lots", unit="Mbps")


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_the_normalised_values_survive_every_catalogue_file(
    file_format: CatalogueFileFormat,
) -> None:
    release = _smb()
    adapter = CatalogueFileAdapter()
    content = adapter.read(file_format, adapter.write(file_format, release))
    assert content.products == release.products
    assert content.journeys == release.journeys
