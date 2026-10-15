"""The library golden set file: a seeded corpus and labelled queries in JSON
(tests/fixtures/golden/library_golden_set.json).

The file is written by hand, so this reader refuses what a label could get wrong silently: a
duplicate id or title, a blank text, a case with no expected hit, an expected hit that names no
document of the corpus or names neither a passage nor a label, or a passage the named document
does not contain.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, ValidationError

from knowledge_portal.application.use_cases.library_evaluation import (
    ExpectedHit,
    LibraryGoldenCase,
    LibraryGoldenDocument,
    LibraryGoldenSet,
)


class LibraryGoldenSetFileError(ValueError):
    """The library golden set file is malformed or mislabelled."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Document(_Strict):
    id: str
    title: str
    filename: str
    mime_type: str
    text: str
    withdrawn: bool = False


class _Expected(_Strict):
    document: str
    passage: str | None = None
    label: str | None = None


class _Case(_Strict):
    id: str
    text: str
    expected: list[_Expected]
    semantic: bool = False
    note: str | None = None


class _File(_Strict):
    version: int
    labelled_on: str
    provenance: str
    documents: list[_Document]
    cases: list[_Case]


def _folded(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _unique(values: list[str], where: str) -> None:
    cleaned = [value.strip() for value in values]
    if any(not value for value in cleaned):
        raise LibraryGoldenSetFileError(f"{where} has a blank entry.")
    if len(set(cleaned)) != len(cleaned):
        raise LibraryGoldenSetFileError(f"{where} names the same entry twice.")


def _document(raw: _Document) -> LibraryGoldenDocument:
    where = f"Document {raw.id!r}"
    if not raw.text.strip():
        raise LibraryGoldenSetFileError(f"{where} has no text.")
    if not raw.title.strip() or not raw.filename.strip() or not raw.mime_type.strip():
        raise LibraryGoldenSetFileError(f"{where} needs a title, a file name and a MIME type.")
    return LibraryGoldenDocument(
        raw.id.strip(),
        raw.title.strip(),
        raw.filename.strip(),
        raw.mime_type.strip(),
        raw.text,
        raw.withdrawn,
    )


def _expected(
    raw: _Expected, where: str, documents: dict[str, LibraryGoldenDocument]
) -> ExpectedHit:
    title = raw.document.strip()
    document = documents.get(title)
    if document is None:
        raise LibraryGoldenSetFileError(f"{where} expects a document the corpus lacks: {title!r}.")
    if document.withdrawn:
        raise LibraryGoldenSetFileError(f"{where} expects a withdrawn document: {title!r}.")
    passage = raw.passage.strip() if raw.passage is not None else None
    label = raw.label.strip() if raw.label is not None else None
    if not passage and not label:
        raise LibraryGoldenSetFileError(f"{where} names neither a passage nor a label.")
    if passage and _folded(passage) not in _folded(document.text):
        raise LibraryGoldenSetFileError(f"{where} expects a passage {title!r} does not contain.")
    return ExpectedHit(title, passage or None, label or None)


def _case(raw: _Case, documents: dict[str, LibraryGoldenDocument]) -> LibraryGoldenCase:
    where = f"Case {raw.id!r}"
    if not raw.text.strip():
        raise LibraryGoldenSetFileError(f"{where} has no text.")
    if not raw.expected:
        raise LibraryGoldenSetFileError(f"{where} expects nothing.")
    expected = tuple(_expected(item, where, documents) for item in raw.expected)
    if len(set(expected)) != len(expected):
        raise LibraryGoldenSetFileError(f"{where} expects the same passage twice.")
    return LibraryGoldenCase(raw.id.strip(), raw.text.strip(), expected, raw.semantic, raw.note)


def read_library_golden_set(content: bytes) -> LibraryGoldenSet:
    try:
        raw = _File.model_validate_json(content)
    except ValidationError as exc:
        raise LibraryGoldenSetFileError(f"The golden set file is malformed: {exc}") from exc
    documents = tuple(_document(item) for item in raw.documents)
    if not documents:
        raise LibraryGoldenSetFileError("The golden set has no documents.")
    _unique([item.id for item in documents], "The document list")
    _unique([item.title for item in documents], "The document titles")
    by_title = {item.title: item for item in documents}
    cases = tuple(_case(item, by_title) for item in raw.cases)
    if not cases:
        raise LibraryGoldenSetFileError("The golden set has no cases.")
    _unique([item.id for item in cases], "The case list")
    return LibraryGoldenSet(raw.version, documents, cases)
