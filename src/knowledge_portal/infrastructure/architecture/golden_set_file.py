"""The golden set file: labelled requirements in JSON (tests/fixtures/golden/).

The file is written by hand, so this reader refuses anything a label could get wrong
silently: a duplicate id, a blank text, an unknown verdict or concept, an offering on a verdict
that names none, or a case with no verdict that does not say what is missing.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, ValidationError

from knowledge_portal.application.use_cases.mapping_evaluation import GoldenCase, GoldenSet
from knowledge_portal.domain.architecture.verdicts import ProductVerdict


class GoldenSetFileError(ValueError):
    """The golden set file is malformed or mislabelled."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Concept(_Strict):
    id: str
    label: str


class _Case(_Strict):
    id: str
    text: str
    verdict: ProductVerdict | None
    offering: str | None
    systems: list[str]
    concepts: list[str]
    missing_facets: list[str]
    note: str | None = None


class _File(_Strict):
    version: int
    catalogue: str
    catalogue_version: str
    labelled_on: str
    provenance: str
    verdicts: list[ProductVerdict]
    concepts: list[_Concept]
    cases: list[_Case]


def _clean(values: list[str], where: str) -> frozenset[str]:
    cleaned = [value.strip() for value in values]
    if any(not value for value in cleaned):
        raise GoldenSetFileError(f"{where} has a blank entry.")
    if len(set(cleaned)) != len(cleaned):
        raise GoldenSetFileError(f"{where} names the same entry twice.")
    return frozenset(cleaned)


def _case(raw: _Case, concepts: frozenset[str]) -> GoldenCase:
    where = f"Case {raw.id!r}"
    if not raw.text.strip():
        raise GoldenSetFileError(f"{where} has no text.")
    systems = _clean(raw.systems, f"{where}'s systems")
    needed = _clean(raw.concepts, f"{where}'s concepts")
    facets = _clean(raw.missing_facets, f"{where}'s missing facets")
    if unknown := sorted(needed - concepts):
        raise GoldenSetFileError(f"{where} names undeclared concepts: {', '.join(unknown)}.")
    offering = raw.offering.strip() if raw.offering is not None else None
    if raw.verdict is None:
        if not facets:
            raise GoldenSetFileError(f"{where} has no verdict, so it must name what is missing.")
        if systems or needed or offering:
            raise GoldenSetFileError(f"{where} has no verdict, so it labels nothing else.")
    else:
        if facets:
            raise GoldenSetFileError(f"{where} has a verdict, so nothing can be missing.")
        if not systems:
            raise GoldenSetFileError(f"{where} names no system.")
        if raw.verdict.names_an_offering != bool(offering):
            raise GoldenSetFileError(
                f"{where}: '{raw.verdict.value}' "
                + ("needs an offering." if raw.verdict.names_an_offering else "names none.")
            )
    return GoldenCase(
        raw.id.strip(),
        raw.text.strip(),
        raw.verdict,
        offering,
        systems,
        needed,
        tuple(sorted(facets)),
    )


def read_golden_set(content: bytes) -> GoldenSet:
    try:
        raw = _File.model_validate_json(content)
    except ValidationError as exc:
        raise GoldenSetFileError(f"The golden set file is malformed: {exc}") from exc
    concepts = _clean([item.id for item in raw.concepts], "The concept list")
    cases = tuple(_case(item, concepts) for item in raw.cases)
    _clean([item.id for item in cases], "The case list")
    if not cases:
        raise GoldenSetFileError("The golden set has no cases.")
    return GoldenSet(raw.version, raw.catalogue_version, cases)
