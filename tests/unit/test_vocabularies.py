"""Controlled vocabularies: the schemes, the links beside free text, the clean-up and its review."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.domain.architecture.candidates import (
    CandidateCitation,
    CandidateContent,
    CandidateKind,
    CandidateMatch,
    CatalogueCandidate,
    apply_candidate,
    classify,
    needs_one_by_one,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.diff import ChangedItem, ChangeKind, diff_releases
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    ActivityIntegration,
    Journey,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    SystemDefinition,
)
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
    OfferingComponent,
    ProductOffering,
)
from knowledge_portal.domain.architecture.vocabularies import (
    VocabularyScheme,
    VocabularyTerm,
    check_vocabulary,
    match_value,
    term_id_for,
)
from knowledge_portal.domain.architecture.vocabulary_cleanup import propose_terms
from knowledge_portal.domain.architecture.vocabulary_links import (
    VocabularyField,
    VocabularyRef,
    written_values,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.knowledge_yaml import knowledge_from_yaml

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "catalogues" / "smb-architecture.yaml"
ADAPTER = CatalogueFileAdapter()
AT = datetime(2026, 10, 10, 12, tzinfo=UTC)

ETOM = VocabularyScheme.ETOM_PROCESS
ROLE = VocabularyScheme.RESPONSIBILITY_ROLE
API = VocabularyScheme.OPEN_API
FULFILLMENT = VocabularyTerm("etom-fulfillment", ETOM, "Fulfillment", ("Fulfilment",))
ORDERS = VocabularyTerm(
    "etom-order-handling", ETOM, "Order Handling", broader_id="etom-fulfillment"
)
ORCHESTRATE = VocabularyTerm("role-orchestrate", ROLE, "Orchestrate", ("Orchestrates",))
ORDERING = VocabularyTerm("api-tmf622", API, "Product Ordering", notation="TMF622")
ASSISTED = VocabularyTerm("channel-assisted", VocabularyScheme.CHANNEL_KIND, "Assisted")


def _release(**values: object) -> ArchitectureKnowledge:
    fields: dict[str, object] = {
        "id": "draft",
        "revision": 1,
        "systems": (SystemDefinition("cwom", "CWOM"), SystemDefinition("bcrm", "BCRM")),
        "relationships": (),
        "channels": (Channel("shop", "Shop", kind="assisted", entry_system_id="bcrm"),),
        "products": (
            ProductOffering(
                "bpp",
                "Business Pro Plus",
                components=(
                    OfferingComponent(
                        "gpon",
                        "GPON",
                        kind="Service",
                        responsibilities=(
                            ComponentResponsibility("cwom", "ORCHESTRATES", "Orchestrates it"),
                            ComponentResponsibility("bcrm", "SAML", "Single sign-on"),
                        ),
                    ),
                ),
            ),
        ),
        "journeys": (
            Journey(
                "bpp-new",
                "Business Pro Plus › New",
                activities=(
                    Activity(
                        "10",
                        "Capture order",
                        performing_system_id="bcrm",
                        etom="Fulfillment · Order Handling",
                        role="ORCHESTRATE",
                    ),
                    Activity("20", "Activate", performing_system_id="cwom", etom="Assurance · X"),
                ),
                integrations=(
                    ActivityIntegration(
                        "10", "20", tmf_equivalent="TMF622 Product Ordering · TMF681 Communication"
                    ),
                ),
            ),
        ),
        "vocabulary": (FULFILLMENT, ORDERS, ORCHESTRATE, ORDERING, ASSISTED),
    }
    fields.update(values)
    return ArchitectureKnowledge(**fields)  # type: ignore[arg-type]


def _candidate(content: CandidateContent) -> CatalogueCandidate:
    return CatalogueCandidate(
        "c1",
        "draft",
        "vocabulary_cleanup",
        content,
        (CandidateCitation("Catalogue › 1 activity's eTOM process", "x"),),
        "vocabulary-cleanup",
        "vocabulary-cleanup-v1",
        AT,
    )


def _proposal(release: ArchitectureKnowledge, term_id: str) -> CandidateContent:
    found = next(item for item in propose_terms(release) if item.term.id == term_id)
    return CandidateContent(
        CandidateKind.VOCABULARY_TERM, found.term.id, term=found.term, value_refs=found.refs
    )


# The schemes ---------------------------------------------------------------------------------


def test_a_term_s_labels_and_code_differ_and_it_names_a_known_scheme() -> None:
    with pytest.raises(InvalidKnowledgeError, match="must differ"):
        VocabularyTerm("api-1", API, "TMF622", notation="tmf-622")
    with pytest.raises(InvalidKnowledgeError, match="broader than itself"):
        VocabularyTerm("etom-a", ETOM, "A", broader_id="etom-a")
    with pytest.raises(InvalidKnowledgeError, match="A vocabulary is one of"):
        VocabularyTerm("x", "process", "X")  # type: ignore[arg-type]
    assert term_id_for(ETOM, "Order Handling", {"etom-order-handling"}) == "etom-order-handling-2"


def test_each_label_names_one_term_of_its_scheme_and_broader_stays_in_it() -> None:
    with pytest.raises(InvalidKnowledgeError, match="already names the eTOM process"):
        check_vocabulary((FULFILLMENT, VocabularyTerm("etom-b", ETOM, "fulfilment")))
    # One label may name a term in each scheme.
    check_vocabulary((FULFILLMENT, VocabularyTerm("role-f", ROLE, "Fulfillment")))
    with pytest.raises(InvalidKnowledgeError, match="not in the role vocabulary"):
        check_vocabulary(
            (FULFILLMENT, VocabularyTerm("role-x", ROLE, "X", broader_id=FULFILLMENT.id))
        )
    deep = (
        VocabularyTerm("etom-1", ETOM, "One"),
        VocabularyTerm("etom-2", ETOM, "Two", broader_id="etom-1"),
        VocabularyTerm("etom-3", ETOM, "Three", broader_id="etom-2"),
        VocabularyTerm("etom-4", ETOM, "Four", broader_id="etom-3"),
    )
    with pytest.raises(InvalidKnowledgeError, match="at most 3 levels"):
        check_vocabulary(deep)


def test_a_field_names_only_known_terms_of_its_own_scheme() -> None:
    release = _release()
    journey = release.journeys[0]
    wrong = replace(
        journey,
        activities=(
            replace(journey.activities[0], etom_id=ORCHESTRATE.id),
            *journey.activities[1:],
        ),
    )
    with pytest.raises(InvalidKnowledgeError, match="not in the eTOM process vocabulary"):
        _release(journeys=(wrong,))
    with pytest.raises(InvalidKnowledgeError, match="Channel Shop names 'channel-web'"):
        _release(channels=(replace(release.channels[0], kind_id="channel-web"),))
    # So a term in use cannot be removed.
    linked = replace(release.channels[0], kind_id=ASSISTED.id)
    with pytest.raises(InvalidKnowledgeError, match="channel kind"):
        _release(channels=(linked,), vocabulary=(FULFILLMENT, ORDERS))


def test_a_value_means_the_term_its_label_or_code_names() -> None:
    terms = (FULFILLMENT, ORDERS, ORDERING)
    assert match_value(terms, ETOM, "Fulfillment · Order Handling") == (ORDERS,)
    assert match_value(terms, ETOM, "fulfilment") == (FULFILLMENT,)
    assert match_value(terms, API, "TMF 622 Product Ordering (GET)") == (ORDERING,)
    # Every code a value names must have a term, or the value is not mapped.
    assert match_value(terms, API, "TMF622 · TMF681 Communication") == ()
    assert match_value(terms, ETOM, "Assurance · Problem Handling") == ()


# The clean-up --------------------------------------------------------------------------------


def test_the_clean_up_links_known_values_and_flags_the_rest_as_new_terms() -> None:
    proposals = {item.term.id: item for item in propose_terms(_release())}

    assert proposals["etom-order-handling"].existing
    assert proposals["role-orchestrate"].existing
    # The activity's code and the responsibility's verb are one role.
    assert {ref.field for ref in proposals["role-orchestrate"].refs} == {
        VocabularyField.ACTIVITY_ROLE,
        VocabularyField.RESPONSIBILITY_ROLE,
    }
    flagged = {item.term.id: item.term for item in proposals.values() if not item.existing}
    assert set(flagged) == {"etom-x", "component-service", "role-saml", "api-tmf681"}
    assert flagged["api-tmf681"].pref_label == "Communication"
    assert flagged["api-tmf681"].notation == "TMF681"
    # The part before the last names the broader term, when the scheme has it.
    assert flagged["etom-x"].broader_id is None
    assert proposals["api-tmf622"].refs[0].value.startswith("TMF622")


def test_accepting_a_link_maps_every_place_still_writing_the_value() -> None:
    release = _release()
    content = _proposal(release, "role-orchestrate")
    assert classify(content, release) is CandidateMatch.UPDATES_EXISTING
    assert not needs_one_by_one(_candidate(content), release)

    linked = apply_candidate(content, release)

    assert linked.journeys[0].activities[0].role_id == "role-orchestrate"
    duties = linked.products[0].components[0].responsibilities
    assert [duty.role_id for duty in duties] == ["role-orchestrate", None]
    assert classify(content, linked) is CandidateMatch.ALREADY_PRESENT
    assert not any(item.term.id == "role-orchestrate" for item in propose_terms(linked))


def test_a_place_whose_text_changed_or_that_is_linked_keeps_what_it_has() -> None:
    release = _release()
    content = _proposal(release, "etom-order-handling")
    journey = release.journeys[0]
    edited = replace(
        journey,
        activities=(replace(journey.activities[0], etom="Order capture"), journey.activities[1]),
    )
    changed = replace(release, journeys=(edited,))

    assert classify(content, changed) is CandidateMatch.ALREADY_PRESENT
    assert apply_candidate(content, changed).journeys[0].activities[0].etom_id is None


def test_a_new_term_is_flagged_and_decided_alone_or_merged_by_an_edit() -> None:
    release = _release()
    content = _proposal(release, "role-saml")
    assert classify(content, release) is CandidateMatch.NEW
    assert needs_one_by_one(_candidate(content), release)

    added = apply_candidate(content, release)
    assert any(item.id == "role-saml" for item in added.vocabulary)
    assert added.products[0].components[0].responsibilities[1].role_id == "role-saml"

    # Edited to name an existing term, it adds the written value as another label.
    assert content.term is not None
    merged = replace(content, term=replace(content.term, id="role-orchestrate"))
    assert classify(merged, release) is CandidateMatch.UPDATES_EXISTING
    applied = apply_candidate(merged, release)
    orchestrate = next(item for item in applied.vocabulary if item.id == "role-orchestrate")
    assert orchestrate.alt_labels == ("Orchestrates", "SAML")
    assert applied.products[0].components[0].responsibilities[1].role_id == "role-orchestrate"


def test_a_new_api_joins_the_values_already_linked_to_another() -> None:
    release = apply_candidate(_proposal(_release(), "api-tmf622"), _release())
    content = _proposal(release, "api-tmf681")

    linked = apply_candidate(content, release)

    assert linked.journeys[0].integrations[0].open_api_ids == ("api-tmf622", "api-tmf681")


def test_a_term_under_a_missing_broader_term_waits_for_it() -> None:
    term = VocabularyTerm("etom-selling", ETOM, "Selling", broader_id="Assurance")
    content = CandidateContent(CandidateKind.VOCABULARY_TERM, term.id, term=term)
    assert classify(content, _release()) is CandidateMatch.NEEDS_CONCEPT
    placed = replace(content, term=replace(term, broader_id="Fulfilment"))
    added = apply_candidate(placed, _release())
    assert next(item for item in added.vocabulary if item.id == "etom-selling").broader_id == (
        "etom-fulfillment"
    )


def test_a_suggestion_covers_only_values_of_its_own_scheme() -> None:
    ref = VocabularyRef(VocabularyField.CHANNEL_KIND, "shop", "assisted")
    with pytest.raises(InvalidKnowledgeError, match="only values of its own vocabulary"):
        CandidateContent(CandidateKind.VOCABULARY_TERM, ORDERS.id, term=ORDERS, value_refs=(ref,))
    with pytest.raises(InvalidKnowledgeError, match="names its item"):
        VocabularyRef(VocabularyField.ACTIVITY_ETOM, "bpp-new", "Order Handling")


def test_a_document_read_again_never_unlinks_a_value_it_still_writes() -> None:
    release = apply_candidate(_proposal(_release(), "role-orchestrate"), _release())
    release = apply_candidate(_proposal(release, "etom-order-handling"), release)
    offering = release.products[0]
    plain_part = replace(
        offering.components[0],
        responsibilities=tuple(
            replace(duty, role_id=None) for duty in offering.components[0].responsibilities
        ),
    )
    reading = CandidateContent(
        CandidateKind.PRODUCT, "bpp", product=replace(offering, components=(plain_part,))
    )
    kept = apply_candidate(reading, release)
    assert kept.products[0].components[0].responsibilities[0].role_id == "role-orchestrate"

    journey = release.journeys[0]
    plain = replace(
        journey,
        activities=tuple(replace(item, etom_id=None, role_id=None) for item in journey.activities),
    )
    again = CandidateContent(CandidateKind.JOURNEY, journey.id, journey=plain)
    assert classify(again, release) is CandidateMatch.ALREADY_PRESENT
    assert apply_candidate(again, release).journeys[0].activities[0].etom_id == ORDERS.id


# Review --------------------------------------------------------------------------------------


def test_the_changes_name_terms_and_links_apart_from_the_rest() -> None:
    base = _release()
    draft = apply_candidate(_proposal(base, "role-saml"), base)
    draft = apply_candidate(_proposal(draft, "etom-order-handling"), draft)
    draft = replace(draft, channels=(replace(draft.channels[0], kind_id=ASSISTED.id),))

    changes = {(item.item, item.key): item for item in diff_releases(base, draft).changes}

    assert changes[(ChangedItem.VOCABULARY_TERM, "role-saml")].change is ChangeKind.ADDED
    assert changes[(ChangedItem.PRODUCT, "bpp")].fields == ("vocabulary_links",)
    assert changes[(ChangedItem.JOURNEY, "bpp-new")].fields == ("vocabulary_links",)
    assert changes[(ChangedItem.CHANNEL, "shop")].fields == ("vocabulary_links",)


@pytest.mark.parametrize(
    "file_format", [CatalogueFileFormat.YAML, CatalogueFileFormat.JSON, CatalogueFileFormat.XLSX]
)
def test_terms_and_links_survive_every_file_format(file_format: CatalogueFileFormat) -> None:
    release = _release()
    for term_id in ("role-orchestrate", "etom-order-handling", "api-tmf622", "channel-assisted"):
        release = apply_candidate(_proposal(release, term_id), release)
    release = apply_candidate(_proposal(release, "component-service"), release)

    content = ADAPTER.read(file_format, ADAPTER.write(file_format, release))

    assert content.vocabulary == release.vocabulary
    assert content.products == release.products
    assert content.journeys == release.journeys
    assert content.channels == release.channels


def test_a_file_term_names_a_known_scheme_and_where_it_is() -> None:
    raw = {"systems": [], "vocabulary": [{"id": "x", "scheme": "process", "pref_label": "X"}]}
    with pytest.raises(InvalidKnowledgeError, match="vocabulary entry 1.*A vocabulary is one of"):
        ADAPTER.read(CatalogueFileFormat.JSON, json.dumps(raw).encode())


# The committed catalogue ---------------------------------------------------------------------


def test_every_value_in_the_smb_catalogue_is_mapped_or_flagged() -> None:
    release = knowledge_from_yaml(CATALOGUE.read_text(encoding="utf-8"))
    schemes = {item.scheme for item in release.vocabulary}
    assert schemes == set(VocabularyScheme) - {VocabularyScheme.COMPONENT_KIND}

    proposals = propose_terms(release)
    for proposal in proposals:
        if proposal.existing:
            content = CandidateContent(
                CandidateKind.VOCABULARY_TERM,
                proposal.term.id,
                term=proposal.term,
                value_refs=proposal.refs,
            )
            release = apply_candidate(content, release)

    flagged = {ref for item in proposals if not item.existing for ref in item.refs}
    unmapped = {
        found.ref
        for found in written_values(release.products, release.journeys, release.channels)
        if not found.term_ids
    }
    assert unmapped == flagged
    # The responsibility verbs no activity role names are left for a maintainer.
    assert sorted({ref.value for ref in flagged}) == [
        "APPLIES",
        "CREATES",
        "ENABLES",
        "PASSES",
        "RETURNS",
        "SAML",
        "SUGGESTS",
    ]
    # Re-running proposes only the flagged values again.
    assert {item.term.id for item in propose_terms(release)} == {
        item.term.id for item in proposals if not item.existing
    }
