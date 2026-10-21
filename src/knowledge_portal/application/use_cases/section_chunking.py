"""How a document is cut into parents and children under section-v4 (ADR section-v4).

A *parent* is what the verdict reasoner reads: a section's paragraphs, up to
PARENT_MAX tokens, or one table with its caption and columns. A *child* is what
is embedded and searched: one paragraph, a few short ones joined, a group of
whole sentences of a long one, or one table row. A hit on a child is read as its
parent, so a short query finds a small unit and the model still sees the context.

Every child's text is an exact, contiguous slice of its parent's text, so a quote
from either can be checked against the parent. Locations keep the parser's
addresses ("paragraph 12", "table 2, row 3") and add sentence ranges.

The rules, in order:

P1  The document's Title paragraph is body text, not heading level 1.
P2  A table's header row names its columns; it is never a unit of its own.
P3  A row whose one value spans the columns is a note on the table.
P4  A caption, or a short paragraph just before a table under the same
    heading, is that table's caption.
P5  A slide is a section of its own. (A PDF's pages, which carry no headings
    to read, pack together like paragraphs: a page is not a section.)
C1  A section's paragraphs pack into parents of at most PARENT_MAX tokens; a
    paragraph longer than that splits at sentence ends.
C2  A paragraph is a child; one under CHILD_MIN joins its neighbour; one over
    CHILD_MAX splits into groups of whole sentences (about CHILD_TARGET tokens)
    that share one sentence with the next.
C3  A table is one parent (split by rows past PARENT_MAX); each data row and its
    note are children, embedded with a line naming the table.
C6  Text that repeats exactly in one document is indexed once; the other places
    are kept as aliases.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace

from knowledge_portal.application.ports.located_document_extractor import LocatedText

CHILD_MIN = 40
CHILD_TARGET = 160
CHILD_MAX = 220
PARENT_MAX = 600
CAPTION_MAX = 60
# A catalogue record's lines pack into windows of at most this many tokens.
RECORD_WINDOW = 500

TokenCount = Callable[[str], int]

_NUMBERED = re.compile(r"^(?P<unit>[a-z]+) (?P<number>\d+)$")
_LINES = re.compile(r"^lines? (?P<start>\d+)(?:-(?P<end>\d+))?$")
_SHEET_ROW = re.compile(r"^sheet (?P<sheet>\d+), row (?P<row>\d+)$")
_TABLE_ROW = re.compile(r"^(?P<table>(?:control \d+, )?table \d+), row \d+$")
# Sentence ends: ".", "!" or "?" then space and a capital or a digit, but not after a
# single capital ("E. Smith") or a common abbreviation. Arabic has no capitals: there a
# sentence ends at ".", "!", "?", the Arabic question mark or full stop, before an Arabic
# letter or digit.
_SENTENCE_END = re.compile(
    r"(?<!\be\.g)(?<!\bi\.e)(?<!\betc)(?<!\bvs)(?<!\bNo)(?<!\b[A-Z])(?<=[.!?])\s+(?=[A-Z0-9])"
    r"|(?<=[.!?\u061f\u06d4])\s+(?=[\u0600-\u06ff\u0750-\u077f\u0660-\u0669])"
)


def span(first: str, last: str) -> str:
    """ "paragraph 12" and "paragraph 15" read as "paragraphs 12–15", and likewise rows."""
    if first == last:
        return first
    lines = _LINES.match(first), _LINES.match(last)
    if lines[0] and lines[1]:
        # Markdown passages mix "line 4" (a table row) with "lines 6-9" (a paragraph).
        return f"lines {lines[0]['start']}-{lines[1]['end'] or lines[1]['start']}"
    start, end = _NUMBERED.match(first), _NUMBERED.match(last)
    if start and end and start["unit"] == end["unit"]:
        return f"{start['unit']}s {start['number']}–{end['number']}"
    rows = _SHEET_ROW.match(first), _SHEET_ROW.match(last)
    if rows[0] and rows[1] and rows[0]["sheet"] == rows[1]["sheet"]:
        return f"sheet {rows[0]['sheet']}, rows {rows[0]['row']}–{rows[1]['row']}"
    return f"{first} – {last}"


def sentences(text: str) -> tuple[tuple[int, int], ...]:
    """Each sentence's (start, end) offsets in the text, blank ones left out."""
    bounds: list[tuple[int, int]] = []
    start = 0
    for match in _SENTENCE_END.finditer(text):
        bounds.append((start, match.start()))
        start = match.end()
    bounds.append((start, len(text)))
    return tuple((a, b) for a, b in bounds if text[a:b].strip())


@dataclass(frozen=True)
class SentenceGroup:
    first: int  # 1-based sentence numbers
    last: int
    start: int  # offsets in the text
    end: int


def sentence_groups(
    text: str, count: TokenCount, target: int, maximum: int, overlap: int
) -> tuple[SentenceGroup, ...]:
    """Groups of whole sentences of about `target` tokens, never over `maximum` unless one
    sentence is; neighbouring groups share `overlap` sentences."""
    bounds = sentences(text)
    sizes = [count(text[a:b]) for a, b in bounds]
    groups: list[SentenceGroup] = []
    first = 0
    while first < len(bounds):
        last = first
        size = 0
        while last < len(bounds) and (size == 0 or size + sizes[last] <= target):
            size += sizes[last]
            last += 1
        # A group well under target takes one more sentence while it stays within maximum.
        while last < len(bounds) and size < target * 0.8 and size + sizes[last] <= maximum:
            size += sizes[last]
            last += 1
        groups.append(SentenceGroup(first + 1, last, bounds[first][0], bounds[last - 1][1]))
        if last >= len(bounds):
            break
        first = max(last - overlap, first + 1)
    return tuple(groups)


@dataclass(frozen=True)
class ChildPlan:
    location: str
    # The exact text searched for, a slice of the parent's body.
    text: str
    # Embedded with the text but not part of it: which table a row is from.
    context: str | None = None
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True)
class ParentPlan:
    location: str
    # The headings the parent sits under, outermost first, numbered as the document shows.
    headings: tuple[str, ...]
    # What the reasoner reads, below the parent's header line.
    body: str
    children: tuple[ChildPlan, ...]
    aliases: tuple[str, ...] = ()


@dataclass
class _Paragraph:
    location: str
    text: str
    headings: tuple[str, ...]
    # Where a split piece's sentences are counted from, and the paragraph it came from.
    source: str | None = None
    base: int = 0


@dataclass
class _Table:
    # "table 2" for a Word table; None for rows of a sheet, CSV or Markdown table.
    key: str | None
    location: str
    headings: tuple[str, ...]
    rows: list[LocatedText] = field(default_factory=list)
    columns: tuple[str, ...] = ()
    data: list[_Paragraph] = field(default_factory=list)
    caption: _Paragraph | None = None
    note: _Paragraph | None = None


def _rendered(segment: LocatedText) -> str:
    """A paragraph as the document shows it: with the number or bullet Word draws."""
    return f"{segment.label} {segment.text}" if segment.label else segment.text


def _items(
    segments: Sequence[LocatedText],
) -> list[_Paragraph | _Table | list[_Paragraph] | None]:
    """Paragraphs and tables in document order; None where a heading starts a section.

    Applies P1 (the title is body text) and numbers the heading paths as the
    document shows them.
    """
    title = next((item.text for item in segments if item.title), None)
    numbered: dict[tuple[str, ...], tuple[str, ...]] = {}

    def path(raw: tuple[str, ...]) -> tuple[str, ...]:
        if title is not None and raw[:1] == (title,):
            raw = raw[1:]
        return numbered.get(raw, raw)

    items: list[_Paragraph | _Table | list[_Paragraph] | None] = []
    table: _Table | None = None
    for segment in segments:
        if segment.title:
            items.append(_Paragraph(segment.location, segment.text, ()))
            table = None
            continue
        if segment.heading:
            raw = segment.heading_path
            if title is not None and raw[:1] == (title,):
                raw = raw[1:]
            numbered[(*raw, segment.text)] = (*numbered.get(raw, raw), _rendered(segment))
            items.append(None)
            table = None
            continue
        headings = path(segment.heading_path)
        if segment.block is None:
            items.append(_Paragraph(segment.location, _rendered(segment), headings))
            table = None
            continue
        word = _TABLE_ROW.match(segment.location)
        key = word["table"] if word else None
        # A row without cells after rows with cells starts the next table of a sheet.
        restarts = not segment.cells and table is not None and any(r.cells for r in table.rows)
        if table is None or table.key != key or table.headings != headings or restarts:
            table = _Table(key, key or segment.location, headings)
            items.append(table)
        table.rows.append(segment)
    return [_settled(item) if isinstance(item, _Table) else item for item in items]


def _settled(table: _Table) -> _Table | _Paragraph | list[_Paragraph]:
    """A table's columns (P2), note (P3) and data rows; one whose rows carry no cells, such
    as a boxed one-column note, reads as paragraphs."""
    headings = table.headings
    if not any(row.cells for row in table.rows):
        return [_Paragraph(row.location, row.text, headings) for row in table.rows]
    rows = list(table.rows)
    if not rows[0].cells:
        table.columns = tuple(part.strip() for part in rows.pop(0).text.split(" | "))
    else:
        table.columns = tuple(name for name, _ in rows[0].cells)
    for row in rows:
        filled = [value for _, value in row.cells if value]
        if (
            table.note is None
            and len(row.cells) >= 3
            and len(filled) == 1
            and row.cells[0][1] == filled[0]
        ):
            table.note = _Paragraph(row.location, filled[0], headings)
            continue
        table.data.append(_Paragraph(row.location, row.text, headings))
    if table.key is None and table.data:
        table.location = span(table.rows[0].location, table.rows[-1].location)
    return table


def _paragraph_children(units: Sequence[_Paragraph], count: TokenCount) -> list[ChildPlan]:
    """C2 over one parent's paragraphs: each child a contiguous run of the parent's text."""
    runs: list[ChildPlan | list[_Paragraph]] = []
    pending: list[_Paragraph] = []
    for unit in units:
        if count(unit.text) > CHILD_MAX:
            if pending:
                runs.append(pending)
                pending = []
            where = unit.source or unit.location
            runs.extend(
                ChildPlan(
                    f"{where}, sentences {unit.base + group.first}–{unit.base + group.last}",
                    unit.text[group.start : group.end],
                )
                for group in sentence_groups(unit.text, count, CHILD_TARGET, CHILD_MAX, overlap=1)
            )
            continue
        pending.append(unit)
        if count(_joined(pending)) >= CHILD_MIN:
            runs.append(pending)
            pending = []
    if pending:
        # A short leftover joins the run of paragraphs just before it, when that still fits.
        last = runs[-1] if runs else None
        if isinstance(last, list) and count(_joined([*last, *pending])) <= CHILD_MAX:
            last.extend(pending)
        else:
            runs.append(pending)
    return [
        run
        if isinstance(run, ChildPlan)
        else ChildPlan(span(run[0].location, run[-1].location), _joined(run))
        for run in runs
    ]


def _joined(units: Sequence[_Paragraph]) -> str:
    return "\n".join(unit.text for unit in units)


def _table_parents(table: _Table, count: TokenCount) -> list[ParentPlan]:
    """C3: the table as parents of whole rows, each repeating its caption and columns; each
    row, and the note, a child embedded with a line naming the table."""
    caption = table.caption.text if table.caption else None
    columns = " | ".join(table.columns)
    context = f"Table: {caption or columns}" if caption or columns else None
    head = [line for line in (caption, f"Columns: {columns}" if columns else None) if line]
    note = f"Note: {table.note.text}" if table.note else None
    fixed = count("\n".join([*head, *([note] if note else [])]))
    batches: list[list[_Paragraph]] = [[]]
    for row in table.data:
        batch = batches[-1]
        if batch and fixed + count(_joined([*batch, row])) > PARENT_MAX:
            batches.append([])
        batches[-1].append(row)
    parents: list[ParentPlan] = []
    for number, batch in enumerate(batches, 1):
        last = number == len(batches)
        lines = [*head, *(row.text for row in batch), *([note] if last and note else [])]
        children = [ChildPlan(row.location, row.text, context) for row in batch]
        if last and table.note is not None:
            children.append(ChildPlan(table.note.location, table.note.text, context))
        location = (
            table.location
            if len(batches) == 1 or not batch
            else span(batch[0].location, batch[-1].location)
        )
        parents.append(ParentPlan(location, table.headings, "\n".join(lines), tuple(children)))
    return parents


def _split_long(paragraph: _Paragraph, count: TokenCount) -> list[_Paragraph]:
    """C1: a paragraph longer than a parent, as parent-sized runs of whole sentences."""
    pieces: list[_Paragraph] = []
    for group in sentence_groups(
        paragraph.text, count, int(PARENT_MAX * 0.7), PARENT_MAX, overlap=0
    ):
        pieces.append(
            _Paragraph(
                f"{paragraph.location}, sentences {group.first}–{group.last}",
                paragraph.text[group.start : group.end],
                paragraph.headings,
                source=paragraph.location,
                base=group.first - 1,
            )
        )
    return pieces


def plan_document(segments: Sequence[LocatedText], count: TokenCount) -> tuple[ParentPlan, ...]:
    """A document's parents and their children, in document order (rules above)."""
    items: list[_Paragraph | _Table | None] = []
    for entry in _items(segments):
        items.extend(entry if isinstance(entry, list) else [entry])
    # P4: the paragraph just before a table, under the same heading, is its caption when it
    # is styled as one or is short.
    captions = {segment.location for segment in segments if segment.caption}
    taken: set[int] = set()
    for at, item in enumerate(items):
        before = items[at - 1] if at else None
        if (
            isinstance(item, _Table)
            and item.data
            and isinstance(before, _Paragraph)
            and before.headings == item.headings
            and (before.location in captions or count(before.text) <= CAPTION_MAX)
        ):
            item.caption = before
            taken.add(id(before))
    parents: list[ParentPlan] = []
    group: list[_Paragraph] = []

    def flush() -> None:
        if not group:
            return
        parents.append(
            ParentPlan(
                span(group[0].location, group[-1].location)
                if group[0].source is None
                else group[0].location,
                group[0].headings,
                _joined(group),
                tuple(_paragraph_children(group, count)),
            )
        )
        group.clear()

    for item in items:
        if item is None:
            flush()
            continue
        if isinstance(item, _Table):
            flush()
            parents.extend(_table_parents(item, count))
            continue
        if id(item) in taken:
            continue
        if group and group[0].headings != item.headings:
            flush()
        # P5: a slide is a section of its own: a deck's slides are never read as one parent.
        if group and _is_slide(group[0].location) and group[-1].location != item.location:
            flush()
        if count(item.text) > PARENT_MAX:
            flush()
            for piece in _split_long(item, count):
                group.append(piece)
                flush()
            continue
        if group and count(_joined([*group, item])) > PARENT_MAX:
            flush()
        group.append(item)
    flush()
    return _deduplicated(parents)


_SLIDE = re.compile(r"^slide \d+$")


def _is_slide(location: str) -> bool:
    return bool(_SLIDE.match(location))


def _deduplicated(parents: list[ParentPlan]) -> tuple[ParentPlan, ...]:
    """C6: a parent or child whose text repeats an earlier one is kept once, with aliases."""
    first: dict[tuple[tuple[str, ...], str], int] = {}
    kept: list[ParentPlan] = []
    for parent in parents:
        body = (parent.headings, parent.body)
        if body in first:
            at = first[body]
            kept[at] = replace(kept[at], aliases=(*kept[at].aliases, parent.location))
            continue
        first[body] = len(kept)
        kept.append(parent)
    owner: dict[tuple[str | None, str], tuple[int, int]] = {}
    children: list[list[ChildPlan]] = [[] for _ in kept]
    for number, parent in enumerate(kept):
        for child in parent.children:
            text = (child.context, child.text)
            if text in owner:
                at, place = owner[text]
                earlier = children[at][place]
                children[at][place] = replace(earlier, aliases=(*earlier.aliases, child.location))
                continue
            owner[text] = (number, len(children[number]))
            children[number].append(child)
    return tuple(
        replace(parent, children=tuple(own)) for parent, own in zip(kept, children, strict=True)
    )


_SENTENCES = re.compile(r", sentences \d+–\d+$")
_SPAN = re.compile(r"^(?P<unit>[a-z]+)s (?P<first>\d+)–\d+$")
_SHEET_ROWS = re.compile(r"^sheet (?P<sheet>\d+), rows (?P<first>\d+)–\d+$")
_WHOLE_TABLE = re.compile(r"^(?:control \d+, )?table \d+$")


def first_location(location: str) -> str:
    """The first passage a section-v4 location names, as the parser locates it:
    "paragraphs 3–5" → "paragraph 3", "paragraph 46, sentences 4–6" → "paragraph 46",
    "table 2" → "table 2, row 1", "sheet 1, rows 4–9" → "sheet 1, row 4"."""
    location = _SENTENCES.sub("", location.split(" – ")[0].strip())
    if match := _SPAN.match(location):
        return f"{match['unit']} {match['first']}"
    if match := _SHEET_ROWS.match(location):
        return f"sheet {match['sheet']}, row {match['first']}"
    if _WHOLE_TABLE.match(location):
        return f"{location}, row 1"
    return location


def record_windows(content: str, location: str, count: TokenCount) -> tuple[tuple[str, str], ...]:
    """A catalogue record's (location, text) windows under section-v4: whole lines packed
    up to RECORD_WINDOW tokens, the next window repeating the last line; a record that fits
    is one window at its own location."""
    if not content.strip():
        return ()
    if count(content) <= RECORD_WINDOW:
        return ((location, content),)
    lines = content.split("\n")
    windows: list[tuple[str, str]] = []
    first = 0
    while first < len(lines):
        last = first
        size = 0
        while last < len(lines) and (size == 0 or size + count(lines[last]) <= RECORD_WINDOW):
            size += count(lines[last])
            last += 1
        text = "\n".join(lines[first:last])
        windows.append((f"{location}, lines {first + 1}–{last}", text))
        if last >= len(lines):
            break
        first = max(last - 1, first + 1)
    return tuple(windows)
