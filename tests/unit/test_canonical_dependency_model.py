"""A dependency is identified by its source, target and kind (ADR-0119)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

import pytest
from pydantic import TypeAdapter

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateKind,
    CandidateMatch,
    apply_candidate,
    classify,
)
from knowledge_portal.domain.architecture.diff import ChangeKind, diff_releases
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeReleaseStatus,
    RelationshipKind,
    SystemRelationship,
    with_purpose,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from tests.catalogue_seed import seed_knowledge

ADAPTER = CatalogueFileAdapter()
CALLS, EVENTS = RelationshipKind.CALLS_API, RelationshipKind.PUBLISHES_EVENTS_TO
NOW = datetime(2026, 10, 21, tzinfo=UTC)


def _draft(*relationships: SystemRelationship) -> ArchitectureKnowledge:
    return replace(
        seed_knowledge(),
        id="draft",
        status=KnowledgeReleaseStatus.DRAFT,
        relationships=relationships,
    )


def _between(release: ArchitectureKnowledge, source: str, target: str) -> list[SystemRelationship]:
    return [
        item
        for item in release.relationships
        if (item.source_system_id, item.target_system_id) == (source, target)
    ]


def _entry(candidate_id: str) -> dict[str, str]:
    return {
        "candidate_id": candidate_id,
        "model": "m",
        "prompt_version": "v",
        "decided_by": "amina",
        "decided_at": NOW.isoformat(),
    }


def test_a_release_recorded_before_reads_with_one_dependency_per_kind() -> None:
    adapter: TypeAdapter[ArchitectureKnowledge] = TypeAdapter(ArchitectureKnowledge)
    stored = adapter.dump_python(_draft(SystemRelationship("bcrm", "dcrm", "Lookup")), mode="json")
    (edge,) = stored["relationships"]
    # As a release stored while the description was part of the identity may hold them.
    stored["relationships"] = [
        edge,
        {
            **edge,
            "description": "Quotes",
            "confidence": "inferred",
            "source": "SDD §4",
            "accepted": [_entry("c1")],
        },
        {**edge, "description": "lookup", "accepted": [_entry("c2")]},
    ]

    (merged,) = adapter.validate_python(stored).relationships

    assert merged.description == "Lookup; Quotes"
    assert (merged.confidence, merged.source) == (SourceConfidence.INFERRED, "SDD §4")
    assert [item.candidate_id for item in merged.accepted] == ["c1", "c2"]


def test_two_kinds_between_one_pair_are_two_dependencies() -> None:
    draft = _draft(
        SystemRelationship("bcrm", "dcrm", "Lookup", CALLS),
        SystemRelationship("bcrm", "dcrm", "Order events", EVENTS),
    )

    assert {item.kind for item in _between(draft, "bcrm", "dcrm")} == {CALLS, EVENTS}


def test_a_purpose_joins_a_description_once() -> None:
    assert with_purpose("Lookup", "Quotes") == "Lookup; Quotes"
    assert with_purpose("Lookup; Quotes", " quotes ") == "Lookup; Quotes"


def _suggestion(text: str, kind: RelationshipKind | None = None) -> CandidateContent:
    return CandidateContent(
        CandidateKind.RELATIONSHIP,
        "bcrm",
        target_system_id="dcrm",
        text=text,
        relationship_kind=kind,
    )


def test_a_suggestion_reworded_adds_its_purpose_to_the_same_dependency() -> None:
    draft = _draft(SystemRelationship("bcrm", "dcrm", "Lookup", CALLS))

    assert classify(_suggestion("lookup", CALLS), draft) is CandidateMatch.ALREADY_PRESENT
    assert classify(_suggestion("Quotes", CALLS), draft) is CandidateMatch.UPDATES_EXISTING
    (dependency,) = _between(apply_candidate(_suggestion("Quotes", CALLS), draft), "bcrm", "dcrm")
    assert (dependency.kind, dependency.description) == (CALLS, "Lookup; Quotes")


def test_a_suggestion_of_another_kind_is_another_dependency() -> None:
    draft = _draft(SystemRelationship("bcrm", "dcrm", "Lookup", CALLS))

    assert classify(_suggestion("Order events", EVENTS), draft) is CandidateMatch.NEW
    kinds = {
        item.kind
        for item in _between(
            apply_candidate(_suggestion("Order events", EVENTS), draft), "bcrm", "dcrm"
        )
    }
    assert kinds == {CALLS, EVENTS}


def test_a_suggestion_that_says_no_kind_means_the_pairs_only_dependency() -> None:
    draft = _draft(SystemRelationship("bcrm", "dcrm", "Lookup", CALLS))

    assert classify(_suggestion("Lookup"), draft) is CandidateMatch.ALREADY_PRESENT
    two = _draft(
        SystemRelationship("bcrm", "dcrm", "Lookup", CALLS),
        SystemRelationship("bcrm", "dcrm", "Order events", EVENTS),
    )
    # Two kinds and no word on which: a dependency of its own, until a person says how.
    assert classify(_suggestion("Lookup"), two) is CandidateMatch.NEW


def test_the_diff_names_a_dependencys_changed_fields() -> None:
    base = _draft(SystemRelationship("bcrm", "dcrm", "Lookup", CALLS))
    sourced = _draft(
        SystemRelationship(
            "bcrm", "dcrm", "Lookup", CALLS, confidence=SourceConfidence.CONFIRMED, source="SDD"
        )
    )

    (change,) = diff_releases(base, sourced).changes

    assert (change.change, change.key, change.fields) == (
        ChangeKind.CHANGED,
        "bcrm->dcrm:calls_api",
        ("confidence", "source"),
    )


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_every_file_format_carries_where_a_dependency_is_said(
    file_format: CatalogueFileFormat,
) -> None:
    draft = _draft(
        SystemRelationship(
            "bcrm", "dcrm", "Lookup", CALLS, confidence=SourceConfidence.INFERRED, source="SDD §4"
        )
    )

    read = ADAPTER.read(file_format, ADAPTER.write(file_format, draft))

    assert read.relationships == draft.relationships
