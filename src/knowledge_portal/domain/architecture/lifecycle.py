"""What happens to an offering over its life, as its sources tell it (requirement-portal
ADR-0101, step 4).

Beyond the order journeys, an offering's sources describe how it changes once sold: an
up/downgrade matrix, what cessation blocks, how a renewal carries the contract over, what
an add-on does on each order type. Each is a lifecycle note: a titled topic, the order
types and channels it concerns, and its content as the source sets it out, as paragraphs,
lists and tables. A note keeps its source's confidence, so content carried over from an
older source and marked to re-verify says so.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source

MAX_TABLE_COLUMNS = 10
MAX_TABLE_ROWS = 60
MAX_LIST_ITEMS = 40


class NoteBlockKind(StrEnum):
    TEXT = "text"
    LIST = "list"
    TABLE = "table"


@dataclass(frozen=True)
class NoteBlock:
    """One part of a note: a paragraph, a list, or a table with its column heads."""

    kind: NoteBlockKind
    # A heading of its own, such as "v8.2 Master-Definition carry-over".
    title: str | None = None
    text: str | None = None
    items: tuple[str, ...] = ()
    columns: tuple[str, ...] = ()
    rows: tuple[tuple[str, ...], ...] = ()
    # A table's caption, said under it.
    caption: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        try:
            kind = NoteBlockKind(str(self.kind).strip().casefold())
        except ValueError as exc:
            raise InvalidKnowledgeError(
                f"A note's block is text, a list or a table, not {self.kind!r}."
            ) from exc
        object.__setattr__(self, "kind", kind)
        object.__setattr__(self, "title", optional(self.title, "Block title"))
        object.__setattr__(self, "caption", optional(self.caption, "Caption"))
        object.__setattr__(self, "text", optional(self.text, "Text"))
        object.__setattr__(self, "items", tuple(required(item, "List item") for item in self.items))
        object.__setattr__(self, "columns", tuple(item.strip() for item in self.columns))
        check_source(self)
        if kind is NoteBlockKind.TEXT and not self.text:
            raise InvalidKnowledgeError("A text block needs its text.")
        if kind is NoteBlockKind.LIST and not self.items:
            raise InvalidKnowledgeError("A list needs at least one item.")
        if len(self.items) > MAX_LIST_ITEMS:
            raise InvalidKnowledgeError(f"A list holds at most {MAX_LIST_ITEMS} items.")
        if kind is NoteBlockKind.TABLE:
            if not self.columns or not any(self.columns):
                raise InvalidKnowledgeError("A table needs its column heads.")
            if len(self.columns) > MAX_TABLE_COLUMNS:
                raise InvalidKnowledgeError(f"A table holds at most {MAX_TABLE_COLUMNS} columns.")
            if len(self.rows) > MAX_TABLE_ROWS:
                raise InvalidKnowledgeError(f"A table holds at most {MAX_TABLE_ROWS} rows.")
            width = len(self.columns)
            rows = []
            for row in self.rows:
                cells = tuple(str(cell).strip() for cell in row)
                if len(cells) > width:
                    raise InvalidKnowledgeError(
                        f"A table row has {len(cells)} cells but the table {width} columns."
                    )
                if any(cells):
                    rows.append(cells + ("",) * (width - len(cells)))
            object.__setattr__(self, "rows", tuple(rows))
        elif self.columns or self.rows:
            raise InvalidKnowledgeError("Only a table has columns and rows.")


@dataclass(frozen=True)
class LifecycleNote:
    """A lifecycle topic of an offering, such as "Up / Downgrade scenario matrix"."""

    id: str
    title: str
    # As the source groups it: "Change", "Commercial", "Exception".
    kind: str | None = None
    summary: str | None = None
    # The order types it concerns, by code; none named means every one.
    order_types: tuple[str, ...] = ()
    # The channels it concerns, by id; none named means every one.
    channels: tuple[str, ...] = ()
    blocks: tuple[NoteBlock, ...] = ()
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Note id"))
        object.__setattr__(self, "title", required(self.title, "Note title"))
        object.__setattr__(self, "kind", optional(self.kind, "Kind of note"))
        object.__setattr__(self, "summary", optional(self.summary, "Summary"))
        object.__setattr__(
            self,
            "order_types",
            tuple(dict.fromkeys(required(item, "Order type") for item in self.order_types)),
        )
        object.__setattr__(
            self,
            "channels",
            tuple(dict.fromkeys(required(item, "Channel") for item in self.channels)),
        )
        check_source(self)
        if not self.blocks and not self.summary:
            raise InvalidKnowledgeError(f"{self.title}: a note says something.")

    def concerns(self, order_code: str, channel_id: str | None = None) -> bool:
        """Whether the note holds for an order type, read through a channel."""
        order = not self.order_types or any(
            item.casefold() == order_code.casefold() for item in self.order_types
        )
        channel = channel_id is None or not self.channels or channel_id in self.channels
        return order and channel


def check_lifecycle_notes(
    offering_name: str,
    notes: tuple[LifecycleNote, ...],
    order_codes: Collection[str],
    channel_ids: Collection[str] | None = None,
) -> None:
    """Notes with one id each, naming only the offering's order types and, when given, only
    catalogued channels; the message says which note names the unknown one."""
    ids = [item.id for item in notes]
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError(f"{offering_name}: lifecycle note ids must be unique.")
    known = {code.casefold() for code in order_codes}
    for note in notes:
        unknown = [item for item in note.order_types if item.casefold() not in known]
        if unknown:
            raise InvalidKnowledgeError(
                f"{offering_name} › {note.title}: order type {unknown[0]!r} is not one of the "
                "offering's order types."
            )
        if channel_ids is not None:
            absent = [item for item in note.channels if item not in channel_ids]
            if absent:
                raise InvalidKnowledgeError(
                    f"{offering_name} › {note.title} names channel {absent[0]!r}, which is not "
                    "in the catalogue."
                )
