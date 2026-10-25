"""Retiring a system, concept or term keeps it readable and out of every match (ADR-0121)."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.requirement_assessment import AssessmentQuery
from knowledge_portal.application.use_cases.architecture_evidence import named_systems
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.assess_requirement import AssessRequirement
from knowledge_portal.application.use_cases.index_links import concept_scheme
from knowledge_portal.application.use_cases.mapping_evaluation import (
    PublishCatalogueForEvaluation,
)
from knowledge_portal.application.use_cases.resolve_architecture_knowledge import (
    ResolveArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.candidates import (
    find_concept,
    find_system,
    retired_names,
    system_named,
)
from knowledge_portal.domain.architecture.concepts import labels_in
from knowledge_portal.domain.architecture.deprecation import in_service, successor
from knowledge_portal.domain.architecture.diff import diff_releases
from knowledge_portal.domain.architecture.impact_graph import realisers
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.vocabularies import (
    VocabularyScheme,
    VocabularyTerm,
    find_term,
    term_named,
)
from knowledge_portal.domain.organisation.catalogue import (
    OrganisationCatalogue,
    Product,
    ReleaseReferences,
    Squad,
    SquadResource,
    SquadRole,
    SystemSuccessor,
    ValueStream,
    check_references,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.passage_reranking import LexicalPassageReranker
from knowledge_portal.infrastructure.architecture.reasoning import FakeArchitectureReasoner
from knowledge_portal.infrastructure.architecture.requirement_reading import FakeRequirementReader
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.architecture.verdict_reasoning import FakeVerdictReasoner
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_organisation import (
    InMemoryOrganisationRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_precedents import InMemoryPrecedents
from tests.catalogue_seed import seeded_repository

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()
NOW = datetime(2026, 10, 21, tzinfo=UTC)
WIFI = "cap-wifi-access"
FORTIAP = (
    "Let Business Pro Plus customers add a second FortiAP as an add-on from B2B Web. "
    "A technician visit installs it."
)


def _catalogue() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def _retired(release: ArchitectureKnowledge) -> ArchitectureKnowledge:
    """CWOM retired for good, BCRM replaced by Netcracker CSRD, Wi-Fi access retired."""
    return replace(
        release,
        systems=tuple(
            replace(item, deprecated=True)
            if item.id == "cwom"
            else replace(item, replaced_by="nc-csrd")
            if item.id == "bcrm"
            else item
            for item in release.systems
        ),
        business_capabilities=tuple(
            replace(item, deprecated=True) if item.id == WIFI else item
            for item in release.business_capabilities
        ),
    )


# The model's rules.


def test_naming_a_successor_retires_the_entity() -> None:
    assert SystemDefinition("old", "Old", replaced_by="new").deprecated
    assert not SystemDefinition("new", "New").deprecated
    with pytest.raises(InvalidKnowledgeError, match="cannot replace itself"):
        SystemDefinition("old", "Old", replaced_by="old")


def test_a_successor_is_of_the_same_kind_in_the_release_and_no_chain_loops() -> None:
    release = _catalogue()

    def systems(*changes: tuple[str, str]) -> ArchitectureKnowledge:
        swap = dict(changes)
        return replace(
            release,
            systems=tuple(
                replace(item, replaced_by=swap[item.id]) if item.id in swap else item
                for item in release.systems
            ),
        )

    with pytest.raises(InvalidKnowledgeError, match="'gone', which is not in the catalogue"):
        systems(("bcrm", "gone"))
    with pytest.raises(InvalidKnowledgeError, match="ends up replaced by itself"):
        systems(("bcrm", "dcrm"), ("dcrm", "bcrm"))
    entity, process = (
        next(item for item in release.vocabulary if item.scheme is scheme)
        for scheme in (VocabularyScheme.INFORMATION_ENTITY, VocabularyScheme.ETOM_PROCESS)
    )
    with pytest.raises(InvalidKnowledgeError, match="only be replaced by one of its own kind"):
        replace(
            release,
            vocabulary=tuple(
                replace(item, replaced_by=process.id) if item.id == entity.id else item
                for item in release.vocabulary
            ),
        )
    # A chain is fine, and forwards to its last link in service.
    chained = systems(("bcrm", "dcrm"), ("dcrm", "nc-crm"))
    assert successor(chained.systems, "bcrm") == next(
        item for item in chained.systems if item.id == "nc-crm"
    )


def test_the_diff_reports_retiring_and_replacing() -> None:
    release = _catalogue()
    retired = _retired(release)

    changes = {(change.key, change.fields) for change in diff_releases(release, retired).changes}

    assert ("cwom", ("deprecated",)) in changes
    assert ("bcrm", ("deprecated", "replaced_by")) in changes
    assert (WIFI, ("deprecated",)) in changes


def test_lookups_forward_to_a_successor_and_match_nothing_retired_for_good() -> None:
    retired = _retired(_catalogue())

    assert find_system(retired, "BCRM").id == "nc-csrd"  # type: ignore[union-attr]
    assert find_system(retired, "CWOM") is None
    # Whether a name is taken still sees every system.
    assert system_named(retired, "CWOM").id == "cwom"  # type: ignore[union-attr]
    concept = next(item for item in retired.business_capabilities if item.id == WIFI)
    assert find_concept(retired, concept.pref_label) is None
    assert labels_in(f"Add {concept.pref_label} to the offer", retired.business_capabilities) == ()
    assert retired_names(retired)["nc-csrd"][0] == "BCRM"
    serving = {item.id for item in in_service(retired.systems)}
    assert "nc-csrd" in serving and {"bcrm", "cwom"}.isdisjoint(serving)


def test_a_term_lookup_forwards_within_its_vocabulary() -> None:
    old = VocabularyTerm(
        "e-old", VocabularyScheme.INFORMATION_ENTITY, "Account", replaced_by="e-new"
    )
    new = VocabularyTerm("e-new", VocabularyScheme.INFORMATION_ENTITY, "Billing account")

    assert find_term((old, new), VocabularyScheme.INFORMATION_ENTITY, "Account") == new
    assert term_named((old, new), VocabularyScheme.INFORMATION_ENTITY, "Account") == old


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_carries_retirement(file_format: CatalogueFileFormat) -> None:
    retired = _retired(_catalogue())
    term = retired.vocabulary[1]
    retired = replace(
        retired,
        vocabulary=tuple(
            replace(item, replaced_by=term.id) if item is retired.vocabulary[0] else item
            for item in retired.vocabulary
        ),
    )

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, retired))

    def lifecycle(items: tuple[object, ...]) -> set[tuple[str, bool, str | None]]:
        return {
            (item.id, item.deprecated, item.replaced_by)  # type: ignore[attr-defined]
            for item in items
            if item.deprecated  # type: ignore[attr-defined]
        }

    for field in ("systems", "business_capabilities", "vocabulary"):
        assert lifecycle(getattr(read, field)) == lifecycle(getattr(retired, field))
    assert lifecycle(read.systems) == {("cwom", True, None), ("bcrm", True, "nc-csrd")}


# The sweep: nothing that chooses systems or concepts chooses a retired one.


@dataclass(frozen=True)
class _Worlds:
    base: ArchitectureKnowledge
    retired: ArchitectureKnowledge
    repository: InMemoryArchitectureKnowledgeRepository
    index: InMemoryEvidenceIndex
    organisation: InMemoryOrganisationRepository

    def assess(self, release: ArchitectureKnowledge, text: str) -> object:
        return AssessRequirement(
            self.repository,
            self.index,
            FakeRequirementReader(),
            FakeVerdictReasoner(),
            self.organisation,
            LexicalPassageReranker(),
            InMemoryPrecedents(),
        ).assess(AssessmentQuery((text,), release_id=release.id))

    def match(self, release: ArchitectureKnowledge, query: ArchitectureQuery) -> object:
        return ResolveArchitectureKnowledge(
            self.repository,
            self.index,
            FakeArchitectureReasoner(),
            self.organisation,
        ).match(replace(query, release_id=release.id))


@pytest.fixture(scope="module")
def worlds() -> _Worlds:
    clock = FixedClock(NOW)
    repository = seeded_repository()
    index = InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer())
    manage = ManageArchitectureKnowledge(
        repository, ADAPTER, index, 10_000_000, OfflineDocumentScanner()
    )
    build = BuildArchitectureIndex(
        manage,
        index,
        InMemoryDocumentStorage(),
        LocatedDocumentExtractor(SafeDocumentTextExtractor()),
        FakeWordTokenizer(),
    )
    publish = PublishCatalogueForEvaluation(manage, build, clock)
    base = publish.execute(CATALOGUE.name, CATALOGUE.read_bytes())
    retired = publish.execute(
        "smb-retired.yaml", ADAPTER.write(CatalogueFileFormat.YAML, _retired(_catalogue()))
    )
    return _Worlds(base, retired, repository, index, InMemoryOrganisationRepository(clock))


def _ids(result: object) -> set[str]:
    return {item.id for item in result.systems}  # type: ignore[attr-defined]


def test_an_assessment_never_selects_a_retired_system_or_links_a_retired_concept(
    worlds: _Worlds,
) -> None:
    before = worlds.assess(worlds.base, FORTIAP)
    after = worlds.assess(worlds.retired, FORTIAP + " CWOM provisions it.")

    assert "cwom" in _ids(before)
    linked = {
        item.concept_id
        for facet in after.facets  # type: ignore[attr-defined]
        for item in facet.concepts
    }
    assert "cwom" not in _ids(after)
    assert WIFI not in linked
    # CWOM realises fixed order management; retired, it realises nothing.
    assert any(
        item.system_id == "cwom" for item in realisers(worlds.base, "cap-fixed-order-management")
    )
    assert not any(
        item.system_id == "cwom" for item in realisers(worlds.retired, "cap-fixed-order-management")
    )


def test_matching_skips_a_retired_system_and_forwards_a_replaced_one(worlds: _Worlds) -> None:
    query = ArchitectureQuery(
        ("Change the CWOM fulfilment flow and the BCRM quote screen.",),
        declared_systems=("CWOM", "BCRM"),
    )

    before = worlds.match(worlds.base, query)
    after = worlds.match(worlds.retired, query)

    assert {"cwom", "bcrm"} <= _ids(before)
    assert {"cwom", "bcrm"}.isdisjoint(_ids(after))
    assert "nc-csrd" in _ids(after)
    assert {item.id for item in named_systems(worlds.retired, "CWOM and BCRM")} == set()


def test_the_index_and_the_models_are_offered_concepts_in_service_only(worlds: _Worlds) -> None:
    assert WIFI in {item.concept_id for item in concept_scheme(worlds.base)}
    assert WIFI not in {item.concept_id for item in concept_scheme(worlds.retired)}


# The squad catalogue follows a replacement instead of calling it gone.


def test_a_seat_on_a_replaced_system_is_pointed_at_its_successor() -> None:
    catalogue = OrganisationCatalogue(
        value_streams=(ValueStream("vs", "SMB"),),
        products=(Product("p", "vs", "Business Pro Plus", system_ids=("bcrm", "cwom")),),
        squads=(
            Squad(
                "sales",
                "Sales",
                "vs",
                resources=(
                    SquadResource("bcrm", SquadRole.SYSTEM_CONTACT),
                    SquadResource("cwom", SquadRole.SYSTEM_CONTACT),
                ),
            ),
        ),
    )
    release = ReleaseReferences(
        systems={"nc-csrd": set()},
        offering_systems={},
        portfolio_node_ids=set(),
        successors={"bcrm": "nc-csrd"},
    )

    squad, product = check_references(catalogue, release)

    assert squad.retired_system_ids == ("cwom",)
    assert squad.replaced_systems == (SystemSuccessor("bcrm", "nc-csrd"),)
    assert product.retired_system_ids == ("cwom",)
    assert product.replaced_systems == (SystemSuccessor("bcrm", "nc-csrd"),)
