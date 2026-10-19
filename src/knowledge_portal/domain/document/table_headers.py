"""Column names for table rows, so a row is searched with the headers it belongs under.

Extraction renders a table row with cell references, not column names:
"R3C1: Fleet Plus | R3C2: 25 GB per line" (Word, slides, CSV) or
"A2=SIP Trunk 10 | B2=10" (worksheets). A question about "pooled data" then misses the row that
answers it, because only the header row says "Pooled data". The first row of a table is read as
its header, and each later row's searched text names its cells by column. The cited text is
never changed: only what is searched and embedded.
"""

from __future__ import annotations

import re

# "R1C2: Pooled data" up to the next " | R1C3: " or the end.
_REFERENCE_CELL = re.compile(r"R\d+C(\d+): (.*?)(?= \| R\d+C\d+: |$)", re.DOTALL)
# "B1=Concurrent channels" up to the next " | C1=" or the end.
_SHEET_CELL = re.compile(r"([A-Z]{1,3})\d+=(.*?)(?= \| [A-Z]{1,3}\d+=|$)", re.DOTALL)
_REFERENCE_PREFIX = re.compile(r"(^| \| )R\d+C(\d+): ")
_SHEET_PREFIX = re.compile(r"(^| \| )([A-Z]{1,3})\d+=")
# A header cell longer than this is not a column name.
MAX_NAME = 60


def column_names(header_row: str) -> dict[str, str]:
    """The header row's cells by column: "2" -> "Pooled data", or "B" -> "Concurrent channels"."""
    cells = _REFERENCE_CELL.findall(header_row) or _SHEET_CELL.findall(header_row)
    names: dict[str, str] = {}
    for column, value in cells:
        name = " ".join(value.split())
        if name and len(name) <= MAX_NAME:
            names[column] = name
    return names


def with_column_names(row: str, names: dict[str, str]) -> str:
    """The row with each cell reference replaced by its column name, where one is known."""
    if not names:
        return row

    def named(match: re.Match[str]) -> str:
        name = names.get(match.group(2))
        return f"{match.group(1)}{name}: " if name else match.group(0)

    return _SHEET_PREFIX.sub(named, _REFERENCE_PREFIX.sub(named, row))
