"""The library golden set file: a corpus and labelled queries in JSON
(tests/fixtures/golden/library_golden_set.json).

A corpus document is either a file of any format the library accepts, named relative to the
golden set file, or a short text written inline. It may name the product it belongs to; a case
without a product of its own takes its documents' product when they share one.

The file is written by hand, so this reader refuses what a label could get wrong silently: a
duplicate id or title, a blank text, a document with both or neither of a file and a text, a
file outside the golden set's folder or missing, a case with no expected hit, or an expected hit
on a document the corpus lacks or has withdrawn. Whether an expected passage is really in its
document is checked once the document is read, since only then is its text known.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath

from pydantic import BaseModel, ConfigDict, ValidationError

from knowledge_portal.application.use_cases.library_evaluation import (
    ExpectedHit,
    LibraryGoldenCase,
    LibraryGoldenDocument,
    LibraryGoldenSet,
)
from knowledge_portal.infrastructure.json_reading import trimmed_text

# An upload with a generic type is read by its extension, as the portal reads one.
GENERIC_TYPE = "application/octet-stream"
# A case whose documents belong to different products.
SEVERAL_PRODUCTS = "Several products"


class LibraryGoldenSetFileError(ValueError):
    """The library golden set file is malformed or mislabelled."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Document(_Strict):
    id: str
    title: str
    product: str | None = None
    # A file next to the golden set, of any format the library reads...
    file: str | None = None
    # ...or an inline text, with the file name it is uploaded under.
    text: str | None = None
    filename: str | None = None
    mime_type: str | None = None
    withdrawn: bool = False


class _Expected(_Strict):
    document: str
    # Absent when any passage of the document answers the case.
    passage: str | None = None


class _Case(_Strict):
    id: str
    text: str
    expected: list[_Expected]
    product: str | None = None
    semantic: bool = False
    note: str | None = None


class _File(_Strict):
    version: int
    labelled_on: str
    provenance: str
    documents: list[_Document]
    cases: list[_Case]


def _unique(values: list[str], where: str) -> None:
    cleaned = [value.strip() for value in values]
    if any(not value for value in cleaned):
        raise LibraryGoldenSetFileError(f"{where} has a blank entry.")
    if len(set(cleaned)) != len(cleaned):
        raise LibraryGoldenSetFileError(f"{where} names the same entry twice.")


def _file(raw: _Document, where: str, folder: Path) -> tuple[str, bytes]:
    name = (raw.file or "").strip()
    relative = PurePosixPath(name)
    if not name or relative.is_absolute() or ".." in relative.parts:
        raise LibraryGoldenSetFileError(f"{where} names a file outside the golden set's folder.")
    path = folder.joinpath(*relative.parts)
    try:
        content = path.read_bytes()
    except OSError as exc:
        raise LibraryGoldenSetFileError(f"{where} names a file that cannot be read: {exc}") from exc
    if not content:
        raise LibraryGoldenSetFileError(f"{where} names an empty file.")
    return relative.name, content


def _document(raw: _Document, folder: Path) -> LibraryGoldenDocument:
    where = f"Document {raw.id!r}"
    if not raw.title.strip():
        raise LibraryGoldenSetFileError(f"{where} has no title.")
    if (raw.file is None) == (raw.text is None):
        raise LibraryGoldenSetFileError(f"{where} needs either a file or a text, not both.")
    if raw.file is not None:
        if raw.filename is not None:
            raise LibraryGoldenSetFileError(f"{where} takes its file name from its file.")
        filename, content = _file(raw, where, folder)
    else:
        if not (raw.text or "").strip():
            raise LibraryGoldenSetFileError(f"{where} has no text.")
        filename = (raw.filename or "").strip()
        if not filename:
            raise LibraryGoldenSetFileError(f"{where} needs the file name its text is sent as.")
        content = (raw.text or "").encode("utf-8")
    return LibraryGoldenDocument(
        raw.id.strip(),
        raw.title.strip(),
        filename,
        trimmed_text(raw.mime_type) or GENERIC_TYPE,
        content,
        trimmed_text(raw.product),
        raw.withdrawn,
    )


def _case(raw: _Case, documents: dict[str, LibraryGoldenDocument]) -> LibraryGoldenCase:
    where = f"Case {raw.id!r}"
    if not raw.text.strip():
        raise LibraryGoldenSetFileError(f"{where} has no text.")
    if not raw.expected:
        raise LibraryGoldenSetFileError(f"{where} expects nothing.")
    expected: list[ExpectedHit] = []
    for item in raw.expected:
        title = item.document.strip()
        document = documents.get(title)
        if document is None:
            raise LibraryGoldenSetFileError(
                f"{where} expects a document the corpus lacks: {title!r}."
            )
        if document.withdrawn:
            raise LibraryGoldenSetFileError(f"{where} expects a withdrawn document: {title!r}.")
        if item.passage is not None and not item.passage.strip():
            raise LibraryGoldenSetFileError(f"{where} expects a blank passage.")
        expected.append(ExpectedHit(title, trimmed_text(item.passage)))
    if len(set(expected)) != len(expected):
        raise LibraryGoldenSetFileError(f"{where} expects the same passage twice.")
    products = {documents[item.document_title].product for item in expected} - {None}
    product = trimmed_text(raw.product) or (
        next(iter(products)) if len(products) == 1 else SEVERAL_PRODUCTS if products else None
    )
    return LibraryGoldenCase(
        raw.id.strip(), raw.text.strip(), tuple(expected), product, raw.semantic, raw.note
    )


def read_library_golden_set(content: bytes, folder: Path) -> LibraryGoldenSet:
    """`folder` is where the golden set file lives; document files are named relative to it."""
    try:
        raw = _File.model_validate_json(content)
    except ValidationError as exc:
        raise LibraryGoldenSetFileError(f"The golden set file is malformed: {exc}") from exc
    if not raw.documents:
        raise LibraryGoldenSetFileError("The golden set has no documents.")
    _unique([item.id for item in raw.documents], "The document list")
    _unique([item.title for item in raw.documents], "The document titles")
    documents = tuple(_document(item, folder) for item in raw.documents)
    by_title = {item.title: item for item in documents}
    if not raw.cases:
        raise LibraryGoldenSetFileError("The golden set has no cases.")
    _unique([item.id for item in raw.cases], "The case list")
    cases = tuple(_case(item, by_title) for item in raw.cases)
    return LibraryGoldenSet(raw.version, documents, cases)
