"""How an offering's parts are realised, and what it requires of the platform
(requirement-portal ADR-0101, step 4)."""

from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.products import (
    NfrCoverage,
    OfferingComponent,
    OfferingNfr,
    ProductOffering,
    Realisation,
    RealisationLayer,
    SourceConfidence,
    merge_offerings,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge

ADAPTER = CatalogueFileAdapter()
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
FIREWALL = OfferingComponent(
    "fw",
    "Firewall",
    realisation=(
        Realisation(
            RealisationLayer.CFS,
            "CFSS_ONPREM_FIREWALL_HE",
            SourceConfidence.CONFIRMED,
            "SDD §11.1.1",
        ),
        Realisation(RealisationLayer.RFS, "UTP licence activation"),
        Realisation(RealisationLayer.RESOURCE, "Fortinet HE CPE", SourceConfidence.INFERRED),
    ),
)
OFFERING = ProductOffering(
    "pro",
    "Business Pro",
    components=(FIREWALL,),
    nfrs=(
        OfferingNfr(
            "Availability",
            NfrCoverage.MISSING,
            "No availability targets in any source.",
            SourceConfidence.GAP,
        ),
        OfferingNfr("Security", NfrCoverage.PARTIAL, "SAML SSO for the portal.", None, "SDD §11"),
    ),
)


def _release(*offerings: ProductOffering) -> ArchitectureKnowledge:
    return replace(seed_knowledge(), products=offerings or (OFFERING,))


def test_layers_and_coverage_are_read_however_a_source_writes_them() -> None:
    assert Realisation("Customer-facing service", "x").layer is RealisationLayer.CFS  # type: ignore[arg-type]
    assert Realisation("RFS", "x").layer is RealisationLayer.RFS  # type: ignore[arg-type]
    assert Realisation("res", "x").layer is RealisationLayer.RESOURCE  # type: ignore[arg-type]
    assert OfferingNfr("Audit", "GAP").coverage is NfrCoverage.MISSING  # type: ignore[arg-type]
    assert OfferingNfr("Audit", "Not defined").coverage is NfrCoverage.MISSING  # type: ignore[arg-type]
    assert OfferingNfr("Audit", "Partial").coverage is NfrCoverage.PARTIAL  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("build", "message"),
    [
        (lambda: Realisation("service", "x"), "CFS, RFS or resource"),  # type: ignore[arg-type]
        (lambda: OfferingNfr("Audit", "maybe"), "defined, partial or missing"),  # type: ignore[arg-type]
        (lambda: Realisation(RealisationLayer.CFS, " "), "Realisation"),
        (
            lambda: replace(
                FIREWALL,
                realisation=(*FIREWALL.realisation, Realisation("cfs", "cfss_onprem_firewall_he")),  # type: ignore[arg-type]
            ),
            "same thing twice in one layer",
        ),
        (
            lambda: replace(OFFERING, nfrs=(*OFFERING.nfrs, OfferingNfr("security", "defined"))),  # type: ignore[arg-type]
            "each NFR quality is stated once",
        ),
    ],
)
def test_what_realisation_and_nfrs_refuse(build: object, message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        build()  # type: ignore[operator]


def test_the_same_name_may_be_realised_in_two_layers() -> None:
    both = replace(
        FIREWALL,
        realisation=(Realisation("cfs", "Firewall"), Realisation("rfs", "Firewall")),  # type: ignore[arg-type]
    )
    assert len(both.realisation) == 2


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_round_trips_them(file_format: CatalogueFileFormat) -> None:
    release = _release()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.products == release.products


def test_a_second_reading_fills_layers_and_nfrs_but_never_overrides() -> None:
    later = replace(
        OFFERING,
        components=(
            replace(
                FIREWALL,
                realisation=(
                    Realisation("cfs", "cfss_onprem_firewall_he", SourceConfidence.GAP),  # type: ignore[arg-type]
                    Realisation("resource", "Rack"),  # type: ignore[arg-type]
                ),
            ),
        ),
        nfrs=(OfferingNfr("availability", "defined", "99.9%"), OfferingNfr("Audit", "missing")),  # type: ignore[arg-type]
    )

    merged = merge_offerings(OFFERING, later)

    assert [item.name for item in merged.components[0].realisation] == [
        "CFSS_ONPREM_FIREWALL_HE",
        "UTP licence activation",
        "Fortinet HE CPE",
        "Rack",
    ]
    assert merged.components[0].realisation[0].confidence is SourceConfidence.CONFIRMED
    assert [(item.quality, item.coverage) for item in merged.nfrs] == [
        ("Availability", NfrCoverage.MISSING),
        ("Security", NfrCoverage.PARTIAL),
        ("Audit", NfrCoverage.MISSING),
    ]


def test_the_diff_names_realisation_and_nfrs_apart_from_the_rest() -> None:
    after = replace(
        OFFERING,
        components=(replace(FIREWALL, realisation=FIREWALL.realisation[:1]),),
        nfrs=OFFERING.nfrs[:1],
    )

    (change,) = [
        item
        for item in diff_releases(_release(), _release(after)).changes
        if item.item is ChangedItem.PRODUCT
    ]

    assert change.change is ChangeKind.CHANGED
    assert change.fields == ("nfrs", "realisation")


def test_a_draft_saves_them_through_the_api(client: TestClient) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    offering = {
        "id": "pro",
        "name": "Business Pro",
        "components": [
            {
                "id": "fw",
                "name": "Firewall",
                "realisation": [
                    {"layer": "cfs", "name": "CFSS_ONPREM_FIREWALL_HE", "confidence": "confirmed"},
                    {"layer": "resource", "name": "Fortinet HE CPE"},
                ],
            }
        ],
        "nfrs": [{"quality": "Availability", "coverage": "missing"}],
    }

    url = f"/architecture-knowledge/releases/{draft['id']}"
    body = {"systems": draft["systems"], "relationships": draft["relationships"]}

    response = client.put(
        url,
        json={**body, "expected_revision": draft["revision"], "products": [offering]},
        headers=OWNER,
    )

    assert response.status_code == 200, response.text
    (saved,) = response.json()["products"]
    assert saved["components"][0]["realisation"][1] == {
        "layer": "resource",
        "name": "Fortinet HE CPE",
        "confidence": None,
        "source": None,
        "record_id": None,
    }
    assert saved["nfrs"][0]["coverage"] == "missing"

    refused = client.put(
        url,
        json={
            **body,
            "expected_revision": response.json()["revision"],
            "products": [{**offering, "nfrs": [{"quality": "Audit", "coverage": "unknown"}]}],
        },
        headers=OWNER,
    )
    assert refused.status_code == 422
