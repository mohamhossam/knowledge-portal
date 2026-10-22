"""One SKOS base for business capability concepts and vocabulary terms (recommendation 9).

A concept and a term are the same shape: a preferred label, other labels people write, a
definition, a broader entry in the same scheme, and matches in outside references. The two
used to check that shape twice, apart. Both now check it here: each label naming one entry
of its scheme, broader entries in the same scheme, no cycles, a depth cap, and outside
matches (``exact_match``, the one reference that means the same thing, and ``close_match``,
references near enough to read across, as SKOS's closeMatch).

Labels are English only (PRODUCT.md), so they carry no language tag.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Hashable, Sequence
from typing import Protocol

from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, required


def label_words(label: str) -> tuple[str, ...]:
    """A label's words, ignoring case and punctuation."""
    return tuple(re.findall(r"[^\W_]+", label.casefold()))


def label_key(label: str) -> str:
    """How two labels are compared: their letters and digits alone, so "Wi-Fi" is "WiFi"."""
    return "".join(label_words(label))


class SkosEntry(Protocol):
    @property
    def id(self) -> str: ...

    @property
    def pref_label(self) -> str: ...

    @property
    def broader_id(self) -> str | None: ...

    @property
    def exact_match(self) -> str | None: ...

    @property
    def close_match(self) -> tuple[str, ...]: ...

    @property
    def labels(self) -> tuple[str, ...]: ...


def check_entry(entry: SkosEntry, labels_are: str = "label") -> None:
    """One entry's own shape: its outside matches as written, each once, apart from its
    exact match; its labels each with a letter or digit and apart from each other; and no
    entry broader than itself. Run from ``__post_init__``, after the labels are trimmed."""
    matches = tuple(required(item, "Close match") for item in entry.close_match)
    object.__setattr__(entry, "close_match", matches)
    if len(set(matches)) != len(matches):
        raise InvalidKnowledgeError(f"{entry.pref_label}: each close match is named once.")
    if entry.exact_match is not None and entry.exact_match in matches:
        raise InvalidKnowledgeError(
            f"{entry.pref_label}: {entry.exact_match!r} is its exact match, so it is not also "
            "a close one."
        )
    keys = [label_key(item) for item in entry.labels]
    if any(not key for key in keys):
        raise InvalidKnowledgeError(f"{entry.pref_label}: a label needs a letter or digit.")
    if len(set(keys)) != len(keys):
        raise InvalidKnowledgeError(
            f"{entry.pref_label}: each {labels_are} must differ from the rest."
        )
    if entry.broader_id == entry.id:
        raise InvalidKnowledgeError(f"{entry.pref_label} cannot be broader than itself.")


def check_tree[Entry: SkosEntry](
    entries: Sequence[Entry],
    *,
    kind: str,
    max_depth: int,
    scheme: Callable[[Entry], Hashable] = lambda _: None,
    owned_by: Callable[[Entry], str] = lambda entry: entry.pref_label,
    outside: Callable[[Entry], str] = lambda _: "in the catalogue",
) -> dict[str, Entry]:
    """Entries of one register as a set of SKOS schemes: unique ids, each label naming one
    entry of its scheme, broader entries in the same scheme, no cycles, and at most
    ``max_depth`` levels.

    ``kind`` names an entry in messages ("concept", "term"); ``owned_by`` says which entry
    owns a label ("the eTOM process Order Handling"), and ``outside`` where a broader entry
    is missing from ("in the eTOM process vocabulary"). Returns the entries by id.
    """
    by_id = {item.id: item for item in entries}
    if len(by_id) != len(entries):
        raise InvalidKnowledgeError(f"{kind.capitalize()} ids must be unique.")
    owners: dict[tuple[Hashable, str], Entry] = {}
    for entry in entries:
        for label in entry.labels:
            owner = owners.setdefault((scheme(entry), label_key(label)), entry)
            if owner.id != entry.id:
                raise InvalidKnowledgeError(
                    f"{label!r} already names {owned_by(owner)}, so it cannot also name "
                    f"{entry.pref_label}. Each label must identify one {kind}."
                )
        broader = by_id.get(entry.broader_id or "")
        if entry.broader_id is not None and (broader is None or scheme(broader) != scheme(entry)):
            raise InvalidKnowledgeError(
                f"{entry.pref_label} narrows {entry.broader_id!r}, which is not {outside(entry)}."
            )
        depth, seen, current = 1, {entry.id}, entry
        while current.broader_id is not None and current.broader_id in by_id:
            current = by_id[current.broader_id]
            if current.id in seen:
                raise InvalidKnowledgeError(f"{entry.pref_label} is narrower than itself.")
            seen.add(current.id)
            depth += 1
        if depth > max_depth:
            raise InvalidKnowledgeError(
                f"{kind.capitalize()}s are at most {max_depth} levels deep; "
                f"{entry.pref_label!r} is deeper."
            )
    return by_id
