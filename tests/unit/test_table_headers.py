"""Table rows are searched with their header row's column names."""

from __future__ import annotations

from knowledge_portal.domain.document.table_headers import column_names, with_column_names


def test_a_header_row_names_its_columns_in_both_renderings() -> None:
    assert column_names("R1C1: Tier | R1C2: Pooled data | R1C3: Roaming") == {
        "1": "Tier",
        "2": "Pooled data",
        "3": "Roaming",
    }
    assert column_names("A1=Plan | B1=Concurrent channels | C1=Included minutes") == {
        "A": "Plan",
        "B": "Concurrent channels",
        "C": "Included minutes",
    }


def test_blank_and_overlong_header_cells_name_nothing() -> None:
    names = column_names("R1C1:  | R1C2: " + "x" * 61 + " | R1C3: Region")
    assert names == {"3": "Region"}
    assert column_names("Just a sentence, not a row.") == {}


def test_a_row_names_its_cells_and_keeps_the_ones_without_a_header() -> None:
    names = {"1": "Tier", "2": "Pooled data"}
    row = "R3C1: Fleet Plus | R3C2: 25 GB per line | R3C3: GCC roaming bundle included"
    assert with_column_names(row, names) == (
        "Tier: Fleet Plus | Pooled data: 25 GB per line | R3C3: GCC roaming bundle included"
    )
    sheet = "A2=SIP Trunk 10 | B2=10 | D2=Emergency calls are always routed."
    assert with_column_names(sheet, {"A": "Plan", "B": "Concurrent channels"}) == (
        "Plan: SIP Trunk 10 | Concurrent channels: 10 | D2=Emergency calls are always routed."
    )


def test_a_fragment_of_a_long_row_names_the_cells_it_holds() -> None:
    # A chunk may start in the middle of a cell; only whole cell references are named.
    fragment = "per line | R3C3: GCC roaming bundle included"
    assert with_column_names(fragment, {"3": "Roaming"}) == (
        "per line | Roaming: GCC roaming bundle included"
    )
    assert with_column_names("R3C1: Fleet Plus", {}) == "R3C1: Fleet Plus"
