"""The library golden set and its retrieval evaluation (RAG review, E1)."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.reference_index import ReferenceChunk
from knowledge_portal.application.use_cases.library_evaluation import (
    ExpectedHit,
    LibraryCaseResult,
    LibraryEvaluationError,
    LibraryEvaluationReport,
    LibraryGoldenCase,
    LibraryGoldenSet,
    PublishedSource,
    ResolvedHit,
    RetrievedHit,
    SeededCorpus,
    resolve,
)
from knowledge_portal.infrastructure.config.options import LLMProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.documents.library_golden_set_file import (
    SEVERAL_PRODUCTS,
    LibraryGoldenSetFileError,
    read_library_golden_set,
)
from knowledge_portal.interfaces import evaluate
from knowledge_portal.interfaces.api.composition.evaluation import build_library_evaluation

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "tests" / "fixtures" / "golden" / "library_golden_set.json"
NOW = datetime(2026, 10, 15, tzinfo=UTC)

# The fake hash embedding on the fixture, recorded in
# docs/operations/library-retrieval-evaluation.md. Recall and the zero-hit share are the same
# on every run; the mean reciprocal rank moves between 84% and 90%, because near-ties are broken
# by chunk id and chunk ids change with each run's publications. A retrieval change may raise
# these floors; none may fall below them.
FLOORS = {
    "recall_at_10": 0.85,
    "mean_reciprocal_rank": 0.80,
}
ZERO_HIT_CEILING = 0.15
# Every case that shares words with its passage puts it within the first three chunks, except
# the known misses below; semantic cases may rank anywhere or miss.
RANK_CEILING = 3
# Search keeps three chunks per document. The fleet guide's three prose paragraphs outrank its
# table row, so the row that answers L008 is cut. A retrieval change that fixes it may drop
# the case from here.
KNOWN_MISSES = {"L008"}


def _golden() -> LibraryGoldenSet:
    return read_library_golden_set(GOLDEN.read_bytes(), GOLDEN.parent)


def _report() -> LibraryEvaluationReport:
    golden = _golden()
    evaluation = build_library_evaluation(Settings(llm_provider=LLMProvider.FAKE), FixedClock(NOW))
    try:
        corpus = evaluation.seed.execute(golden)
        return evaluation.evaluate.execute(golden, corpus)
    finally:
        evaluation.close()


def _chunk(
    block_id: str = "b1", start: int = 0, end: int = 10, document_id: str = "d1"
) -> ReferenceChunk:
    return ReferenceChunk(
        "c1", document_id, "Policy", "v1", 1, "r1", "p1", "f", "parent", block_id, (), "Any label",
        "text", "search", "hash", "en", 10, "policy", start, end,
    )  # fmt: skip


def test_the_golden_set_is_a_fixture_across_products_and_formats() -> None:
    golden = _golden()
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
    # Many products and the formats a library holds, each with its own structure.
    assert len({item.product for item in golden.documents}) >= 6
    assert {Path(item.filename).suffix for item in golden.documents} >= {
        ".txt", ".md", ".docx", ".pdf", ".pptx", ".xlsx", ".csv",
    }  # fmt: skip
    assert any(case.semantic for case in golden.cases)
    assert any(hit.passage is None for case in golden.cases for hit in case.expected)


def test_the_fake_embedding_never_falls_below_the_recorded_floors() -> None:
    report = _report()

    measured = evaluate.library_scores(report)
    assert report.failures == 0
    assert report.empty_answers == 0
    assert report.documents == 14 and report.chunks > report.documents
    # The PDF's page visuals have no text, so the review excludes them.
    assert report.excluded_blocks >= 2
    for name, floor in FLOORS.items():
        assert measured[name] >= floor, name
    assert measured["zero_hit_share"] <= ZERO_HIT_CEILING
    # A withdrawn document is never served.
    assert report.hits_from(_golden().withdrawn_titles) == 0
    for result in report.results:
        if not result.case.semantic and result.case.id not in KNOWN_MISSES:
            rank = result.first_relevant_rank
            assert rank is not None and rank <= RANK_CEILING, result.case.id
    # Every product with a case is scored on its own.
    assert set(report.products) == {case.product for case in _golden().cases}


def test_a_chunk_answers_a_passage_it_holds_or_half_of_one_split_across_chunks() -> None:
    source = PublishedSource(
        "d1",
        "Policy",
        None,
        (("b1", "Intro.\nDiscounts  show on\nthe INVOICE line. Then more text follows here."),),
        1,
        0,
    )
    (span,) = source.locate("discounts show on the invoice line")
    hit = ResolvedHit(ExpectedHit("Policy", "discounts show on the invoice line"), "d1", (span,))
    whole = ResolvedHit(ExpectedHit("Policy"), "d1", ())

    assert (span.start, span.end) == (7, 42)
    assert hit.matches(_chunk(start=0, end=60))  # The chunk holds the passage.
    assert hit.matches(_chunk(start=7, end=25))  # The first half of a split passage.
    assert hit.matches(_chunk(start=24, end=42))  # The second half.
    assert not hit.matches(_chunk(start=38, end=60))  # Only its last words.
    assert not hit.matches(_chunk(block_id="b2", start=0, end=60))
    assert not hit.matches(_chunk(document_id="d2", start=0, end=60))
    assert whole.matches(_chunk(block_id="b9")) and not whole.matches(_chunk(document_id="d2"))


def test_a_golden_set_that_no_longer_matches_its_corpus_stops_the_run() -> None:
    golden = LibraryGoldenSet(
        1,
        (),
        (
            LibraryGoldenCase("L1", "q", (ExpectedHit("Policy", "not in it"),)),
            LibraryGoldenCase("L2", "q", (ExpectedHit("Gone"),)),
        ),
    )
    corpus = SeededCorpus((PublishedSource("d1", "Policy", None, (("b1", "Rule."),), 1, 0),))

    with pytest.raises(LibraryEvaluationError) as raised:
        resolve(golden, corpus)
    assert "L1: 'Policy' as extracted does not hold 'not in it'" in str(raised.value)
    assert "L2: 'Gone' is not in service" in str(raised.value)


def test_the_report_scores_recall_reciprocal_rank_and_zero_hits_per_product() -> None:
    fibre = LibraryGoldenCase("L1", "q", (ExpectedHit("A", "x"), ExpectedHit("B", "y")), "Fibre")
    mobile = LibraryGoldenCase("L2", "q", (ExpectedHit("A", "x"),), "Mobile")
    hits = (
        RetrievedHit(1, "C", "Line 1", "z", False),
        RetrievedHit(2, "A", "Line 1", "x", True),
    )
    found = LibraryCaseResult(fibre, hits, (True, False))
    missed = LibraryCaseResult(fibre, (), (False, False))
    failed = LibraryCaseResult(mobile, (), (False,), "unusable output")
    report = LibraryEvaluationReport(1, "fake", "fake:policy", 10, 2, 4, 0, (found, missed, failed))

    assert found.recall == 0.5 and found.reciprocal_rank == 0.5 and not found.zero_hit
    assert missed.zero_hit and missed.reciprocal_rank == 0.0
    assert report.failures == 1
    assert report.empty_answers == 1
    assert report.recall_at_k == pytest.approx(0.5 / 3)
    assert report.mean_reciprocal_rank == pytest.approx(0.5 / 3)
    assert report.zero_hit_share == pytest.approx(2 / 3)
    assert report.hits_from(frozenset({"C"})) == 1
    assert report.products == ("Fibre", "Mobile")
    by_product = evaluate.library_scores_by_product(report)
    assert by_product["Fibre"]["cases"] == 2
    assert by_product["Fibre"]["recall_at_10"] == pytest.approx(0.25)
    assert by_product["Mobile"]["zero_hit_share"] == 1.0


def test_a_case_takes_its_documents_product_unless_it_names_one() -> None:
    raw = json.loads(GOLDEN.read_text(encoding="utf-8"))
    raw["cases"] = [
        {"id": "A", "text": "q", "expected": [{"document": "SIP trunk rate card (fixture)"}]},
        {
            "id": "B",
            "text": "q",
            "expected": [
                {"document": "SIP trunk rate card (fixture)"},
                {"document": "Mobile fleet plan guide (fixture)"},
            ],
        },
        {
            "id": "C",
            "text": "q",
            "product": "Voice",
            "expected": [{"document": "SIP trunk rate card (fixture)"}],
        },
    ]

    cases = read_library_golden_set(json.dumps(raw).encode("utf-8"), GOLDEN.parent).cases
    assert [case.product for case in cases] == ["SIP trunk", SEVERAL_PRODUCTS, "Voice"]


Change = Callable[[dict[str, Any]], object]


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
                0, {"document": "XGPON coverage rules (sample)", "passage": " "}
            ),
            "blank passage",
        ),
        (
            lambda raw: raw["cases"][0]["expected"].__setitem__(
                0, {"document": "Legacy ADSL ordering (sample)"}
            ),
            "withdrawn",
        ),
        (
            lambda raw: raw["cases"][0]["expected"].__setitem__(
                0, {"document": "XGPON coverage rules (sample)", "label": "Line 1"}
            ),
            "malformed",
        ),
        (lambda raw: raw["cases"].__setitem__(1, raw["cases"][0]), "same entry twice"),
        (
            lambda raw: raw["documents"][1].__setitem__("title", raw["documents"][0]["title"]),
            "twice",
        ),
        (lambda raw: raw["cases"][0].__setitem__("text", "  "), "has no text"),
        (lambda raw: raw["documents"][0].__setitem__("file", "a.txt"), "not both"),
        (lambda raw: raw["documents"][0].pop("filename"), "file name its text"),
        (lambda raw: raw["documents"][8].__setitem__("file", "../AGENTS.md"), "outside"),
        (lambda raw: raw["documents"][8].__setitem__("file", "library/none.pdf"), "cannot be read"),
        (lambda raw: raw["documents"][8].__setitem__("filename", "x.docx"), "from its file"),
    ],
)
def test_the_reader_refuses_a_mislabelled_golden_set(change: Change, message: str) -> None:
    raw = json.loads(GOLDEN.read_text(encoding="utf-8"))
    change(raw)

    with pytest.raises(LibraryGoldenSetFileError, match=message):
        read_library_golden_set(json.dumps(raw).encode("utf-8"), GOLDEN.parent)


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
    assert "By product" in printed and "Mobile fleet" in printed
    written = json.loads(output.read_text(encoding="utf-8"))
    assert written["mapper"] == "library"
    assert len(written["cases"]) == len(_golden().cases)
    assert set(written["scores"]) == {"recall_at_10", "mean_reciprocal_rank", "zero_hit_share"}
    assert "Cloud backup" in written["scores_by_product"]
    first = written["cases"][0]
    assert first["product"] == "Business fibre"
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
