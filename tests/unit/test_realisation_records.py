"""CFS, RFS and resource records (ontology plan Phase 8, ADR-0114).

A component's realisation keeps the name its source wrote and gains the id of the record
it means; a record names the systems that deliver it and what realises it one layer down.
Checked by the domain, carried by every catalogue file format, the draft API, the diff and
the evidence index, kept when a document is read again, and followed by the graph lane.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.use_cases.architecture_index import _offering_text
from knowledge_portal.domain.architecture.assessment import PathKind
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.impact_graph import realisers
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.products import (
    OfferingComponent,
    ProductOffering,
    Realisation,
    RealisationLayer,
)
from knowledge_portal.domain.architecture.realisations import (
    RealisationRecord,
    realisation_chains,
)
from knowledge_portal.domain.architecture.vocabulary_links import kept_component_terms
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter

ADAPTER = CatalogueFileAdapter()
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
BASE = "/architecture-knowledge/releases"
CFS, RFS, RESOURCE = RealisationLayer.CFS, RealisationLayer.RFS, RealisationLayer.RESOURCE

RECORDS = (
    RealisationRecord(
        "cfs-firewall",
        CFS,
        "CFSS_ONPREM_FIREWALL_HE",
        system_ids=("cwom",),
        realised_by=("rfs-fw",),
    ),
    RealisationRecord("rfs-fw", RFS, "RFS firewall policy", realised_by=("res-cpe",)),
    RealisationRecord("res-cpe", RESOURCE, "Fortinet HE CPE", ("Fortinet 90G",), ("e2eso",)),
)


def _release(**changes: Any) -> ArchitectureKnowledge:
    component = OfferingComponent(
        "firewall",
        "Firewall",
        realisation=(Realisation(CFS, "CFSS_ONPREM_FIREWALL_HE", record_id="cfs-firewall"),),
    )
    base = ArchitectureKnowledge(
        "realised",
        1,
        (SystemDefinition("cwom", "CWOM"), SystemDefinition("e2eso", "E2ESO")),
        (),
        products=(ProductOffering("bpp", "Business Pro Plus", components=(component,)),),
        realisations=RECORDS,
    )
    return replace(base, **changes)


def test_a_record_keeps_its_own_rules() -> None:
    with pytest.raises(InvalidKnowledgeError, match="nothing below it"):
        RealisationRecord("res-a", RESOURCE, "A", realised_by=("res-b",))
    with pytest.raises(InvalidKnowledgeError, match="more than once, or itself"):
        RealisationRecord("cfs-a", CFS, "A", realised_by=("cfs-a",))
    with pytest.raises(InvalidKnowledgeError, match="each name must differ"):
        RealisationRecord("cfs-a", CFS, "A", aliases=("a",))
    with pytest.raises(InvalidKnowledgeError, match="realisation layer is CFS"):
        RealisationRecord("x", "service", "A")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("records", "message"),
    [
        ((*RECORDS, RECORDS[0]), "ids must be unique"),
        ((*RECORDS, RealisationRecord("cfs-b", CFS, "cfss_onprem_firewall_he")), "already names"),
        ((*RECORDS, RealisationRecord("cfs-b", CFS, "B", system_ids=("erp",))), "system 'erp'"),
        ((*RECORDS, RealisationRecord("cfs-b", CFS, "B", realised_by=("nowhere",))), "not in"),
        (
            (*RECORDS, RealisationRecord("rfs-b", RFS, "B", realised_by=("cfs-firewall",))),
            "realised by a layer below it",
        ),
        (RECORDS[1:], "is not a CFS in the catalogue"),
    ],
)
def test_a_release_checks_its_records(records: tuple[RealisationRecord, ...], message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        _release(realisations=records)


def test_the_same_name_may_name_records_of_two_layers() -> None:
    twin = RealisationRecord("res-fw", RESOURCE, "CFSS_ONPREM_FIREWALL_HE")

    assert len(_release(realisations=(*RECORDS, twin)).realisations) == 4


def test_a_record_s_chains_run_down_its_layers() -> None:
    records = {item.id: item for item in RECORDS}

    assert [
        [item.id for item in chain] for chain in realisation_chains(records, "cfs-firewall")
    ] == [["cfs-firewall", "rfs-fw", "res-cpe"]]
    assert realisation_chains(records, "res-cpe") == ((RECORDS[2],),)


def test_the_graph_reaches_the_systems_delivering_a_component_s_records() -> None:
    release = _release()
    concept = replace(release.products[0].components[0], capability_ids=("cap-firewall",))
    release = _release(
        business_capabilities=(BusinessCapability("cap-firewall", "Firewall"),),
        products=(replace(release.products[0], components=(concept,)),),
    )

    found = {
        item.system_id: [step.id for step in item.steps if step.kind is PathKind.REALISATION]
        for item in realisers(release, "cap-firewall")
    }

    assert found == {"cwom": ["cfs-firewall"], "e2eso": ["cfs-firewall", "rfs-fw", "res-cpe"]}


def test_a_document_read_again_keeps_a_component_s_records() -> None:
    kept = _release().products[0].components[0]
    read = replace(kept, realisation=(Realisation(CFS, "CFSS_ONPREM_FIREWALL_HE"),))

    assert kept_component_terms(read, kept).realisation[0].record_id == "cfs-firewall"
    renamed = replace(kept, realisation=(Realisation(CFS, "CFSS_FIREWALL_V2"),))
    assert kept_component_terms(renamed, kept).realisation[0].record_id is None


def test_the_evidence_names_the_systems_and_layers_below() -> None:
    release = _release()
    names = {item.id: item.name for item in release.systems}

    text = _offering_text(release.products[0], names, {item.id: item for item in RECORDS})

    assert (
        "Firewall is realised by the customer-facing service CFSS_ONPREM_FIREWALL_HE (CWOM), "
        "on the resource-facing service RFS firewall policy" in text
    )


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_carries_records_and_links(
    file_format: CatalogueFileFormat,
) -> None:
    release = _release()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.realisations == release.realisations
    assert content.products == release.products


def test_the_diff_reports_records_and_links() -> None:
    base = _release()
    unlinked = replace(
        base.products[0].components[0],
        realisation=(Realisation(CFS, "CFSS_ONPREM_FIREWALL_HE"),),
    )
    draft = _release(
        products=(replace(base.products[0], components=(unlinked,)),),
        realisations=(replace(RECORDS[0], system_ids=()), *RECORDS[1:]),
    )

    changes = {
        (item.item, item.change, item.key): item.fields
        for item in diff_releases(base, draft).changes
    }

    assert changes[(ChangedItem.REALISATION, ChangeKind.CHANGED, "cfs-firewall")] == ("system_ids",)
    assert "realisation" in changes[(ChangedItem.PRODUCT, ChangeKind.CHANGED, "bpp")]


def test_the_draft_api_stores_and_returns_records(client: TestClient) -> None:
    draft = client.post(BASE, json={"name": "Records"}, headers=OWNER).json()
    body: dict[str, Any] = {
        "expected_revision": draft["revision"],
        "systems": [{"id": "cwom", "name": "CWOM"}],
        "relationships": [],
        "products": [
            {
                "id": "bpp",
                "name": "Business Pro Plus",
                "components": [
                    {
                        "id": "firewall",
                        "name": "Firewall",
                        "realisation": [
                            {
                                "layer": "cfs",
                                "name": "CFSS_ONPREM_FIREWALL_HE",
                                "record_id": "cfs-fw",
                            }
                        ],
                    }
                ],
            }
        ],
        "realisations": [
            {
                "id": "cfs-fw",
                "layer": "cfs",
                "name": "CFSS_ONPREM_FIREWALL_HE",
                "system_ids": ["cwom"],
            },
        ],
    }

    saved = client.put(f"{BASE}/{draft['id']}", json=body, headers=OWNER)

    assert saved.status_code == 200, saved.text
    stored = client.get(f"{BASE}/{draft['id']}", headers=OWNER).json()
    assert stored["realisations"][0]["system_ids"] == ["cwom"]
    assert stored["products"][0]["components"][0]["realisation"][0]["record_id"] == "cfs-fw"

    # A client that predates records leaves them as they are.
    kept = client.put(
        f"{BASE}/{draft['id']}",
        json={k: v for k, v in body.items() if k != "realisations"}
        | {"expected_revision": stored["revision"]},
        headers=OWNER,
    )
    assert kept.status_code == 200, kept.text
    assert len(kept.json()["realisations"]) == 1

    # A link to a record of another layer is the caller's mistake.
    body["expected_revision"] = kept.json()["revision"]
    body["realisations"][0]["layer"] = "resource"
    refused = client.put(f"{BASE}/{draft['id']}", json=body, headers=OWNER)
    assert refused.status_code == 422
    assert "is not a CFS in the catalogue" in refused.text


def test_the_committed_catalogue_links_each_named_spec_to_a_record() -> None:
    """Every Business Pro Plus component whose technical spec names a CFS or a resource is
    realised as its record."""
    path = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
    content = ADAPTER.read(CatalogueFileFormat.YAML, path.read_bytes())
    offering = next(item for item in content.products if item.id == "business-pro-plus")

    linked = {
        part.id: [item.record_id for item in part.realisation]
        for part in offering.components
        if part.technical_spec
    }

    assert linked == {
        "gpon": ["cfs-internet-cpe-onprem-he"],
        "cpe": ["res-fortinet-he-cpe"],
        "firewall": ["cfs-onprem-firewall-he"],
        "selfservice": ["cfs-selfservice-portal-access"],
        "sdwan": ["cfs-sdwan-new"],
        "ap": ["res-fortiap"],
    }
    assert {item.layer for item in content.realisations} == {CFS, RESOURCE}
