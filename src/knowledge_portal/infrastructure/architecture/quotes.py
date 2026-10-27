"""Finding a model's quote in the passage it cites.

A model copying a passage often re-spaces it or straightens its quotation marks and dashes;
those still match. What is kept is the passage's own text, never the model's.
"""

from __future__ import annotations

_TYPOGRAPHY = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-"})


def verbatim(quote: str, text: str) -> str | None:
    """The passage's own words for `quote`, or None when it is not there."""
    quote = quote.strip()
    if not quote:
        return None
    if quote in text:
        return quote
    # The passage with marks plain and spacing single, and where each character came from.
    # `translate` keeps one character for one, so positions still index `text`.
    chars: list[str] = []
    origins: list[int] = []
    for index, char in enumerate(text.translate(_TYPOGRAPHY)):
        if char.isspace():
            if not chars or chars[-1] == " ":
                continue
            char = " "
        chars.append(char)
        origins.append(index)
    wanted = " ".join(quote.translate(_TYPOGRAPHY).split())
    found = "".join(chars).find(wanted)
    if found < 0:
        return None
    return text[origins[found] : origins[found + len(wanted) - 1] + 1]
