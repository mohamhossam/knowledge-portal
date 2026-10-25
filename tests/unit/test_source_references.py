"""A fact's source line is read once, and an acceptance keeps where it was read.

Review recommendation 5: one rule reads a source line against the register, and every
version the API sends carries those readings, so no screen matches a line itself.
Review recommendation 6: an accepted suggestion's first citations stay with the fact,
naming the document version they came from, after the suggestion itself is gone.
"""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.citations import source_reference, source_references
from knowledge_portal.domain.architecture.governance import KnowledgeSource, SourceLevel
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.knowledge import (
    KnowledgeCapability,
    SystemComponent,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.provenance import (
    MAX_ACCEPTED_CITATIONS,
    AcceptedCitation,
    AcceptedFrom,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    AcceptedFromSchema,
    ExplorerReleaseResponse,
    KnowledgeReleaseResponse,
)
from tests.catalogue_seed import seed_knowledge

ADAPTER = CatalogueFileAdapter()
SDD = KnowledgeSource("sdd", "Solution design", SourceLevel.L2, short="SDD v2.3")
SDD_OLD = KnowledgeSource("sdd2", "Solution design, old", SourceLevel.L3, short="SDD v2")
REF = KnowledgeSource("ref", "SMB reference", SourceLevel.L1, short="SMB reference v1.0")
SOURCES = (SDD, SDD_OLD, REF)
NOW = datetime(2026, 10, 22, 9, 0, tzinfo=UTC)


# Recommendation 5 ---------------------------------------------------------------------------


def test_a_line_names_its_source_and_says_where_in_it() -> None:
    reference = source_reference("SDD v2.3 · §P1 · a note", SOURCES)

    assert reference.source_id == "sdd"
    assert reference.cited == "SDD v2.3"
    assert reference.rest == "· §P1 · a note"
    assert reference.where == "§P1 · a note"


@pytest.mark.parametrize(
    ("text", "source_id"),
    [
        # "SDD v2" must not take "SDD v2.3"'s facts: a point and a digit carry on a number.
        ("SDD v2.3 §4", "sdd"),
        ("SDD v2 §4", "sdd2"),
        # Any case, and by id as well as by short name.
        ("smb reference v1.0 · §3.1", "ref"),
        ("REF §2", "ref"),
        # A name ends where a word does.
        ("SDDX §1", None),
        ("An email from the architect", None),
    ],
)
def test_one_rule_reads_every_line(text: str, source_id: str | None) -> None:
    assert source_reference(text, SOURCES).source_id == source_id


def test_the_words_cited_are_the_name_that_matched_as_a_whole_word() -> None:
    # Its short name runs on into "SDD v2.3x"; its id "sdd" names it as a whole word.
    reference = source_reference("SDD v2.3x §1", (SDD,))

    assert (reference.source_id, reference.cited, reference.rest) == ("sdd", "SDD", "v2.3x §1")


def test_a_line_that_names_no_registered_source_is_all_where() -> None:
    reference = source_reference("An email from the architect", SOURCES)

    assert (reference.cited, reference.rest, reference.where) == (
        None,
        None,
        "An email from the architect",
    )


def test_a_version_reads_each_distinct_line_once_and_both_responses_carry_them() -> None:
    capability = KnowledgeCapability("c", "Billing", ("bill",), source="SDD v2.3 · §4")
    component = SystemComponent("m", "Rating", source="SDD v2.3 · §4")
    system = SystemDefinition(
        "biller",
        "Biller",
        capabilities=(capability,),
        components=(component,),
        source="Email",
    )
    release = replace(seed_knowledge(), systems=(system,), relationships=(), sources=SOURCES)

    references = source_references(release)

    texts = [item.text for item in references]
    # Two facts writing one line read it once.
    assert len(texts) == len(set(texts))
    assert {"Email", "SDD v2.3 · §4"} <= set(texts)
    for response in (
        KnowledgeReleaseResponse.from_domain(release),
        ExplorerReleaseResponse.from_domain(release),
    ):
        sent = {item.text: item for item in response.source_references}
        assert sent["SDD v2.3 · §4"].source_id == "sdd"
        assert sent["Email"].source_id is None


# Recommendation 6 ---------------------------------------------------------------------------

CITED = AcceptedCitation(
    "§4.1 › Table 2, row 3", "CWOM tracks orders", "doc-1", "Integration design"
)
ACCEPTED = AcceptedFrom("cand-1", "fake", "v3", "fake-owner", NOW, (CITED,))


def test_an_acceptance_keeps_at_most_three_citations_with_their_document() -> None:
    assert ACCEPTED.citations[0].document == "Integration design"
    with pytest.raises(InvalidKnowledgeError, match="at most"):
        AcceptedFrom("c", "m", "v", "a", NOW, (CITED,) * (MAX_ACCEPTED_CITATIONS + 1))
    with pytest.raises(InvalidKnowledgeError):
        AcceptedCitation("  ", "quote")
    # A suggestion read from the catalogue or a change request names no document.
    assert AcceptedCitation("Catalogue › 3 activities", "Order Handling").document is None


@pytest.mark.parametrize(
    "file_format", [CatalogueFileFormat.YAML, CatalogueFileFormat.JSON, CatalogueFileFormat.XLSX]
)
def test_every_catalogue_file_format_keeps_what_an_acceptance_cites(
    file_format: CatalogueFileFormat,
) -> None:
    system = SystemDefinition("tracker", "Tracker", accepted=(ACCEPTED,))
    release = replace(seed_knowledge(), systems=(*seed_knowledge().systems, system))

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    tracker = next(item for item in content.systems if item.id == "tracker")
    assert tracker.accepted == (ACCEPTED,)


def test_a_file_with_malformed_citations_says_where() -> None:
    system = SystemDefinition("tracker", "Tracker", accepted=(ACCEPTED,))
    release = replace(seed_knowledge(), systems=(*seed_knowledge().systems, system))
    raw = json.loads(ADAPTER.write(CatalogueFileFormat.JSON, release))
    raw["acceptances"][0]["citations"] = [{"location": "§1"}]

    with pytest.raises(InvalidKnowledgeError, match="citation 1"):
        ADAPTER.read(CatalogueFileFormat.JSON, json.dumps(raw).encode())


def test_the_api_sends_what_an_acceptance_cites() -> None:
    sent = AcceptedFromSchema.from_domain(ACCEPTED)

    assert [(item.document, item.location, item.quote) for item in sent.citations] == [
        ("Integration design", "§4.1 › Table 2, row 3", "CWOM tracks orders")
    ]
