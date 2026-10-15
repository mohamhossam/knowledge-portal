"""Score a mapper on its golden set: ``python -m knowledge_portal.interfaces.evaluate``.

``--mapper assess`` (the default) scores the requirement assessment; ``--mapper match``
today's per-item mapping, the Phase 0 baseline. ``--precedents loo`` first keeps every
other labelled case as an accepted verdict, so the assessment's precedent lane is scored
too (Phase 5); without it, no precedent is known.

Both publish the catalogue the golden set was labelled against into an in-memory release,
map every case with the models the settings configure (``LLM_PROVIDER``), and print the
scores. ``--json`` also writes each case's answer, for comparing two runs.

``--mapper library`` scores the reference library's retrieval instead (RAG review, E1): it
puts the library golden set's corpus, of any products and formats, in service through the
worker's own path, in memory, searches every case with the configured embedding, and prints
recall@10, the mean reciprocal rank and the share of cases with no expected passage among the
first ten chunks, in all and per product.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from smb_kernel.time.system import SystemClock

from knowledge_portal.application.use_cases.library_evaluation import (
    DEFAULT_K,
    LibraryCaseResult,
    LibraryEvaluationError,
    LibraryEvaluationReport,
)
from knowledge_portal.application.use_cases.mapping_evaluation import (
    CaseResult,
    EvaluationReport,
    unknown_ids,
)
from knowledge_portal.infrastructure.architecture.golden_set_file import (
    GoldenSetFileError,
    read_golden_set,
)
from knowledge_portal.infrastructure.config.options import ConfigurationError
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.documents.library_golden_set_file import (
    LibraryGoldenSetFileError,
    read_library_golden_set,
)
from knowledge_portal.interfaces.api.composition.evaluation import (
    build_library_evaluation,
    build_mapping_evaluation,
)

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GOLDEN_SET = ROOT / "tests" / "fixtures" / "golden" / "impact_golden_set.json"
DEFAULT_LIBRARY_GOLDEN_SET = ROOT / "tests" / "fixtures" / "golden" / "library_golden_set.json"
DEFAULT_CATALOGUE = ROOT / "catalogues" / "smb-architecture.yaml"


def _percent(value: float | None) -> str:
    return "not measured" if value is None else f"{value:.1%}"


def scores(report: EvaluationReport) -> dict[str, float | None]:
    return {
        "system_precision": report.system_precision,
        "system_recall": report.system_recall,
        "verdict_accuracy": report.verdict_accuracy,
        "offering_accuracy": report.offering_accuracy,
        "concept_recall": report.concept_recall,
        "citation_faithfulness": report.citation_faithfulness,
        "owner_consumer_reach": report.reach,
        "drafts_applied": report.drafts_applied,
    }


def _case(result: CaseResult) -> dict[str, Any]:
    prediction = result.prediction
    return {
        "id": result.case.id,
        "expected": {
            "verdict": result.case.verdict,
            "offering": result.case.offering_id,
            "systems": sorted(result.case.system_ids),
        },
        "predicted": None
        if prediction is None
        else {
            "verdict": prediction.verdict,
            "offering": prediction.offering_id,
            "systems": sorted(prediction.system_ids),
            "concepts": None if prediction.concept_ids is None else sorted(prediction.concept_ids),
        },
        "draft": None
        if prediction is None or prediction.draft is None
        else {
            "offering": prediction.draft.offering.id,
            "components": [item.id for item in prediction.draft.offering.components],
            "journey": prediction.draft.journey.id if prediction.draft.journey else None,
            "problems": list(result.draft_problems or ()),
        },
        "failure": result.failure,
        "citations": {"checked": result.citations_checked, "faithful": result.citations_faithful},
    }


def render(report: EvaluationReport) -> str:
    lines = [
        f"Golden set v{report.golden_set_version} on {report.catalogue_version}",
        f"Mapper: {report.mapper} ({report.model}); {len(report.results)} cases, "
        f"{report.failures} failed",
        "",
        *(
            f"{name.replace('_', ' '):<24}{_percent(value)}"
            for name, value in scores(report).items()
        ),
        f"{'false changes':<24}{report.false_changes}",
        f"{'new offerings drafted':<24}{report.new_offerings[1]} of {report.new_offerings[0]}",
    ]
    return "\n".join(lines)


def library_scores(report: LibraryEvaluationReport) -> dict[str, float]:
    return {
        f"recall_at_{report.k}": report.recall_at_k,
        "mean_reciprocal_rank": report.mean_reciprocal_rank,
        "zero_hit_share": report.zero_hit_share,
    }


def _library_case(result: LibraryCaseResult) -> dict[str, Any]:
    return {
        "id": result.case.id,
        "product": result.product,
        "semantic": result.case.semantic,
        "expected": [
            {
                "document": hit.document_title,
                "passage": hit.passage,
                "found": found,
            }
            for hit, found in zip(result.case.expected, result.found, strict=True)
        ],
        "hits": [
            {
                "rank": hit.rank,
                "document": hit.document_title,
                "location": hit.location,
                "text": hit.text,
                "relevant": hit.relevant,
            }
            for hit in result.hits
        ],
        "first_relevant_rank": result.first_relevant_rank,
        "failure": result.failure,
    }


def library_scores_by_product(report: LibraryEvaluationReport) -> dict[str, dict[str, Any]]:
    return {
        product: {"cases": len(part.results), **library_scores(part)}
        for product in report.products
        for part in (report.only(product),)
    }


def render_library(report: LibraryEvaluationReport) -> str:
    lines = [
        f"Library golden set v{report.golden_set_version}: {report.documents} documents, "
        f"{report.chunks} chunks, {report.excluded_blocks} blocks excluded at review",
        f"Mapper: library ({report.model}); {len(report.results)} cases, "
        f"{report.failures} failed, {report.empty_answers} empty answers",
        "",
        *(
            f"{name.replace('_', ' '):<24}{_percent(value)}"
            for name, value in library_scores(report).items()
        ),
    ]
    misses = [item.case.id for item in report.results if item.zero_hit]
    if misses:
        lines.append(f"{'cases with no hit':<24}{', '.join(misses)}")
    by_product = library_scores_by_product(report)
    width = max(len(name) for name in by_product) + 2
    lines += [
        "",
        f"{'By product':<{width}}{'cases':>6}{'recall':>9}{'MRR':>9}{'no hit':>9}",
        *(
            f"{name:<{width}}{values['cases']:>6}"
            + "".join(f"{_percent(value):>9}" for key, value in values.items() if key != "cases")
            for name, values in by_product.items()
        ),
    ]
    return "\n".join(lines)


def _evaluate_library(golden_set: Path | None, output: Path | None, settings: Settings) -> int:
    path = golden_set or DEFAULT_LIBRARY_GOLDEN_SET
    try:
        golden = read_library_golden_set(path.read_bytes(), path.parent)
    except (LibraryGoldenSetFileError, OSError) as exc:
        print(f"[evaluate] {exc}", file=sys.stderr)
        return 2
    evaluation = build_library_evaluation(settings, SystemClock())
    try:
        corpus = evaluation.seed.execute(golden)
        report = evaluation.evaluate.execute(golden, corpus, DEFAULT_K)
    except LibraryEvaluationError as exc:
        print(f"[evaluate] {exc}", file=sys.stderr)
        return 2
    finally:
        evaluation.close()
    print(render_library(report))
    if output is not None:
        output.write_text(
            json.dumps(
                {
                    "mapper": "library",
                    "model": report.model,
                    "index_identity": report.index_identity,
                    "scores": library_scores(report),
                    "scores_by_product": library_scores_by_product(report),
                    "excluded_blocks": report.excluded_blocks,
                    "failures": report.failures,
                    "empty_answers": report.empty_answers,
                    "cases": [_library_case(item) for item in report.results],
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score a mapper on its golden set.")
    parser.add_argument(
        "--golden-set",
        type=Path,
        help="The impact golden set (default: the committed one), or the library's "
        "with --mapper library.",
    )
    parser.add_argument("--catalogue", type=Path, default=DEFAULT_CATALOGUE)
    parser.add_argument("--json", type=Path, help="Also write the scores and every case here.")
    parser.add_argument(
        "--mapper",
        choices=("assess", "match", "library"),
        default="assess",
        help="The requirement assessment (default), today's per-item match, or the "
        "reference library's retrieval.",
    )
    parser.add_argument(
        "--precedents",
        choices=("none", "loo"),
        default="none",
        help="No precedents (default), or every other labelled case as an accepted verdict.",
    )
    arguments = parser.parse_args(argv)
    try:
        settings = Settings.from_env()
    except ConfigurationError as exc:
        print(f"[evaluate] {exc}", file=sys.stderr)
        return 2
    if arguments.mapper == "library":
        return _evaluate_library(arguments.golden_set, arguments.json, settings)
    try:
        golden = read_golden_set((arguments.golden_set or DEFAULT_GOLDEN_SET).read_bytes())
    except (GoldenSetFileError, OSError) as exc:
        print(f"[evaluate] {exc}", file=sys.stderr)
        return 2
    evaluation = build_mapping_evaluation(settings, SystemClock())
    try:
        release = evaluation.publish.execute(
            arguments.catalogue.name, arguments.catalogue.read_bytes()
        )
        if missing := unknown_ids(golden, release):
            print("[evaluate] The catalogue lacks: " + "; ".join(missing), file=sys.stderr)
            return 2
        if arguments.precedents == "loo":
            evaluation.seed_precedents.execute(golden, release.id)
        evaluate = (
            evaluation.evaluate if arguments.mapper == "assess" else evaluation.evaluate_match
        )
        report = evaluate.execute(golden, release.id)
    finally:
        evaluation.close()
    print(render(report))
    if arguments.json is not None:
        arguments.json.write_text(
            json.dumps(
                {
                    "scores": scores(report),
                    "false_changes": report.false_changes,
                    "new_offerings": dict(
                        zip(("labelled", "drafted"), report.new_offerings, strict=True)
                    ),
                    "cases": [_case(item) for item in report.results],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
