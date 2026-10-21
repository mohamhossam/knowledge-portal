"""Release comparison covers every reviewed field, and a draft keeps its base."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeReleaseStatus,
)
from knowledge_portal.domain.architecture.products import SourceConfidence
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import (
    knowledge_from_yaml,
    seed_knowledge,
)
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))


def _committed() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def _changed_fields(
    base: ArchitectureKnowledge,
    draft: ArchitectureKnowledge,
    item: ChangedItem,
    key: str,
) -> tuple[str, ...]:
    found = [
        change
        for change in diff_releases(base, draft).changes
        if change.item is item and change.change is ChangeKind.CHANGED and change.key == key
    ]
    assert len(found) == 1, found
    return found[0].fields


def test_a_system_profile_change_is_visible_in_the_diff() -> None:
    base = _committed()
    system = base.systems[0]
    draft = base.updated(
        systems=(
            replace(
                system,
                owner="New custodians",
                external=not system.external,
                roadmap="Replace by 2027",
                placement_from="SMB reference v1.0 · §1 System Directory",
                placement_reason="Moved for the review",
                confidence=SourceConfidence.INFERRED,
                source="SMB reference v1.0 · §9",
            ),
            *base.systems[1:],
        )
    )

    fields = _changed_fields(base, draft, ChangedItem.SYSTEM, system.id)
    for field in ("owner", "external", "roadmap", "placement", "confidence", "source"):
        assert field in fields, field


def test_an_offering_portfolio_move_is_visible_in_the_diff() -> None:
    base = _committed()
    offering = base.products[0]
    other_node = next(
        (node for node in base.portfolio if node.id != offering.portfolio_node_id), None
    )
    assert other_node is not None
    draft = base.updated(
        products=(replace(offering, portfolio_node_id=other_node.id), *base.products[1:])
    )

    fields = _changed_fields(base, draft, ChangedItem.PRODUCT, offering.id)
    assert "portfolio_node_id" in fields


def test_a_portfolio_node_rename_is_visible_in_the_diff() -> None:
    base = _committed()
    node = next(item for item in base.portfolio if item.parent_id is not None)
    draft = base.updated(
        portfolio=tuple(
            replace(item, name="Renamed family") if item.id == node.id else item
            for item in base.portfolio
        )
    )

    fields = _changed_fields(base, draft, ChangedItem.PORTFOLIO_NODE, node.id)
    assert fields == ("name",)


def test_a_draft_diffs_against_its_recorded_base_not_the_active_release() -> None:
    seed = seed_knowledge()
    repository = InMemoryArchitectureKnowledgeRepository(seed)
    manage = ManageArchitectureKnowledge(
        repository,
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
    )
    draft = manage.create_draft(MAINTAINER, "Kept base")
    assert draft.base_release_id == seed.id

    # Another release becomes active while the draft is open...
    later = replace(seed, id="later-release", name="Later", status=KnowledgeReleaseStatus.PUBLISHED)
    repository.save(later, None, "maintainer", "import")
    repository.activate(later.id, "maintainer", "test")

    # ...and the draft's review diff still reads against the base it was cut from.
    diff = manage.changes(draft.id, MAINTAINER)
    assert diff.base_release_id == seed.id
    assert diff.empty

    # A published release still compares against the one in service by default.
    against_active = manage.changes(seed.id, MAINTAINER)
    assert against_active.base_release_id == later.id
