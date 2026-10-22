"""The explorer reads its taxonomy as data, not from the frontend (recommendation 10).

The explorer response carries the vocabulary, the curated vocabularies, the business areas
and the interface records. What the frontend hard-coded is stored on the entities: roles
rank from strongest (a term's ``rank``), and the landscape map's bus, the layer above it and
its side layers (a top landscape domain's ``layout``).
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.diff import ChangedItem, diff_releases
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    LandscapeDomain,
    LandscapeLayout,
)
from knowledge_portal.domain.architecture.vocabularies import (
    VocabularyScheme,
    VocabularyTerm,
    check_vocabulary,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    ExplorerReleaseResponse,
    LandscapeDomainSchema,
    VocabularyTermSchema,
)

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()
ROLE = VocabularyScheme.RESPONSIBILITY_ROLE
# The order the explorer's impact lens used to keep in its own code.
STRONGEST_FIRST = (
    "orchestrate",
    "capture",
    "activate",
    "field",
    "validate",
    "customer-data",
    "catalog",
    "logistics",
    "bill",
    "track",
    "notify",
    "record",
)


def _catalogue() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def test_a_rank_is_a_place_in_its_own_vocabulary() -> None:
    with pytest.raises(InvalidKnowledgeError, match="a whole number from 1"):
        VocabularyTerm("role-x", ROLE, "X", rank=0)
    with pytest.raises(InvalidKnowledgeError, match="both rank 1 among the role terms"):
        check_vocabulary(
            (
                VocabularyTerm("role-a", ROLE, "A", rank=1),
                VocabularyTerm("role-b", ROLE, "B", rank=1),
            )
        )
    # The same rank in another vocabulary is another place.
    check_vocabulary(
        (
            VocabularyTerm("role-a", ROLE, "A", rank=1),
            VocabularyTerm("channel-a", VocabularyScheme.CHANNEL_KIND, "A", rank=1),
        )
    )


def test_the_committed_roles_rank_as_the_explorer_used_to_hard_code_them() -> None:
    roles = [item for item in _catalogue().vocabulary if item.scheme is ROLE]

    ranked = sorted(
        (item for item in roles if item.rank is not None), key=lambda item: item.rank or 0
    )

    assert tuple(item.id.removeprefix("role-") for item in ranked) == STRONGEST_FIRST
    # Roles the source added later rank after the ranked ones.
    assert {item.id for item in roles if item.rank is None} == {
        "role-configure",
        "role-authenticate",
        "role-suggest",
    }


def test_a_top_domain_names_its_place_on_the_map_once() -> None:
    release = _catalogue()
    layouts = {item.id: item.layout for item in release.landscape_domains if item.layout}
    assert layouts == {
        "customer": LandscapeLayout.ABOVE_BUS,
        "integration": LandscapeLayout.BUS,
        "engaged-party": LandscapeLayout.SIDE,
        "enterprise": LandscapeLayout.SIDE,
    }

    with pytest.raises(InvalidKnowledgeError, match="only a top landscape domain"):
        LandscapeDomain("customer.web", "Web", parent_id="customer", layout=LandscapeLayout.SIDE)
    with pytest.raises(InvalidKnowledgeError, match="a layout is one of"):
        LandscapeDomain("x", "X", layout="middle")  # type: ignore[arg-type]

    def placed(domain_id: str, layout: LandscapeLayout | None) -> ArchitectureKnowledge:
        return release.updated(
            landscape_domains=tuple(
                replace(item, layout=layout) if item.id == domain_id else item
                for item in release.landscape_domains
            )
        )

    with pytest.raises(InvalidKnowledgeError, match="One landscape domain is the bus"):
        placed("customer", LandscapeLayout.BUS)
    with pytest.raises(InvalidKnowledgeError, match="sits above a bus no domain is"):
        placed("integration", None)


@pytest.mark.parametrize(
    "file_format", [CatalogueFileFormat.YAML, CatalogueFileFormat.JSON, CatalogueFileFormat.XLSX]
)
def test_every_catalogue_file_format_keeps_ranks_and_layout(
    file_format: CatalogueFileFormat,
) -> None:
    release = _catalogue()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert {item.id: item.rank for item in content.vocabulary} == {
        item.id: item.rank for item in release.vocabulary
    }
    assert {item.id: item.layout for item in content.landscape_domains} == {
        item.id: item.layout for item in release.landscape_domains
    }


def test_the_version_diff_reports_a_new_rank_and_a_moved_layer() -> None:
    base = _catalogue()
    draft = base.updated(
        vocabulary=tuple(
            replace(item, rank=13) if item.id == "role-suggest" else item
            for item in base.vocabulary
        ),
        landscape_domains=tuple(
            replace(item, layout=None) if item.id == "engaged-party" else item
            for item in base.landscape_domains
        ),
    )

    changes = {(item.item, item.key): item.fields for item in diff_releases(base, draft).changes}

    assert changes[(ChangedItem.VOCABULARY_TERM, "role-suggest")] == ("rank",)
    assert changes[(ChangedItem.LANDSCAPE_DOMAIN, "engaged-party")] == ("layout",)


def test_the_explorer_reads_the_taxonomy_with_its_content() -> None:
    release = _catalogue()

    response = ExplorerReleaseResponse.from_domain(release)

    assert {item.id: item.rank for item in response.vocabulary} == {
        item.id: item.rank for item in release.vocabulary
    }
    assert [item.id for item in response.capability_domains] == [
        item.id for item in release.capability_domains
    ]
    assert [item.id for item in response.interfaces] == [item.id for item in release.interfaces]
    assert next(item for item in response.landscape_domains if item.id == "integration").layout == (
        LandscapeLayout.BUS
    )
    # Taxonomy, not curation: nothing says who accepted what.
    assert not any(item.accepted for item in response.vocabulary)


def test_the_api_carries_a_rank_and_a_layout_both_ways() -> None:
    term = VocabularyTerm("role-x", ROLE, "X", rank=3)
    domain = LandscapeDomain("integration", "Integration", layout=LandscapeLayout.BUS)

    assert VocabularyTermSchema.from_domain(term).to_domain() == term
    assert LandscapeDomainSchema.from_domain(domain).to_domain() == domain
