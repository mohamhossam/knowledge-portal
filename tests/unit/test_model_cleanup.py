"""Names compared one way across the catalogue, and capabilities in their concept's domain."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    CapabilityDomain,
    InvalidKnowledgeError,
    KnowledgeCapability,
    SystemComponent,
    SystemDefinition,
)
from knowledge_portal.infrastructure.architecture.knowledge_yaml import (
    knowledge_from_yaml,
    seed_knowledge,
)

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"


def _with(
    *systems: SystemDefinition, capability_domains: tuple[CapabilityDomain, ...] | None = None
) -> ArchitectureKnowledge:
    seed = seed_knowledge()
    return replace(
        seed,
        systems=(*seed.systems, *systems),
        capability_domains=seed.capability_domains
        if capability_domains is None
        else capability_domains,
    )


def test_the_committed_catalogues_hold_to_both_rules() -> None:
    assert knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8")).systems
    assert seed_knowledge().systems


def test_two_systems_whose_names_differ_only_in_punctuation_are_refused() -> None:
    with pytest.raises(InvalidKnowledgeError, match="already names Wi-Fi Hub"):
        _with(
            SystemDefinition("wifi-hub", "Wi-Fi Hub"),
            SystemDefinition("hub-2", "Access Hub", aliases=("WiFi hub",)),
        )


def test_one_system_keeps_spellings_of_its_own_name() -> None:
    kept = _with(SystemDefinition("wifi-hub", "Wi-Fi Hub", aliases=("WiFi Hub", "Wi Fi Hub")))

    assert kept.systems[-1].aliases == ("WiFi Hub", "Wi Fi Hub")


def test_two_components_whose_names_differ_only_in_punctuation_are_refused() -> None:
    with pytest.raises(InvalidKnowledgeError, match="names more than one component"):
        SystemDefinition(
            "hub",
            "Hub",
            components=(
                SystemComponent("gw", "CRM GW"),
                SystemComponent("gateway", "Gateway", aliases=("CRMGW",)),
            ),
        )
    kept = SystemDefinition(
        "hub", "Hub", components=(SystemComponent("gw", "CRM GW", aliases=("CRMGW",)),)
    )
    assert kept.components[0].aliases == ("CRMGW",)


def test_sibling_domains_are_told_apart_by_more_than_punctuation() -> None:
    with pytest.raises(InvalidKnowledgeError, match="Two domains under one parent"):
        _with(
            capability_domains=(
                *seed_knowledge().capability_domains,
                CapabilityDomain("order-capture-2", "Order-Capture"),
                CapabilityDomain("order-capture-3", "Order capture"),
            )
        )


def _domains() -> tuple[CapabilityDomain, ...]:
    return (CapabilityDomain("orders", "Orders"), CapabilityDomain("billing", "Billing"))


def _concepts() -> tuple[BusinessCapability, ...]:
    return (
        BusinessCapability("cap:capture", "Order capture", domain_id="orders"),
        BusinessCapability("cap:quote", "Quoting", broader_id="cap:capture"),
    )


def _realising(domain_id: str | None, concept_id: str) -> ArchitectureKnowledge:
    system = SystemDefinition(
        "order-hub",
        "Order Hub",
        capabilities=(
            KnowledgeCapability(
                "quotes", "Quotes", ("quote",), domain_id=domain_id, concept_id=concept_id
            ),
        ),
    )
    return replace(
        seed_knowledge(),
        systems=(system,),
        relationships=(),
        capability_domains=_domains(),
        business_capabilities=_concepts(),
        products=(),
        journeys=(),
        channels=(),
        interfaces=(),
        realisations=(),
    )


def test_a_capability_sits_in_the_domain_of_the_concept_it_realises() -> None:
    assert _realising("orders", "cap:quote").systems
    assert _realising(None, "cap:capture").systems
    with pytest.raises(InvalidKnowledgeError, match="sits in its concept's domain"):
        _realising("billing", "cap:quote")
