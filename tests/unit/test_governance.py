"""Where the catalogue's knowledge comes from, and where its sources disagree
(requirement-portal ADR-0101, step 5)."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.diff import ChangedItem, diff_releases
from knowledge_portal.domain.architecture.governance import (
    ArchitectureDecision,
    ConflictScope,
    ConflictSide,
    KnowledgeSource,
    OpenQuestion,
    SourceConflict,
    SourceLevel,
    named_source,
    source_level,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    KnowledgeReleaseStatus,
)
from knowledge_portal.domain.architecture.products import (
    OrderType,
    ProductOffering,
    merge_offerings,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge

ADAPTER = CatalogueFileAdapter()
OWNER = {"X-Fake-Actor-Id": "fake-owner"}
SEED = seed_knowledge()
CANON = KnowledgeSource("CANON", "SMB Reference", SourceLevel.L1, short="SMB Ref")
SDD = KnowledgeSource("SDD", "BPP Solution Design", "l2", short="BPP SDD", version="2.3")  # type: ignore[arg-type]
V82 = KnowledgeSource("V82", "Explorer v8.2", "Level 3", short="v8.2", supplied=False)  # type: ignore[arg-type]
QUESTION = OpenQuestion("OQ-01", "Is B2B Digital in scope for Up / Downgrade?", "Shown as not.")
OFFERING = ProductOffering(
    "bpp",
    "Business Pro Plus",
    order_types=(OrderType("NEW", "New Activation"), OrderType("UPDOWN", "Up / Downgrade")),
    sources=("SDD", "CANON"),
    primary_source="SDD",
    questions=(QUESTION,),
    decisions=(ArchitectureDecision("AD-01", "Reuse O2D", "No new order flow."),),
    boundaries=("Runtime from the SDD.",),
    not_used=("Siebel CRM",),
)
CONFLICT = SourceConflict(
    "CF-01",
    "Up / Downgrade channel scope",
    ConflictSide("SDD", "BCRM and SMB App only.", "§11.1.3"),
    ConflictSide("V82", "B2B allowed.", "OrderEvaluate"),
    scope=(ConflictScope("bpp", ("UPDOWN",), "OQ-01"),),
    difference="Whether B2B is an entry channel.",
    impact="B2B disabled until resolved.",
    decision="Product owner to confirm.",
)


def _release(**changes: Any) -> ArchitectureKnowledge:
    fields: dict[str, Any] = {
        "products": (OFFERING,),
        "sources": (CANON, SDD, V82),
        "conflicts": (CONFLICT,),
        "journeys": (),
    }
    return replace(SEED, **{**fields, **changes})


def test_a_level_is_read_however_it_is_written() -> None:
    assert (SDD.level, V82.level) == (SourceLevel.L2, SourceLevel.L3)
    assert source_level("2") is SourceLevel.L2
    with pytest.raises(InvalidKnowledgeError, match="L1, L2 or L3"):
        source_level("L4")


def test_a_facts_source_text_names_a_registered_source_by_id_or_short_name() -> None:
    sources = (CANON, SDD, KnowledgeSource("SDDA", "Annex", SourceLevel.L2, short="BPP SDD Annex"))

    assert named_source("BPP SDD §11.1.3", sources) is SDD
    # The longest name wins, and a name must end where a word does.
    assert named_source("BPP SDD Annex §2", sources).id == "SDDA"  # type: ignore[union-attr]
    assert named_source("SDDX §1", sources) is None
    assert named_source("smb ref §0", sources) is CANON
    assert named_source(None, sources) is None


def test_a_conflict_concerns_its_offerings_and_order_types() -> None:
    every = replace(CONFLICT, scope=(ConflictScope("bpp"),))

    assert CONFLICT.concerns("bpp", "updown") and not CONFLICT.concerns("bpp", "NEW")
    assert CONFLICT.concerns("bpp") and not CONFLICT.concerns("op")
    assert every.concerns("bpp", "NEW")


@pytest.mark.parametrize(
    ("build", "message"),
    [
        (lambda: _release(sources=(SDD, SDD)), "Source ids must be unique"),
        (
            lambda: _release(sources=(SDD, replace(V82, short="bpp sdd"))),
            "short name must be its own",
        ),
        (lambda: _release(sources=(CANON, SDD)), "cites source 'V82'"),
        (
            lambda: _release(sources=(SDD, V82)),
            "Business Pro Plus names source 'CANON', which is not in the register",
        ),
        (
            lambda: _release(
                conflicts=(replace(CONFLICT, scope=(ConflictScope("op"),)),),
            ),
            "affects offering 'op'",
        ),
        (
            lambda: _release(
                conflicts=(replace(CONFLICT, scope=(ConflictScope("bpp", ("CEASE",)),)),),
            ),
            "order type 'CEASE', which Business Pro Plus does not have",
        ),
        (
            lambda: _release(products=(replace(OFFERING, questions=()),)),
            "raises question 'OQ-01', which Business Pro Plus does not have",
        ),
        (lambda: _release(conflicts=(CONFLICT, CONFLICT)), "Conflict ids must be unique"),
        (
            lambda: replace(OFFERING, primary_source="V82"),
            "primary source 'V82' is not one of its sources",
        ),
        (
            lambda: replace(OFFERING, questions=(QUESTION, QUESTION)),
            "each question id is used once",
        ),
        (
            lambda: replace(CONFLICT, scope=(ConflictScope("bpp"), ConflictScope("bpp"))),
            "an offering is in its scope once",
        ),
        (lambda: ConflictSide("SDD", " "), "Statement"),
    ],
)
def test_what_governance_refuses(build: Any, message: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match=message):
        build()


def test_a_second_reading_adds_questions_and_decisions_but_never_replaces_one() -> None:
    later = replace(
        OFFERING,
        sources=("V82",),
        primary_source=None,
        questions=(replace(QUESTION, text="Another reading"), OpenQuestion("OQ-02", "And this?")),
        decisions=(),
        boundaries=("Runtime from the SDD.", "Office Presence unchanged."),
    )

    merged = merge_offerings(OFFERING, later)

    assert merged.sources == ("SDD", "CANON", "V82")
    assert merged.primary_source == "SDD"
    assert [item.text for item in merged.questions] == [QUESTION.text, "And this?"]
    assert merged.boundaries == ("Runtime from the SDD.", "Office Presence unchanged.")


def test_the_diff_names_sources_conflicts_and_an_offerings_governance() -> None:
    before = _release()
    after = _release(
        sources=(CANON, replace(SDD, version="2.4"), V82),
        conflicts=(replace(CONFLICT, decision="Architecture board to decide."),),
        products=(replace(OFFERING, decisions=()),),
    )

    changes = {(item.item, item.key): item.fields for item in diff_releases(before, after).changes}

    assert changes[(ChangedItem.SOURCE, "SDD")] == ("version",)
    assert changes[(ChangedItem.CONFLICT, "CF-01")] == ("decision",)
    assert changes[(ChangedItem.PRODUCT, "bpp")] == ("decisions",)


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_catalogue_file_format_round_trips_governance(
    file_format: CatalogueFileFormat,
) -> None:
    release = _release()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.sources == release.sources
    assert content.conflicts == release.conflicts
    assert content.products == release.products


def test_accepting_a_reading_of_an_offering_keeps_the_governance_a_person_recorded() -> None:
    draft = _release(status=KnowledgeReleaseStatus.DRAFT)
    reading = ProductOffering(
        "bpp",
        "Business Pro Plus",
        proposition="Premium internet.",
        order_types=OFFERING.order_types,
    )
    content = CandidateContent(
        CandidateKind.PRODUCT, reading.id, name=reading.name, product=reading
    )

    assert classify(content, draft) is CandidateMatch.UPDATES_EXISTING
    (accepted,) = apply_candidate(content, draft).products

    assert accepted.proposition == "Premium internet."
    assert (accepted.questions, accepted.sources) == (OFFERING.questions, OFFERING.sources)


def test_a_draft_saves_its_registers_through_the_api(client: TestClient) -> None:
    draft = client.post(
        "/architecture-knowledge/releases", json={"name": "Next version"}, headers=OWNER
    ).json()
    url = f"/architecture-knowledge/releases/{draft['id']}"
    body = {
        "systems": draft["systems"],
        "relationships": draft["relationships"],
        "products": [
            {
                "id": "bpp",
                "name": "Business Pro Plus",
                "order_types": [{"code": "UPDOWN", "name": "Up / Downgrade"}],
                "sources": ["SDD"],
                "primary_source": "SDD",
                "questions": [{"id": "OQ-01", "text": "Is B2B in scope?"}],
            }
        ],
        "sources": [
            {"id": "SDD", "title": "Solution design", "level": "L2"},
            {"id": "V82", "title": "Explorer v8.2", "level": "L3", "supplied": False},
        ],
        "conflicts": [
            {
                "id": "CF-01",
                "title": "Channel scope",
                "a": {"source_id": "SDD", "statement": "BCRM only."},
                "b": {"source_id": "V82", "statement": "B2B allowed."},
                "scope": [{"product_id": "bpp", "order_types": ["UPDOWN"], "question_id": "OQ-01"}],
            }
        ],
    }

    saved = client.put(url, json={**body, "expected_revision": draft["revision"]}, headers=OWNER)

    assert saved.status_code == 200, saved.text
    release = saved.json()
    assert [item["level"] for item in release["sources"]] == ["L2", "L3"]
    assert release["conflicts"][0]["scope"][0]["question_id"] == "OQ-01"
    assert release["products"][0]["primary_source"] == "SDD"

    refused = client.put(
        url,
        json={**body, "expected_revision": release["revision"], "sources": body["sources"][:1]},
        headers=OWNER,
    )
    assert refused.status_code == 422
    assert "cites source 'V82'" in refused.text
