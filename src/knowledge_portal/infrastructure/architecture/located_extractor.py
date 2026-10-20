"""Safe text extraction with page, paragraph, line, or row references."""

from __future__ import annotations

import io
import posixpath
import re
import zipfile
from collections.abc import Iterable
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
        return _word_passages(body, styles, _numbering(content), _paragraph_roles(content))

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
                part = archive.read(target)
                if kind == _XLSX:
                    part = _without_hidden_sheets(part)
                parts.append(EmbeddedPart(number, PurePosixPath(target).name, kind, under, part))
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
        rows: list[tuple[str, int, dict[str, str]]] = []

        def flush() -> None:
            segments.extend(_sheet_rows(sheet_name, rows))
            rows.clear()

        for block in self._validator.extract_structured(_XLSX, content).evidence_blocks:
            if not block.text or (block.section_path and block.section_path[0].startswith(_HIDDEN)):
                continue
            if block.kind is EvidenceBlockKind.HEADING:
                flush()
                sheet_name = block.text
                location = f"sheet {block.label.removeprefix('Worksheet ')}"
                segments.append(LocatedText(location, sheet_name, heading=True))
            elif block.kind is EvidenceBlockKind.WORKSHEET_RANGE:
                row = _ROW.match(block.label)
                if row is None:  # A chart: its title and the ranges it plots.
                    segments.append(LocatedText(block.label.lower(), block.text))
                else:
                    rows.append((row["sheet"], int(row["row"]), _cells(block.text)))
        flush()
        return tuple(segments)


def _cells(text: str) -> dict[str, str]:
    """A worksheet row's values by column letter, merged cells holding their anchor's value.

    The extractor writes a row "A3=1 | B3=CPE platform Selection", a merged range's
    first cell "A2=1 [merged A2:A7 anchor]" and its others "A3=[merged A2:A7
    continuation; anchor A2]"; a continuation is given the anchor's value later, by
    ``_sheet_rows``, which has seen the anchor's row.
    """
    values: dict[str, str] = {}
    for part in _CELL_SPLIT.split(text):
        match = _CELL.match(part)
        if match is None:
            continue
        value = match["value"]
        if continued := _CONTINUATION.fullmatch(value.strip()):
            value = f"\0{continued['anchor']}"
        else:
            value = _ANCHOR.sub("", value).strip()
        values[match["column"]] = value
    return values


def _header_like(values: dict[str, str]) -> bool:
    """A row naming columns: three or more short labels, none a number or a date."""
    labels = [value for value in values.values() if value and not value.startswith("\0")]
    return len(labels) >= 3 and all(
        len(label) <= _MAX_LABEL and "\n" not in label and not _NUMBER_LIKE.match(label)
        for label in labels
    )


def _sheet_rows(sheet: str, rows: list[tuple[str, int, dict[str, str]]]) -> list[LocatedText]:
    """A sheet's rows as passages, under their column names where the sheet has a header row.

    A header row is three or more short labels ("Seq. | Description | System")
    that starts a table: first in the sheet, after a blank row or after a title.
    A row of one or two values just above a header is that table's title ("WF-1 |
    Order fulfillment"), and the tables below sit under it until the next title. A row
    under a header reads "Seq.: 1 | System: OM" and carries its (column, value)
    cells, every header column included, as a Word or Markdown table row does, so
    the table reader can read it. A sheet with no header row reads as the
    extractor wrote it.
    """
    passages: list[LocatedText] = []
    seen: dict[str, str] = {}
    header: dict[str, str] | None = None
    title: str | None = None
    previous: int | None = None
    for index, (number, row, values) in enumerate(rows):
        for column, value in list(values.items()):
            if value.startswith("\0"):
                # Merged down, a cell holds the value above; merged across, it is said once.
                anchor = value[1:]
                same_row = anchor.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ") == str(row)
                values[column] = "" if same_row else seen.get(anchor, "")
            seen[f"{column}{row}"] = values[column]
        filled = {column: value for column, value in values.items() if value}
        location = f"sheet {number}, row {row}"
        gap = previous is None or row > previous + 1
        previous = row
        following = rows[index + 1][2] if index + 1 < len(rows) else {}
        if gap:
            # A blank row ends a header; the title stands until the next one, so a table
            # broken by a blank row and its header repeated stays under its title.
            header = None
        heads_a_table = _header_like(following) and len(filled) <= max(
            2, sum(1 for value in following.values() if value) // 2
        )
        # A workflow book also starts a table under the header above it with a coded title
        # row ("WF-3 | Migration of Legacy product ... | Oder Type : Migrate").
        coded = len(filled) <= _MAX_TITLE_CELLS and bool(
            _CODED_TITLE.match(next(iter(filled.values()), ""))
        )
        if heads_a_table or coded:
            title = " ".join(" ".join(filled.values()).split())[:_MAX_TITLE].rstrip()
            if heads_a_table:
                header = None
            passages.append(LocatedText(location, title, (sheet,), heading=True))
            continue
        if _header_like(filled) and header is None:
            header = {column: " ".join(value.split()) for column, value in filled.items()}
            text = " | ".join(header.values())
            passages.append(LocatedText(location, text, _under(sheet, title), block=location))
            continue
        if header is None:
            text = " | ".join(f"{column}{row}={value}" for column, value in filled.items())
            passages.append(LocatedText(location, text, (sheet,)))
            continue
        columns = [*header, *(column for column in values if column not in header)]
        cells = tuple(
            (header.get(column, f"Column {column}"), values.get(column, "")) for column in columns
        )
        text = " | ".join(f"{name}: {value}" for name, value in cells if value)
        if text:
            passages.append(
                LocatedText(location, text, _under(sheet, title), block=location, cells=cells)
            )
    return passages


def _under(sheet: str, title: str | None) -> tuple[str, ...]:
    return (sheet, title) if title else (sheet,)


class _Counters:
    """Paragraphs and tables counted in one scope: the body, or one content control."""

    def __init__(self) -> None:
        self.paragraphs = 0
        self.tables = 0


def _word_passages(
    body: ElementTree.Element, styles: dict[str, int], numbering: _Numbering, roles: _Roles
) -> tuple[LocatedText, ...]:
    """A Word body's passages: paragraphs, table rows, and what content controls hold.

    Text inside a content control (``w:sdt``), such as a cover page or a form field, is
    read as "control N, paragraph M", so the paragraphs around it keep their numbers. A
    table of contents is a control too, and is left out: it repeats the headings.
    """
    segments: list[LocatedText] = []
    headings: list[str] = []
    controls = 0

    def walk(elements: Iterable[ElementTree.Element], prefix: str, count: _Counters) -> None:
        nonlocal headings, controls
        for element in elements:
            if element.tag == f"{_W}p":
                count.paragraphs += 1
                # Numbering advances on every numbered paragraph, empty or not, as Word counts.
                label, depth = numbering.label(element, roles)
                value = _text(element)
                if not value:
                    continue
                level = _heading_level(element, styles)
                style = _style_id(element)
                location = f"{prefix}paragraph {count.paragraphs}"
                # A style named so in styles.xml, or one whose id says it when there is none.
                title = style in roles.titles or (style or "").casefold() == "title"
                caption = style in roles.captions or (style or "").casefold() == "caption"
                if level is None:
                    segments.append(
                        LocatedText(
                            location,
                            value,
                            tuple(headings),
                            title=title,
                            caption=caption,
                            label=label,
                            list_level=depth,
                        )
                    )
                    continue
                headings = [*headings[: level - 1], value]
                segments.append(
                    LocatedText(
                        location,
                        value,
                        tuple(headings[:-1]),
                        heading=True,
                        title=title,
                        caption=caption,
                        label=label,
                    )
                )
            elif element.tag == f"{_W}tbl":
                count.tables += 1
                rows: list[list[str]] = []
                for row in element.findall(f"{_W}tr"):
                    cells: list[str] = []
                    for cell in row.findall(f"{_W}tc"):
                        paragraphs = list(cell.iter(f"{_W}p"))
                        count.paragraphs += len(paragraphs)
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
                segments.extend(_table_rows(count.tables, rows, tuple(headings), prefix))
            elif element.tag == f"{_W}sdt":
                if _table_of_contents(element):
                    continue
                inner = element.find(f"{_W}sdtContent")
                if inner is not None:
                    controls += 1
                    walk(inner, f"control {controls}, ", _Counters())

    # Paragraphs and tables are counted in the body's own order (``paragraph N`` names the
    # same paragraph however the tables around it are read); controls count their own.
    walk(body, "", _Counters())
    return tuple(segments)


def _table_of_contents(control: ElementTree.Element) -> bool:
    gallery = control.find(f"{_W}sdtPr/{_W}docPartObj/{_W}docPartGallery")
    value = (gallery.get(f"{_W}val") or "") if gallery is not None else ""
    return "contents" in value.casefold()


def _style_id(paragraph: ElementTree.Element) -> str | None:
    style = paragraph.find(f"{_W}pPr/{_W}pStyle")
    return style.get(f"{_W}val") if style is not None else None


class _Roles:
    """Paragraph styles by role, and the numbering each style carries."""

    def __init__(self) -> None:
        self.titles: set[str | None] = set()
        self.captions: set[str | None] = set()
        # Style id -> (numbering id, level), following "based on" to the style that says.
        self.numbered: dict[str, tuple[str, int]] = {}


def _paragraph_roles(content: bytes) -> _Roles:
    roles = _Roles()
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if "word/styles.xml" not in set(archive.namelist()):
            return roles
        styles = ElementTree.fromstring(archive.read("word/styles.xml"))
    based: dict[str, str] = {}
    own: dict[str, tuple[str | None, int | None]] = {}
    for style in styles.iter(f"{_W}style"):
        style_id = style.get(f"{_W}styleId")
        if not style_id or style.get(f"{_W}type") != "paragraph":
            continue
        name_node = style.find(f"{_W}name")
        name = ((name_node.get(f"{_W}val") if name_node is not None else "") or "").strip()
        if name.casefold() == "title" or style_id.casefold() == "title":
            roles.titles.add(style_id)
        if name.casefold() == "caption" or style_id.casefold() == "caption":
            roles.captions.add(style_id)
        parent = style.find(f"{_W}basedOn")
        if parent is not None and parent.get(f"{_W}val"):
            based[style_id] = parent.get(f"{_W}val", "")
        number = style.find(f"{_W}pPr/{_W}numPr")
        if number is not None:
            named = number.find(f"{_W}numId")
            depth = number.find(f"{_W}ilvl")
            own[style_id] = (
                named.get(f"{_W}val") if named is not None else None,
                int(depth.get(f"{_W}val", "0")) if depth is not None else None,
            )
    for style_id in {*based, *own}:
        num_id: str | None = None
        level: int | None = None
        current: str | None = style_id
        for _ in range(_MAX_BASED_ON):
            if current is None:
                break
            found = own.get(current, (None, None))
            num_id = num_id if num_id is not None else found[0]
            level = level if level is not None else found[1]
            current = based.get(current)
        if num_id and num_id != "0":
            roles.numbered[style_id] = (num_id, level or 0)
    return roles


class _Numbering:
    """Word's list and heading numbers, counted as Word counts them, per numbering id."""

    def __init__(self, root: ElementTree.Element | None) -> None:
        # Abstract numbering id -> level -> (start, format, text such as "%1.%2.").
        abstract: dict[str, dict[int, tuple[int, str, str]]] = {}
        self._levels: dict[str, dict[int, tuple[int, str, str]]] = {}
        self._counts: dict[str, list[int]] = {}
        if root is None:
            return
        for item in root.iter(f"{_W}abstractNum"):
            levels: dict[int, tuple[int, str, str]] = {}
            for lvl in item.findall(f"{_W}lvl"):
                start = lvl.find(f"{_W}start")
                fmt = lvl.find(f"{_W}numFmt")
                text = lvl.find(f"{_W}lvlText")
                levels[int(lvl.get(f"{_W}ilvl", "0"))] = (
                    int(start.get(f"{_W}val", "1")) if start is not None else 1,
                    (fmt.get(f"{_W}val") or "decimal") if fmt is not None else "decimal",
                    (text.get(f"{_W}val") or "") if text is not None else "",
                )
            abstract[item.get(f"{_W}abstractNumId", "")] = levels
        for item in root.iter(f"{_W}num"):
            target = item.find(f"{_W}abstractNumId")
            if target is not None:
                self._levels[item.get(f"{_W}numId", "")] = abstract.get(
                    target.get(f"{_W}val", ""), {}
                )

    def label(self, paragraph: ElementTree.Element, roles: _Roles) -> tuple[str | None, int | None]:
        """The paragraph's number or bullet, and its list depth; (None, None) when it has none."""
        number = paragraph.find(f"{_W}pPr/{_W}numPr")
        style = _style_id(paragraph)
        num_id: str | None = None
        level = 0
        if number is not None:
            found = number.find(f"{_W}numId")
            depth = number.find(f"{_W}ilvl")
            num_id = found.get(f"{_W}val") if found is not None else None
            level = int(depth.get(f"{_W}val", "0")) if depth is not None else 0
            if num_id is None and style in roles.numbered:
                num_id = roles.numbered[style][0]
        elif style in roles.numbered:
            num_id, level = roles.numbered[style]
        levels = self._levels.get(num_id or "")
        if not levels or level not in levels:
            return None, None
        counts = self._counts.setdefault(num_id or "", [0] * _MAX_LEVELS)
        counts[level] = (counts[level] or levels[level][0] - 1) + 1
        for deeper in range(level + 1, _MAX_LEVELS):
            counts[deeper] = 0
        start, fmt, text = levels[level]
        if fmt == "bullet":
            return "•", level
        if fmt == "none":
            return None, level

        def number_at(match: re.Match[str]) -> str:
            at = int(match.group(1)) - 1
            first, form, _ = levels.get(at, (1, "decimal", ""))
            return _formatted(counts[at] or first, form)

        rendered = _LEVEL_TEXT.sub(number_at, text).strip()
        return rendered or None, level


def _formatted(value: int, form: str) -> str:
    if form in {"lowerLetter", "upperLetter"}:
        letters = ""
        while value > 0:
            value, rest = divmod(value - 1, 26)
            letters = chr(ord("a") + rest) + letters
        return letters.upper() if form == "upperLetter" else letters
    if form in {"lowerRoman", "upperRoman"}:
        roman = ""
        for amount, numeral in _ROMAN:
            while value >= amount:
                roman += numeral
                value -= amount
        return roman if form == "upperRoman" else roman.casefold()
    if form == "decimalZero":
        return f"{value:02d}"
    return str(value)


def _numbering(content: bytes) -> _Numbering:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if _NUMBERING not in set(archive.namelist()):
            return _Numbering(None)
        return _Numbering(ElementTree.fromstring(archive.read(_NUMBERING)))


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


def _without_hidden_sheets(content: bytes) -> bytes:
    """A workbook without its hidden sheets, or the workbook as it is when that is unsafe.

    Hidden sheets are never read (``_worksheet_rows``), but they are still extracted
    first: an SDD's embedded workflow books each hid a "Sheet1" filled down to row
    1,048,576, a hundred megabytes of XML that refused the whole book. Only the
    workbook's index parts are read, each small; the sheets, their relationships and
    the calculation chain (which names sheets by position) are dropped by name, and
    the index text is edited in place, so nothing else is rewritten. What remains is
    checked by the validator when it is read.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            sizes = {info.filename: info.file_size for info in archive.infolist()}
            index = (_WORKBOOK, _WORKBOOK_RELS, _TYPES)
            if any(not 0 < sizes.get(name, 0) <= _MAX_INDEX_BYTES for name in index):
                return content
            workbook, relationships, types = (archive.read(name).decode() for name in index)
            sheets = ElementTree.fromstring(workbook).iter(f"{_S}sheet")
            states = [(sheet.get("state"), sheet.get(f"{_R}id") or "") for sheet in sheets]
            hidden = {rel for state, rel in states if state in {"hidden", "veryHidden"}}
            if not hidden or len(hidden) == len(states):
                return content
            targets = {
                item.get("Id"): posixpath.normpath(
                    posixpath.join("xl", item.get("Target", ""))
                ).lstrip("/")
                for item in ElementTree.fromstring(relationships).iter(f"{_PR}Relationship")
            }
            dropped = {targets[rel] for rel in hidden if rel in targets}
            dropped |= {_CALC_CHAIN} | {
                posixpath.join(posixpath.dirname(name), "_rels", posixpath.basename(name) + ".rels")
                for name in tuple(dropped)
            }
            for rel in hidden:
                workbook = re.sub(rf'<sheet\b[^>]*\br:id="{re.escape(rel)}"[^>]*/>', "", workbook)
            # Defined names point at sheets by position; the reader needs none of them.
            workbook = re.sub(r"<definedNames>.*?</definedNames>", "", workbook, flags=re.S)
            for rel_id, name in targets.items():
                if name in dropped or name == _CALC_CHAIN:
                    relationships = re.sub(
                        rf'<Relationship\b[^>]*\bId="{re.escape(rel_id or "")}"[^>]*/>',
                        "",
                        relationships,
                    )
            for name in dropped:
                types = re.sub(
                    rf'<Override\b[^>]*\bPartName="/{re.escape(name)}"[^>]*/>', "", types
                )
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as kept:
                edited = dict(zip(index, (workbook, relationships, types), strict=True))
                for info in archive.infolist():
                    if info.filename in dropped:
                        continue
                    if info.filename in edited:
                        kept.writestr(info.filename, edited[info.filename])
                    else:
                        kept.writestr(info, archive.read(info.filename))
            return buffer.getvalue()
    except (zipfile.BadZipFile, ElementTree.ParseError, UnicodeDecodeError, KeyError):
        return content


def _text(paragraph: ElementTree.Element) -> str:
    return "".join(node.text or "" for node in paragraph.iter(f"{_W}t")).strip()


def _table_rows(
    table: int, rows: list[list[str]], headings: tuple[str, ...], prefix: str = ""
) -> list[LocatedText]:
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
        location = f"{prefix}table {table}, row {row_number}"
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
_S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_WORKBOOK = "xl/workbook.xml"
_WORKBOOK_RELS = "xl/_rels/workbook.xml.rels"
_TYPES = "[Content_Types].xml"
_CALC_CHAIN = "xl/calcChain.xml"
# A workbook's index parts are small; larger ones are left to the validator to refuse.
_MAX_INDEX_BYTES = 2 * 1024 * 1024
_RELATIONSHIPS = "word/_rels/document.xml.rels"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_HIDDEN = "Hidden worksheet: "
_ROW = re.compile(r"^Worksheet (?P<sheet>\d+)!(?P<row>\d+):(?P=row)$")
# A row's cells: "A3=1 | B3=CPE platform Selection"; a value may itself hold " | ".
_CELL_SPLIT = re.compile(r" \| (?=[A-Z]{1,3}\d+=)")
_CELL = re.compile(r"^(?P<column>[A-Z]{1,3})\d+=(?P<value>.*)$", re.DOTALL)
_ANCHOR = re.compile(r"\s*\[merged [A-Z]+\d+:[A-Z]+\d+ anchor\]\s*$")
_CONTINUATION = re.compile(
    r"\[merged [A-Z]+\d+:[A-Z]+\d+ continuation; anchor (?P<anchor>[A-Z]+\d+)\]"
)
_NUMBER_LIKE = re.compile(r"^[\d\s.,:/%-]+$")
# A column label is short; a table's title is kept to a heading's length.
_MAX_LABEL = 40
_MAX_TITLE = 120
# A workflow's coded title: "WF-3", "WF 3C", "WF-8-A" first in the row, beside a few cells.
_CODED_TITLE = re.compile(r"^WF[\s_-]*\d", re.IGNORECASE)
_MAX_TITLE_CELLS = 4
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_NUMBERING = "word/numbering.xml"
_LEVEL_TEXT = re.compile(r"%([1-9])")
_MAX_LEVELS = 9
_MAX_BASED_ON = 8
_ROMAN = (
    (1000, "M"),
    (900, "CM"),
    (500, "D"),
    (400, "CD"),
    (100, "C"),
    (90, "XC"),
    (50, "L"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
)
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
