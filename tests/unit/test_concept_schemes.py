"""Vocabularies as data, on one SKOS base shared by concepts and terms (recommendation 9).

A curator defines a vocabulary with the version (``ConceptScheme``), covering free-text
fields such as an offering's business-rule kinds or a portfolio level, so a new list needs
no deploy. Its terms are ordinary vocabulary terms; the clean-up reads the fields it covers
and links them once a maintainer accepts. Concepts and terms check their shape in one
place and both carry close matches beside their exact one.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateKind,
    apply_candidate,
)
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge, SystemComponent
from knowledge_portal.domain.architecture.products import NfrCoverage, OfferingNfr
from knowledge_portal.domain.architecture.vocabularies import (
    ConceptScheme,
    VocabularyField,
    VocabularyScheme,
    VocabularyTerm,
    check_schemes,
)
from knowledge_portal.domain.architecture.vocabulary_cleanup import propose_terms
from knowledge_portal.domain.architecture.vocabulary_links import (
    kept_journey_terms,
    kept_offering_terms,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    BusinessCapabilitySchema,
    ConceptSchemeSchema,
    VocabularyTermSchema,
)

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()
RULE_KINDS = ConceptScheme(
    "rule_kind",
    "Business rule kind",
    "How a source groups rules.",
    (VocabularyField.RULE_KIND,),
)
LEVELS = ConceptScheme(
    "portfolio_level", "Portfolio level", fields=(VocabularyField.PORTFOLIO_LEVEL,)
)
NFR_QUALITIES = ConceptScheme("nfr_quality", "NFR quality", fields=(VocabularyField.NFR_QUALITY,))


def _catalogue() -> ArchitectureKnowledge:
    return knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))


def _accept_all(release: ArchitectureKnowledge) -> ArchitectureKnowledge:
    for proposal in propose_terms(release):
        content = CandidateContent(
            CandidateKind.VOCABULARY_TERM,
            proposal.term.id,
            term=proposal.term,
            value_refs=proposal.refs,
        )
        release = apply_candidate(content, release)
    return release


# One SKOS base -------------------------------------------------------------------------------


def _concept(**extra: Any) -> BusinessCapability:
    return BusinessCapability("cap-x", "Order capture", **extra)


def _term(**extra: Any) -> VocabularyTerm:
    return VocabularyTerm("etom-x", VocabularyScheme.ETOM_PROCESS, "Capture", **extra)


@pytest.mark.parametrize(
    ("make", "own_id"), [(_concept, "cap-x"), (_term, "etom-x")], ids=["concept", "term"]
)
def test_a_concept_and_a_term_check_their_shape_alike(
    make: Callable[..., BusinessCapability | VocabularyTerm], own_id: str
) -> None:
    assert make(close_match=(" ODA Capture ",)).close_match == ("ODA Capture",)
    with pytest.raises(InvalidKnowledgeError, match="each close match is named once"):
        make(close_match=("ODA", "ODA"))
    with pytest.raises(InvalidKnowledgeError, match="is its exact match, so it is not also"):
        make(exact_match="ODA", close_match=("ODA",))
    with pytest.raises(InvalidKnowledgeError, match="cannot be broader than itself"):
        make(broader_id=own_id)


# Vocabularies as data ------------------------------------------------------------------------


def test_a_curated_vocabulary_covers_free_text_fields_only() -> None:
    with pytest.raises(InvalidKnowledgeError, match="is a built-in vocabulary"):
        ConceptScheme("etom_process", "Processes")
    with pytest.raises(InvalidKnowledgeError, match="lower case letters"):
        ConceptScheme("NFR quality", "NFR quality")
    with pytest.raises(InvalidKnowledgeError, match="already has its built-in vocabulary"):
        ConceptScheme("steps", "Steps", fields=(VocabularyField.ACTIVITY_ETOM,))
    with pytest.raises(InvalidKnowledgeError, match="covers fields among"):
        ConceptScheme("steps", "Steps", fields=("nowhere",))  # type: ignore[arg-type]
    with pytest.raises(InvalidKnowledgeError, match="already names the vocabulary"):
        check_schemes((ConceptScheme("processes", "eTOM process"),))
    with pytest.raises(InvalidKnowledgeError, match="covered by Business rule kind already"):
        check_schemes((RULE_KINDS, ConceptScheme("kinds", "Kinds", fields=("rule_kind",))))  # type: ignore[arg-type]


def test_a_version_holds_terms_of_its_own_vocabularies_and_links_them_by_field() -> None:
    release = _catalogue()
    (bpp,) = release.products
    billing = VocabularyTerm("rule-kind-billing", "rule_kind", "Billing")
    rule = next(item for item in bpp.business_rules if item.kind == "billing")

    def linked(term_id: str) -> ArchitectureKnowledge:
        rules = tuple(
            replace(item, kind_id=term_id) if item is rule else item for item in bpp.business_rules
        )
        return release.updated(products=(replace(bpp, business_rules=rules),))

    with pytest.raises(InvalidKnowledgeError, match="vocabulary 'rule_kind', which is not in"):
        release.updated(vocabulary=(*release.vocabulary, billing))
    release = release.updated(schemes=(RULE_KINDS,), vocabulary=(*release.vocabulary, billing))
    rules = linked(billing.id).products[0].business_rules
    assert next(item for item in rules if item.id == rule.id).kind_id == billing.id
    # Linked to a term of another vocabulary, or where no vocabulary covers the field.
    other = next(item for item in release.vocabulary if item.scheme is VocabularyScheme.OPEN_API)
    with pytest.raises(InvalidKnowledgeError, match="not in the Business rule kind vocabulary"):
        linked(other.id)
    with pytest.raises(InvalidKnowledgeError, match="no vocabulary covers it"):
        linked(billing.id).updated(schemes=(replace(RULE_KINDS, fields=()),))


def test_the_clean_up_reads_a_field_once_a_curated_vocabulary_covers_it() -> None:
    release = _catalogue()
    assert not any(
        ref.field is VocabularyField.RULE_KIND
        for item in propose_terms(release)
        for ref in item.refs
    )

    release = _accept_all(release.updated(schemes=(RULE_KINDS, LEVELS)))

    (bpp,) = release.products
    kinds = {rule.kind: rule.kind_id for rule in bpp.business_rules if rule.kind is not None}
    assert kinds["billing"] == "rule-kind-billing"
    assert all(kinds.values())
    assert {node.level: node.level_id for node in release.portfolio}["Segment"] == (
        "portfolio-level-segment"
    )
    added = next(item for item in release.vocabulary if item.id == "rule-kind-billing")
    assert (added.scheme, added.pref_label) == ("rule_kind", "billing")
    # Read again, nothing is left to link in either vocabulary.
    assert not any(
        ref.field in {VocabularyField.RULE_KIND, VocabularyField.PORTFOLIO_LEVEL}
        for item in propose_terms(release)
        for ref in item.refs
    )


def test_a_reading_keeps_the_terms_a_maintainer_linked() -> None:
    release = _catalogue()
    (bpp,) = release.products
    kept = replace(
        bpp,
        family_id="family-internet",
        nfrs=(
            OfferingNfr("Availability", NfrCoverage.DEFINED, quality_id="nfr-quality-availability"),
        ),
    )
    read_again = replace(bpp, nfrs=(OfferingNfr("Availability", NfrCoverage.PARTIAL),))

    offering = kept_offering_terms(read_again, kept)

    assert offering.family_id == "family-internet"
    assert offering.nfrs[0].quality_id == "nfr-quality-availability"
    # A value written differently now is not the one that was linked.
    assert kept_offering_terms(replace(read_again, family="Other"), kept).family_id is None

    journey = release.journeys[0]
    step = replace(journey.activities[0], mode="Automated", mode_id="mode-automated")
    linked = replace(journey, activities=(step, *journey.activities[1:]))
    again = replace(linked, activities=(replace(step, mode_id=None), *journey.activities[1:]))
    assert kept_journey_terms(again, linked).activities[0].mode_id == "mode-automated"


# Files, diff and API -------------------------------------------------------------------------


def _curated() -> ArchitectureKnowledge:
    release = _accept_all(_catalogue().updated(schemes=(RULE_KINDS, LEVELS, NFR_QUALITIES)))
    (bpp,) = release.products
    quality = VocabularyTerm(
        "nfr-quality-availability", "nfr_quality", "Availability", close_match=("ISO 25010",)
    )
    system = release.systems[0]
    concept = release.business_capabilities[0]
    return release.updated(
        vocabulary=(*release.vocabulary, quality),
        products=(
            replace(
                bpp,
                nfrs=(OfferingNfr("Availability", NfrCoverage.DEFINED, quality_id=quality.id),),
            ),
        ),
        systems=(
            replace(
                system,
                components=(SystemComponent("api", "Order API", technology="Microservice"),),
            ),
            *release.systems[1:],
        ),
        business_capabilities=(
            replace(concept, close_match=("TMF ODA Order Management",)),
            *release.business_capabilities[1:],
        ),
    )


@pytest.mark.parametrize(
    "file_format", [CatalogueFileFormat.YAML, CatalogueFileFormat.JSON, CatalogueFileFormat.XLSX]
)
def test_every_catalogue_file_format_keeps_vocabularies_and_their_links(
    file_format: CatalogueFileFormat,
) -> None:
    release = _curated()

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.schemes == release.schemes
    assert {item.id: item for item in content.vocabulary}["nfr-quality-availability"] == next(
        item for item in release.vocabulary if item.id == "nfr-quality-availability"
    )
    assert content.business_capabilities[0].close_match == ("TMF ODA Order Management",)
    (bpp,) = content.products
    assert bpp.nfrs[0].quality_id == "nfr-quality-availability"
    assert all(rule.kind_id for rule in bpp.business_rules if rule.kind)
    assert all(node.level_id for node in content.portfolio)


def test_a_file_term_names_a_vocabulary_it_lists() -> None:
    raw = (
        b'{"systems": [], "schemes": [{"id": "nfr_quality", "name": "NFR quality"}], '
        b'"vocabulary": [{"id": "q", "scheme": "nfr_quality", "pref_label": "Availability"}]}'
    )

    content = ADAPTER.read(CatalogueFileFormat.JSON, raw)

    assert content.vocabulary[0].scheme == "nfr_quality"


def test_the_version_diff_reports_a_vocabulary_and_the_links_it_made() -> None:
    base = _catalogue()
    draft = _accept_all(base.updated(schemes=(RULE_KINDS,)))

    changes = diff_releases(base, draft).changes

    added = next(item for item in changes if item.item is ChangedItem.VOCABULARY)
    assert (added.change, added.key) == (ChangeKind.ADDED, "rule_kind")
    offering = next(item for item in changes if item.item is ChangedItem.PRODUCT)
    # The rules read the same; only what they are linked to changed.
    assert offering.fields == ("vocabulary_links",)


def test_the_api_carries_vocabularies_and_close_matches_both_ways() -> None:
    term = VocabularyTerm("q", "nfr_quality", "Availability", close_match=("ISO 25010",))
    concept = BusinessCapability("cap-x", "Order capture", close_match=("ODA",))

    assert ConceptSchemeSchema.from_domain(NFR_QUALITIES).to_domain() == NFR_QUALITIES
    assert VocabularyTermSchema.from_domain(term).to_domain() == term
    assert BusinessCapabilitySchema.from_domain(concept).to_domain() == concept
    assert VocabularyTermSchema.from_domain(term).scheme == "nfr_quality"
