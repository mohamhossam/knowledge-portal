"""A call's timing, a step's point of no return and a plan's measures, held as fields the
screens and requirement work read instead of the words around them."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from knowledge_portal.application.ports.catalogue_file import CatalogueFileFormat
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.journeys import (
    NO_RETURN,
    Activity,
    ActivityIntegration,
    CallTiming,
    call_timing,
    read_timing,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.domain.architecture.products import (
    PlanCharacteristic,
    measure_disagrees,
    measure_of,
)
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from knowledge_portal.infrastructure.persistence.stored_timings import stored_timings
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    ActivityIntegrationSchema,
    PlanCharacteristicSchema,
)

CATALOGUE = Path(__file__).resolve().parents[2] / "catalogues" / "smb-architecture.yaml"
RELEASE: TypeAdapter[ArchitectureKnowledge] = TypeAdapter(ArchitectureKnowledge)
MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))


def _catalogue() -> ArchitectureKnowledge:
    """A draft holding the committed catalogue."""
    manage = ManageArchitectureKnowledge(
        InMemoryArchitectureKnowledgeRepository(seed_knowledge()),
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000_000,
        OfflineDocumentScanner(),
    )
    draft = manage.create_draft(MAINTAINER, "Fields")
    return manage.apply_file_import(
        draft.id, draft.revision, CATALOGUE.name, CATALOGUE.read_bytes(), MAINTAINER
    )


# A call's timing -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("written", "timing"),
    [
        ("Sync", CallTiming.SYNC),
        ("sync", CallTiming.SYNC),
        ("Synchronous", CallTiming.SYNC),
        ("Sync (callback)", CallTiming.SYNC),
        ("ASYNC", CallTiming.ASYNC),
        ("Asynchronous via MQ", CallTiming.ASYNC),
        ("async-callback", CallTiming.ASYNC),
        ("  ", None),
    ],
)
def test_a_timing_reads_as_its_sources_write_it(written: str, timing: CallTiming | None) -> None:
    assert call_timing(written) is timing
    assert ActivityIntegration("10", "20", timing=written).timing is timing  # type: ignore[arg-type]


@pytest.mark.parametrize("written", ["REST", "Sync/Async", "sync or async", "waits"])
def test_text_that_names_no_one_timing_is_refused_or_read_as_unsaid(written: str) -> None:
    with pytest.raises(InvalidKnowledgeError, match="Sync or Async"):
        call_timing(written)
    assert read_timing(written) is None


def test_the_api_takes_a_timing_as_sources_write_it_and_refuses_other_text() -> None:
    call = ActivityIntegrationSchema.model_validate(
        {"from_activity": "10", "to_activity": "20", "timing": "synchronous"}
    )
    assert call.timing is CallTiming.SYNC
    with pytest.raises(ValidationError):
        ActivityIntegrationSchema.model_validate(
            {"from_activity": "10", "to_activity": "20", "timing": "REST"}
        )


def test_a_catalogue_file_refuses_an_unknown_timing_and_says_where() -> None:
    text = CATALOGUE.read_text(encoding="utf-8").replace("timing: Async", "timing: Sync/Async", 1)
    with pytest.raises(InvalidKnowledgeError, match="Sync or Async, not 'Sync/Async'"):
        CatalogueFileAdapter().read(CatalogueFileFormat.YAML, text.encode())


@pytest.mark.parametrize("file_format", list(CatalogueFileFormat))
def test_timings_travel_through_every_catalogue_file(file_format: CatalogueFileFormat) -> None:
    draft = _catalogue()
    adapter = CatalogueFileAdapter()
    read = adapter.read(file_format, adapter.write(file_format, draft))
    timings = [call.timing for journey in read.journeys for call in journey.integrations]
    assert timings == [call.timing for journey in draft.journeys for call in journey.integrations]
    assert CallTiming.SYNC in timings and CallTiming.ASYNC in timings


def test_a_release_stored_with_free_text_timings_still_loads() -> None:
    stored = RELEASE.dump_python(_catalogue(), mode="json")
    calls = [call for journey in stored["journeys"] for call in journey["integrations"]]
    calls[0]["timing"], calls[1]["timing"], calls[2]["timing"] = "synchronous", "REST", "sync"

    with pytest.raises(ValidationError):
        RELEASE.validate_python(copy.deepcopy(stored))
    loaded = RELEASE.validate_python(stored_timings(stored))

    first, second, third = loaded.journeys[0].integrations[:3]
    assert (first.timing, second.timing, third.timing) == (CallTiming.SYNC, None, CallTiming.SYNC)


def test_any_stored_record_holding_journeys_has_its_timings_read_again() -> None:
    record = {"content": {"journey": {"integrations": [{"timing": "Asynchronous"}]}}, "n": [1]}
    assert stored_timings(record) == {
        "content": {"journey": {"integrations": [{"timing": "Async"}]}},
        "n": [1],
    }


# A step's point of no return -------------------------------------------------------------


@pytest.mark.parametrize(
    ("written", "held"),
    [
        ("Yes", NO_RETURN),
        ("y", NO_RETURN),
        ("No", None),
        ("N/A", None),
        ("-", None),
        (
            "The XaaS callback is the point of no return.",
            "The XaaS callback is the point of no return.",
        ),
    ],
)
def test_a_point_of_no_return_says_why_and_a_no_is_not_one(written: str, held: str | None) -> None:
    assert Activity("10", "Hand over", point_of_no_return=written).point_of_no_return == held


# A plan's measures -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "measure"),
    [
        ("200 Mbps", ("200", "Mbps")),
        ("100Mbps", ("100", "Mbps")),
        ("2,5 GB", ("2.5", "GB")),
        ("1,000 GB", ("1000", "GB")),
        ("50%", ("50", "%")),
        ("5 G", ("5", "G")),
        ("5G", None),
        ("4K", None),
        ("24/7", None),
        ("Fortinet 90G", None),
        ("Unlimited", None),
    ],
)
def test_a_measure_is_a_number_and_its_unit(value: str, measure: tuple[str, str] | None) -> None:
    assert measure_of(value) == measure
    held = PlanCharacteristic("Fact", value)
    assert (held.amount, held.unit) == (measure or (None, None))


def test_a_given_measure_is_read_again_from_its_value() -> None:
    # A pair the value does not say, as a writer might send it.
    assert PlanCharacteristic("Data", "1,000 GB", "1.000", "GB").amount == "1000"
    assert PlanCharacteristic("CPE", "Fortinet 90G", "90", "G").amount is None


def test_the_api_refuses_a_measure_the_value_does_not_say() -> None:
    assert not measure_disagrees("200 Mbps", "200.0", "mbps")
    assert not measure_disagrees("200 Mbps", None, None)
    for amount, unit, value in (("300", "Mbps", "200 Mbps"), ("90", "G", "Fortinet 90G")):
        with pytest.raises(InvalidKnowledgeError, match="read from the value"):
            PlanCharacteristicSchema(name="Fact", value=value, amount=amount, unit=unit).to_domain()


def test_the_smb_plans_carry_their_measures() -> None:
    (offering,) = _catalogue().products
    measured = [
        (fact.amount, fact.unit)
        for plan in offering.plans
        for fact in plan.characteristics
        if fact.amount is not None
    ]
    assert measured
    assert all(unit for _, unit in measured)
