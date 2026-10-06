"""Work-item ids a BRD mentions, suggested to the curator, never linked on their own.

BRDs sometimes name the Azure DevOps items they were delivered as (decision 10): "#12345",
"AB#12345", "Epic 12345", "User Story: 12345", or a link to `_workitems/edit/12345`. Each match
is cited with the passage it came from, so the curator can judge it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from smb_kernel.documents.model import DocumentEvidenceBlock

SUGGESTIONS_MAX = 50
QUOTE_RADIUS = 60

# Ids of 3 to 7 digits: shorter numbers are too often section or list numbers.
_ID = r"(\d{3,7})"
_PATTERNS = (
    re.compile(r"_workitems/edit/" + _ID, re.IGNORECASE),
    re.compile(r"\bAB#" + _ID),
    re.compile(
        r"\b(?:epic|feature|user\s+story|story|work\s*item|wi|pbi)\s*(?:id\s*)?[:#]?\s*#?" + _ID,
        re.IGNORECASE,
    ),
    re.compile(r"(?<![\w&/])#" + _ID + r"\b"),
)


@dataclass(frozen=True)
class IdSuggestion:
    work_item_id: int
    block_id: str
    label: str
    quote: str


def _quote(text: str, start: int, end: int) -> str:
    left = max(0, start - QUOTE_RADIUS)
    right = min(len(text), end + QUOTE_RADIUS)
    quote = " ".join(text[left:right].split())
    return ("…" if left else "") + quote + ("…" if right < len(text) else "")


def suggest_work_item_ids(blocks: tuple[DocumentEvidenceBlock, ...]) -> tuple[IdSuggestion, ...]:
    """The first place each id is mentioned, in reading order, at most 50 ids."""
    found: dict[int, IdSuggestion] = {}
    for block in blocks:
        text = block.text or ""
        matches = sorted(
            (match for pattern in _PATTERNS for match in pattern.finditer(text)),
            key=lambda match: match.start(),
        )
        for match in matches:
            work_item_id = int(match.group(1))
            if work_item_id in found:
                continue
            found[work_item_id] = IdSuggestion(
                work_item_id, block.id, block.label, _quote(text, match.start(), match.end())
            )
            if len(found) >= SUGGESTIONS_MAX:
                return tuple(found.values())
    return tuple(found.values())
