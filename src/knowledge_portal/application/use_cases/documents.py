"""The file checks every background-ingested upload passes, and what an upload carries."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath, PureWindowsPath

from knowledge_portal.application.document_upload_validation import (
    LEGACY_WORD_MIME,
    LEGACY_WORD_REFUSAL,
)
from knowledge_portal.application.errors import UnsupportedDocumentError

SUPPORTED_EXTENSIONS: dict[str, str | tuple[str, ...]] = {
    "text/csv": ".csv",
    "text/tab-separated-values": ".tsv",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": (".txt", ".md"),
    "text/markdown": (".md",),
    "image/png": (".png",),
    "image/jpeg": (".jpg", ".jpeg"),
}


def validate_ingested_upload(
    filename: str, mime_type: str, content: bytes, max_bytes: int
) -> tuple[str, str]:
    """The checks for a file scanned and extracted in the background.

    The declared type wins; an absent or generic one is inferred from the
    extension. Returns the cleaned filename and the type it will be read as.
    """
    filename = filename.strip()
    mime = mime_type.split(";", 1)[0].strip().lower()
    extension = PurePosixPath(filename).suffix.lower()
    if extension == ".doc" or mime == LEGACY_WORD_MIME:
        raise UnsupportedDocumentError(LEGACY_WORD_REFUSAL)
    if mime in {"", "application/octet-stream"}:
        mime = next(
            (
                m
                for m, suffixes in SUPPORTED_EXTENSIONS.items()
                if extension in ((suffixes,) if isinstance(suffixes, str) else suffixes)
            ),
            mime,
        )
    suffixes = SUPPORTED_EXTENSIONS.get(mime)
    if (
        not filename
        or "\x00" in filename
        or len(filename) > 255
        or PurePosixPath(filename).name != filename
        or PureWindowsPath(filename).name != filename
        or not suffixes
        or not filename.lower().endswith(suffixes)
        or not 0 < len(content) <= max_bytes
    ):
        raise UnsupportedDocumentError(
            "Provide a supported, nonempty file within the upload limit, "
            "without a path in its name."
        )
    return filename, mime


@dataclass(frozen=True)
class UploadDocumentInput:
    filename: str
    mime_type: str
    content: bytes
    include_in_analysis: bool = False
