"""The rebuilt architecture catalogue's additions (plan 03-architecture-catalogue).

A product portfolio whose levels are data; an offering's place in it, its plans as the
sources describe them, and its business rules; who performs a step when it is not a
catalogued system, its point of no return and its role; the systems a call names; and a
system's owner, roadmap and moved placement. Each is checked by the domain, carried by
every catalogue file format and by the draft API.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    ActivityIntegration,
    Journey,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import (
    BusinessRule,
    OfferingPlan,
    OrderType,
    PlanCharacteristic,
    ProductOffering,
    SourceConfidence,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter

ADAPTER = CatalogueFileAdapter()
OWNER = {"X-Fake-Actor-Id": "fake-owner"}

PORTFOLIO = (
    PortfolioNode("enterprise", "Enterprise", "Business unit"),
    PortfolioNode("fixed", "Fixed", "Line of business", "enterprise"),
    PortfolioNode("smb", "SMB", "Segment", "fixed", "Small and medium businesses."),
)


def _release(**changes: Any) -> ArchitectureKnowledge:
    """A small catalogue with every addition filled in."""
    systems = (
        SystemDefinition(
            "rtf",
            "RTF",
            owner="RTF team",
            placement_from="Service",
            placement_reason="It captures and routes the customer's order.",
            confidence=SourceConfidence.CONFIRMED,
            source="SMB reference §1",
        ),
        SystemDefinition("cwom", "CWOM", roadmap="Kept"),
        SystemDefinition("cbcm", "CBCM", aliases=("CRMGW",)),
        SystemDefinition("tibco", "TIBCO"),
        SystemDefinition("fortinet", "Fortinet", external=True),
    )
    offering = ProductOffering(
        "bpp",
        "Business Pro Plus",
        order_types=(OrderType("NEW", "New activation", channels=("b2b",)),),
        portfolio_node_id="smb",
        plans=(
            OfferingPlan(
                "Business Pro Plus 200 Mbps",
                (PlanCharacteristic("Download", "200 Mbps"), PlanCharacteristic("CPE", "90G")),
                confidence=SourceConfidence.CONFIRMED,
                source="SDD §IN",
            ),
        ),
        business_rules=(
            BusinessRule("R1", "Firewall is mandatory.", "composition"),
            BusinessRule("R2", "No amendment from the SMB App.", "lifecycle"),
        ),
    )
    journey = Journey(
        "bpp-new",
        "New activation",
        "bpp",
        "NEW",
        activities=(
            Activity("10", "Submit the order", channel_entry=True, role="capture"),
            Activity(
                "20",
                "Evaluate the order",
                performing_system_id="rtf",
                role="validate",
                point_of_no_return="None before CWOM accepts it.",
            ),
            Activity("30", "Set up SD-WAN", performer="MSS team"),
        ),
        integrations=(
            ActivityIntegration(
                "20",
                "20",
                interface="evaluateOrder",
                from_system_id="rtf",
                to_system_id="cbcm",
                purpose="Check business rules.",
                style="API",
                tmf_equivalent="TMF679 Product Offering Qualification",
            ),
            ActivityIntegration(
                "20", "30", interface="Onboarding ticket", via_system_id="tibco", style="Ticket"
            ),
        ),
    )
    base = ArchitectureKnowledge(
        "smb-catalogue",
        1,
        systems,
        (),
        products=(offering,),
        journeys=(journey,),
        channels=(Channel("b2b", "B2B Web", entry_system_id="rtf"),),
        portfolio=PORTFOLIO,
    )
    return replace(base, **changes)


def test_the_portfolio_is_a_tree_of_named_levels() -> None:
    release = _release()
    assert [node.level for node in release.portfolio] == [
        "Business unit",
        "Line of business",
        "Segment",
    ]
    with pytest.raises(InvalidKnowledgeError, match="not in the portfolio"):
        _release(portfolio=(*PORTFOLIO, PortfolioNode("lost", "Lost", "Segment", "nowhere")))
    with pytest.raises(InvalidKnowledgeError, match="sits under itself"):
        _release(
            portfolio=(
                PortfolioNode("a", "A", "Level", "b"),
                PortfolioNode("b", "B", "Level", "a"),
            )
        )
    with pytest.raises(InvalidKnowledgeError, match="both called"):
        _release(portfolio=(*PORTFOLIO, PortfolioNode("smb-2", "smb", "Segment", "fixed")))


def test_an_offering_sits_only_in_a_node_of_the_portfolio() -> None:
    offering = replace(_release().products[0], portfolio_node_id="mobile")
    with pytest.raises(InvalidKnowledgeError, match="which is not in the portfolio"):
        _release(products=(offering,), journeys=())


def test_plans_and_rules_are_named_once() -> None:
    with pytest.raises(InvalidKnowledgeError, match="each characteristic is stated once"):
        OfferingPlan("P", (PlanCharacteristic("CPE", "90G"), PlanCharacteristic("cpe", "120G")))
    offering = _release().products[0]
    with pytest.raises(InvalidKnowledgeError, match="plan names must be unique"):
        replace(offering, plans=(*offering.plans, *offering.plans))
    with pytest.raises(InvalidKnowledgeError, match="business rule ids must be unique"):
        replace(offering, business_rules=(BusinessRule("R1", "A"), BusinessRule("r1", "B")))


def test_a_step_has_one_performer_and_its_role_is_a_code() -> None:
    step = _release().journeys[0].activities[0]
    assert step.role == "CAPTURE"
    with pytest.raises(InvalidKnowledgeError, match="team or party"):
        Activity("40", "Twice", performing_system_id="rtf", performer="MSS team")
    with pytest.raises(InvalidKnowledgeError, match="not both"):
        Activity("40", "Twice", performing_system_id="rtf", channel_entry=True)


def test_a_call_names_only_catalogued_systems() -> None:
    journey = _release().journeys[0]
    stray = ActivityIntegration("20", "20", interface="getX", to_system_id="nowhere")
    with pytest.raises(InvalidKnowledgeError, match="names system 'nowhere'"):
        _release(journeys=(replace(journey, integrations=(stray,)),))
    assert journey.integrations[0].systems == ("rtf", "cbcm")


def test_a_moved_placement_says_where_it_was_and_why() -> None:
    with pytest.raises(InvalidKnowledgeError, match="where it was and why"):
        SystemDefinition("gis", "GIS", placement_from="Engaged Party")


def test_the_committed_smb_catalogue_reads_as_a_valid_release() -> None:
    """catalogues/smb-architecture.yaml, seeded into a draft, keeps every domain rule."""
    path = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
    content = ADAPTER.read(CatalogueFileFormat.YAML, path.read_bytes())

    release = ArchitectureKnowledge(
        "smb-architecture",
        1,
        content.systems,
        content.relationships,
        capability_domains=content.capability_domains,
        landscape_domains=content.landscape_domains,
        products=content.products,
        journeys=content.journeys,
        channels=content.channels,
        sources=content.sources,
        conflicts=content.conflicts,
        portfolio=content.portfolio,
        business_capabilities=content.business_capabilities,
        vocabulary=content.vocabulary,
        interfaces=content.interfaces,
        realisations=content.realisations,
    )

    assert [node.name for node in release.portfolio][:3] == ["Enterprise", "Fixed", "SMB"]
    # Every Business Pro Plus order type has its journey, plus order tracking, which has none.
    offering = next(item for item in release.products if item.id == "business-pro-plus")
    assert {journey.order_type_code for journey in release.journeys} == {
        *(item.code for item in offering.order_types),
        None,
    }
    # Nothing priced: the sources state no plan prices.
    assert all(
        "price" not in fact.name.casefold()
        for product in release.products
        for plan in product.plans
        for fact in plan.characteristics
    )


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_carries_the_additions(
    file_format: CatalogueFileFormat,
) -> None:
    release = _release()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.portfolio == release.portfolio
    assert content.systems == release.systems
    assert content.products == release.products
    assert content.journeys == release.journeys


def test_the_draft_api_stores_and_returns_the_additions(client: TestClient) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Rebuilt catalogue"}, headers=OWNER
    ).json()
    release = _release()
    body: dict[str, Any] = {
        "expected_revision": draft["revision"],
        "systems": [
            {"id": "rtf", "name": "RTF", "owner": "RTF team", "external": False},
            {"id": "cbcm", "name": "CBCM"},
            {"id": "fortinet", "name": "Fortinet", "external": True, "roadmap": "Kept"},
        ],
        "relationships": [],
        "portfolio": [
            {"id": node.id, "name": node.name, "level": node.level, "parent_id": node.parent_id}
            for node in release.portfolio
        ],
        "products": [
            {
                "id": "bpp",
                "name": "Business Pro Plus",
                "portfolio_node_id": "smb",
                "order_types": [{"code": "NEW", "name": "New activation"}],
                "plans": [
                    {
                        "name": "200 Mbps",
                        "characteristics": [{"name": "Download", "value": "200 Mbps"}],
                    }
                ],
                "business_rules": [{"id": "R1", "statement": "Firewall is mandatory."}],
            }
        ],
        "journeys": [
            {
                "id": "bpp-new",
                "name": "New activation",
                "product_id": "bpp",
                "order_type_code": "NEW",
                "activities": [
                    {"number": "10", "name": "Evaluate", "performing_system_id": "rtf"},
                    {"number": "20", "name": "Set up SD-WAN", "performer": "MSS team"},
                ],
                "integrations": [
                    {
                        "from_activity": "10",
                        "to_activity": "10",
                        "interface": "evaluateOrder",
                        "from_system_id": "rtf",
                        "to_system_id": "cbcm",
                        "style": "API",
                    }
                ],
            }
        ],
    }

    saved = client.put(f"/architecture-knowledge/releases/{draft['id']}", json=body, headers=OWNER)

    assert saved.status_code == 200, saved.text
    stored = client.get(f"/architecture-knowledge/releases/{draft['id']}", headers=OWNER).json()
    assert [node["level"] for node in stored["portfolio"]] == [
        "Business unit",
        "Line of business",
        "Segment",
    ]
    (product,) = stored["products"]
    assert product["portfolio_node_id"] == "smb"
    assert product["plans"][0]["characteristics"] == [{"name": "Download", "value": "200 Mbps"}]
    assert product["business_rules"][0]["id"] == "R1"
    (journey,) = stored["journeys"]
    assert journey["activities"][1]["performer"] == "MSS team"
    assert journey["integrations"][0]["to_system_id"] == "cbcm"
    assert stored["systems"][2]["external"] is True

    # A client that predates the portfolio leaves it as it is.
    kept = client.put(
        f"/architecture-knowledge/releases/{draft['id']}",
        json={k: v for k, v in body.items() if k != "portfolio"}
        | {"expected_revision": stored["revision"]},
        headers=OWNER,
    )
    assert kept.status_code == 200, kept.text
    assert len(kept.json()["portfolio"]) == 3

    # An offering placed outside the portfolio is refused, as the caller's mistake.
    body["expected_revision"] = kept.json()["revision"]
    body["products"][0]["portfolio_node_id"] = "mobile"
    refused = client.put(
        f"/architecture-knowledge/releases/{draft['id']}", json=body, headers=OWNER
    )
    assert refused.status_code in (400, 422), refused.text
