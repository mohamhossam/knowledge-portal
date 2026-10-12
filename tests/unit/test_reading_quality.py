"""What a model reads is kept: one wrong item costs only itself, and a quote is cited where it is.

The reported reading: a long Word specification lost seven parts to "unusable"
answers (one item over a limit rejected the whole answer), six to "uncited" ones,
and 240 suggestions whose quotes a check too strict about typography refused.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import replace
from types import SimpleNamespace
from typing import Any

from openpyxl import Workbook
from smb_kernel.documents.text_extractor import SafeDocumentTextExtractor

from knowledge_portal.application.ports.catalogue_extractor import (
    CatalogueProposal,
    ExtractionRequest,
    ExtractionSegment,
    ProposedChange,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateContent,
    CandidateKind,
    apply_candidate,
)
from knowledge_portal.domain.architecture.knowledge import KnowledgeReleaseStatus
from knowledge_portal.domain.architecture.products import (
    OfferingPlan,
    OrderType,
    PlanCharacteristic,
    ProductOffering,
)
from knowledge_portal.infrastructure.architecture.knowledge_yaml import seed_knowledge
from knowledge_portal.infrastructure.architecture.located_extractor import (
    LocatedDocumentExtractor,
    _without_hidden_sheets,
)
from knowledge_portal.infrastructure.llm.catalogue_extraction import StructuredCatalogueExtractor
from tests.unit.test_document_reading_coverage import (
    MAINTAINER,
    _docx,
    _p,
    _Recording,
    _setup,
)

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _item(**values: Any) -> dict[str, Any]:
    """An answered item as the model writes it: JSON, not yet checked."""
    base: dict[str, Any] = {
        "kind": "system",
        "system": "Order Hub",
        "name": "Order Hub",
        "name_ar": None,
        "aliases": [],
        "triggers": [],
        "target_system": None,
        "component": None,
        "technology": None,
        "domain": None,
        "parent_domain": None,
        "offering": None,
        "journey": None,
        "text": None,
        "evidence_numbers": [1],
        "quote": "The Order Hub receives partner orders",
        "basis": "stated",
        "reasoning": None,
        "relationship_kind": None,
        "channel_kind": None,
    }
    return base | values


class _Answering:
    """A client that answers each call with raw items, as a transport parses them."""

    model = "answering"

    def __init__(self, *answers: list[Any]) -> None:
        self.answers = list(answers)

    def parse(self, **_: Any) -> Any:
        return SimpleNamespace(changes=self.answers.pop(0) if self.answers else [])


def _read(texts: list[str], *items: Any) -> Any:
    request = ExtractionRequest(
        "Reference",
        tuple(
            ExtractionSegment(number, f"paragraph {number}", text)
            for number, text in enumerate(texts, start=1)
        ),
        (),
    )
    extractor = StructuredCatalogueExtractor(_Answering(list(items)), supports_images=False)
    return extractor.propose(request)


def test_one_item_the_model_got_wrong_costs_only_itself() -> None:
    proposal = _read(
        ["The Order Hub receives partner orders. BCRM keeps the customer records."],
        # Eleven evidence numbers, and a key left out: both mended.
        _item(evidence_numbers=[1] * 11),
        {key: value for key, value in _item(name="BCRM", system="BCRM").items() if key != "aliases"}
        | {"quote": "BCRM keeps the customer records"},
        # Not a kind at all: left out, and counted.
        _item(kind="database"),
    )

    assert [change.content.name for change in proposal.changes] == ["Order Hub", "BCRM"]
    assert proposal.warnings == ("Incomplete suggestions were left out: 1 item.",)


def test_a_quote_with_other_typography_or_another_passage_is_cited_where_it_is() -> None:
    proposal = _read(
        [
            "Intro text.",
            "The “Order Hub” receives partner orders — every day.",
            "BCRM keeps the customer",
            "records for every account.",
        ],
        # Straight quotes and a hyphen for the document's curly quotes and dash, citing
        # the wrong passage: kept, and cited where the words are.
        _item(evidence_numbers=[1], quote='The "Order Hub" receives partner orders - every day'),
        # A sentence across two passages: cited at both.
        _item(
            name="BCRM",
            system="BCRM",
            evidence_numbers=[3, 4],
            quote="BCRM keeps the customer records",
        ),
    )

    hub, bcrm = proposal.changes
    assert hub.locations == ("paragraph 2",)
    assert hub.quote == 'The "Order Hub" receives partner orders - every day'
    assert bcrm.locations == ("paragraph 3", "paragraph 4")
    assert proposal.warnings == ()


def test_a_paraphrase_is_replaced_by_the_whole_sentence_even_after_an_initial() -> None:
    proposal = _read(
        ["Speed Booster add-ons are offered only for B. Pro+ bundles in the portal."],
        _item(quote="Speed Booster offered only for B. Pro+ bundles"),
    )

    assert proposal.changes[0].quote == (
        "Speed Booster add-ons are offered only for B. Pro+ bundles in the portal."
    )


def test_a_quote_no_passage_says_is_left_out_and_counted() -> None:
    proposal = _read(
        ["The Order Hub receives partner orders."],
        _item(),
        _item(name="Ghost", system="Ghost", quote="A ghost ledger reconciles money"),
    )

    assert [change.content.name for change in proposal.changes] == ["Order Hub"]
    assert proposal.warnings == (
        "1 suggestion(s) were left out: what they quote was not found in the document.",
    )


def _cell(text: str, merge: str | None = None, span: int = 1) -> str:
    properties = ""
    if merge is not None or span > 1:
        properties = "<w:tcPr>"
        properties += f'<w:gridSpan w:val="{span}"/>' if span > 1 else ""
        if merge is not None:
            properties += f'<w:vMerge w:val="{merge}"/>' if merge else "<w:vMerge/>"
        properties += "</w:tcPr>"
    paragraph = f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>" if text else "<w:p/>"
    return f"<w:tc>{properties}{paragraph}</w:tc>"


def test_a_word_cell_merged_down_or_across_keeps_its_value_and_columns() -> None:
    table = (
        "<w:tbl>"
        f"<w:tr>{_cell('Scenario')}{_cell('Details', span=2)}</w:tr>"
        f"<w:tr>{_cell('Faulty CPE', merge='restart')}{_cell('Replace')}{_cell('Same day')}</w:tr>"
        f"<w:tr>{_cell('', merge='')}{_cell('Return')}{_cell('Next day')}</w:tr>"
        "</w:tbl>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr(
            "word/document.xml",
            f'<w:document xmlns:w="{W}"><w:body>{table}</w:body></w:document>',
        )

    located = LocatedDocumentExtractor(SafeDocumentTextExtractor()).extract(DOCX, buffer.getvalue())

    assert [item.text for item in located] == [
        "Scenario | Details | Details",
        "Scenario: Faulty CPE | Details: Replace | Details: Same day",
        "Scenario: Faulty CPE | Details: Return | Details: Next day",
    ]


# Plans -------------------------------------------------------------------------------------


def test_an_offerings_tiers_are_read_as_its_plans() -> None:
    offering = {
        "plans": [
            {
                "name": "PO1",
                "characteristics": [
                    {"name": "Offer Description", "value": "Unlimited 100Mbps over GSM"},
                    {"name": "IN Offer ID", "value": "860"},
                    {"name": "in offer id", "value": "861"},
                ],
                "description": None,
            },
            {"name": "PO1", "characteristics": [], "description": "Again"},
            {"name": "PO2", "characteristics": [], "description": None},
        ]
    }
    proposal = _read(
        ["Business Pro Plus has a Backup GSM Bandwidth PO per speed."],
        _item(
            kind="product_offering",
            system="",
            name="Business Pro Plus",
            offering=offering,
            quote="Business Pro Plus has a Backup GSM Bandwidth PO per speed",
        ),
    )

    (change,) = proposal.changes
    product = change.content.product
    assert product is not None
    assert [plan.name for plan in product.plans] == ["PO1", "PO2"]
    assert [(fact.name, fact.value) for fact in product.plans[0].characteristics] == [
        ("Offer Description", "Unlimited 100Mbps over GSM"),
        ("IN Offer ID", "860"),
    ]


def test_an_accepted_reading_without_plans_keeps_the_offerings_plans() -> None:
    planned = ProductOffering(
        "bpp",
        "Business Pro Plus",
        plans=(OfferingPlan("PO1", (PlanCharacteristic("Speed", "100 Mbps"),)),),
    )
    release = replace(seed_knowledge(), status=KnowledgeReleaseStatus.DRAFT, products=(planned,))
    reading = CandidateContent(
        CandidateKind.PRODUCT,
        "bpp",
        name="Business Pro Plus",
        product=ProductOffering("bpp", "Business Pro Plus", proposition="For business."),
    )

    (offering,) = apply_candidate(reading, release).products

    assert offering.proposition == "For business."
    assert offering.plans == planned.plans


# Channels and journeys ---------------------------------------------------------------------


def _offering_reading(*channels: str) -> ProposedChange:
    product = ProductOffering(
        "bpp",
        "Business Pro Plus",
        order_types=(OrderType("NEW", "New Activation", channels=channels),),
    )
    return ProposedChange(
        CandidateContent(CandidateKind.PRODUCT, "bpp", name="Business Pro Plus", product=product),
        ("paragraph 2",),
        "Applicable Channels: BCRM, B2B, SMB App",
        source_name="Business Pro Plus",
    )


class _Scripted:
    supports_images = False
    model = "scripted"
    prompt_version = "scripted-v1"

    def __init__(self, *changes: ProposedChange) -> None:
        self.changes = changes

    def propose(self, request: ExtractionRequest) -> CatalogueProposal:
        return CatalogueProposal(self.changes, self.model, self.prompt_version)


def test_channels_an_offering_is_ordered_through_are_suggested_as_channels() -> None:
    content = _docx(_p("Ordering") + _p("The journey of an order is described in the annex."))
    proposer, draft, _ = _setup(content, _Recording())
    proposer._extractor = _Scripted(_offering_reading("BCRM", "Partner Shop", "bcrm"))

    run = proposer.execute(draft.id, "doc", lambda: None)

    channels = [
        item.content.channel
        for item in proposer._candidates.list(draft.id)
        if item.content.kind is CandidateKind.CHANNEL
    ]
    # Once each; a channel named like a system enters through it.
    assert [(item.name, item.entry_system_id) for item in channels if item] == [
        ("BCRM", "bcrm"),
        ("Partner Shop", None),
    ]
    assert (
        "The document mentions journeys, but none was read: a journey is read where the "
        "document sets out the activities of an order type in order."
    ) in run.warnings


# Embedded documents ------------------------------------------------------------------------

OFFICE = "urn:schemas-microsoft-com:office:office"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
TYPES = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships"


def _pptx(text: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", TYPES)
        archive.writestr(
            "ppt/presentation.xml",
            f'<p:presentation xmlns:p="{P}" xmlns:r="{R}"><p:sldIdLst>'
            '<p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
        )
        archive.writestr(
            "ppt/_rels/presentation.xml.rels",
            f'<Relationships xmlns="{RELATIONSHIPS}">'
            f'<Relationship Id="rId1" Type="{R}/slide" Target="slides/slide1.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "ppt/slides/slide1.xml",
            f'<p:sld xmlns:p="{P}" xmlns:a="{A}"><p:cSld><p:spTree><p:sp><p:txBody>'
            f"<a:p><a:r><a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>"
            "</p:sld>",
        )
    return buffer.getvalue()


def _with_embedded() -> bytes:
    def embedded(rel_id: str) -> str:
        return f'<w:p><w:r><w:object><o:OLEObject r:id="{rel_id}"/></w:object></w:r></w:p>'

    body = (
        _p("Annexure", "Heading1")
        + _p("Workflows", "Heading2")
        + embedded("rId1")
        + embedded("rId2")
        + embedded("rId3")
        + embedded("rId4")
        + embedded("rId5")
    )
    relationships = (
        f'<Relationship Id="rId1" Type="{R}/package" Target="embeddings/flow.pptx"/>'
        f'<Relationship Id="rId2" Type="{R}/oleObject" Target="embeddings/oleObject1.bin"/>'
        f'<Relationship Id="rId3" Type="{R}/package" Target="embeddings/spec.docx"/>'
        f'<Relationship Id="rId4" Type="{R}/package" Target="embeddings/flows.xlsx"/>'
        f'<Relationship Id="rId5" Type="{R}/package" Target="embeddings/flows2.xlsx"/>'
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", TYPES)
        archive.writestr(
            "word/document.xml",
            f'<w:document xmlns:w="{W}" xmlns:o="{OFFICE}" xmlns:r="{R}"><w:body>{body}</w:body>'
            "</w:document>",
        )
        archive.writestr(
            "word/_rels/document.xml.rels",
            f'<Relationships xmlns="{RELATIONSHIPS}">{relationships}</Relationships>',
        )
        archive.writestr("word/embeddings/flow.pptx", _pptx("Step 1: BCRM captures the order."))
        archive.writestr("word/embeddings/oleObject1.bin", b"legacy OLE package")
        archive.writestr(
            "word/embeddings/spec.docx", _docx(_p("CWOM orchestrates the fulfilment."))
        )
        # Two versions of one workflow book, the same word for word.
        archive.writestr("word/embeddings/flows.xlsx", _workbook())
        archive.writestr("word/embeddings/flows2.xlsx", _workbook())
    return buffer.getvalue()


def test_office_files_a_word_document_embeds_are_read_and_their_citations_open() -> None:
    extractor = _Recording()
    proposer, draft, reader = _setup(_with_embedded(), extractor)

    run = proposer.execute(draft.id, "doc", lambda: None)

    read = [
        (item.location, item.section, item.text)
        for item in extractor.requests[-1].segments
        if item.location.startswith("embedded")
    ]
    # Documents and decks first; the second workbook's sheet repeats the first's.
    assert [location for location, _, _ in read] == [
        "embedded 3, paragraph 1",
        "embedded 1, slide 1",
        "embedded 4, sheet 1",
        "embedded 4, sheet 1, row 1",
        "embedded 4, sheet 1, row 2",
    ]
    assert read[:2] == [
        (
            "embedded 3, paragraph 1",
            ("Annexure", "Workflows", "spec.docx"),
            "CWOM orchestrates the fulfilment.",
        ),
        (
            "embedded 1, slide 1",
            ("Annexure", "Workflows", "flow.pptx"),
            "Step 1: BCRM captures the order.",
        ),
    ]
    assert (
        "1 embedded sheet(s) were left out: an embedded workbook read before has the same "
        "sheet, word for word."
    ) in run.warnings
    assert (
        "1 embedded object(s) were not read: only Word, PowerPoint and Excel files are, each "
        "within the upload limits."
    ) in run.warnings

    passage = reader.passage(draft.id, "doc", "embedded 3, paragraph 1", MAINTAINER)
    assert passage.passage.text == "CWOM orchestrates the fulfilment."


def _workbook() -> bytes:
    book = Workbook()
    flows = book.active
    assert flows is not None
    flows.title = "Provisioning WF"
    flows.append(["Step", "System"])
    flows.append(["1", "BCRM captures the order"])
    filler = book.create_sheet("Sheet1")
    filler.sheet_state = "hidden"
    for row in range(1, 50):
        filler.cell(row, 7, "filler")
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def _sheets(content: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        return sorted(name for name in archive.namelist() if name.startswith("xl/worksheets/"))


def test_an_embedded_workbook_is_read_without_its_hidden_sheets() -> None:
    """Each embedded workflow book hid a sheet filled to row 1,048,576 that refused the book."""
    slim = _without_hidden_sheets(_workbook())

    assert _sheets(slim) == ["xl/worksheets/sheet1.xml"]
    located = LocatedDocumentExtractor(SafeDocumentTextExtractor()).extract(XLSX, slim)
    assert [item.text for item in located if item.heading] == ["Provisioning WF"]
    assert any("BCRM captures the order" in item.text for item in located)
    assert _without_hidden_sheets(b"not a workbook") == b"not a workbook"


def test_a_dependency_the_model_gave_no_words_for_is_said_by_its_kind() -> None:
    """The reported reading left out 104 stated dependencies whose description was null."""
    proposal = _read(
        ["SMB App calls CRMGW APIs. B2B uses TIBCO."],
        _item(
            kind="relationship",
            system="SMB App",
            name=None,
            target_system="CRMGW",
            relationship_kind="calls_api",
            quote="SMB App calls CRMGW APIs",
        ),
        _item(
            kind="relationship",
            system="B2B",
            name=None,
            target_system="TIBCO",
            quote="B2B uses TIBCO",
        ),
        # No target: never a dependency on a system called "item".
        _item(kind="relationship", system="B2B", name=None, quote="B2B uses TIBCO"),
    )

    assert [change.content.text for change in proposal.changes] == [
        "Calls the API of CRMGW",
        "Depends on TIBCO",
    ]
    assert proposal.warnings == ("Incomplete suggestions were left out: 1 relationship.",)
