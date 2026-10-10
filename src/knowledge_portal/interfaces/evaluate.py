"""Score the impact mapper on the golden set: ``python -m knowledge_portal.interfaces.evaluate``.

``--mapper assess`` (the default) scores the requirement assessment; ``--mapper match``
today's per-item mapping, the Phase 0 baseline.

It publishes the catalogue the golden set was labelled against into an in-memory release,
maps every case with the models the settings configure (``LLM_PROVIDER``), and prints the
scores. ``--json`` also writes each case's answer, for comparing two runs.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from smb_kernel.time.system import SystemClock

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
from knowledge_portal.interfaces.api.composition.evaluation import build_mapping_evaluation

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GOLDEN_SET = ROOT / "tests" / "fixtures" / "golden" / "impact_golden_set.json"
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
    ]
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score the impact mapper on the golden set.")
    parser.add_argument("--golden-set", type=Path, default=DEFAULT_GOLDEN_SET)
    parser.add_argument("--catalogue", type=Path, default=DEFAULT_CATALOGUE)
    parser.add_argument("--json", type=Path, help="Also write the scores and every case here.")
    parser.add_argument(
        "--mapper",
        choices=("assess", "match"),
        default="assess",
        help="The requirement assessment (default), or today's per-item match.",
    )
    arguments = parser.parse_args(argv)
    try:
        settings = Settings.from_env()
        golden = read_golden_set(arguments.golden_set.read_bytes())
    except (ConfigurationError, GoldenSetFileError, OSError) as exc:
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
