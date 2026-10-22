"""The one reader of decoded JSON: each kind of value means the same thing in every adapter,
and a value of the wrong kind is refused as UnreadableValue, never passed on."""

from __future__ import annotations

import pytest

from knowledge_portal.infrastructure.json_reading import (
    UnreadableValue,
    bounded_list,
    flag,
    integer,
    mapping,
    optional_integer,
    optional_text,
    text,
    trimmed_text,
)


def test_unreadable_value_is_a_value_error_naming_what_was_expected() -> None:
    with pytest.raises(ValueError, match="expected text, not int"):
        text(7)


def test_text_is_read_exactly_as_written() -> None:
    assert text("  Billing ") == "  Billing "
    assert text("") == ""


@pytest.mark.parametrize("value", [None, 7, 7.5, True, ["a"], {"a": 1}])
def test_text_refuses_anything_but_text(value: object) -> None:
    with pytest.raises(UnreadableValue):
        text(value)


def test_optional_text_is_none_only_when_absent() -> None:
    assert optional_text(None) is None
    assert optional_text("") == ""
    assert optional_text(" x ") == " x "
    with pytest.raises(UnreadableValue):
        optional_text(False)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("", None),
        ("   ", None),
        (" Launched \n", "Launched"),
        (24, "24"),
        (0, "0"),
        (12.5, "12.5"),
        (12.0, "12.0"),
    ],
)
def test_trimmed_text_trims_reads_numbers_and_treats_blank_as_absent(
    value: object, expected: str | None
) -> None:
    assert trimmed_text(value) == expected


@pytest.mark.parametrize("value", [True, False, ["x"], {"name": "x"}])
def test_trimmed_text_refuses_flags_and_structures(value: object) -> None:
    with pytest.raises(UnreadableValue):
        trimmed_text(value)


def test_integer_reads_whole_numbers() -> None:
    assert integer(0) == 0
    assert integer(-3) == -3


@pytest.mark.parametrize("value", [None, True, False, 3.0, "3", ""])
def test_integer_refuses_flags_fractions_and_text(value: object) -> None:
    with pytest.raises(UnreadableValue, match="a whole number"):
        integer(value)


def test_optional_integer_is_none_only_when_absent() -> None:
    assert optional_integer(None) is None
    assert optional_integer(0) == 0
    with pytest.raises(UnreadableValue):
        optional_integer(True)
    with pytest.raises(UnreadableValue):
        optional_integer("")


def test_flag_reads_only_true_or_false() -> None:
    assert flag(True) is True
    assert flag(False) is False


@pytest.mark.parametrize("value", [None, 0, 1, "true", ""])
def test_flag_refuses_numbers_and_text(value: object) -> None:
    with pytest.raises(UnreadableValue, match="true or false"):
        flag(value)


def test_mapping_reads_an_object() -> None:
    assert mapping({}) == {}
    assert mapping({"id": "x"}) == {"id": "x"}


@pytest.mark.parametrize("value", [None, [], "", ["id", "x"]])
def test_mapping_refuses_anything_but_an_object(value: object) -> None:
    with pytest.raises(UnreadableValue, match="an object"):
        mapping(value)


def test_bounded_list_is_empty_when_absent_and_cut_at_its_limit() -> None:
    assert bounded_list(None, 2) == []
    assert bounded_list([], 2) == []
    assert bounded_list([1, 2, 3], 2) == [1, 2]
    assert bounded_list([1], 2) == [1]


@pytest.mark.parametrize("value", ["", "abc", {"a": 1}, (1, 2), 0])
def test_bounded_list_refuses_anything_but_a_list(value: object) -> None:
    with pytest.raises(UnreadableValue, match="a list"):
        bounded_list(value, 5)
