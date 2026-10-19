"""The golden set's floors: the least each score may be, kept beside the golden set.

Floors are kept per provider kind. A fake model's scores only guard the harness against
regressions in CI; a real model's floors are set from real runs and are empty until then.
Nothing here invents a number: a score with no floor is shown as having none.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, ValidationError

SCORES = frozenset(
    {
        "system_precision",
        "system_recall",
        "verdict_accuracy",
        "offering_accuracy",
        "concept_recall",
        "citation_faithfulness",
        "owner_consumer_reach",
        "drafts_applied",
    }
)
PROVIDERS = frozenset({"fake", "live"})


class GoldenFloorsFileError(ValueError):
    """The floors file is malformed or names a score or provider that does not exist."""


class _File(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str
    floors: dict[str, dict[str, float]]


def read_golden_floors(content: bytes) -> dict[str, dict[str, float]]:
    try:
        raw = _File.model_validate_json(content)
    except ValidationError as exc:
        raise GoldenFloorsFileError(f"The floors file is malformed: {exc}") from exc
    if unknown := sorted(set(raw.floors) - PROVIDERS):
        raise GoldenFloorsFileError(f"Floors for unknown providers: {', '.join(unknown)}.")
    floors = {provider: raw.floors.get(provider, {}) for provider in sorted(PROVIDERS)}
    for provider, scores in floors.items():
        if unknown := sorted(set(scores) - SCORES):
            raise GoldenFloorsFileError(
                f"The {provider} floors name unknown scores: {', '.join(unknown)}."
            )
        if any(not 0.0 <= value <= 1.0 for value in scores.values()):
            raise GoldenFloorsFileError(f"The {provider} floors must be between 0 and 1.")
    return floors
