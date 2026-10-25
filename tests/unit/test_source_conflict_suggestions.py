"""Sources and conflicts between them suggested from documents (ADR-0123)."""

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
from knowledge_portal.domain.architecture.governance import (
    ConflictScope,
    ConflictSide,
    KnowledgeSource,
    SourceConflict,
    SourceLevel,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.llm.catalogue_extraction import (
    ChangeOutput,
    ConflictSideOutput,
    ExtractionOutput,
    LeanExtractionOutput,
    StructuredCatalogueExtractor,
)
from knowledge_portal.infrastructure.llm.prompts.catalogue_extraction_prompt import (
    LEAN_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
)
from tests.catalogue_seed import seed_knowledge

OWNER = {"X-Fake-Actor-Id": "fake-owner"}
ADAPTER = CatalogueFileAdapter()
SDD = KnowledgeSource("src-sdd", "Business Pro Plus SDD", SourceLevel.L2, short="BPP SDD")
HLD = KnowledgeSource("src-hld", "SMB High-level design", SourceLevel.L1, short="SMB HLD")
SPEED = SourceConflict(
    "conflict-speed",
    "Upload speed",
    ConflictSide("BPP SDD", "Upload is 100 Mbps."),
    ConflictSide("smb hld", "Upload is 50 Mbps."),
    scope=(ConflictScope("Business Pro Plus"),),
)


def _draft(
    sources: tuple[KnowledgeSource, ...] = (),
    products: tuple[ProductOffering, ...] = (),
    conflicts: tuple[SourceConflict, ...] = (),
) -> ArchitectureKnowledge:
    return ArchitectureKnowledge(
        "draft", 1, (), (), sources=sources, products=products, conflicts=conflicts
    )


def _source(source: KnowledgeSource) -> CandidateContent:
    return CandidateContent(
        CandidateKind.SOURCE, source.id, name=source.title, knowledge_source=source
    )


def _conflict(conflict: SourceConflict) -> CandidateContent:
    return CandidateContent(
        CandidateKind.CONFLICT, conflict.id, name=conflict.title, conflict=conflict
    )


# Domain -----------------------------------------------------------------------------------


def test_a_source_already_registered_is_filled_never_relevelled() -> None:
    reading = KnowledgeSource(
        "src-other", "business pro plus sdd", SourceLevel.L3, version="2.3", short="X"
    )

    assert classify(_source(SDD), _draft()) is CandidateMatch.NEW
    assert classify(_source(reading), _draft((SDD,))) is CandidateMatch.UPDATES_EXISTING
    (held,) = apply_candidate(_source(reading), _draft((SDD,))).sources
    assert (held.id, held.level, held.short, held.version) == (
        "src-sdd",
        SourceLevel.L2,
        "BPP SDD",
        "2.3",
    )


def test_a_conflict_waits_for_its_sources_then_its_offerings() -> None:
    offering = ProductOffering("bpp", "Business Pro Plus")

    assert classify(_conflict(SPEED), _draft()) is CandidateMatch.NEEDS_SOURCE
    with pytest.raises(CandidateDependencyError, match="source 'BPP SDD'"):
        apply_candidate(_conflict(SPEED), _draft())
    assert classify(_conflict(SPEED), _draft((SDD, HLD))) is CandidateMatch.NEEDS_OFFERING

    (recorded,) = apply_candidate(_conflict(SPEED), _draft((SDD, HLD), (offering,))).conflicts
    assert (recorded.a.source_id, recorded.b.source_id) == ("src-sdd", "src-hld")
    assert [item.product_id for item in recorded.scope] == ["bpp"]


def test_a_conflict_already_recorded_gains_offerings_but_keeps_its_sides() -> None:
    held = replace(
        SPEED,
        a=replace(SPEED.a, source_id="src-sdd"),
        b=replace(SPEED.b, source_id="src-hld"),
        scope=(),
    )
    offering = ProductOffering("bpp", "Business Pro Plus")
    reading = replace(SPEED, id="x", a=ConflictSide("SMB HLD", "Something else."))
    draft = _draft((SDD, HLD), (offering,), (held,))

    assert classify(_conflict(reading), draft) is CandidateMatch.UPDATES_EXISTING
    (recorded,) = apply_candidate(_conflict(reading), draft).conflicts
    assert recorded.a.statement == "Upload is 100 Mbps."
    assert [item.product_id for item in recorded.scope] == ["bpp"]


# The model --------------------------------------------------------------------------------


class _Answer:
    model = "scripted"

    def __init__(self, output: ExtractionOutput) -> None:
        self.output = output

    def parse(self, **_: Any) -> ExtractionOutput:
        return self.output


def _change(**values: Any) -> ChangeOutput:
    base: dict[str, Any] = {
        "kind": "source",
        "system": "",
        "name": "Business Pro Plus SDD",
        "aliases": ["BPP SDD"],
        "triggers": [],
        "target_system": None,
        "component": None,
        "technology": None,
        "domain": None,
        "parent_domain": None,
        "offering": None,
        "journey": None,
        "text": "The design of Business Pro Plus.",
        "evidence_numbers": [1],
        "quote": "BPP SDD says upload is 100 Mbps; the SMB HLD says 50 Mbps",
        "basis": "stated",
        "reasoning": None,
        "relationship_kind": None,
        "channel_kind": None,
        "interface_style": None,
        "portfolio_level": None,
        "realisation_layer": None,
        "realised_by": [],
        "source_level": None,
        "source_version": "2.3",
        "conflict_sides": [],
        "affected_offerings": [],
    }
    return ChangeOutput(**(base | values))


def test_the_model_suggests_a_source_at_l3_and_a_conflict_with_its_sides() -> None:
    passage = "BPP SDD says upload is 100 Mbps; the SMB HLD says 50 Mbps."
    sides = [
        ConflictSideOutput(source="BPP SDD", statement="Upload is 100 Mbps.", reference="§4"),
        ConflictSideOutput(source="SMB HLD", statement="Upload is 50 Mbps.", reference=None),
    ]
    output = ExtractionOutput(
        changes=[
            _change(),
            _change(
                kind="conflict",
                name="Upload speed",
                aliases=[],
                text="The upload speed.",
                source_version=None,
                conflict_sides=sides,
                affected_offerings=["Business Pro Plus"],
            ),
            _change(kind="conflict", name="One-sided", conflict_sides=sides[:1]),
        ]
    )

    source, conflict = (
        item.content
        for item in StructuredCatalogueExtractor(_Answer(output), supports_images=False)  # type: ignore[arg-type]
        .propose(ExtractionRequest("Notes", (ExtractionSegment(1, "paragraph 1", passage),), ()))
        .changes
    )

    assert source.knowledge_source == KnowledgeSource(
        "src-bpp-sdd",
        "Business Pro Plus SDD",
        SourceLevel.L3,
        short="BPP SDD",
        version="2.3",
        authority="The design of Business Pro Plus.",
    )
    assert conflict.conflict is not None
    assert (conflict.conflict.a.source_id, conflict.conflict.a.reference) == ("BPP SDD", "§4")
    assert [item.product_id for item in conflict.conflict.scope] == ["Business Pro Plus"]


def test_only_the_full_reading_proposes_sources_and_conflicts() -> None:
    assert "- conflict:" in SYSTEM_PROMPT
    assert "- conflict:" not in LEAN_SYSTEM_PROMPT
    assert "conflict_sides" not in json.dumps(LeanExtractionOutput.model_json_schema())


# End to end -------------------------------------------------------------------------------

DOCUMENT = b"""# Where the upload speed comes from

Source: Quokka Product Design [L2] as QPD

Source: Wombat Landscape Notes as WLN

Conflict: Quokka upload speed; QPD says upload is 100 Mbps; WLN says upload is 50 Mbps
"""


def test_a_conflict_is_decided_alone_once_its_sources_are_registered(
    client: TestClient,
) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    uploaded = client.post(
        f"/architecture-knowledge/releases/{draft['id']}/documents",
        data={"title": "Speeds", "expected_revision": draft["revision"]},
        files={"file": ("speeds.md", DOCUMENT, "text/markdown")},
        headers=OWNER,
    ).json()
    base = f"/architecture-knowledge/releases/{draft['id']}"
    client.post(f"{base}/documents/{uploaded['documents'][-1]['id']}/extractions", headers=OWNER)
    listing = client.get(f"{base}/suggestions", headers=OWNER).json()
    by_kind = {
        item["content"]["name"]: item
        for item in listing["suggestions"]
        if item["content"]["kind"] in {"source", "conflict"}
    }
    assert by_kind["Quokka upload speed"]["match"] == CandidateMatch.NEEDS_SOURCE.value
    assert by_kind["Wombat Landscape Notes"]["content"]["knowledge_source"]["level"] == "L3"

    bulk = client.post(
        f"{base}/suggestions/acceptance",
        json={"expected_revision": listing["release_revision"]},
        headers=OWNER,
    ).json()
    assert bulk["remaining"] == 1
    assert {item["short"] for item in bulk["release"]["sources"]} >= {"QPD", "WLN"}
    assert bulk["release"]["conflicts"] == []

    decided = client.post(
        f"{base}/suggestions/{by_kind['Quokka upload speed']['id']}/decision",
        json={"expected_revision": bulk["release"]["revision"], "accept": True},
        headers=OWNER,
    )
    assert decided.status_code == 200, decided.text
    (conflict,) = decided.json()["conflicts"]
    assert (conflict["a"]["source_id"], conflict["b"]["source_id"]) == ("src-qpd", "src-wln")
    assert conflict["accepted"][0]["candidate_id"] == by_kind["Quokka upload speed"]["id"]


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_file_format_keeps_where_a_source_and_a_conflict_came_from(
    file_format: CatalogueFileFormat,
) -> None:
    stamp = AcceptedFrom("c1", "m", "v", "amina", datetime(2026, 10, 21, tzinfo=UTC))
    conflict = replace(
        SPEED,
        a=replace(SPEED.a, source_id="src-sdd"),
        b=replace(SPEED.b, source_id="src-hld"),
        scope=(),
        accepted=(stamp,),
    )
    release = replace(
        seed_knowledge(),
        sources=(replace(SDD, accepted=(stamp,)), HLD),
        conflicts=(conflict,),
    )

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert read.sources[0].accepted == (stamp,)
    assert read.conflicts[0].accepted == (stamp,)
