"""A Word 97–2003 file is refused with how to convert it, wherever it is uploaded (C)."""

import pytest

from knowledge_portal.application.document_upload_validation import validate_document_upload
from knowledge_portal.application.errors import UnsupportedDocumentError
from knowledge_portal.application.use_cases.documents import validate_ingested_upload

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@pytest.mark.parametrize(
    ("filename", "mime"),
    [
        ("Policy.DOC", "application/msword"),
        ("policy.doc", "application/octet-stream"),
        ("policy.doc", DOCX),
        ("policy.docx", "application/msword"),
    ],
)
def test_legacy_word_is_refused_with_how_to_convert_it(filename: str, mime: str) -> None:
    for validate in (validate_document_upload, validate_ingested_upload):
        with pytest.raises(UnsupportedDocumentError, match=r"save it as \.docx"):
            validate(filename, mime, b"\xd0\xcf\x11\xe0", 1000)


def test_a_docx_still_passes() -> None:
    assert validate_document_upload("policy.docx", DOCX, b"PK", 1000) == ("policy.docx", DOCX)
    assert validate_ingested_upload("policy.docx", DOCX, b"PK", 1000) == ("policy.docx", DOCX)
