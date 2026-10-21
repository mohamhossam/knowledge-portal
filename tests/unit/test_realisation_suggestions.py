"""Realisation records (CFS, RFS, resource) suggested from documents (ADR-0123)."""

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
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, SystemDefinition
from knowledge_portal.domain.architecture.products import RealisationLayer
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
from knowledge_portal.domain.architecture.realisations import RealisationRecord, record_id
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.llm.catalogue_extraction import (
    ChangeOutput,
    ExtractionOutput,
    LeanExtractionOutput,
    StructuredCatalogueExtractor,
)
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    LEAN_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
)

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
ADAPTER = CatalogueFileAdapter()
FORTINET = RealisationRecord("res-fortinet", RealisationLayer.RESOURCE, "FORTINET_CPE")


def _draft(*records: RealisationRecord) -> ArchitectureKnowledge:
    return ArchitectureKnowledge(
        "draft",
        1,
        (SystemDefinition("cwom", "CWOM"), SystemDefinition("e2eso", "E2ESO")),
        (),
        realisations=records,
    )


def _suggested(record: RealisationRecord) -> CandidateContent:
    return CandidateContent(
        CandidateKind.REALISATION_RECORD, record.id, name=record.name, realisation=record
    )


# Domain -----------------------------------------------------------------------------------


def test_a_record_waits_for_its_systems_and_what_realises_it() -> None:
    firewall = RealisationRecord(
        "cfs-firewall",
        RealisationLayer.CFS,
        "CFSS_ONPREM_FIREWALL_HE",
        system_ids=("CWOM",),
        realised_by=("fortinet cpe",),
    )

    assert classify(_suggested(replace(firewall, system_ids=("Nowhere",))), _draft()) is (
        CandidateMatch.NEEDS_SYSTEM
    )
    assert classify(_suggested(firewall), _draft()) is CandidateMatch.NEEDS_REALISATION
    with pytest.raises(CandidateDependencyError, match="realisation record 'fortinet cpe'"):
        apply_candidate(_suggested(firewall), _draft())

    (_, added) = apply_candidate(_suggested(firewall), _draft(FORTINET)).realisations
    assert (added.system_ids, added.realised_by) == (("cwom",), ("res-fortinet",))


def test_only_a_lower_layer_realises_a_record() -> None:
    other_cfs = RealisationRecord("cfs-other", RealisationLayer.CFS, "FORTINET_CPE_CFS")
    named = RealisationRecord(
        "cfs-x", RealisationLayer.CFS, "CFS_X", realised_by=("FORTINET_CPE_CFS",)
    )

    assert classify(_suggested(named), _draft(other_cfs)) is CandidateMatch.NEEDS_REALISATION


def test_a_record_already_held_gains_names_and_systems_but_keeps_its_own() -> None:
    held = replace(FORTINET, description="The CPE firewall.")
    reading = RealisationRecord(
        "resource-fortinet-cpe",
        RealisationLayer.RESOURCE,
        "fortinet cpe",
        aliases=("FGT-CPE",),
        system_ids=("e2eso",),
        description="Something else.",
    )

    assert classify(_suggested(reading), _draft(held)) is CandidateMatch.UPDATES_EXISTING
    (merged,) = apply_candidate(_suggested(reading), _draft(held)).realisations
    assert merged.id == "res-fortinet"
    assert merged.aliases == ("FGT-CPE",)
    assert merged.system_ids == ("e2eso",)
    assert merged.description == "The CPE firewall."


# The model --------------------------------------------------------------------------------


class _Answer:
    model = "scripted"

    def __init__(self, output: ExtractionOutput) -> None:
        self.output = output

    def parse(self, **_: Any) -> ExtractionOutput:
        return self.output


def _change(**values: Any) -> ChangeOutput:
    base: dict[str, Any] = {
        "kind": "realisation_record",
        "system": "CWOM",
        "name": "CFSS_ONPREM_FIREWALL_HE",
        "name_ar": None,
        "aliases": [],
        "triggers": [],
        "target_system": None,
        "component": None,
        "technology": None,
        "domain": None,
        "parent_domain": None,
        "offering": None,
        "journey": None,
        "text": "The managed firewall on the customer's premises.",
        "evidence_numbers": [1],
        "quote": "CFSS_ONPREM_FIREWALL_HE is realised by FORTINET_CPE",
        "basis": "stated",
        "reasoning": None,
        "relationship_kind": None,
        "channel_kind": None,
        "interface_style": None,
        "portfolio_level": None,
        "realisation_layer": "cfs",
        "realised_by": ["FORTINET_CPE", "CFSS_ONPREM_FIREWALL_HE"],
    }
    return ChangeOutput(**(base | values))


def test_the_model_suggests_a_record_with_its_layer_and_what_realises_it() -> None:
    passage = "CFSS_ONPREM_FIREWALL_HE is realised by FORTINET_CPE, delivered by CWOM."
    output = ExtractionOutput(changes=[_change(), _change(realisation_layer=None, name="X")])

    (change,) = (
        StructuredCatalogueExtractor(_Answer(output), supports_images=False)  # type: ignore[arg-type]
        .propose(ExtractionRequest("Notes", (ExtractionSegment(1, "paragraph 1", passage),), ()))
        .changes
    )

    record = change.content.realisation
    assert record is not None
    assert (record.id, record.layer, record.system_ids, record.realised_by) == (
        "cfs-cfss-onprem-firewall-he",  # "CFSS" is not the layer "cfs", so it is kept
        RealisationLayer.CFS,
        ("cwom",),
        ("FORTINET_CPE",),
    )


def test_only_the_full_reading_proposes_realisation_records() -> None:
    assert "- realisation_record:" in SYSTEM_PROMPT
    assert "- realisation_record:" not in LEAN_SYSTEM_PROMPT
    assert "realisation_layer" not in json.dumps(LeanExtractionOutput.model_json_schema())


# End to end -------------------------------------------------------------------------------

DOCUMENT = b"""# Managed firewall realisation

System: Quokka Firewall Manager
Realisation: CFSS_QUOKKA_FIREWALL [cfs] realised by RFS_QUOKKA_POLICY
Realisation: RFS_QUOKKA_POLICY [rfs] realised by QUOKKA_APPLIANCE

Realisation: QUOKKA_APPLIANCE [resource]

Realisation: CFSS_QUOKKA_FIREWALL [cfs] realised by RFS_QUOKKA_POLICY.
"""


def test_accepting_a_documents_records_adds_them_lowest_first_with_provenance(
    client: TestClient,
) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "Firewall", "language": "en", "expected_revision": draft["revision"]},
        files={"file": ("firewall.md", DOCUMENT, "text/markdown")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    by_name = {
        item["content"]["name"]: item
        for item in listing["suggestions"]
        if item["content"]["kind"] == "realisation_record"
    }
    assert set(by_name) == {"CFSS_QUOKKA_FIREWALL", "RFS_QUOKKA_POLICY", "QUOKKA_APPLIANCE"}
    assert by_name["CFSS_QUOKKA_FIREWALL"]["match"] == CandidateMatch.NEEDS_SYSTEM.value
    assert len(by_name["CFSS_QUOKKA_FIREWALL"]["citations"]) == 2

    accepted = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()

    records = {item["name"]: item for item in accepted["release"]["realisations"]}
    firewall = records["CFSS_QUOKKA_FIREWALL"]
    assert firewall["realised_by"] == [records["RFS_QUOKKA_POLICY"]["id"]]
    assert records["RFS_QUOKKA_POLICY"]["realised_by"] == [records["QUOKKA_APPLIANCE"]["id"]]
    assert firewall["system_ids"] == ["quokka-firewall-manager"]
    assert firewall["accepted"][0]["candidate_id"] == by_name["CFSS_QUOKKA_FIREWALL"]["id"]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_file_format_keeps_where_a_record_came_from(
    file_format: CatalogueFileFormat,
) -> None:
    stamp = AcceptedFrom("c1", "m", "v", "amina", datetime(2026, 10, 21, tzinfo=UTC))
    release = replace(seed_knowledge(), realisations=(replace(FORTINET, accepted=(stamp,)),))

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert read.realisations[0].accepted == (stamp,)


def test_a_records_id_names_its_layer_once() -> None:
    assert record_id(RealisationLayer.RFS, "rfs-quokka-policy") == "rfs-quokka-policy"
    assert record_id(RealisationLayer.RFS, "quokka-policy") == "rfs-quokka-policy"
    assert record_id(RealisationLayer.CFS, "cfss-firewall") == "cfs-cfss-firewall"
