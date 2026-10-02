"""Library review edge cases: scoped warning exclusion, original previews, unsupported regions."""

import io
from dataclasses import replace
from datetime import UTC, datetime

import pytest
from PIL import Image
from pydantic import TypeAdapter

from knowledge_portal.application.errors import (
    DocumentNotFoundError,
)
from knowledge_portal.application.use_cases.document_library import DocumentLibrary
from knowledge_portal.application.use_cases.documents import UploadDocumentInput
from knowledge_portal.application.use_cases.reference_knowledge import ReferenceKnowledge
from knowledge_portal.domain.document.entities import DocumentExtractionWarning
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.library import (
    ExtractionRevision,
    LibraryDocument,
    ReviewedPassage,
)
from knowledge_portal.domain.document.value_objects import (
    ExtractionWarningSeverity,
)
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError
from knowledge_portal.infrastructure.persistence.document_library import (
    InMemoryDocumentLibrary,
)
from tests.presentation_fixtures import PPTX_MIME, drawing_paragraph, presentation
from tests.unit.test_document_library import library as library  # noqa: F401
from tests.unit.test_document_library import other, owner

LibraryFixture = tuple[DocumentLibrary, ReferenceKnowledge, InMemoryDocumentLibrary]


def test_warning_exclusion_is_exact_reversible_and_legacy_safe(library: LibraryFixture) -> None:
    service, _, _ = library
    uploaded = service.submit(
        "Policy",
        UploadDocumentInput("rules.txt", "text/plain", b"Keep\nProblem\nOther"),
        "scope",
        owner(),
    )
    service.process_next()
    source = service.get(uploaded.id, owner()).versions[0]
    warnings = (
        DocumentExtractionWarning(
            "region", ExtractionWarningSeverity.BLOCKING, "Region failed", source.blocks[1].id
        ),
        DocumentExtractionWarning("global", ExtractionWarningSeverity.BLOCKING, "Document failed"),
    )
    source = replace(
        source, warning_details=warnings, blocking_warnings=tuple(w.message for w in warnings)
    )

    def reviewed(excluded: str) -> ExtractionRevision:
        return ExtractionRevision(
            "r",
            datetime.now(UTC),
            owner().snapshot(),
            tuple(
                ReviewedPassage(
                    b.id, b.text or "", b.id != excluded, "Irrelevant" if b.id == excluded else ""
                )
                for b in source.blocks
            ),
            "Checked source",
        )

    unrelated = replace(source, revisions=(reviewed(source.blocks[2].id),))
    assert unrelated.unresolved_blocking_warnings == ("Region failed", "Document failed")
    scoped = replace(source, revisions=(reviewed(source.blocks[1].id),))
    assert scoped.unresolved_blocking_warnings == ("Document failed",)
    assert replace(scoped, revisions=()).unresolved_blocking_warnings == (
        "Region failed",
        "Document failed",
    )
    assert replace(scoped, warning_details=()).unresolved_blocking_warnings == (
        "Region failed",
        "Document failed",
    )
    # Stored JSON round-trips preserve warning scope; legacy payloads remain readable.
    doc = replace(uploaded, versions=(scoped,))
    codec = TypeAdapter(LibraryDocument)
    assert codec.validate_json(codec.dump_json(doc)) == doc


def test_original_image_preview_is_owner_only_and_sanitized(library: LibraryFixture) -> None:
    service, _, _ = library
    output = io.BytesIO()
    Image.new("RGB", (128, 128), "white").save(output, format="PNG")
    upload = service.submit(
        "Source",
        UploadDocumentInput("image.png", "image/png", output.getvalue()),
        "preview",
        owner(),
    )
    service.process_next()
    source = service.get(upload.id, owner()).versions[0]
    block = source.blocks[0]
    result = service.preview_original(upload.id, source.id, block.id, owner())
    assert result.image_data is not None
    assert result.image_data.startswith("data:image/")
    with pytest.raises(AuthorizationDeniedError):
        service.preview_original(upload.id, source.id, block.id, other())
    with pytest.raises(DocumentNotFoundError):
        service.preview_original(upload.id, source.id, "another-version-block", owner())


def test_excluding_the_unsupported_region_allows_only_selected_publication(
    library: LibraryFixture,
) -> None:
    service, knowledge, _ = library
    content = presentation(
        drawing_paragraph("Keep coverage policy.")
        + '<p:graphicFrame><a:graphic><a:graphicData uri="chart"/></a:graphic></p:graphicFrame>'
    )
    uploaded = service.submit(
        "Scoped evidence",
        UploadDocumentInput("scope.pptx", PPTX_MIME, content),
        "scope-chart",
        owner(),
    )
    service.process_next()
    current = service.get(uploaded.id, owner())
    source = current.versions[0]
    affected = source.warning_details[0].block_id
    reviewed = service.review(
        uploaded.id,
        source.id,
        current.version,
        owner(),
        tuple(ReviewedPassage(b.id, b.text or "[Image]", True) for b in source.blocks),
        "Compared source",
    )
    view = service.get(uploaded.id, owner())
    assert view.review_fingerprint is not None
    with pytest.raises(InvalidDocumentError, match="Blocking"):
        service.approve(
            uploaded.id,
            source.id,
            reviewed.versions[0].revisions[-1].id,
            view.review_fingerprint,
            reviewed.version,
            owner(),
        )
    reviewed = service.review(
        uploaded.id,
        source.id,
        reviewed.version,
        owner(),
        tuple(
            ReviewedPassage(
                b.id,
                b.text or "[Image]",
                b.id != affected,
                "Outside this reference scope" if b.id == affected else "",
            )
            for b in source.blocks
        ),
        "Excluded only the unsupported graphic",
    )
    view = service.get(uploaded.id, owner())
    assert view.review_fingerprint is not None
    assert view.versions[0].blocking_warnings == ()
    assert view.versions[0].warnings  # Original warning remains in review history.
    service.approve(
        uploaded.id,
        source.id,
        reviewed.versions[0].revisions[-1].id,
        view.review_fingerprint,
        reviewed.version,
        owner(),
    )
    assert knowledge.index_next()
    shared = service.get(uploaded.id, other()).versions[0]
    assert [b.text for b in shared.blocks] == ["Keep coverage policy."]
    assert shared.warning_details == () and shared.assets == ()
