"""Connected systems: one catalogued relationship away from a mapped impact (ADR-0087)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.architecture_knowledge import ArchitectureQuery
from knowledge_portal.application.use_cases.resolve_architecture_knowledge import (
    ResolveArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.knowledge import SystemRelationship
from knowledge_portal.domain.architecture.neighbours import adjacent
from knowledge_portal.domain.organisation.catalogue import (
    OrganisationCatalogue,
    Squad,
    SquadResource,
    SquadRole,
    ValueStream,
)
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.reasoning import FakeArchitectureReasoner
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.architecture.yaml_knowledge import (
    YamlArchitectureKnowledge,
    default_knowledge_path,
)
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.in_memory_organisation import (
    InMemoryOrganisationRepository,
)

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _rel(source: str, target: str, text: str = "uses") -> SystemRelationship:
    return SystemRelationship(source, target, text)


def test_adjacent_walks_one_hop_both_ways_and_skips_selected_systems() -> None:
    result = adjacent(
        {"hub"},
        (
            _rel("hub", "billing"),
            _rel("portal", "hub"),
            _rel("billing", "ledger"),  # two hops away: not reached
            _rel("hub", "inside"),
            _rel("inside", "hub", "calls back"),
        ),
    )

    assert result.system_ids == ("inside", "billing", "portal")
    assert [(item.source_system_id, item.target_system_id) for item in result.dependencies] == [
        ("hub", "inside"),
        ("inside", "hub"),
        ("hub", "billing"),
        ("portal", "hub"),
    ]
    assert result.omitted == 0


def test_adjacent_ignores_relationships_inside_the_selection_and_caps_the_list() -> None:
    relationships = (
        _rel("a", "b"),
        *(_rel("a", f"n{index}") for index in range(5)),
    )

    result = adjacent({"a", "b"}, relationships, limit=3)

    assert result.system_ids == ("n0", "n1", "n2")
    assert result.omitted == 2
    assert all(
        "b" not in (item.source_system_id, item.target_system_id) for item in result.dependencies
    )
    assert adjacent({"a", "b"}, relationships, limit=3) == result
    assert adjacent(set(), relationships).system_ids == ()
    with pytest.raises(ValueError):
        adjacent({"a"}, relationships, limit=-1)


def _resolver(organisation: InMemoryOrganisationRepository) -> ResolveArchitectureKnowledge:
    return ResolveArchitectureKnowledge(
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        FakeArchitectureReasoner(),
        YamlArchitectureKnowledge(default_knowledge_path()),
        organisation,
    )


def test_resolver_lists_connected_systems_with_their_owners() -> None:
    organisation = InMemoryOrganisationRepository(FixedClock(NOW))
    organisation.change(
        lambda _: OrganisationCatalogue(
            value_streams=(ValueStream("retail", "Retail"),),
            squads=(
                Squad(
                    "care",
                    "Care squad",
                    "retail",
                    None,
                    (SquadResource("cbcm-crmgw", SquadRole.SYSTEM_CONTACT),),
                ),
            ),
        ),
        "amina",
        "seed",
        "all",
    )

    result = _resolver(organisation).match(
        ArchitectureQuery(text=("Capture back-office orders",), declared_systems=("DCRM",))
    )

    assert [item.id for item in result.systems] == ["dcrm"]
    assert result.dependencies == ()
    assert [item.id for item in result.adjacent_systems] == ["cbcm-crmgw"]
    assert [item.name for item in result.adjacent_systems[0].squads] == ["Care squad"]
    assert [
        (item.source_system_id, item.target_system_id) for item in result.adjacent_dependencies
    ] == [("dcrm", "cbcm-crmgw")]
