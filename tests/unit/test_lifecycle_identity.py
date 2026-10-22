"""What an id names now, followed one way by everything outside a version (recommendation 7).

An offering or journey is renamed (former ids, ADR-0124); a system, offering, portfolio node,
concept or term is retired with what replaces it (ADR-0121). ``identity.resolve`` follows
both, and the organisation catalogue, precedents and assessments read ids through it, so a
rename or a replacement forwards what names the old id instead of silently dropping it.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.precedents import PrecedentMatch
from knowledge_portal.application.use_cases.assessment_lanes import (
    catalogue_terms,
    precedent_candidates,
)
from knowledge_portal.application.use_cases.organisation_catalogue import _release_references
from knowledge_portal.domain.architecture.diff import ChangedItem, diff_releases
from knowledge_portal.domain.architecture.identity import (
    forwards,
    renamed_offering,
    resolve,
    resolved_id,
)
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.precedents import (
    Precedent,
    PrecedentDecision,
    PrecedentSystem,
)
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.verdicts import ProductVerdict
from knowledge_portal.domain.organisation.catalogue import (
    Forwarded,
    OrganisationCatalogue,
    Product,
    Squad,
    SquadResource,
    SquadRole,
    ValueStream,
    check_references,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()
NOW = datetime(2026, 10, 22, 9, 0, tzinfo=UTC)
BPP = "business-pro-plus"


def _catalogue() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def _renamed(release: ArchitectureKnowledge, new_id: str) -> ArchitectureKnowledge:
    """BPP under a new id, its journeys and conflicts moved with it (ADR-0124)."""
    products, journeys, conflicts = renamed_offering(
        release.products, release.journeys, release.conflicts, BPP, new_id
    )
    return release.updated(products=products, journeys=journeys, conflicts=conflicts)


def _with_successor_offering(release: ArchitectureKnowledge) -> ArchitectureKnowledge:
    """BPP renamed once (bpp-v1 before), then retired for a successor offering."""
    (bpp,) = release.products
    old = replace(bpp, former_ids=("bpp-v1",), deprecated=True, replaced_by="bpp-2027")
    successor = ProductOffering("bpp-2027", "Business Pro Plus 2027")
    return release.updated(products=(old, successor))


# The resolver ---------------------------------------------------------------------------------


def test_an_id_leads_to_what_names_it_now_through_renames_and_replacements() -> None:
    products = _with_successor_offering(_catalogue()).products

    assert resolved_id(products, "bpp-2027") == "bpp-2027"
    # Retired: its own id and its former id lead to the offering that replaced it.
    assert resolved_id(products, BPP) == "bpp-2027"
    assert resolved_id(products, "bpp-v1") == "bpp-2027"
    assert resolve(products, "nothing") is None
    assert resolve(products, None) is None


def test_a_retired_entity_with_nothing_in_its_place_leads_nowhere() -> None:
    nodes = (PortfolioNode("smb", "SMB", "Segment", deprecated=True),)

    assert resolve(nodes, "smb") is None
    assert forwards(nodes) == {}


def test_forwards_say_whether_an_old_id_is_the_same_thing_renamed() -> None:
    release = _catalogue()
    (bpp,) = release.products
    renamed = (replace(bpp, id="bpp", former_ids=(BPP,)),)

    assert forwards(renamed) == {BPP: ("bpp", True)}
    assert forwards(_with_successor_offering(release).products) == {
        BPP: ("bpp-2027", False),
        "bpp-v1": ("bpp-2027", False),
    }


# Offerings and portfolio nodes retire like systems ---------------------------------------------


def test_an_offering_or_node_names_a_successor_of_its_own_kind_that_the_version_holds() -> None:
    release = _catalogue()
    (bpp,) = release.products

    with pytest.raises(InvalidKnowledgeError, match="cannot replace itself"):
        replace(bpp, replaced_by=BPP)
    # Naming a successor retires it.
    assert replace(bpp, replaced_by="other").deprecated
    with pytest.raises(InvalidKnowledgeError, match="not in the catalogue"):
        release.updated(products=(replace(bpp, replaced_by="missing"),))
    smb = next(item for item in release.portfolio if item.id == "smb")
    with pytest.raises(InvalidKnowledgeError, match="not in the catalogue"):
        release.updated(
            portfolio=tuple(
                replace(item, replaced_by="gone") if item is smb else item
                for item in release.portfolio
            )
        )


def test_a_retired_offering_is_left_out_of_what_an_assessment_matches() -> None:
    terms = catalogue_terms(_with_successor_offering(_catalogue()))

    assert [item.id for item in terms.offerings] == ["bpp-2027"]
    assert all(not item.id.startswith(f"{BPP}/") for item in terms.order_types)


@pytest.mark.parametrize(
    "file_format", [CatalogueFileFormat.YAML, CatalogueFileFormat.JSON, CatalogueFileFormat.XLSX]
)
def test_every_catalogue_file_format_keeps_a_retirement(file_format: CatalogueFileFormat) -> None:
    release = _with_successor_offering(_catalogue())
    release = release.updated(
        portfolio=(
            *release.portfolio,
            PortfolioNode("old-segment", "Old segment", "Segment", replaced_by="smb"),
        )
    )

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    old = next(item for item in content.products if item.id == BPP)
    assert (old.deprecated, old.replaced_by, old.former_ids) == (True, "bpp-2027", ("bpp-v1",))
    node = next(item for item in content.portfolio if item.id == "old-segment")
    assert (node.deprecated, node.replaced_by) == (True, "smb")


def test_the_version_diff_says_an_offering_was_retired() -> None:
    base = _catalogue()
    draft = _with_successor_offering(base)

    change = next(
        item
        for item in diff_releases(base, draft).changes
        if item.item is ChangedItem.PRODUCT and item.key == BPP
    )

    assert {"deprecated", "replaced_by"} <= set(change.fields)


# Registers outside the version follow -----------------------------------------------------------


def _organisation(offering_id: str, node_id: str, concept_id: str) -> OrganisationCatalogue:
    return OrganisationCatalogue(
        value_streams=(ValueStream("vs", "SMB"),),
        products=(
            Product(
                "p",
                "vs",
                "Business Pro Plus",
                offering_ids=(offering_id,),
                portfolio_node_id=node_id,
            ),
        ),
        squads=(
            Squad(
                "sales",
                "Sales",
                "vs",
                resources=(
                    SquadResource("bcrm", SquadRole.SYSTEM_CONTACT, capability_id=concept_id),
                ),
            ),
        ),
    )


def test_a_product_naming_a_renamed_or_replaced_offering_or_node_is_told_where_it_went() -> None:
    release = _with_successor_offering(_catalogue())
    release = release.updated(
        portfolio=(
            *release.portfolio,
            PortfolioNode("old-segment", "Old segment", "Segment", replaced_by="smb"),
        )
    )
    bcrm_concept = next(
        item.concept_id
        for system in release.systems
        if system.id == "bcrm"
        for item in system.capabilities
        if item.concept_id
    )

    (product,) = check_references(
        _organisation("bpp-v1", "old-segment", bcrm_concept), _release_references(release)
    )

    assert product.subject == "product"
    # Not "no longer an offering": the old id leads to the offering in its place.
    assert product.retired_offering_ids == ()
    assert product.retired_portfolio_node_id is None
    assert product.forwarded == (
        Forwarded("offering", "bpp-v1", "bpp-2027", False),
        Forwarded("portfolio_node", "old-segment", "smb", False),
    )


def test_a_renamed_offering_is_the_same_one_and_still_sells_its_systems() -> None:
    references = _release_references(_renamed(_catalogue(), "bpp"))

    flags = check_references(_organisation(BPP, "smb", "unused"), references)
    product = next(item for item in flags if item.subject == "product")

    assert product.forwarded == (Forwarded("offering", BPP, "bpp", True),)
    # What it sells is read under the new id, so its systems are not reported missing for it.
    assert product.retired_offering_ids == ()


def test_a_seat_scoped_to_a_replaced_concept_moves_to_the_one_its_system_links_now() -> None:
    release = _catalogue()
    bcrm = next(item for item in release.systems if item.id == "bcrm")
    capability = next(item for item in bcrm.capabilities if item.concept_id)
    concept = next(
        item for item in release.business_capabilities if item.id == capability.concept_id
    )
    retired = replace(
        concept,
        id="cap-retired",
        pref_label="Retired capture",
        alt_labels=(),
        replaced_by=concept.id,
    )
    release = release.updated(business_capabilities=(*release.business_capabilities, retired))

    flags = check_references(_organisation(BPP, "smb", "cap-retired"), _release_references(release))

    squad = next(item for item in flags if item.subject == "squad")
    assert squad.retired_capabilities == ()
    assert squad.forwarded == (Forwarded("concept", "cap-retired", concept.id, False, "bcrm"),)


def _decided(number: int, system_id: str, offering_id: str, concept_id: str) -> PrecedentMatch:
    return PrecedentMatch(
        Precedent(
            id=f"p{number}",
            requirement_id=f"REQ-{number}",
            version=f"a{number}@1",
            release_id="smb-architecture",
            text="Add a field to the order capture form",
            suggested_verdict=ProductVerdict.CHANGE_EXISTING_OFFERING,
            verdict=ProductVerdict.CHANGE_EXISTING_OFFERING,
            decision=PrecedentDecision.ACCEPTED,
            offering_id=offering_id,
            concept_ids=(concept_id,),
            systems=(PrecedentSystem(system_id),),
            decided_at=NOW,
            received_at=NOW,
        ),
        0.9,
    )


def test_precedents_count_for_what_their_retired_system_and_renamed_offering_name_now() -> None:
    release = _renamed(_catalogue(), "bpp")
    capture = (
        next(item.concept_id for item in release.systems[0].capabilities if item.concept_id)
        or next(iter(release.business_capabilities)).id
    )
    successor = release.systems[0]
    retired = replace(successor, id="old-crm", name="Old CRM", aliases=(), replaced_by=successor.id)
    release = release.updated(systems=(*release.systems, retired))
    # Decided before the rename and the replacement: they name the old ids.
    decided = tuple(_decided(number, "old-crm", BPP, capture) for number in (1, 2))

    found = precedent_candidates(release, decided, "bpp", frozenset({capture}), ())

    assert [item.system_id for item in found] == [successor.id]
