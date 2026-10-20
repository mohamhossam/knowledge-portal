"""Located text segments for verifiable architecture citations."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class LocatedText:
    """One citable passage.

    `heading_path` holds the headings the passage sits under, outermost first.
    `heading` marks a passage that is itself a heading. Passages that share a
    `block` (the cells of one table row) belong together when indexed.
    `cells` holds a table row's (column, value) pairs, every column of its
    header included, when the format has one row per passage.

    What a Word document says of a paragraph's role, for chunking (ADR section-v4):
    `title` marks the document's own title; `caption` a captioned paragraph;
    `label` the number or bullet Word draws before it ("2.1", "a)", "•"), which
    is not in `text`; `list_level` the depth of a list item, 0 outermost.
    """

    location: str
    text: str
    heading_path: tuple[str, ...] = ()
    heading: bool = False
    block: str | None = None
    cells: tuple[tuple[str, str], ...] = ()
    title: bool = False
    caption: bool = False
    label: str | None = None
    list_level: int | None = None


@dataclass(frozen=True)
class EmbeddedPart:
    """An Office file embedded in a Word document, such as the workflows an annex holds.

    ``number`` is its place among the document's embedded objects, so it is cited
    as "embedded N" however many are read. ``headings`` are those it sits under.
    """

    number: int
    filename: str
    mime_type: str
    headings: tuple[str, ...]
    content: bytes


@dataclass(frozen=True)
class EmbeddedParts:
    """The Office files embedded in a document, and how many other objects were not read."""

    parts: tuple[EmbeddedPart, ...] = ()
    others: int = 0


class LocatedDocumentExtractorPort(Protocol):
    def extract(self, mime_type: str, content: bytes) -> tuple[LocatedText, ...]: ...

    def figure_headings(self, mime_type: str, content: bytes) -> dict[str, tuple[str, ...]]:
        """The headings each embedded image first appears under, by its package path."""
        ...

    def embedded(self, mime_type: str, content: bytes, max_bytes: int) -> EmbeddedParts:
        """A validated Word document's embedded Word, PowerPoint and Excel files, in order;
        each at most ``max_bytes`` once unpacked."""
        ...
