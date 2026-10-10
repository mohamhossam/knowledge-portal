"""Assessing a whole requirement (ontology plan Phase 3, ADR-0114).

The committed SMB catalogue is published into a throwaway release with the fake models, as
the golden-set evaluation does, and assessed: verdicts with their paths, roles, gaps and
owners; questions instead of a verdict for a vague requirement; and the checks every
model answer passes before it is used.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceError,
    EvidenceChunk,
)
from knowledge_portal.application.ports.requirement_assessment import (
    ArchitectureAssessment,
    AssessmentQuery,
    CatalogueTerm,
    CatalogueTerms,
    ConceptBasis,
    ConceptOption,
    GapKind,
    SystemCandidate,
    VerdictContext,
    VerdictDecision,
)
from knowledge_portal.application.use_cases.architecture_evidence import named_systems
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.assess_requirement import AssessRequirement
from knowledge_portal.application.use_cases.mapping_evaluation import (
    PublishCatalogueForEvaluation,
)
from knowledge_portal.application.use_cases.resolve_architecture_knowledge import (
    ResolveArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.assessment import (
    ChangeType,
    Facet,
    FacetKind,
    PathKind,
    PathStep,
    SystemRole,
    change_type_in,
    speeds_in,
)
from knowledge_portal.domain.architecture.impact_graph import realisers
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.verdicts import (
    OfferingFit,
    ProductVerdict,
    VerdictCall,
    decide_verdict,
)
from knowledge_portal.domain.organisation.catalogue import (
    OrganisationCatalogue,
    Person,
    Product,
    Squad,
    SquadResource,
    SquadRole,
    ValueStream,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.reasoning import FakeArchitectureReasoner
from knowledge_portal.infrastructure.architecture.requirement_reading import (
    FakeRequirementReader,
    StructuredRequirementReader,
)
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.architecture.verdict_reasoning import (
    FakeVerdictReasoner,
    StructuredVerdictReasoner,
)
from knowledge_portal.infrastructure.architecture.yaml_knowledge import (
    YamlArchitectureKnowledge,
    default_knowledge_path,
)
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_organisation import (
    InMemoryOrganisationRepository,
)
from knowledge_portal.interfaces.api.container import Container, build_container
from knowledge_portal.interfaces.api.main import create_app
from tests.conftest import FAKE_PROVIDER_SETTINGS

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
NOW = datetime(2026, 10, 10, tzinfo=UTC)
BPP = "business-pro-plus"


@dataclass(frozen=True)
class _World:
    release: ArchitectureKnowledge
    manage: ManageArchitectureKnowledge
    index: InMemoryEvidenceIndex
    repository: InMemoryArchitectureKnowledgeRepository
    organisation: InMemoryOrganisationRepository

    def assessor(self, reasoner: Any = None) -> AssessRequirement:
        return AssessRequirement(
            self.repository,
            self.index,
            FakeRequirementReader(),
            reasoner or FakeVerdictReasoner(),
            self.organisation,
        )

    def assess(self, text: str, reasoner: Any = None) -> ArchitectureAssessment:
        return self.assessor(reasoner).assess(AssessmentQuery((text,), release_id=self.release.id))


@pytest.fixture(scope="module")
def world() -> _World:
    clock = FixedClock(NOW)
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    index = InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer())
    manage = ManageArchitectureKnowledge(repository, CatalogueFileAdapter(), index, 10_000_000)
    build = BuildArchitectureIndex(
        manage,
        index,
        InMemoryDocumentStorage(),
        LocatedDocumentExtractor(SafeDocumentTextExtractor()),
        FakeWordTokenizer(),
    )
    release = PublishCatalogueForEvaluation(manage, build, clock).execute(
        CATALOGUE.name, CATALOGUE.read_bytes()
    )
    organisation = InMemoryOrganisationRepository(clock)
    seeded = OrganisationCatalogue(
        people=(Person("amal", "Amal Saeed"),),
        value_streams=(ValueStream("vs-smb", "SMB fixed"),),
        products=(Product("prod-bpp", "vs-smb", "Business Pro Plus", offering_ids=(BPP,)),),
        squads=(
            Squad(
                "sq-field",
                "Field squad",
                "vs-smb",
                resources=(
                    SquadResource("wfms", SquadRole.DEVELOPER, "amal", "cap-field-installation"),
                    # An open seat on CWOM: a known staffing gap.
                    SquadResource("cwom", SquadRole.TESTER),
                ),
            ),
        ),
    )
    organisation.change(lambda _: seeded, "test", "seed", "organisation")
    return _World(release, manage, index, repository, organisation)


def _system(assessment: ArchitectureAssessment, system_id: str) -> Any:
    return next(item for item in assessment.systems if item.id == system_id)


def test_a_requirement_on_an_offering_gets_its_verdict_systems_paths_and_owners(
    world: _World,
) -> None:
    result = world.assess(
        "Let Business Pro Plus customers add a second FortiAP as an add-on from B2B Web. "
        "A technician visit installs it."
    )

    assert result.verdict is ProductVerdict.CHANGE_EXISTING_OFFERING
    assert result.rule_verdict is result.verdict and result.offering_id == BPP
    linked = {item.concept_id for facet in result.facets for item in facet.concepts}
    assert linked == {"cap-wifi-access", "cap-field-installation"}
    assert all(item.covered for item in result.coverage)
    # The access point component requires Wi-Fi access; CWOM provisions it.
    cwom = _system(result, "cwom")
    assert cwom.role is SystemRole.PRIMARY and cwom.change_type is ChangeType.MODIFY
    assert [step.kind for step in cwom.paths[0]] == [
        PathKind.FACET,
        PathKind.CONCEPT,
        PathKind.OFFERING,
        PathKind.COMPONENT,
        PathKind.SYSTEM,
    ]
    assert [step.id for step in cwom.paths[0][1:]] == ["cap-wifi-access", BPP, "ap", "cwom"]
    # WFMS realises field installation through a capability of its own.
    wfms = _system(result, "wfms")
    assert any(
        [step.id for step in path[1:]] == ["cap-field-installation", "wfms"] for path in wfms.paths
    )
    # The named channel's entry system; the other self-service channel stays out.
    assert _system(result, "b2b-web").role is SystemRole.CHANNEL
    assert "smb-app" not in {item.id for item in result.systems}
    # Every quote is in the passage it cites.
    assert result.citations
    for citation in result.citations:
        assert (
            citation.quote
            in world.manage.published_evidence(result.knowledge_version, citation.chunk_id).text
        )
    # Owners per impacted capability, with the seat scoped to it, and the staffing gaps.
    owned = {(item.concept_id, item.system_id): item for item in result.owners}
    field = owned[("cap-field-installation", "wfms")]
    assert [(seat.person_name, seat.scoped) for seat in field.seats] == [("Amal Saeed", True)]
    assert [item.name for item in field.value_streams] == ["SMB fixed"]
    staffing = {(item.concept_id, item.system_id) for item in result.gaps}
    assert ("cap-wifi-access", "cwom") in staffing
    assert ("cap-field-installation", "wfms") not in staffing
    assert [item.id for item in result.offering_products] == ["prod-bpp"]
    assert result.proposal is not None and result.proposal.offering_id == BPP
    assert {item.component_id for item in result.proposal.components} == {"ap"}
    assert result.questions == ()


class _Untouched:
    model = "never-called"

    def decide(self, context: VerdictContext) -> VerdictDecision:
        raise AssertionError("A vague requirement is never weighed.")


def test_add_a_new_device_returns_questions_not_a_verdict(world: _World) -> None:
    result = world.assess("Add a new device.", reasoner=_Untouched())

    assert result.verdict is None and result.rule_verdict is None
    assert result.systems == () and result.proposal is None
    offering, capability = result.questions[:2]
    assert offering.facet is FacetKind.OFFERING
    assert [(item.label, item.id) for item in offering.options] == [
        ("Business Pro Plus", BPP),
        ("A new offering", None),
    ]
    assert capability.facet is FacetKind.NEED
    concepts = {item.id for item in world.release.business_capabilities}
    assert capability.options and {item.id for item in capability.options} <= concepts


def test_a_capability_realised_nowhere_is_a_new_product_line_with_a_gap(world: _World) -> None:
    result = world.assess("Cloud video surveillance for shops, with cameras installed on site.")

    assert result.verdict is ProductVerdict.NEW_PRODUCT_LINE
    gaps = [item for item in result.gaps if item.kind is GapKind.CAPABILITY]
    assert [item.concept_id for item in gaps] == ["cap-video-surveillance"]
    assert result.proposal is not None and result.proposal.summary.startswith("A new product line")


def test_a_new_speed_is_a_new_plan_and_a_left_out_component_a_new_offering(
    world: _World,
) -> None:
    plan = world.assess("Launch a 2 Gbps Business Pro Plus speed tier.")
    assert plan.verdict is ProductVerdict.NEW_PLAN
    assert plan.proposal is not None and plan.proposal.new_values == ("2 Gbps",)
    assert all(item.change_type is ChangeType.CONFIGURE for item in plan.systems)
    # The 800 Mbps tier exists, so naming it changes the offering.
    existing = world.assess("For the 800 Mbps Business Pro Plus tier, suggest the Fortinet 120G.")
    assert existing.verdict is ProductVerdict.CHANGE_EXISTING_OFFERING

    lighter = world.assess(
        "A lighter bundle with a managed access point, without SD-WAN or the firewall."
    )
    assert lighter.verdict is ProductVerdict.NEW_OFFERING_IN_FAMILY
    assert lighter.proposal is not None
    assert lighter.proposal.portfolio_node_id == "business-internet"
    linked = {item.concept_id for facet in lighter.facets for item in facet.concepts}
    assert "cap-sdwan" not in linked


def test_the_verdict_rules_of_thumb() -> None:
    wifi = frozenset({"cap-wifi"})

    def fit(**changes: Any) -> OfferingFit:
        return replace(OfferingFit("bpp", False, composed=wifi), **changes)

    assert decide_verdict(frozenset(), frozenset(), None).verdict is None
    assert (
        decide_verdict(wifi, frozenset(), fit()).verdict is ProductVerdict.CHANGE_EXISTING_OFFERING
    )
    assert decide_verdict(wifi, frozenset(), fit(), new_family=True).verdict is (
        ProductVerdict.NEW_PRODUCT_LINE
    )
    assert decide_verdict(wifi, wifi, fit(composed=frozenset())).verdict is (
        ProductVerdict.NEW_PRODUCT_LINE
    )
    assert decide_verdict(wifi, frozenset(), None).verdict is ProductVerdict.NEW_OFFERING_IN_FAMILY
    for changed in ({"other_segment": True}, {"excluded": ("sdwan",)}):
        assert decide_verdict(wifi, frozenset(), fit(**changed)).verdict is (
            ProductVerdict.NEW_OFFERING_IN_FAMILY
        )
    both = wifi | {"cap-billing"}
    assert decide_verdict(both, frozenset(), fit()).verdict is ProductVerdict.NEW_OFFERING_IN_FAMILY
    # Named, the offering keeps the verdict; what it does not cover is reported, not forced.
    named = decide_verdict(both, frozenset({"cap-billing"}), fit(named=True))
    assert named.verdict is ProductVerdict.CHANGE_EXISTING_OFFERING and "gaps" in named.reason
    assert decide_verdict(frozenset(), frozenset(), fit(named=True)).offering_id == "bpp"
    assert decide_verdict(wifi, frozenset(), fit(new_values=("2 Gbps",))).verdict is (
        ProductVerdict.NEW_PLAN
    )


def test_change_types_and_speeds_are_read_from_the_words() -> None:
    assert change_type_in("Retire the old portal.") is ChangeType.RETIRE
    assert change_type_in("A discounted price tier.") is ChangeType.CONFIGURE
    assert change_type_in("Let customers add a FortiAP.") is ChangeType.MODIFY
    assert speeds_in("2 Gbps or 500 Mbps") == (2000.0, 2048.0, 500.0)


def test_a_concept_reaches_systems_by_their_own_capability_and_by_components(
    world: _World,
) -> None:
    billing = {item.system_id: item.steps for item in realisers(world.release, "cap-billing")}
    assert billing == {
        "bscs": (
            PathStep(PathKind.CONCEPT, "cap-billing", "Billing and charging"),
            PathStep(PathKind.SYSTEM, "bscs", "BSCS"),
        )
    }
    backup = {item.system_id for item in realisers(world.release, "cap-mobile-backup-access")}
    assert backup == {"veda", "in"}
    assert realisers(world.release, "cap-video-surveillance") == ()


def test_a_short_system_name_is_named_only_as_written(world: _World) -> None:
    named = {item.id for item in named_systems(world.release, "Throttle Backup 5G in IN.")}
    assert "in" in named
    assert "in" not in {item.id for item in named_systems(world.release, "Pay in the app.")}


def test_per_item_mapping_explains_its_systems_with_role_change_type_and_path(
    world: _World,
) -> None:
    knowledge = ResolveArchitectureKnowledge(
        world.repository,
        world.index,
        FakeArchitectureReasoner(),
        YamlArchitectureKnowledge(default_knowledge_path()),
        world.organisation,
    )

    match = knowledge.match(
        ArchitectureQuery(
            ("Throttle Backup 5G in IN and vEDA from the SMB App.",), release_id=world.release.id
        )
    )

    systems = {item.id: item for item in match.systems}
    assert systems["in"].role is SystemRole.PRIMARY
    assert systems["in"].change_type is ChangeType.MODIFY
    assert any(path[0].id == "cap-mobile-backup-access" for path in systems["in"].paths)
    assert systems["smb-app"].role is SystemRole.CHANNEL


class _Client:
    model = "stub-model"

    def __init__(self, *outputs: Any) -> None:
        self.outputs = list(outputs)

    def parse(self, **_: Any) -> Any:
        return self.outputs.pop(0)


TERMS = CatalogueTerms(offerings=(CatalogueTerm(BPP, ("Business Pro Plus",)),))
TEXT = "Let Business Pro Plus customers add a FortiAP."


def _facets(**facet: Any) -> Any:
    from knowledge_portal.infrastructure.architecture import requirement_reading

    item = {"kind": "need", "text": "add a FortiAP", "quote": "add a FortiAP", "ref_id": None}
    return requirement_reading._Facets.model_validate({"facets": [{**item, **facet}]})


@pytest.mark.parametrize(
    ("facet", "message"),
    [
        ({"quote": "add two FortiAPs"}, "invented a quote"),
        ({"kind": "offering", "ref_id": "business-pro"}, "invented a offering id"),
        ({"kind": "change_type", "ref_id": "rewrite"}, "invented a change type"),
    ],
)
def test_the_reader_keeps_to_the_requirement_s_words_and_the_release_s_ids(
    facet: dict[str, Any], message: str
) -> None:
    reader = StructuredRequirementReader(_Client(_facets(**facet)))

    with pytest.raises(ArchitectureEvidenceError, match=message):
        reader.facets(TEXT, TERMS)


def test_the_reader_s_facets_and_picks_pass_when_they_keep_to_the_lists() -> None:
    from knowledge_portal.infrastructure.architecture import requirement_reading

    picks = requirement_reading._Picks.model_validate(
        {"picks": [{"need": 0, "concept_id": "cap-wifi-access", "weak": True}]}
    )
    off = requirement_reading._Picks.model_validate(
        {"picks": [{"need": 0, "concept_id": "cap-billing", "weak": False}]}
    )
    reader = StructuredRequirementReader(
        _Client(_facets(kind="offering", ref_id=BPP, quote="business pro plus"), picks, off)
    )
    (offering,) = reader.facets(TEXT, TERMS)
    assert offering.ref_id == BPP
    need = Facet(FacetKind.NEED, "add a FortiAP", "add a FortiAP")
    shortlist = (
        (
            ConceptOption(
                "cap-wifi-access",
                "Managed Wi-Fi access points",
                ("Wi-Fi",),
                "Service › Managed Wi-Fi access points",
                ConceptBasis.INDEX,
            ),
        ),
    )
    (pick,) = reader.pick((need,), shortlist)
    assert pick.concept_id == "cap-wifi-access" and pick.weak
    with pytest.raises(ArchitectureEvidenceError, match="off the shortlist"):
        reader.pick((need,), shortlist)


def _context(world: _World) -> VerdictContext:
    chunk = world.index.system_chunk(world.release.index_id or "", "cwom")
    assert chunk is not None
    return VerdictContext(
        TEXT,
        world.release,
        (),
        VerdictCall(ProductVerdict.CHANGE_EXISTING_OFFERING, BPP, "Covered."),
        (SystemCandidate("cwom", "CWOM", SystemRole.PRIMARY),),
        (chunk,),
    )


def _decision(chunk: EvidenceChunk, **changes: Any) -> Any:
    from knowledge_portal.infrastructure.architecture import verdict_reasoning

    system = {
        "system_id": "cwom",
        "change_type": "modify",
        "citations": [{"id": chunk.id, "quote": chunk.text[:20]}],
    }
    decision = {
        "verdict": "change_existing_offering",
        "offering_id": BPP,
        "reason": "One offering covers it.",
        "systems": [system],
        "uncertainty": None,
    }
    system.update(changes.pop("system", {}))
    return verdict_reasoning._Decision.model_validate({**decision, **changes})


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"system": {"system_id": "cwom-2"}}, "invented a system id"),
        ({"system": {"citations": []}}, "uncited"),
        ({"system": {"citations": [{"id": "nowhere", "quote": "x"}]}}, "invented a citation"),
        ({"system": {"citations": [{"id": "CHUNK", "quote": "not in it"}]}}, "invented a quote"),
        ({"offering_id": "business-pro"}, "outside the release"),
    ],
)
def test_the_reasoner_keeps_to_the_release_and_quotes_its_evidence(
    world: _World, changes: dict[str, Any], message: str
) -> None:
    context = _context(world)
    chunk = context.evidence[0]
    citations = changes.get("system", {}).get("citations")
    if citations and citations[0]["id"] == "CHUNK":
        citations[0]["id"] = chunk.id
    reasoner = StructuredVerdictReasoner(
        _Client(_decision(chunk, **changes)),
        max_input_tokens=None,
    )

    with pytest.raises(ArchitectureEvidenceError, match=message):
        reasoner.decide(context)


def test_the_reasoner_s_checked_answer_is_used(world: _World) -> None:
    context = _context(world)
    chunk = context.evidence[0]
    reasoner = StructuredVerdictReasoner(
        _Client(_decision(chunk)),
        max_input_tokens=None,
    )

    decision = reasoner.decide(context)

    assert decision.verdict is ProductVerdict.CHANGE_EXISTING_OFFERING
    assert decision.offering_id == BPP
    assert [(item.system_id, item.change_type) for item in decision.systems] == [
        ("cwom", ChangeType.MODIFY)
    ]


TOKEN = "r" * 40
REQUIREMENTS = {"Authorization": f"Bearer {TOKEN}"}


class _Fixed:
    def __init__(self, answer: ArchitectureAssessment) -> None:
        self.answer = answer
        self.queries: list[AssessmentQuery] = []

    def assess(self, query: AssessmentQuery) -> ArchitectureAssessment:
        self.queries.append(query)
        return self.answer


@pytest.fixture
def served(world: _World) -> Iterator[tuple[_Fixed, TestClient]]:
    answer = world.assess("Let Business Pro Plus customers add a FortiAP from B2B Web.")
    fixed = _Fixed(answer)
    container: Container = replace(
        build_container(replace(FAKE_PROVIDER_SETTINGS, requirement_service_token=TOKEN)),
        requirement_assessment=fixed,
    )
    with TestClient(create_app(lambda: container)) as client:
        yield fixed, client


def test_requirement_work_assesses_through_the_internal_route(
    served: tuple[_Fixed, TestClient],
) -> None:
    fixed, client = served
    body = {"text": ["Add a FortiAP."], "release_id": "r1"}

    assert client.post("/internal/architecture/assess", json=body).status_code == 401
    answered = client.post("/internal/architecture/assess", json=body, headers=REQUIREMENTS)

    assert answered.status_code == 200, answered.text
    assert fixed.queries == [AssessmentQuery(("Add a FortiAP.",), release_id="r1")]
    assert answered.json() == TypeAdapter(ArchitectureAssessment).dump_python(
        fixed.answer, mode="json"
    )
    assert answered.json()["verdict"] == "change_existing_offering"
