"""Section-v4 chunking (ADR section-v4): what the Word reader recovers, and how a document is cut
into parents that are read and children that are searched."""

from __future__ import annotations

from datetime import UTC, datetime
from xml.sax.saxutils import escape

import pytest
from smb_kernel.documents.scanner import OfflineDocumentScanner
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor

from knowledge_portal.application.ports.architecture_rag import (
    ChunkRole,
    EntityRole,
    IndexVersion,
    LinkedEntity,
)
from knowledge_portal.application.ports.identity import Actor
from knowledge_portal.application.ports.located_document_extractor import LocatedText
from knowledge_portal.application.ports.requirement_assessment import (
    LinkedFacet,
    SystemCandidate,
)
from knowledge_portal.application.use_cases.architecture_documents import (
    ReadKnowledgeDocument,
    UploadKnowledgeDocument,
)
from knowledge_portal.application.use_cases.architecture_evidence import readable
from knowledge_portal.application.use_cases.architecture_index import BuildArchitectureIndex
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.assessment_lanes import passage_lane
from knowledge_portal.application.use_cases.section_chunking import (
    CHILD_MAX,
    PARENT_MAX,
    ParentPlan,
    first_location,
    plan_document,
    record_windows,
    sentence_groups,
    sentences,
)
from knowledge_portal.domain.architecture.assessment import FacetKind, SystemRole
from knowledge_portal.infrastructure.architecture.catalogue_files import CatalogueFileAdapter
from knowledge_portal.infrastructure.architecture.embeddings import FakeEmbeddings
from knowledge_portal.infrastructure.architecture.evidence_index import (
    InMemoryEvidenceIndex,
)
from knowledge_portal.infrastructure.architecture.evidence_index import (
    readable as readable_profile,
)
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
)
from knowledge_portal.infrastructure.architecture.passage_reranking import (
    LexicalPassageReranker,
)
from knowledge_portal.infrastructure.architecture.tokenizer import ApproximateTokenizer
from knowledge_portal.infrastructure.config.options import ConfigurationError
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.persistence.document_storage import InMemoryDocumentStorage
from knowledge_portal.infrastructure.persistence.in_memory_architecture_knowledge import (
    InMemoryArchitectureKnowledgeRepository,
)
from tests.pdf_fixtures import pdf_document
from tests.presentation_fixtures import drawing_paragraph, drawing_table, presentation, table_cell
from tests.spreadsheet_fixtures import spreadsheet_document
from tests.word_table_fixtures import DOCX_MIME, W, word_document

TOKENS = ApproximateTokenizer()
MAINTAINER = Actor("maintainer", frozenset({"knowledge_maintainer"}))


def count(text: str) -> int:
    return len(TOKENS.spans(text))


STYLES = f"""<w:styles xmlns:w="{W}">
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
  <w:pPr><w:numPr><w:numId w:val="1"/><w:ilvl w:val="0"/></w:numPr>
  <w:outlineLvl w:val="0"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
  <w:basedOn w:val="Heading1"/>
  <w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr><w:outlineLvl w:val="1"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/></w:style>
</w:styles>"""

NUMBERING = f"""<w:numbering xmlns:w="{W}">
<w:abstractNum w:abstractNumId="0">
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>
    <w:lvlText w:val="%1"/></w:lvl>
  <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/>
    <w:lvlText w:val="%1.%2"/></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="1">
  <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/></w:lvl>
  <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/>
    <w:lvlText w:val="%2)"/></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>"""


def paragraph(text: str, style: str | None = None, number: tuple[int, int] | None = None) -> str:
    properties = (f'<w:pStyle w:val="{style}"/>' if style else "") + (
        f'<w:numPr><w:ilvl w:val="{number[1]}"/><w:numId w:val="{number[0]}"/></w:numPr>'
        if number
        else ""
    )
    return f"<w:p><w:pPr>{properties}</w:pPr><w:r><w:t>{escape(text)}</w:t></w:r></w:p>"


def control(body: str, gallery: str) -> str:
    return (
        "<w:sdt><w:sdtPr><w:docPartObj>"
        f'<w:docPartGallery w:val="{gallery}"/></w:docPartObj></w:sdtPr>'
        f"<w:sdtContent>{body}</w:sdtContent></w:sdt>"
    )


def cell(text: str, span: int = 1) -> str:
    grid = f'<w:gridSpan w:val="{span}"/>' if span > 1 else ""
    return f"<w:tc><w:tcPr>{grid}</w:tcPr>{paragraph(text)}</w:tc>"


def table(*rows: list[str] | str) -> str:
    out = []
    for row in rows:
        cells = cell(row, 3) if isinstance(row, str) else "".join(cell(item) for item in row)
        out.append(f"<w:tr>{cells}</w:tr>")
    grid = '<w:gridCol w:w="1000"/>' * 3
    return f"<w:tbl><w:tblGrid>{grid}</w:tblGrid>{''.join(out)}</w:tbl>"


SENTENCE = (
    "The technician confirms the customer's identity and checks the fibre termination point "
    "before splicing the drop cable at the installation address."
)
LONG = " ".join(f"Step {number}. {SENTENCE}" for number in range(1, 15))
REPEATED = (
    "Orders are captured in B2B Web and validated by CWOM before activation, and every "
    "service order is decomposed by RTF before CWOM hands the access line to the network."
)
TOC = control(paragraph("1 Scope ........ 3"), "Table of Contents")
COVER = control(paragraph("Prepared by the architecture team"), "Cover Pages")


def sample() -> bytes:
    body = (
        paragraph("Business Pro Plus Solution Design", "Title")
        + COVER
        + TOC
        + paragraph("Scope", "Heading1")
        + paragraph(
            "This design covers how a Business Pro Plus order moves from capture to activation "
            "across the stack, for new activations and for up or downgrades."
        )
        + paragraph("Order capture", "Heading2")
        + paragraph("Orders are captured in B2B Web.")
        + paragraph("Sales agents capture the same order in CBCM on behalf of the customer.")
        + paragraph("The order carries:")
        + paragraph("the bandwidth", number=(2, 0))
        + paragraph("the router model", number=(2, 0))
        + paragraph("Integrations", "Heading2")
        + paragraph("Interfaces between the order systems", "Caption")
        + table(
            ["Interface", "Provider", "Consumer"],
            ["createCustomerOrder", "RTF", "CWOM"],
            ["CPE Model Inquiry", "ECM", "CWOM"],
            "Billing is raised once per completed customer order.",
        )
        + paragraph("Field installation", "Heading1")
        + paragraph(LONG)
        + paragraph("Repeated", "Heading1")
        + paragraph(REPEATED)
        + paragraph(
            "A different paragraph sits between the two copies of the same text: it explains "
            "that the access line is reserved in the network inventory before the technician "
            "visit is booked, so the visit never waits on a port."
        )
        + paragraph(REPEATED)
    )
    return word_document(
        body, {"word/styles.xml": STYLES.encode(), "word/numbering.xml": NUMBERING.encode()}
    )


def passages() -> tuple[LocatedText, ...]:
    return LocatedDocumentExtractor(SafeDocumentTextExtractor()).extract(DOCX_MIME, sample())


def test_word_reader_keeps_controls_numbers_title_and_caption_without_moving_paragraphs() -> None:
    found = {item.location: item for item in passages()}
    # A cover-page control is read under its own address; a table of contents is not read.
    assert found["control 1, paragraph 1"].text == "Prepared by the architecture team"
    assert not any("........" in item.text for item in found.values())
    # Paragraph numbers are those of the body alone, as before controls were read.
    assert found["paragraph 1"].title and found["paragraph 1"].heading
    assert found["paragraph 2"].text == "Scope" and found["paragraph 2"].label == "1"
    assert found["paragraph 4"].label == "1.1"
    assert (found["paragraph 8"].label, found["paragraph 8"].list_level) == ("•", 0)
    assert found["paragraph 11"].caption
    # Numbering is said beside the text, never in it, so section-v3 chunks keep their text.
    assert found["paragraph 2"].text == "Scope"


def test_every_child_is_an_exact_slice_of_its_parent_and_within_bounds() -> None:
    plan = plan_document(passages(), count)
    assert plan
    for parent in plan:
        assert count(parent.body) <= PARENT_MAX
        for child in parent.children:
            assert child.text in parent.body
            assert child.text.strip()
            single = len(sentence_groups(child.text, count, 10_000, 10_000, 0)) == 1
            assert count(child.text) <= CHILD_MAX or single


def test_title_is_text_headings_are_numbered_and_small_paragraphs_join() -> None:
    plan = plan_document(passages(), count)
    first = plan[0]
    assert first.headings == ()
    assert "Business Pro Plus Solution Design" in first.body
    capture = next(item for item in plan if item.headings == ("1 Scope", "1.1 Order capture"))
    # Four short paragraphs, the list items drawn with their bullets, read as one child.
    assert len(capture.children) == 1
    assert capture.children[0].location == "paragraphs 5–9"
    assert "• the bandwidth" in capture.children[0].text


def test_a_table_is_one_parent_with_its_caption_columns_rows_and_note() -> None:
    plan = plan_document(passages(), count)
    parent = next(item for item in plan if item.location == "table 1")
    assert parent.headings == ("1 Scope", "1.2 Integrations")
    lines = parent.body.split("\n")
    assert lines[0] == "Interfaces between the order systems"
    assert lines[1] == "Columns: Interface | Provider | Consumer"
    assert lines[-1] == "Note: Billing is raised once per completed customer order."
    rows = [child for child in parent.children if child.location.startswith("table 1, row")]
    # The header row is not a child; each data row is, with the caption as context.
    assert [child.location for child in rows] == [
        "table 1, row 2",
        "table 1, row 3",
        "table 1, row 4",
    ]
    assert rows[0].text == "Interface: createCustomerOrder | Provider: RTF | Consumer: CWOM"
    assert rows[0].context == "Table: Interfaces between the order systems"
    # The caption is the table's, not a paragraph of the section before it.
    assert not any("Interfaces between" in item.body for item in plan if item is not parent)


def test_a_long_paragraph_splits_at_sentences_that_overlap_by_one() -> None:
    plan = plan_document(passages(), count)
    install = [item for item in plan if item.headings == ("2 Field installation",)]
    children = [child for parent in install for child in parent.children]
    assert len(children) > 1
    assert all(", sentences " in child.location for child in children)
    for before, after in zip(children, children[1:], strict=False):
        start, end = sentences(before.text)[-1]
        assert after.text.startswith(before.text[start:end])


def test_repeated_text_is_indexed_once_with_an_alias() -> None:
    plan = plan_document(passages(), count)
    repeated = next(item for item in plan if item.headings == ("3 Repeated",))
    copies = [child for child in repeated.children if child.text == REPEATED]
    assert len(copies) == 1
    assert copies[0].aliases == ("paragraph 27",)


def test_record_windows_keep_whole_lines_and_locations() -> None:
    content = "\n".join(f"{number}. {SENTENCE}" for number in range(1, 60))
    windows = record_windows(content, "journey bpp-new", count)
    assert len(windows) > 1
    assert windows[0][0].startswith("journey bpp-new, lines 1–")
    assert all(line in content.split("\n") for _, text in windows for line in text.split("\n"))
    assert record_windows("Short", "system rtf", count) == (("system rtf", "Short"),)


@pytest.mark.parametrize(
    ("location", "first"),
    [
        ("paragraphs 5–9", "paragraph 5"),
        ("paragraph 46, sentences 4–6", "paragraph 46"),
        ("table 2", "table 2, row 1"),
        ("control 1, table 1", "control 1, table 1, row 1"),
        ("sheet 3, rows 4–9", "sheet 3, row 4"),
        ("table 2, row 1 – paragraph 44", "table 2, row 1"),
    ],
)
def test_first_location_names_the_first_passage(location: str, first: str) -> None:
    assert first_location(location) == first


def test_any_index_version_reads_any_other_with_the_same_model() -> None:
    current = "fake:offline-word-v1:section-v3"
    assert readable_profile("fake:offline-word-v1:section-v4", current)
    assert readable_profile("fake:offline-word-v1:section-v2", current)
    assert not readable_profile("other:offline-word-v1:section-v4", current)


Published = tuple[
    InMemoryEvidenceIndex, ManageArchitectureKnowledge, str, str, InMemoryDocumentStorage
]


def _published_v4() -> Published:
    repository = InMemoryArchitectureKnowledgeRepository(seed_knowledge())
    index = InMemoryEvidenceIndex(FakeEmbeddings(), TOKENS, IndexVersion.SECTION_V4)
    manage = ManageArchitectureKnowledge(repository, CatalogueFileAdapter(), index, 10_000_000)
    storage = InMemoryDocumentStorage()
    draft = manage.create_draft(MAINTAINER, "With a design")
    draft = UploadKnowledgeDocument(
        manage,
        repository,
        storage,
        SafeDocumentTextExtractor(),
        10_000_000,
        OfflineDocumentScanner(),
    ).execute(
        draft.id,
        draft.revision,
        "BPP design",
        "design.docx",
        DOCX_MIME,
        "en",
        sample(),
        MAINTAINER,
        datetime.now(UTC),
    )
    document_id = draft.documents[-1].id
    built = BuildArchitectureIndex(
        manage,
        index,
        storage,
        LocatedDocumentExtractor(SafeDocumentTextExtractor()),
        TOKENS,
    ).execute(draft.id, draft.revision, MAINTAINER.id, fence=lambda: None)
    release = manage.publish(built.id, built.revision, MAINTAINER, datetime.now(UTC), "Reviewed")
    assert release.index_profile is not None and release.index_profile.endswith(":section-v4")
    assert release.index_id is not None
    return index, manage, release.index_id, document_id, storage


def test_a_v4_index_searches_children_and_reads_their_parents() -> None:
    index, _, index_id, document_id, _ = _published_v4()
    found = index.retrieve(index_id, "CPE Model Inquiry ECM CWOM", 20)
    assert found and all(item.role is not ChunkRole.PARENT for item in found)
    child = next(item for item in found if item.role is ChunkRole.CHILD)
    # A child is embedded under a compact header: the document, then its nearest heading.
    assert child.text.startswith("BPP design › 1.2 Integrations\n")
    read = readable(index, index_id, found)
    parent = next(item for item in read if item.document_version_id == document_id)
    assert parent.role is ChunkRole.PARENT
    assert parent.focus is not None
    assert parent.text.startswith("BPP design / ")
    # Each parent is read once, however many of its children matched.
    assert len({item.id for item in read}) == len(read)


def test_v4_passages_are_linked_to_the_systems_they_name() -> None:
    index, manage, index_id, _, _ = _published_v4()
    found = index.retrieve(index_id, "Orders are captured in B2B Web", 20)
    child = next(item for item in found if item.role is ChunkRole.CHILD and "B2B Web" in item.text)
    entities, _ = index.links(index_id, (child.id,))
    assert any(
        link.role is EntityRole.MENTIONS
        and link.entity is LinkedEntity.SYSTEM
        and link.entity_id == "b2b-web"
        for link in entities
    )
    release = manage.active()
    parent = index.get(index_id, child.parent_id or "")
    assert parent is not None
    assert any(
        link.entity_id == "b2b-web" for link in manage.named_in(release.id, parent.id, MAINTAINER)
    )


def test_the_passage_lane_keeps_parents_and_caps_by_section_not_document() -> None:
    index, _, index_id, document_id, _ = _published_v4()
    facets = (
        LinkedFacet(FacetKind.NEED, "orders captured in B2B Web validated by CWOM", "q"),
        LinkedFacet(FacetKind.NEED, "technician splices the drop cable fibre", "q"),
    )
    candidates = (SystemCandidate("b2b-web", "B2B Web", SystemRole.CHANNEL),)
    evidence = passage_lane(index, LexicalPassageReranker(), index_id, facets, candidates)
    passages = [item for item in evidence if item.document_version_id == document_id]
    assert passages
    assert all(item.role is ChunkRole.PARENT for item in passages)
    # More than two sections of one document can be kept: the cap is per section now.
    assert len({item.id for item in passages}) == len(passages)


def test_the_document_reader_opens_a_v4_location_at_its_first_passage() -> None:
    _, manage, _, document_id, storage = _published_v4()
    release = manage.active()
    reader = ReadKnowledgeDocument(
        manage, storage, LocatedDocumentExtractor(SafeDocumentTextExtractor())
    )
    for cited, opened in (
        ("paragraphs 5–9", "paragraph 5"),
        ("table 1", "table 1, row 1"),
        ("paragraph 23, sentences 4–6", "paragraph 23"),
    ):
        found = reader.passage(release.id, document_id, cited, MAINTAINER)
        assert found.passage.location == opened


def test_the_index_version_is_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.delenv("ARCHITECTURE_INDEX_VERSION", raising=False)
    assert Settings.from_env().architecture_index_version is IndexVersion.SECTION_V3
    monkeypatch.setenv("ARCHITECTURE_INDEX_VERSION", "section-v4")
    assert Settings.from_env().architecture_index_version is IndexVersion.SECTION_V4
    monkeypatch.setenv("ARCHITECTURE_INDEX_VERSION", "section-v9")
    with pytest.raises(ConfigurationError, match="ARCHITECTURE_INDEX_VERSION"):
        Settings.from_env()


ARABIC = "يرسل النظام الطلب إلى CWOM. ثم ينتظر الرد؟ نعم، يتم ذلك تلقائيًا. Then CWOM replies."


def test_arabic_sentences_end_without_capitals() -> None:
    assert [ARABIC[a:b] for a, b in sentences(ARABIC)] == [
        "يرسل النظام الطلب إلى CWOM.",
        "ثم ينتظر الرد؟",
        "نعم، يتم ذلك تلقائيًا.",
        "Then CWOM replies.",
    ]


PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _bounded(plan: tuple[ParentPlan, ...]) -> None:
    assert plan
    for parent in plan:
        assert count(parent.body) <= PARENT_MAX
        for child in parent.children:
            assert child.text in parent.body and child.text.strip()


def test_section_v4_reads_a_pdf_page_by_page_within_bounds() -> None:
    content = pdf_document(
        ["1 Scope", "CWOM orchestrates the order. RTF captures it for the channel."],
        ["2 Billing", "BSCS rates the order. It bills every month."],
    )
    found = LocatedDocumentExtractor(SafeDocumentTextExtractor()).extract(
        "application/pdf", content
    )
    assert [item.location for item in found] == ["page 1", "page 2"]
    plan = plan_document(found, count)
    _bounded(plan)
    # A page carries no headings to read: small pages pack into one parent.
    assert [parent.location for parent in plan] == ["pages 1–2"]


def test_section_v4_keeps_each_slide_a_section_of_its_own() -> None:
    rows = (
        (table_cell("System"), table_cell("Role")),
        (table_cell("CWOM"), table_cell("Orchestrates")),
    )
    content = presentation(
        "<p:sp><p:txBody>"
        + drawing_paragraph("Order flow")
        + drawing_paragraph("CWOM orchestrates the order.")
        + "</p:txBody></p:sp>",
        drawing_table(*rows),
    )
    plan = plan_document(
        LocatedDocumentExtractor(SafeDocumentTextExtractor()).extract(PPTX, content), count
    )
    _bounded(plan)
    assert [parent.location for parent in plan] == ["slide 1", "slide 2"]


def test_section_v4_reads_a_sheet_s_rows_as_one_parent() -> None:
    content = spreadsheet_document(
        {
            "A1": "System",
            "B1": "Role",
            "A2": "CWOM",
            "B2": "Orchestrates",
            "A3": "BSCS",
            "B3": "Bills",
        }
    )
    plan = plan_document(
        LocatedDocumentExtractor(SafeDocumentTextExtractor()).extract(XLSX, content), count
    )
    _bounded(plan)
    assert [parent.location for parent in plan] == ["sheet 1, rows 1–3"]
