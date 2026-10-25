"""A long Word specification is read whole: its tables by row, its text to a budget, its figures."""

from __future__ import annotations

import io
import zipfile
from datetime import UTC, datetime
from typing import Any

import pytest
from PIL import Image
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor
from smb_kernel.time.fixed import FixedClock

from knowledge_portal.application.ports.catalogue_extractor import (
    CatalogueProposal,
    ExtractionRequest,
    ExtractionSegment,
)
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.use_cases import catalogue_candidates
from knowledge_portal.application.use_cases.architecture_documents import ReadKnowledgeDocument
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.catalogue_candidates import ProposeCatalogueChanges
from knowledge_portal.domain.architecture.knowledge import KnowledgeDocumentVersion
from knowledge_portal.domain.document.value_objects import DocumentVersionId
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.catalogue_tables import CatalogueTableReader
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import InMemoryEvidenceIndex
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.tokenizer import FakeWordTokenizer
from knowledge_portal.infrastructure.documents.library_worker import OfflineDocumentScanner
from knowledge_portal.infrastructure.llm.catalogue_extraction import FakeCatalogueExtractor
from knowledge_portal.infrastructure.llm.catalogue_matching import FakeSystemMatcher
from knowledge_portal.infrastructure.persistence.document_storage import (
    InMemoryDocumentStorage,
)
from knowledge_portal.infrastructure.persistence.in_memory_catalogue_candidates import (
    InMemoryCatalogueCandidates,
)
from tests.catalogue_seed import seeded_repository

NOW = datetime(2026, 10, 12, tzinfo=UTC)
MAINTAINER = Actor("amina", frozenset({"knowledge_maintainer"}))
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
IMAGE_RELATIONSHIP = R + "/image"


def _p(text: str, style: str | None = None) -> str:
    properties = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    return f"<w:p>{properties}<w:r><w:t>{text}</w:t></w:r></w:p>"


def _row(*cells: str) -> str:
    return (
        "<w:tr>"
        + "".join(f"<w:tc>{_p(cell) if cell else '<w:p/>'}</w:tc>" for cell in cells)
        + "</w:tr>"
    )


def _figure(rel_id: str) -> str:
    return f'<w:p><w:r><w:drawing><a:blip r:embed="{rel_id}"/></w:drawing></w:r></w:p>'


def _png(colour: str) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (320, 200), colour).save(buffer, "PNG")
    return buffer.getvalue()


def _docx(body: str, media: dict[str, bytes] | None = None) -> bytes:
    media = media or {}
    relationships = "".join(
        f'<Relationship Id="{rel_id}" Type="{IMAGE_RELATIONSHIP}" Target="media/{rel_id}.png"/>'
        for rel_id in media
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="png" ContentType="image/png"/></Types>',
        )
        archive.writestr(
            "word/document.xml",
            f'<w:document xmlns:w="{W}" xmlns:a="{A}" xmlns:r="{R}"><w:body>{body}</w:body>'
            "</w:document>",
        )
        archive.writestr(
            "word/_rels/document.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{relationships}</Relationships>",
        )
        for rel_id, content in media.items():
            archive.writestr(f"word/media/{rel_id}.png", content)
    return buffer.getvalue()


def _located(content: bytes) -> list[Any]:
    return list(LocatedDocumentExtractor(SafeDocumentTextExtractor()).extract(DOCX, content))


def test_a_word_table_row_is_one_passage_under_its_header() -> None:
    located = _located(
        _docx(
            _p("Impacted Systems", "Heading1")
            + "<w:tbl>"
            + _row("System", "Change")
            + _row("CWOM", "New order type")
            + _row("WFMS", "")
            + "</w:tbl>"
            + "<w:tbl>"
            + _row("A boxed note")
            + "</w:tbl>"
            + _p("After the tables.")
        )
    )

    assert [(item.location, item.text) for item in located] == [
        ("paragraph 1", "Impacted Systems"),
        ("table 1, row 1", "System | Change"),
        ("table 1, row 2", "System: CWOM | Change: New order type"),
        ("table 1, row 3", "System: WFMS"),
        ("table 2, row 1", "A boxed note"),
        # Table paragraphs still count, so a paragraph keeps the number it had.
        ("paragraph 9", "After the tables."),
    ]
    assert located[2].cells == (("System", "CWOM"), ("Change", "New order type"))
    assert located[3].cells == (("System", "WFMS"), ("Change", ""))
    assert located[2].heading_path == ("Impacted Systems",)
    assert located[2].block == "table 1, row 2"
    assert located[4].cells == ()


def test_a_feasibility_table_is_not_read_as_a_system_inventory() -> None:
    located = _located(
        _docx(
            "<w:tbl>"
            + _row("ID", "Requirement Details", "Feasibility", "System")
            + _row("1", "New CPEs are configured", "YES", "ECM, CWOM, WFMS")
            + _row("2", "Portal shows the plan", "YES", "Automation Portal")
            + "</w:tbl>"
            + "<w:tbl>"
            + _row("System", "ID")
            + _row("Order Store", "SYS-STORE")
            + _row("CWOM, WFMS", "SYS-BOTH")
            + "</w:tbl>"
        )
    )
    segments = tuple(
        ExtractionSegment(number, item.location, item.text, cells=item.cells)
        for number, item in enumerate(located, start=1)
    )

    reading = CatalogueTableReader().read(ExtractionRequest("Spec", segments, ()))

    assert [change.content.name for change in reading.changes] == ["Order Store"]
    assert {segments[number - 1].location for number in reading.read} == {"table 2, row 2"}


class _Recording(FakeCatalogueExtractor):
    def __init__(self, *, vision: bool = True) -> None:
        self.requests: list[ExtractionRequest] = []
        self.supports_images = vision

    def propose(self, request: ExtractionRequest) -> CatalogueProposal:
        self.requests.append(request)
        return super().propose(request)


def _setup(content: bytes, extractor: _Recording) -> tuple[ProposeCatalogueChanges, Any, Any]:
    repository = seeded_repository()
    manage = ManageArchitectureKnowledge(
        repository,
        CatalogueFileAdapter(),
        InMemoryEvidenceIndex(FakeEmbeddings(), FakeWordTokenizer()),
        10_000,
        OfflineDocumentScanner(),
    )
    storage = InMemoryDocumentStorage()
    documents = SafeDocumentTextExtractor()
    located = LocatedDocumentExtractor(documents)
    draft = manage.create_draft(MAINTAINER, "Next version")
    storage.put(DocumentVersionId("doc"), content)
    version = KnowledgeDocumentVersion("doc", "Spec", "spec.docx", DOCX, "sum", "doc", "amina", NOW)
    drafted = draft.updated(documents=(version,))
    repository.save(drafted, draft.revision, "amina", "upload_document")
    proposer = ProposeCatalogueChanges(
        manage,
        storage,
        located,
        documents,
        extractor,
        FakeSystemMatcher(),
        InMemoryCatalogueCandidates(),
        FixedClock(NOW),
    )
    return proposer, drafted, ReadKnowledgeDocument(manage, storage, located)


def test_every_passage_is_read_until_the_character_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Far more than the 1,200 passages a reading once stopped at.
    body = "".join(_p(f"Line {number} of the specification.") for number in range(1, 1501))
    extractor = _Recording()
    proposer, draft, _ = _setup(_docx(body), extractor)

    run = proposer.execute(draft.id, "doc", lambda: None)

    assert len(extractor.requests[-1].segments) == 1500
    assert not any("were read" in warning for warning in run.warnings)

    monkeypatch.setattr(catalogue_candidates, "MAX_READ_CHARACTERS", 100)
    run = proposer.execute(draft.id, "doc", lambda: None)

    segments = extractor.requests[-1].segments
    assert [item.location for item in segments] == ["paragraph 1", "paragraph 2", "paragraph 3"]
    read = sum(len(f"Line {number} of the specification.") for number in (1, 2, 3))
    total = sum(len(f"Line {number} of the specification.") for number in range(1, 1501))
    assert (
        f"Only the first {read} of {total:,} characters were read, up to paragraph 3."
        in run.warnings
    )


def test_a_word_documents_figures_are_read_by_a_vision_model_once_each() -> None:
    content = _docx(
        _p("Digital Journey", "Heading1")
        + _p("The journey is drawn below.")
        + _figure("rId1")
        + _figure("rId2")
        + _figure("rId3"),
        {"rId1": _png("navy"), "rId2": _png("olive"), "rId3": _png("navy")},
    )
    extractor = _Recording()
    proposer, draft, reader = _setup(content, extractor)

    run = proposer.execute(draft.id, "doc", lambda: None)

    figures = [item for item in extractor.requests[-1].segments if item.image_mime_type]
    # The third figure repeats the first and is read once.
    assert [(item.number, item.location) for item in figures] == [(3, "image 1"), (4, "image 2")]
    # Each figure arrives as the extractor re-encoded it, never as the document holds it.
    assert figures[0].image_mime_type == "image/jpeg"
    assert figures[0].image.startswith(b"\xff\xd8")
    assert figures[0].section == ("Digital Journey",)
    # The offline reader suggests nothing from a figure; only an uploaded image stands alone.
    assert run.candidate_count == 0

    passage = reader.passage(draft.id, "doc", "image 2", MAINTAINER)
    assert passage.passage.location == "image 2"
    assert (passage.before, passage.after) == ((), ())

    blind = _Recording(vision=False)
    proposer, draft, _ = _setup(content, blind)
    run = proposer.execute(draft.id, "doc", lambda: None)
    assert not any(item.image_mime_type for item in blind.requests[-1].segments)
    assert "3 figure(s) were not read: the configured model cannot read images." in run.warnings


def test_a_citation_of_a_table_cell_still_opens_its_row() -> None:
    content = _docx("<w:tbl>" + _row("System", "Change") + _row("CWOM", "New order") + "</w:tbl>")
    _, draft, reader = _setup(content, _Recording())

    passage = reader.passage(draft.id, "doc", "table 1, row 2, cell 1, paragraph 3", MAINTAINER)

    assert passage.passage.location == "table 1, row 2"
    assert passage.passage.text == "System: CWOM | Change: New order"
