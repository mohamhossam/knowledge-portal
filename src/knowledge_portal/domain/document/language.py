"""The reference library's language rule: it accepts no Arabic.

A document whose title, extracted text or reviewed text holds any Arabic letter is refused,
and so is a search in Arabic. The rule covers the library only; the architecture catalogue
keeps its Arabic names. Search normalisation still folds Arabic forms (`normalize_search`),
because that normal form is part of the citation contract shared with requirement work
(ADR-0099) and must not change.
"""

from __future__ import annotations

import re

# Arabic, Arabic Supplement, Arabic Extended-A and the two presentation-form blocks. Forms-B
# stops at U+FEFC: U+FEFF is the byte-order mark, which plain English files often start with.
_ARABIC = re.compile("[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]")


def has_arabic(text: str) -> bool:
    return _ARABIC.search(text) is not None
