"""Capability domains and portfolio nodes suggested from documents (ADR-0123)."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_extractor import (
    ExtractionRequest,
    ExtractionSegment,
)
from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, CapabilityDomain
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
from knowledge_portal.domain.architecture.sources import SourceConfidence
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.llm.catalogue_extraction import (
    ChangeOutput,
    ExtractionOutput,
    LeanExtractionOutput,
    StructuredCatalogueExtractor,
)
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    CAPABILITY_AREA_RULE,
    LEAN_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    TREE_RULE,
)
from tests.catalogue_seed import seed_knowledge

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
ADAPTER = CatalogueFileAdapter()
CUSTOMER = CapabilityDomain("customer", "Customer")
FIXED = PortfolioNode("fixed", "Fixed", "Line of business")


def _draft(
    domains: tuple[CapabilityDomain, ...] = (), portfolio: tuple[PortfolioNode, ...] = ()
) -> ArchitectureKnowledge:
    return ArchitectureKnowledge(
        "draft", 1, (), (), capability_domains=domains, portfolio=portfolio
    )


def _domain(domain: CapabilityDomain) -> CandidateContent:
    return CandidateContent(
        CandidateKind.CAPABILITY_DOMAIN, domain.id, name=domain.name, capability_domain=domain
    )


def _node(node: PortfolioNode) -> CandidateContent:
    return CandidateContent(
        CandidateKind.PORTFOLIO_NODE, node.id, name=node.name, portfolio_node=node
    )


# Domain -----------------------------------------------------------------------------------


def test_a_domain_waits_for_its_parent_then_sits_inside_it_by_the_drafts_id() -> None:
    inside = CapabilityDomain("customer-ordering", "Ordering", parent_id="customer")

    assert classify(_domain(inside), _draft()) is CandidateMatch.NEEDS_DOMAIN
    with pytest.raises(CandidateDependencyError, match="capability domain 'customer'"):
        apply_candidate(_domain(inside), _draft())

    named = replace(inside, parent_id="CUSTOMER")
    assert classify(_domain(named), _draft((CUSTOMER,))) is CandidateMatch.NEW
    (_, added) = apply_candidate(_domain(named), _draft((CUSTOMER,))).capability_domains
    assert added.parent_id == "customer"


def test_a_domain_already_held_is_filled_never_overridden() -> None:
    held = replace(CUSTOMER, description="Customers' accounts.")
    reading = CapabilityDomain("x", "customer", description="Something else.")

    assert classify(_domain(reading), _draft((held,))) is CandidateMatch.ALREADY_PRESENT
    bare = _draft((CUSTOMER,))
    assert classify(_domain(reading), bare) is CandidateMatch.UPDATES_EXISTING
    (filled,) = apply_candidate(_domain(reading), bare).capability_domains
    assert (filled.id, filled.description) == ("customer", "Something else.")


def test_a_portfolio_node_keeps_its_level_and_waits_for_the_node_above() -> None:
    smb = PortfolioNode("fixed-smb", "SMB", "Segment", parent_id="Fixed", description="Small.")

    assert classify(_node(smb), _draft()) is CandidateMatch.NEEDS_PORTFOLIO_NODE
    with pytest.raises(CandidateDependencyError, match="portfolio node 'Fixed'"):
        apply_candidate(_node(smb), _draft())
    (_, added) = apply_candidate(_node(smb), _draft(portfolio=(FIXED,))).portfolio
    assert (added.parent_id, added.level) == ("fixed", "Segment")

    other = replace(FIXED, level="Segment", description="Fixed-line products.")
    (held,) = apply_candidate(_node(other), _draft(portfolio=(FIXED,))).portfolio
    assert (held.level, held.description) == ("Line of business", "Fixed-line products.")


# The model --------------------------------------------------------------------------------


class _Answer:
    model = "scripted"

    def __init__(self, output: ExtractionOutput) -> None:
        self.output = output

    def parse(self, **_: Any) -> ExtractionOutput:
        return self.output


def _change(**values: Any) -> ChangeOutput:
    base: dict[str, Any] = {
        "kind": "portfolio_node",
        "system": "",
        "name": "SMB",
        "aliases": [],
        "triggers": [],
        "target_system": None,
        "component": None,
        "technology": None,
        "domain": None,
        "parent_domain": "Fixed",
        "offering": None,
        "journey": None,
        "text": "Small and medium businesses.",
        "evidence_numbers": [1],
        "quote": "The SMB segment of Fixed",
        "basis": "stated",
        "reasoning": None,
        "relationship_kind": None,
        "channel_kind": None,
        "interface_style": None,
        "portfolio_level": "Segment",
        "realisation_layer": None,
        "realised_by": [],
        "source_level": None,
        "source_version": None,
        "conflict_sides": [],
        "affected_offerings": [],
    }
    return ChangeOutput(**(base | values))


def test_the_model_suggests_domains_and_portfolio_nodes() -> None:
    passage = "The SMB segment of Fixed buys through Order capture, part of Customer."
    output = ExtractionOutput(
        changes=[
            _change(),
            _change(
                kind="capability_domain",
                name="Order capture",
                parent_domain="Customer",
                portfolio_level=None,
                realisation_layer=None,
                realised_by=[],
                source_level=None,
                source_version=None,
                conflict_sides=[],
                affected_offerings=[],
                text=None,
            ),
        ]
    )

    node, domain = (
        item.content
        for item in StructuredCatalogueExtractor(_Answer(output), supports_images=False)  # type: ignore[arg-type]
        .propose(ExtractionRequest("Notes", (ExtractionSegment(1, "paragraph 1", passage),), ()))
        .changes
    )

    assert node.portfolio_node == PortfolioNode(
        "fixed-smb",
        "SMB",
        "Segment",
        parent_id="Fixed",
        description="Small and medium businesses.",
        confidence=SourceConfidence.CONFIRMED,
    )
    assert domain.capability_domain == CapabilityDomain(
        "customer-order-capture", "Order capture", parent_id="Customer"
    )


def test_a_portfolio_node_without_its_level_is_left_out() -> None:
    output = ExtractionOutput(
        changes=[
            _change(portfolio_level=None),
            _change(kind="capability_domain", name="Billing", parent_domain=None),
        ]
    )

    proposal = StructuredCatalogueExtractor(_Answer(output), supports_images=False).propose(  # type: ignore[arg-type]
        ExtractionRequest(
            "Notes", (ExtractionSegment(1, "paragraph 1", "The SMB segment of Fixed"),), ()
        )
    )

    assert [item.content.kind for item in proposal.changes] == [CandidateKind.CAPABILITY_DOMAIN]


def test_the_model_files_a_capability_under_the_area_it_is_read_under() -> None:
    """ADR-0128: the area as the document names it; none when the document names none."""
    output = ExtractionOutput(
        changes=[
            _change(
                kind="capability",
                system="CRM",
                name="Take orders",
                triggers=["take an order"],
                domain="Order capture",
                parent_domain=None,
                portfolio_level=None,
                text=None,
                quote="take orders",
            ),
            _change(
                kind="capability",
                system="CRM",
                name="Quote",
                triggers=["quote"],
                domain=" ",
                parent_domain=None,
                portfolio_level=None,
                text=None,
                quote="take orders",
            ),
        ]
    )

    filed, unfiled = (
        item.content
        for item in StructuredCatalogueExtractor(_Answer(output), supports_images=False)  # type: ignore[arg-type]
        .propose(
            ExtractionRequest(
                "Notes", (ExtractionSegment(1, "paragraph 1", "Order capture: take orders"),), ()
            )
        )
        .changes
    )

    assert filed.capability_domain_id == "Order capture"
    assert unfiled.capability_domain_id is None


def test_the_full_reading_may_name_a_capabilitys_area_and_never_guesses_one() -> None:
    assert CAPABILITY_AREA_RULE in SYSTEM_PROMPT
    assert "Never guess an area" in CAPABILITY_AREA_RULE
    assert "A capability read under it names it as its domain" in TREE_RULE
    # The lean reading proposes no areas, and an 8k context has no room for the rule.
    assert CAPABILITY_AREA_RULE not in LEAN_SYSTEM_PROMPT


def test_only_the_full_reading_proposes_domains_and_portfolio_nodes() -> None:
    assert TREE_RULE in SYSTEM_PROMPT
    assert "- portfolio_node:" not in LEAN_SYSTEM_PROMPT
    assert "portfolio_level" not in json.dumps(LeanExtractionOutput.model_json_schema())


# End to end -------------------------------------------------------------------------------

DOCUMENT = b"""# Where SMB sits

Portfolio: Enterprise (Business unit)

Portfolio: Fixed (Line of business) under Enterprise

Portfolio: SMB (Segment) under Fixed

Capability domain: Partner management

Capability domain: Partner onboarding under Partner management

Capability domain: Partner onboarding under Partner management.
"""


def test_accepting_a_documents_tree_adds_it_in_order_and_records_where_it_came_from(
    client: TestClient,
) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "Portfolio", "expected_revision": draft["revision"]},
        files={"file": ("portfolio.md", DOCUMENT, "text/markdown")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    by_name = {item["content"]["name"]: item for item in listing["suggestions"]}
    assert by_name["SMB"]["match"] == CandidateMatch.NEEDS_PORTFOLIO_NODE.value
    assert by_name["SMB"]["content"]["portfolio_node"]["level"] == "Segment"
    assert by_name["Partner onboarding"]["match"] == CandidateMatch.NEEDS_DOMAIN.value
    assert len(by_name["Partner onboarding"]["citations"]) == 2

    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()

    portfolio = {item["name"]: item for item in accepted["release"]["portfolio"]}
    assert portfolio["SMB"]["parent_id"] == portfolio["Fixed"]["id"]
    assert portfolio["Fixed"]["parent_id"] == portfolio["Enterprise"]["id"]
    assert portfolio["SMB"]["accepted"][0]["candidate_id"] == by_name["SMB"]["id"]
    domains = {item["name"]: item for item in accepted["release"]["capability_domains"]}
    assert domains["Partner onboarding"]["parent_id"] == domains["Partner management"]["id"]
    assert domains["Partner management"]["accepted"]


FILED = b"""# Partner management

Capability domain: Partner management

System: Zorbit

Capability: Take orders (take an order) in area Partner management

Capability: Quote (quote a price) in area Pricing desk
"""


def test_a_capability_read_under_an_area_is_filed_there_on_acceptance(
    client: TestClient,
) -> None:
    """ADR-0128: an area the reading suggests is accepted first and holds the capability; one
    nothing answers to is kept as written, never added, and the reading says so."""
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "Orders", "expected_revision": draft["revision"]},
        files={"file": ("orders.md", FILED, "text/markdown")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    by_name = {item["content"]["name"]: item for item in listing["suggestions"]}
    area = by_name["Partner management"]["content"]["system_id"]
    assert by_name["Take orders"]["content"]["capability_domain_id"] == area
    assert by_name["Quote"]["content"]["capability_domain_id"] == "Pricing desk"
    assert (
        "Business areas named that neither the draft has nor this reading suggests: "
        "Pricing desk (for Quote)."
    ) in " ".join(listing["runs"][0]["warnings"])

    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()

    assert accepted["remaining"] == 0
    zorbit = next(item for item in accepted["release"]["systems"] if item["name"] == "Zorbit")
    filed = {item["name"]: item["domain_id"] for item in zorbit["capabilities"]}
    assert filed == {"Take orders": area, "Quote": None}
    areas = {item["name"] for item in accepted["release"]["capability_domains"]}
    assert "Partner management" in areas
    assert "Pricing desk" not in areas


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_file_format_keeps_where_a_domain_and_a_node_came_from(
    file_format: CatalogueFileFormat,
) -> None:
    stamp = AcceptedFrom("c1", "m", "v", "amina", datetime(2026, 10, 21, tzinfo=UTC))
    seed = seed_knowledge()
    release = replace(
        seed,
        capability_domains=(
            replace(seed.capability_domains[0], accepted=(stamp,)),
            *seed.capability_domains[1:],
        ),
        portfolio=(replace(FIXED, accepted=(stamp,)),),
    )

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert read.capability_domains[0].accepted == (stamp,)
    assert read.portfolio[0].accepted == (stamp,)
