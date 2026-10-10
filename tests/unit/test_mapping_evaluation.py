"""The golden set and the evaluation harness (ontology plan, Phases 0 and 3)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
import yaml
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceError,
    EvidenceChunk,
)
from knowledge_portal.application.use_cases.architecture_knowledge import (
    KnowledgeNotFoundError,
)
from knowledge_portal.application.use_cases.mapping_evaluation import (
    EvaluateImpactMapping,
    EvaluationReport,
    GoldenCase,
    GoldenSet,
    MappingPrediction,
    unknown_ids,
)
from knowledge_portal.domain.architecture.entities import ArchitectureCitation
from knowledge_portal.domain.architecture.verdicts import ProductVerdict
from knowledge_portal.infrastructure.architecture.golden_set_file import (
    GoldenSetFileError,
    read_golden_set,
)
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.interfaces import evaluate
from knowledge_portal.interfaces.api.composition.evaluation import build_mapping_evaluation

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "tests" / "fixtures" / "golden" / "impact_golden_set.json"
CATALOGUE = ROOT / "catalogues" / "smb-architecture.yaml"
NOW = datetime(2026, 10, 10, tzinfo=UTC)

# Today's mapper with the fake models, recorded in docs/slices/ontology-phase-0-baseline.md.
# A later phase may raise these; none may fall below them.
BASELINE = {
    "system_precision": 0.59,
    "system_recall": 0.08,
    "verdict_accuracy": 0.47,
    "offering_accuracy": 0.71,
    "citation_faithfulness": 1.0,
}
# The assessment with the fake models, recorded in docs/slices/ontology-phase-3-assessment.md.
PHASE_3 = {
    "system_precision": 0.65,
    "system_recall": 0.24,
    "verdict_accuracy": 0.67,
    "offering_accuracy": 0.85,
    "concept_recall": 0.21,
    "citation_faithfulness": 1.0,
}
PHASE_3_FALSE_CHANGES = 5


def _report(mapper: str = "assess") -> EvaluationReport:
    evaluation = build_mapping_evaluation(Settings(llm_provider=LLMProvider.FAKE), FixedClock(NOW))
    try:
        release = evaluation.publish.execute(CATALOGUE.name, CATALOGUE.read_bytes())
        run = evaluation.evaluate if mapper == "assess" else evaluation.evaluate_match
        return run.execute(read_golden_set(GOLDEN.read_bytes()), release.id)
    finally:
        evaluation.close()


def test_the_golden_set_covers_every_verdict_on_the_committed_catalogue() -> None:
    golden = read_golden_set(GOLDEN.read_bytes())
    evaluation = build_mapping_evaluation(Settings(llm_provider=LLMProvider.FAKE), FixedClock(NOW))
    try:
        release = evaluation.publish.execute(CATALOGUE.name, CATALOGUE.read_bytes())
    finally:
        evaluation.close()

    assert len(golden.cases) >= 50
    assert (
        golden.catalogue_version == yaml.safe_load(CATALOGUE.read_text(encoding="utf-8"))["version"]
    )
    assert {case.verdict for case in golden.cases} == {*ProductVerdict, None}
    assert unknown_ids(golden, release) == []


def test_today_s_mapper_never_falls_below_the_baseline() -> None:
    report = _report("match")

    measured = evaluate.scores(report)
    assert report.failures == 0
    for name, floor in BASELINE.items():
        value = measured[name]
        assert value is not None and value >= floor, name
    # Today's match returns no concepts, so concept recall is not measured yet.
    assert measured["concept_recall"] is None


def test_the_assessment_beats_the_baseline_and_never_falls_below_phase_3() -> None:
    report = _report()

    measured = evaluate.scores(report)
    assert report.mapper == "assess"
    assert report.failures == 0
    for name, floor in (*BASELINE.items(), *PHASE_3.items()):
        value = measured[name]
        assert value is not None and value >= floor, name
    assert report.false_changes <= PHASE_3_FALSE_CHANGES
    # Every requirement too vague to place gets questions, not a verdict.
    vague = [item for item in report.results if item.case.verdict is None]
    assert vague and all(item.verdict_correct for item in vague)


def _file(**case: Any) -> bytes:
    labelled = {
        "id": "G1",
        "text": "Add a second access point.",
        "verdict": "change_existing_offering",
        "offering": "business-pro-plus",
        "systems": ["cwom"],
        "concepts": ["cap-wifi-access"],
        "missing_facets": [],
        **case,
    }
    return json.dumps(
        {
            "version": 1,
            "catalogue": "catalogues/smb-architecture.yaml",
            "catalogue_version": "v",
            "labelled_on": "2026-10-10",
            "provenance": "test",
            "verdicts": [item.value for item in ProductVerdict],
            "concepts": [{"id": "cap-wifi-access", "label": "Wi-Fi"}],
            "cases": [labelled],
        }
    ).encode()


def test_a_well_labelled_file_reads() -> None:
    golden = read_golden_set(_file())

    assert golden.cases == (
        GoldenCase(
            "G1",
            "Add a second access point.",
            ProductVerdict.CHANGE_EXISTING_OFFERING,
            "business-pro-plus",
            frozenset({"cwom"}),
            frozenset({"cap-wifi-access"}),
        ),
    )


@pytest.mark.parametrize(
    ("case", "message"),
    [
        ({"text": "  "}, "has no text"),
        ({"verdict": "rebrand"}, "malformed"),
        ({"concepts": ["cap-unknown"]}, "undeclared concepts: cap-unknown"),
        ({"systems": ["cwom", "cwom"]}, "names the same entry twice"),
        ({"systems": [" "]}, "blank entry"),
        ({"systems": []}, "names no system"),
        ({"offering": None}, "needs an offering"),
        ({"verdict": "new_product_line"}, "names none"),
        ({"missing_facets": ["plan"]}, "nothing can be missing"),
        (
            {"verdict": None, "offering": None, "systems": [], "concepts": []},
            "must name what is missing",
        ),
        ({"verdict": None, "offering": None, "missing_facets": ["plan"]}, "labels nothing else"),
        ({"surprise": 1}, "malformed"),
    ],
)
def test_a_mislabelled_file_is_refused(case: dict[str, Any], message: str) -> None:
    with pytest.raises(GoldenSetFileError, match=message):
        read_golden_set(_file(**case))


class _Mapper:
    def __init__(self, answers: dict[str, MappingPrediction | Exception]) -> None:
        self._answers = answers

    @property
    def name(self) -> str:
        return "stub"

    def predict(self, text: str, release_id: str) -> MappingPrediction:
        answer = self._answers[text]
        if isinstance(answer, Exception):
            raise answer
        return answer


class _Evidence:
    def published_evidence(self, release_id: str, chunk_id: str) -> EvidenceChunk:
        if chunk_id != "c1":
            raise KnowledgeNotFoundError("Architecture evidence was not found.")
        return EvidenceChunk("c1", "CWOM", "system cwom", "CWOM orchestrates   fixed orders.")


def _case(text: str, verdict: ProductVerdict | None, *systems: str) -> GoldenCase:
    return GoldenCase(
        text,
        text,
        verdict,
        "bpp" if verdict is ProductVerdict.CHANGE_EXISTING_OFFERING else None,
        frozenset(systems),
        frozenset({"cap-a", "cap-b"}) if systems else frozenset(),
        () if verdict else ("offering",),
    )


def _prediction(
    verdict: ProductVerdict | None,
    *systems: str,
    concepts: frozenset[str] | None = None,
    citations: tuple[ArchitectureCitation, ...] = (),
) -> MappingPrediction:
    return MappingPrediction(
        frozenset(systems),
        verdict,
        "bpp" if verdict is ProductVerdict.CHANGE_EXISTING_OFFERING else None,
        concepts,
        citations,
    )


CHANGE = ProductVerdict.CHANGE_EXISTING_OFFERING


def test_scores_count_systems_verdicts_offerings_and_citations() -> None:
    golden = GoldenSet(
        1,
        "v",
        (
            _case("one", CHANGE, "cwom", "rtf"),
            _case("two", ProductVerdict.NEW_PRODUCT_LINE, "caf"),
            _case("vague", None),
        ),
    )
    mapper = _Mapper(
        {
            "one": _prediction(
                CHANGE,
                "cwom",
                "gis",
                citations=(
                    ArchitectureCitation("cwom", "c1", "orchestrates fixed orders"),
                    ArchitectureCitation("cwom", "c1", "invented words"),
                    ArchitectureCitation("cwom", "gone", "orchestrates"),
                ),
            ),
            "two": _prediction(CHANGE),
            "vague": _prediction(None),
        }
    )

    report = EvaluateImpactMapping(mapper, _Evidence(), "stub-model").execute(golden, "r1")

    assert report.system_precision == pytest.approx(1 / 2)
    assert report.system_recall == pytest.approx(1 / 3)
    assert report.verdict_accuracy == pytest.approx(2 / 3)
    assert report.offering_accuracy == 1.0
    assert report.citation_faithfulness == pytest.approx(1 / 3)
    assert report.concept_recall is None
    # A new product line called a change is the error the owner's gate rules out.
    assert report.false_changes == 1


def test_concept_recall_is_measured_once_the_mapper_returns_concepts() -> None:
    golden = GoldenSet(1, "v", (_case("one", CHANGE, "cwom"),))
    mapper = _Mapper({"one": _prediction(CHANGE, "cwom", concepts=frozenset({"cap-a", "x"}))})

    report = EvaluateImpactMapping(mapper, _Evidence(), "stub-model").execute(golden, "r1")

    assert report.concept_recall == pytest.approx(1 / 2)


def test_a_provider_failure_fails_its_case_and_the_run_goes_on() -> None:
    golden = GoldenSet(1, "v", (_case("one", CHANGE, "cwom"), _case("two", CHANGE, "rtf")))
    mapper = _Mapper(
        {
            "one": ArchitectureEvidenceError("unusable output"),
            "two": _prediction(CHANGE, "rtf"),
        }
    )

    report = EvaluateImpactMapping(mapper, _Evidence(), "stub-model").execute(golden, "r1")

    assert report.failures == 1
    assert report.results[0].failure == "unusable output"
    assert report.system_recall == pytest.approx(1 / 2)
    assert report.verdict_accuracy == pytest.approx(1 / 2)


def test_the_command_prints_the_scores_and_writes_every_case(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", LLMProvider.FAKE.value)
    output = tmp_path / "run.json"

    assert evaluate.main(["--json", str(output)]) == 0

    printed = capsys.readouterr().out
    assert "Mapper: assess" in printed
    assert "system recall" in printed
    assert "false changes" in printed
    written = json.loads(output.read_text(encoding="utf-8"))
    assert len(written["cases"]) == len(read_golden_set(GOLDEN.read_bytes()).cases)
    assert written["scores"]["concept_recall"] is not None
    assert written["false_changes"] == PHASE_3_FALSE_CHANGES

    assert evaluate.main(["--mapper", "match", "--json", str(output)]) == 0

    assert "concept recall          not measured" in capsys.readouterr().out
    assert json.loads(output.read_text(encoding="utf-8"))["scores"]["concept_recall"] is None


def test_the_command_refuses_a_malformed_golden_set(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", LLMProvider.FAKE.value)
    broken = tmp_path / "golden.json"
    broken.write_text("{}", encoding="utf-8")

    assert evaluate.main(["--golden-set", str(broken)]) == 2
    assert "malformed" in capsys.readouterr().err
