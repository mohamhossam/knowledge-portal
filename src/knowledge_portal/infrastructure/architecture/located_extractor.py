"""Safe text extraction with page, paragraph, line, or row references."""

from __future__ import annotations

import io
import posixpath
import re
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree

from pypdf import PdfReader
from smb_kernel.documents.ports import DocumentExtractorPort

from knowledge_portal.application.ports.located_document_extractor import (
    EmbeddedPart,
    EmbeddedParts,
    LocatedText,
)
from knowledge_portal.domain.document.value_objects import EvidenceBlockKind
from knowledge_portal.infrastructure.architecture.markdown_passages import (
    markdown_passages,
)


class LocatedDocumentExtractor:
    def __init__(self, validator: DocumentExtractorPort) -> None:
        self._validator = validator

    def extract(self, mime_type: str, content: bytes) -> tuple[LocatedText, ...]:
        # Spreadsheet rows come straight from the validated extraction.
        if mime_type == _XLSX:
            return self._worksheet_rows(content)
        if mime_type in {"text/csv", "text/tab-separated-values"}:
            return tuple(
                LocatedText(block.label.lower(), block.text)
                for block in self._validator.extract_structured(mime_type, content).evidence_blocks
                if block.kind is EvidenceBlockKind.TABLE_ROW and block.text
            )
        if mime_type == _PPTX:
            return self._slides(content)
        self._validator.extract(mime_type, content)
        if mime_type in {"image/png", "image/jpeg"}:
            # Images carry no citable text; a vision model reads them for suggestions only.
            return ()
        if mime_type == "application/pdf":
            reader = PdfReader(io.BytesIO(content), strict=True)
            return tuple(
                LocatedText(f"page {number}", text.strip())
                for number, page in enumerate(reader.pages, 1)
                if (text := page.extract_text() or "").strip()
            )
        if mime_type == "text/markdown":
            # Passages follow its headings and tables (ADR-0090, as amended).
            return markdown_passages(content.decode("utf-8-sig"))
        if mime_type == "text/plain":
            lines = content.decode("utf-8-sig").splitlines()
            return tuple(
                LocatedText(
                    f"lines {start + 1}-{min(start + 40, len(lines))}",
                    "\n".join(lines[start : start + 40]).strip(),
                )
                for start in range(0, len(lines), 40)
                if "\n".join(lines[start : start + 40]).strip()
            )
        body, styles, _ = _word(content)
        if body is None:
            return ()
        segments: list[LocatedText] = []
        headings: list[str] = []
        # Table paragraphs are counted too, so "paragraph N" names the same
        # paragraph however the tables around it are read.
        paragraph_number = 0
        table_number = 0
        for element in body:
            if element.tag == f"{_W}p":
                paragraph_number += 1
                value = _text(element)
                if not value:
                    continue
                level = _heading_level(element, styles)
                location = f"paragraph {paragraph_number}"
                if level is None:
                    segments.append(LocatedText(location, value, tuple(headings)))
                    continue
                headings = [*headings[: level - 1], value]
                segments.append(LocatedText(location, value, tuple(headings[:-1]), heading=True))
            elif element.tag == f"{_W}tbl":
                table_number += 1
                rows: list[list[str]] = []
                for row in element.findall(f"{_W}tr"):
                    cells: list[str] = []
                    for cell in row.findall(f"{_W}tc"):
                        paragraphs = list(cell.iter(f"{_W}p"))
                        paragraph_number += len(paragraphs)
                        value = "\n".join(filter(None, map(_text, paragraphs)))
                        merged = cell.find(f"{_W}tcPr/{_W}vMerge")
                        above = rows[-1] if rows else []
                        if merged is not None and merged.get(f"{_W}val", "continue") != "restart":
                            # A cell merged down from the row above holds that row's value.
                            value = above[len(cells)] if len(cells) < len(above) else value
                        span = cell.find(f"{_W}tcPr/{_W}gridSpan")
                        width = int(span.get(f"{_W}val", "1")) if span is not None else 1
                        # A cell across several columns fills them all in the header, so
                        # every column is named, and only the first in a later row.
                        cells.extend([value] * width if not rows else [value] + [""] * (width - 1))
                    rows.append(cells)
                segments.extend(_table_rows(table_number, rows, tuple(headings)))
        return tuple(segments)

    def _slides(self, content: bytes) -> tuple[LocatedText, ...]:
        """One passage per slide: its text, table rows and speaker notes, in order."""
        slides: dict[str, list[str]] = {}
        for block in self._validator.extract_structured(_PPTX, content).evidence_blocks:
            # A chart or diagram is only a placeholder ("Graphic content unavailable").
            if not block.text or block.kind is EvidenceBlockKind.EXTERNAL_REFERENCE:
                continue
            slide = block.section_path[0] if block.section_path else block.label
            slides.setdefault(slide, []).append(block.text)
        return tuple(
            LocatedText(slide.casefold(), "\n".join(lines)) for slide, lines in slides.items()
        )

    def embedded(self, mime_type: str, content: bytes, max_bytes: int) -> EmbeddedParts:
        """A Word document's embedded Word, PowerPoint and Excel files, in document order.

        Each is an object in the body ("o:OLEObject") whose relationship names a part
        under word/embeddings/. Legacy OLE packages (".bin") are counted, not read. A
        part larger than ``max_bytes`` unpacked is left out and counted too; what a
        part holds is checked by the validator when it is read.
        """
        if mime_type != _DOCX:
            return EmbeddedParts()
        body, styles, targets = _word(content)
        if body is None:
            return EmbeddedParts()
        found: list[tuple[int, str, tuple[str, ...]]] = []
        headings: list[str] = []
        number = 0
        for element in body:
            if element.tag == f"{_W}p" and (level := _heading_level(element, styles)) is not None:
                if value := _text(element):
                    headings = [*headings[: level - 1], value]
            for item in element.iter(f"{_O}OLEObject"):
                number += 1
                target = targets.get(item.get(f"{_R}id") or "")
                found.append((number, target or "", tuple(headings)))
        parts: list[EmbeddedPart] = []
        others = 0
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            sizes = {info.filename: info.file_size for info in archive.infolist()}
            for number, target, under in found:
                kind = _EMBEDDED.get(PurePosixPath(target).suffix.casefold())
                if kind is None or not 0 < sizes.get(target, 0) <= max_bytes:
                    others += 1
                    continue
                parts.append(
                    EmbeddedPart(
                        number, PurePosixPath(target).name, kind, under, archive.read(target)
                    )
                )
        return EmbeddedParts(tuple(parts), others)

    def figure_headings(self, mime_type: str, content: bytes) -> dict[str, tuple[str, ...]]:
        """For a Word document the validator has accepted: each image's headings, by package path.

        The extractor's own figure labels name headings only by position, so the
        headings a figure sits under are read here, as `extract` reads them.
        """
        if mime_type != _DOCX:
            return {}
        body, styles, targets = _word(content)
        if body is None:
            return {}
        result: dict[str, tuple[str, ...]] = {}
        headings: list[str] = []
        for element in body:
            if element.tag == f"{_W}p" and (level := _heading_level(element, styles)) is not None:
                if value := _text(element):
                    headings = [*headings[: level - 1], value]
            for blip in element.iter(f"{_A}blip"):
                target = targets.get(blip.get(f"{_R}embed") or "")
                if target is not None:
                    result.setdefault(target, tuple(headings))
        return result

    def _worksheet_rows(self, content: bytes) -> tuple[LocatedText, ...]:
        """One passage per non-empty row, under its sheet's name.

        Hidden sheets are left out, as they are for requirement documents: nobody
        reviewing the workbook sees them.
        """
        segments: list[LocatedText] = []
        sheet_name = ""
        for block in self._validator.extract_structured(_XLSX, content).evidence_blocks:
            if not block.text or (block.section_path and block.section_path[0].startswith(_HIDDEN)):
                continue
            if block.kind is EvidenceBlockKind.HEADING:
                sheet_name = block.text
                location = f"sheet {block.label.removeprefix('Worksheet ')}"
                segments.append(LocatedText(location, sheet_name, heading=True))
            elif block.kind is EvidenceBlockKind.WORKSHEET_RANGE:
                row = _ROW.match(block.label)
                if row is None:  # A chart: its title and the ranges it plots.
                    segments.append(LocatedText(block.label.lower(), block.text))
                else:
                    segments.append(
                        LocatedText(
                            f"sheet {row['sheet']}, row {row['row']}", block.text, (sheet_name,)
                        )
                    )
        return tuple(segments)


def _word(
    content: bytes,
) -> tuple[ElementTree.Element | None, dict[str, int], dict[str, str]]:
    """A Word document's body, heading styles, and internal relationship targets by id."""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names = set(archive.namelist())
        root = ElementTree.fromstring(archive.read("word/document.xml"))
        styles = (
            _heading_styles(ElementTree.fromstring(archive.read("word/styles.xml")))
            if "word/styles.xml" in names
            else {}
        )
        relationships = (
            ElementTree.fromstring(archive.read(_RELATIONSHIPS))
            if _RELATIONSHIPS in names
            else None
        )
    targets: dict[str, str] = {}
    for item in relationships.iter(f"{_PR}Relationship") if relationships is not None else ():
        target = item.get("Target") or ""
        if item.get("Id") and target and item.get("TargetMode") != "External":
            # As the extractor names an image's package part, so the two can be matched.
            targets[item.get("Id", "")] = posixpath.normpath(posixpath.join("word", target)).lstrip(
                "/"
            )
    return root.find(f"{_W}body"), styles, targets


def _text(paragraph: ElementTree.Element) -> str:
    return "".join(node.text or "" for node in paragraph.iter(f"{_W}t")).strip()


def _table_rows(table: int, rows: list[list[str]], headings: tuple[str, ...]) -> list[LocatedText]:
    """One passage per Word table row, as a spreadsheet row is read.

    A cell per passage split one row across many passages, so neither a reader
    nor a quote saw the row whole, and a long specification ran to thousands of
    passages. A table of two or more columns and rows takes its first row as
    the header: each later row carries its (column, value) cells, every column
    included, and reads "Column: value | Column: value". The header row, and
    every row of a one-column table (a boxed note), read as their cells joined.
    """
    width = max((len(cells) for cells in rows), default=0)
    header = (
        [cell.replace("\n", " ") or f"Column {number}" for number, cell in enumerate(rows[0], 1)]
        if width > 1 and len(rows) > 1
        else None
    )
    passages: list[LocatedText] = []
    for row_number, values in enumerate(rows, 1):
        location = f"table {table}, row {row_number}"
        if header is None or row_number == 1:
            text = " | ".join(value for value in values if value)
            if text:
                passages.append(LocatedText(location, text, headings, block=location))
            continue
        cells = tuple(
            (
                header[number] if number < len(header) else f"Column {number + 1}",
                values[number] if number < len(values) else "",
            )
            for number in range(max(len(header), len(values)))
        )
        if any(value for _, value in cells):
            passages.append(
                LocatedText(
                    location,
                    " | ".join(f"{name}: {value}" for name, value in cells if value),
                    headings,
                    block=location,
                    cells=cells,
                )
            )
    return passages


_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
_EMBEDDED = {".docx": _DOCX, ".pptx": _PPTX, ".xlsx": _XLSX}
_O = "{urn:schemas-microsoft-com:office:office}"
_RELATIONSHIPS = "word/_rels/document.xml.rels"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_HIDDEN = "Hidden worksheet: "
_ROW = re.compile(r"^Worksheet (?P<sheet>\d+)!(?P<row>\d+):(?P=row)$")
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_HEADING_NAME = re.compile(r"^heading\s*([1-9])$")


def _level(value: str | None) -> int | None:
    """A Word outline level (0-8) as a heading depth (1-9); 9 means body text."""
    if value is None or not value.isdigit() or int(value) > 8:
        return None
    return int(value) + 1


def _heading_styles(styles: ElementTree.Element) -> dict[str, int]:
    """Heading depth per paragraph style id, from outline levels or heading names.

    Style ids are localised (for example "berschrift1"), so the outline level or
    the style's English name decides, not the id.
    """
    result: dict[str, int] = {}
    for style in styles.iter(f"{_W}style"):
        style_id = style.get(f"{_W}styleId")
        if not style_id or style.get(f"{_W}type") != "paragraph":
            continue
        outline = style.find(f"{_W}pPr/{_W}outlineLvl")
        name_node = style.find(f"{_W}name")
        name = (name_node.get(f"{_W}val") if name_node is not None else "") or ""
        match = _HEADING_NAME.match(name.strip().casefold())
        level = _level(outline.get(f"{_W}val") if outline is not None else None) or (
            1 if name.strip().casefold() == "title" else int(match.group(1)) if match else None
        )
        if level is not None:
            result[style_id] = level
    return result


def _heading_level(paragraph: ElementTree.Element, styles: dict[str, int]) -> int | None:
    outline = paragraph.find(f"{_W}pPr/{_W}outlineLvl")
    if outline is not None:
        return _level(outline.get(f"{_W}val"))
    style = paragraph.find(f"{_W}pPr/{_W}pStyle")
    style_id = style.get(f"{_W}val") if style is not None else None
    if not style_id:
        return None
    if style_id in styles:
        return styles[style_id]
    match = _HEADING_NAME.match(style_id.casefold())
    return 1 if style_id.casefold() == "title" else int(match.group(1)) if match else None
