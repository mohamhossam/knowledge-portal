"""The Product Architecture Explorer's model, read once into a catalogue file (ADR-0101)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.journeys import journey_edges
from knowledge_portal.domain.architecture.knowledge import InvalidKnowledgeError
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.explorer_model import read_explorer_model

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
EV = {"s": "CONFIRMED", "src": "SDD", "ref": "§11"}
LATER = {"s": "INFERRED", "src": "SDD", "ref": "§12"}


def _model() -> dict[str, Any]:
    """A small explorer model with each shape the reading has to handle."""
    return {
        "schemaVersion": "6.0.0",
        "sources": [{"id": "SDD", "level": "L2", "short": "BPP SDD", "title": "SDD"}],
        "landscape": {
            "domains": [{"id": "SALES", "name": "Market & Sales", "code": "TAM · Sales"}],
            "systems": [
                {
                    "id": "SYS-WEB",
                    "name": "B2B Web",
                    "domain": "SALES",
                    "function": "Digital storefront",
                    "aliases": ["Portal"],
                    "owner": "Digital",
                },
                {"id": "SYS-APP", "name": "SMB App", "domain": "SALES", "aliases": ["Portal"]},
                {"id": "SYS-CRM", "name": "BCRM", "domain": "SALES"},
                {"id": "SYS-RTF", "name": "RTF"},
                {"id": "SYS-WFM", "name": "WFM"},
            ],
        },
        "channels": [
            {"id": "WEB", "label": "B2B Digital", "systemId": "SYS-WEB"},
            {"id": "APP", "label": "SMB App", "systemId": "SYS-APP"},
            {"id": "CRM", "label": "BCRM", "systemId": "SYS-CRM"},
        ],
        "phases": [
            {"id": "CAP", "label": "Capture", "etom": "Order Handling"},
            {"id": "OOR", "label": "Orchestrate", "etom": "Service Configuration"},
        ],
        "products": [
            {
                "id": "BPP",
                "name": "Business Pro Plus",
                "code": "BPP",
                "family": "Business Pro",
                "version": "2.3",
                "status": "Live",
                "description": "Premium internet bundle.",
                "descEv": EV,
                "rules": [{"text": "SD-WAN is mandated.", "ev": EV}],
                "values": [{"title": "Continuity", "desc": "5G failover", "ev": LATER}],
                "fits": [{"title": "SMB", "desc": "Premium internet", "ev": EV}],
                "plans": [{"tier": "S"}],
                "nfr": [
                    {
                        "attr": "Availability",
                        "status": "GAP",
                        "text": "No availability targets.",
                        "ev": {"s": "GAP"},
                    },
                    {"attr": "Security", "status": "PARTIAL", "text": "SAML SSO.", "ev": EV},
                    {"attr": "security", "status": "GAP", "text": "Repeated.", "ev": EV},
                ],
                "orderTypes": [
                    {
                        "id": "NEW",
                        "label": "New Activation",
                        "desc": "A new site",
                        "ev": EV,
                        "channels": {
                            "WEB": {"supported": True},
                            "APP": {"supported": True},
                            "CRM": {"supported": True},
                        },
                    },
                    {"id": "CEASE", "label": "Cease", "ev": EV, "channels": {}},
                ],
                "components": [
                    {
                        "id": "BB",
                        "name": "Broadband",
                        "cat": "CONNECTIVITY",
                        "mandatory": True,
                        "visible": True,
                        "desc": "GPON",
                        "codes": ["PO_1", "PO_2"],
                        "cfs": [{"name": "GPON CFS", "ev": {"s": "GAP"}}],
                        "rfs": [{"name": "Speed profile"}],
                        "res": [{"name": "Line"}],
                        "ev": EV,
                        "sys": [
                            {"id": "SYS-RTF", "role": "Orchestrates", "ots": ["*"], "ev": EV},
                            {"id": "SYS-WFM", "role": "Installs", "ots": ["NEW"], "ev": EV},
                            {"id": "SYS-WFM", "role": "Recovers", "ots": ["CEASE"], "ev": LATER},
                            {"id": "SYS-CRM", "role": "Picks speed", "ots": ["DESIGN"], "ev": EV},
                        ],
                    },
                    {"id": "SAAS", "name": "SaaS", "mandatory": "CONFIGURABLE", "ev": EV},
                ],
                "apis": [
                    {
                        "id": "API_SR",
                        "name": "RTF SR request",
                        "provider": "SYS-RTF",
                        "consumers": ["SYS-WEB", "SYS-CRM", "SYS-RTF", "SYS-GONE"],
                        "payload": "processCode",
                        "kind": "API",
                    }
                ],
                "journeys": {"NEW": _journey()},
            }
        ],
        "conflicts": [{"id": "C1"}],
    }


def _journey() -> dict[str, Any]:
    def node(node_id: str, label: str, system: str | None, **more: Any) -> dict[str, Any]:
        return {"id": node_id, "label": label, "sys": system, "ev": EV, **more}

    def edge(source: str, target: str, kind: str = "seq", **more: Any) -> dict[str, Any]:
        return {"from": source, "to": target, "kind": kind, "sync": "UNKNOWN", "ev": EV, **more}

    main = {"phase": "CAP", "track": "MAIN"}
    return {
        "nodes": [
            node("s", "Start", "@ENTRY", kind="start", **main),
            node("d", "Select bundle", "@ENTRY", kind="task", ch=["WEB", "APP"], **main)
            | {"comp": ["BB", "NOPE"], "cv": True},
            node("b", "Capture in BCRM", "@ENTRY", kind="task", ch=["CRM"], **main),
            node("sub", "Submit SR", "@ENTRY", kind="task", api="API_SR", **main),
            node("x", "Feasible?", "SYS-RTF", kind="xor", phase="OOR", track="MAIN"),
            node("rej", "Rejected", None, kind="end", phase="OOR", track="MAIN"),
            node("wo", "Field work order", "SYS-WFM", kind="task", phase="OOR", track="FIELD")
            | {"sup": [{"id": "SYS-RTF"}], "ev": LATER},
            node("e", "Done", None, kind="end", phase="OOR", track="MAIN"),
        ],
        "edges": [
            edge("s", "d", ch=["WEB", "APP"]),
            edge("s", "b", ch=["CRM"]),
            edge("d", "sub"),
            edge("b", "sub"),
            edge("sub", "x", api="API_SR", cat="handoff", label="SR request", sync="SYNC"),
            edge("x", "rej", "branch", label="No"),
            edge("x", "wo", "branch", label="Yes"),
            edge("wo", "x", "loop", label="Retry"),
            edge("wo", "e"),
        ],
    }


def _read() -> tuple[dict[str, Any], tuple[str, ...]]:
    seed = read_explorer_model(_model())
    return seed.mapping, seed.report


def test_systems_keep_their_domain_and_aliases_that_name_one_system() -> None:
    mapping, report = _read()

    systems = {item["id"]: item for item in mapping["systems"]}
    assert mapping["landscape_domains"] == [
        {"id": "SALES", "name": "Market & Sales", "description": "TAM · Sales"}
    ]
    assert systems["SYS-WEB"] == {
        "id": "SYS-WEB",
        "name": "B2B Web",
        "aliases": ["Portal"],
        "description": "Digital storefront",
        "landscape_domain": "SALES",
    }
    assert "aliases" not in systems["SYS-APP"]
    assert "Alias 'Portal' of SMB App dropped: it already names B2B Web." in report


def test_each_api_becomes_its_consumers_calling_the_provider() -> None:
    mapping, report = _read()

    assert mapping["dependencies"] == [
        {
            "source_system_id": consumer,
            "target_system_id": "SYS-RTF",
            "description": "RTF SR request",
            "kind": "calls_api",
        }
        for consumer in ("SYS-WEB", "SYS-CRM")
    ]
    assert "Not carried over yet: API links to an uncatalogued party (1)." in report


def test_the_offering_keeps_its_evidence_and_reads_roles_from_scope() -> None:
    mapping, _ = _read()

    product = mapping["products"][0]
    assert product["proposition"] == "Premium internet bundle."
    assert product["lifecycle"] == "Live"
    assert (product["confidence"], product["source"]) == ("confirmed", "BPP SDD §11")
    assert product["rules"] == ["SD-WAN is mandated."]
    assert product["values"] == [
        {
            "name": "Continuity",
            "description": "5G failover",
            "confidence": "inferred",
            "source": "BPP SDD §12",
        }
    ]
    assert [item["code"] for item in product["order_types"]] == ["NEW", "CEASE"]
    broadband, saas = product["components"]
    assert broadband["code"] == "PO_1; PO_2"
    assert "technical_details" not in broadband
    assert broadband["realisation"] == [
        {"layer": "cfs", "name": "GPON CFS", "confidence": "gap"},
        {"layer": "rfs", "name": "Speed profile"},
        {"layer": "resource", "name": "Line"},
    ]
    assert product["nfrs"] == [
        {
            "quality": "Availability",
            "coverage": "missing",
            "statement": "No availability targets.",
            "confidence": "gap",
        },
        {
            "quality": "Security",
            "coverage": "partial",
            "statement": "SAML SSO.",
            "confidence": "confirmed",
            "source": "BPP SDD §11",
        },
    ]
    assert "mandatory" not in saas
    assert saas["commercial_spec"] == "Configurable"
    duties = {(item["system"], item["role"]): item for item in broadband["responsibilities"]}
    assert "order_types" not in duties[("SYS-RTF", "FULFILMENT")]
    assert duties[("SYS-WFM", "FULFILMENT")] == {
        "system": "SYS-WFM",
        "role": "FULFILMENT",
        "description": "Installs; Recovers",
        "confidence": "inferred",
        "source": "BPP SDD §11 / BPP SDD §12",
        "order_types": ["NEW", "CEASE"],
    }
    assert duties[("SYS-CRM", "DESIGN_TIME")]["description"] == "Picks speed"


def test_the_journey_keeps_the_explorers_flow_arrow_for_arrow() -> None:
    mapping, report = _read()
    content = CatalogueFileAdapter().read(CatalogueFileFormat.JSON, json.dumps(mapping).encode())

    (journey,) = content.journeys
    number = {item.name: item.number for item in journey.activities}
    named = {
        (source, target)
        for source, target in (
            ("Start", "Select bundle"),
            ("Start", "Capture in BCRM"),
            ("Select bundle", "Submit SR"),
            ("Capture in BCRM", "Submit SR"),
            ("Submit SR", "Feasible?"),
            ("Feasible?", "Rejected"),
            ("Feasible?", "Field work order"),
            ("Field work order", "Feasible?"),
            ("Field work order", "Done"),
        )
    }
    assert {(edge.from_activity, edge.to_activity) for edge in journey_edges(journey)} == {
        (number[source], number[target]) for source, target in named
    }
    assert (journey.id, journey.product_id, journey.order_type_code) == ("BPP.NEW", "BPP", "NEW")
    assert not [line for line in report if "differs" in line]
    assert "Business Pro Plus › Cease: no journey." in report


def test_channels_carry_over_with_their_entry_systems() -> None:
    mapping, _ = _read()

    assert mapping["channels"] == [
        {"id": "WEB", "name": "B2B Digital", "entry_system": "SYS-WEB"},
        {"id": "APP", "name": "SMB App", "entry_system": "SYS-APP"},
        {"id": "CRM", "name": "BCRM", "entry_system": "SYS-CRM"},
    ]
    new, cease = mapping["products"][0]["order_types"]
    assert new["channels"] == ["WEB", "APP", "CRM"]
    assert "channels" not in cease


def test_steps_keep_their_channels_and_who_performs_them() -> None:
    mapping, report = _read()

    steps = {item["name"]: item for item in mapping["journeys"][0]["activities"]}
    assert steps["Select bundle"]["channels"] == ["WEB", "APP"]
    assert steps["Select bundle"]["channel_entry"] is True
    assert "system" not in steps["Select bundle"]
    assert "description" not in steps["Select bundle"]
    assert steps["Capture in BCRM"]["channels"] == ["CRM"]
    assert "channels" not in steps["Feasible?"]
    assert "channel_entry" not in steps["Feasible?"]
    assert steps["Select bundle"]["components"] == ["BB"]
    assert steps["Select bundle"]["customer_visible"] is True
    assert steps["Submit SR"]["description"] == "Calls RTF SR request."
    assert steps["Rejected"]["track"] == "END"
    assert steps["Field work order"]["supporting"] == ["SYS-RTF"]
    assert (steps["Field work order"]["phase"], steps["Field work order"]["etom"]) == (
        "Orchestrate",
        "Service Configuration",
    )
    assert not [line for line in report if "entry steps" in line or "channels (" in line]
    assert "Not carried over yet: step components outside the product (1)." in report


def test_rules_and_handoffs_say_why_the_flow_goes_where_it_does() -> None:
    mapping, _ = _read()

    journey = mapping["journeys"][0]
    number = {item["name"]: item["number"] for item in journey["activities"]}
    rules = {(rule["from"], rule["to"]): rule for rule in journey["flow_rules"]}
    start = rules[(number["Start"], number["Capture in BCRM"])]
    assert (start["kind"], start["condition"]) == ("decision", "Channels: BCRM")
    retry = rules[(number["Field work order"], number["Feasible?"])]
    assert (retry["kind"], retry["condition"]) == ("loop", "Retry")
    assert rules[(number["Feasible?"], number["Field work order"])]["branch"] == "FIELD"
    assert journey["integrations"] == [
        {
            "from": number["Submit SR"],
            "to": number["Feasible?"],
            "interaction": "SR request",
            "interface": "RTF SR request",
            "payload": "processCode",
            "timing": "Sync",
            "confidence": "confirmed",
            "source": "BPP SDD §11",
        }
    ]


def test_the_report_counts_what_the_catalogue_cannot_hold_yet() -> None:
    _, report = _read()

    assert report[0] == (
        "Read 5 systems, 2 API links, 1 products and 1 journeys from 1 explorer products."
    )
    for line in (
        "Not carried over yet: plans and prices (1).",
        "Not carried over yet: source conflicts (1).",
        "Not carried over yet: source levels (L1/L2/L3) (1).",
        "Not carried over yet: system owners (1).",
    ):
        assert line in report


def test_another_schema_is_refused() -> None:
    with pytest.raises(InvalidKnowledgeError, match="schema 6.x, not 5.0.0"):
        read_explorer_model({"schemaVersion": "5.0.0"})


def test_content_the_catalogue_refuses_is_refused_here_too() -> None:
    model = _model()
    model["products"][0]["components"][0]["sys"][0]["id"] = "SYS-GONE"

    with pytest.raises(InvalidKnowledgeError, match="SYS-GONE"):
        read_explorer_model(model)


def test_an_admin_imports_the_file_into_a_draft(client: TestClient) -> None:
    mapping, _ = _read()
    body = json.dumps(mapping).encode()
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Explorer seed"}, headers=OWNER
    ).json()

    applied = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/catalogue-file",
        data={"expected_revision": draft["revision"]},
        files={"file": ("explorer-catalogue.json", body, "application/json")},
        headers=OWNER,
    )

    assert applied.status_code == 200
    release = applied.json()
    assert [item["id"] for item in release["products"]] == ["BPP"]
    assert [item["id"] for item in release["journeys"]] == ["BPP.NEW"]
    assert len(release["systems"]) == 5
