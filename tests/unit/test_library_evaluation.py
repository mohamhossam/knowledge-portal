"""The library golden set and its retrieval evaluation (RAG review, E1)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.use_cases.library_evaluation import (
    ExpectedHit,
    LibraryCaseResult,
    LibraryEvaluationReport,
    LibraryGoldenCase,
    RetrievedHit,
)
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.documents.library_golden_set_file import (
    LibraryGoldenSetFileError,
    read_library_golden_set,
)
from knowledge_portal.interfaces import evaluate
from knowledge_portal.interfaces.api.composition.evaluation import build_library_evaluation

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "tests" / "fixtures" / "golden" / "library_golden_set.json"
NOW = datetime(2026, 10, 15, tzinfo=UTC)

# The fake hash embedding on the fixture, recorded in docs/operations/library-retrieval-
# evaluation.md. The corpus is small (36 chunks), so the first ten chunks cover a third of it
# and recall@10 is generous; the rank of the first expected passage is the stricter signal.
# A retrieval change may raise these; none may fall below them.
FLOORS = {
    "recall_at_10": 0.95,
    "mean_reciprocal_rank": 0.90,
}
ZERO_HIT_CEILING = 0.05
# Every case that shares words with its passage puts an expected passage within the first
# three chunks; only the semantic cases may rank lower or miss.
LEXICAL_RANK_CEILING = 3


def _report() -> LibraryEvaluationReport:
    golden = read_library_golden_set(GOLDEN.read_bytes())
    evaluation = build_library_evaluation(Settings(llm_provider=LLMProvider.FAKE), FixedClock(NOW))
    try:
        corpus = evaluation.seed.execute(golden)
        return evaluation.evaluate.execute(golden, corpus)
    finally:
        evaluation.close()


def test_the_golden_set_is_a_fixture_with_enough_cases_on_the_seeded_corpus() -> None:
    golden = read_library_golden_set(GOLDEN.read_bytes())
    raw = json.loads(GOLDEN.read_text(encoding="utf-8"))

    assert raw["provenance"].startswith("FIXTURE")
    assert 10 <= len(golden.cases) <= 20
    # The corpus starts from the documents scripts/seed_demo.py publishes.
    titles = {item.title for item in golden.documents}
    assert {
        "XGPON coverage rules (sample)",
        "Business bundle eligibility (sample)",
        "Bundle ordering procedure (sample)",
        "Invoice discount display (sample)",
    } <= titles
    assert golden.withdrawn_titles == {"Legacy ADSL ordering (sample)"}
    assert any(case.semantic for case in golden.cases)


def test_the_fake_embedding_never_falls_below_the_recorded_floors() -> None:
    report = _report()

    measured = evaluate.library_scores(report)
    assert report.failures == 0
    assert report.empty_answers == 0
    assert report.documents == 14 and report.chunks > 0
    for name, floor in FLOORS.items():
        assert measured[name] >= floor, name
    assert measured["zero_hit_share"] <= ZERO_HIT_CEILING
    golden = read_library_golden_set(GOLDEN.read_bytes())
    # A withdrawn document is never served.
    assert report.hits_from(golden.withdrawn_titles) == 0
    for result in report.results:
        if not result.case.semantic:
            rank = result.first_relevant_rank
            assert rank is not None and rank <= LEXICAL_RANK_CEILING, result.case.id


def test_an_expected_hit_matches_on_title_and_passage_or_label() -> None:
    from knowledge_portal.application.ports.reference_index import ReferenceChunk

    chunk = ReferenceChunk(
        "c1", "d1", "Policy", "v1", 1, "r1", "p1", "f", "parent", "b1", (), "Line 2",
        "Discounts  show on the invoice line.", "search", "hash", "en", 10, "policy", 0, 10,
    )  # fmt: skip

    assert ExpectedHit("Policy", passage="discounts show on the INVOICE line").matches(chunk)
    assert ExpectedHit("Policy", label="Line 2").matches(chunk)
    assert not ExpectedHit("Policy", label="Line 1").matches(chunk)
    assert not ExpectedHit("Other", passage="invoice").matches(chunk)
    assert not ExpectedHit("Policy", passage="summary").matches(chunk)


def test_the_report_scores_recall_reciprocal_rank_and_zero_hits() -> None:
    case = LibraryGoldenCase("L1", "q", (ExpectedHit("A", "x"), ExpectedHit("B", "y")))
    hits = (
        RetrievedHit(1, "C", "Line 1", "z", False),
        RetrievedHit(2, "A", "Line 1", "x", True),
    )
    found = LibraryCaseResult(case, hits, (True, False))
    missed = LibraryCaseResult(case, (), (False, False))
    failed = LibraryCaseResult(case, (), (False, False), "unusable output")
    report = LibraryEvaluationReport(1, "fake", "fake:policy", 10, 2, 4, (found, missed, failed))

    assert found.recall == 0.5 and found.reciprocal_rank == 0.5 and not found.zero_hit
    assert missed.zero_hit and missed.reciprocal_rank == 0.0
    assert report.failures == 1
    assert report.empty_answers == 1
    assert report.recall_at_k == pytest.approx(0.5 / 3)
    assert report.mean_reciprocal_rank == pytest.approx(0.5 / 3)
    assert report.zero_hit_share == pytest.approx(2 / 3)
    assert report.hits_from(frozenset({"C"})) == 1


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda raw: raw["cases"].clear(), "no cases"),
        (lambda raw: raw["documents"].clear(), "no documents"),
        (lambda raw: raw["cases"][0]["expected"].clear(), "expects nothing"),
        (
            lambda raw: raw["cases"][0]["expected"].__setitem__(
                0, {"document": "Nowhere (sample)", "passage": "x"}
            ),
            "the corpus lacks",
        ),
        (
            lambda raw: raw["cases"][0]["expected"].__setitem__(
                0, {"document": "XGPON coverage rules (sample)", "passage": "not in it"}
            ),
            "does not contain",
        ),
        (
            lambda raw: raw["cases"][0]["expected"].__setitem__(
                0, {"document": "XGPON coverage rules (sample)"}
            ),
            "neither a passage nor a label",
        ),
        (
            lambda raw: raw["cases"][0]["expected"].__setitem__(
                0, {"document": "Legacy ADSL ordering (sample)", "label": "Line 1"}
            ),
            "withdrawn",
        ),
        (lambda raw: raw["cases"].__setitem__(1, raw["cases"][0]), "same entry twice"),
        (
            lambda raw: raw["documents"][1].__setitem__("title", raw["documents"][0]["title"]),
            "twice",
        ),
        (lambda raw: raw["cases"][0].__setitem__("text", "  "), "has no text"),
        (lambda raw: raw["cases"][0].__setitem__("extra", 1), "malformed"),
    ],
)
def test_the_reader_refuses_a_mislabelled_golden_set(change, message) -> None:  # type: ignore[no-untyped-def]
    raw = json.loads(GOLDEN.read_text(encoding="utf-8"))
    change(raw)

    with pytest.raises(LibraryGoldenSetFileError, match=message):
        read_library_golden_set(json.dumps(raw).encode("utf-8"))


def test_the_command_prints_the_scores_and_writes_every_case(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", LLMProvider.FAKE.value)
    output = tmp_path / "library.json"

    assert evaluate.main(["--mapper", "library", "--json", str(output)]) == 0

    printed = capsys.readouterr().out
    assert "Mapper: library" in printed
    assert "recall at 10" in printed
    assert "mean reciprocal rank" in printed
    assert "zero hit share" in printed
    written = json.loads(output.read_text(encoding="utf-8"))
    golden = read_library_golden_set(GOLDEN.read_bytes())
    assert written["mapper"] == "library"
    assert len(written["cases"]) == len(golden.cases)
    assert set(written["scores"]) == {"recall_at_10", "mean_reciprocal_rank", "zero_hit_share"}
    first = written["cases"][0]
    assert first["hits"] and {"rank", "document", "location", "text", "relevant"} <= set(
        first["hits"][0]
    )
    assert all("found" in item for item in first["expected"])


def test_the_command_refuses_a_malformed_library_golden_set(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", LLMProvider.FAKE.value)
    broken = tmp_path / "golden.json"
    broken.write_text("{}", encoding="utf-8")

    assert evaluate.main(["--mapper", "library", "--golden-set", str(broken)]) == 2
    assert "malformed" in capsys.readouterr().err
