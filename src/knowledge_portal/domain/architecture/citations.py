"""Citations that name no registered source.

A fact cites its source as one line: the source as it is cited ("SDD v2.3"), then where in
it and any note, separated by " · ". The screens read the first part against the source
register to give the source its level and title. A citation whose first part names no
registered source can't be read that way, so before publishing a curator sees each one,
grouped by what it cites, and either registers the source or corrects the citation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, fields, is_dataclass
from typing import Any

from knowledge_portal.domain.architecture.governance import KnowledgeSource
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge

SEPARATOR = " · "
_EXAMPLES = 3
# What a release holds that is not a cited fact.
_NOT_FACTS = frozenset({"sources", "documents", "change_history", "outdated_passages"})
_WORD = re.compile(r"[^\W_]", re.UNICODE)


@dataclass(frozen=True)
class UnregisteredCitation:
    """What a set of citations names, how many facts cite it, and a few of them."""

    cited: str
    facts: int
    examples: tuple[str, ...]


def cited_source(text: str | None, sources: tuple[KnowledgeSource, ...]) -> KnowledgeSource | None:
    """The registered source a citation names: the longest id or short name it starts with,
    as a whole word ("SDD v2.3 · §P1" names the source cited "SDD v2.3")."""
    written = (text or "").strip().casefold()
    if not written:
        return None
    best: tuple[int, KnowledgeSource] | None = None
    for source in sources:
        for name in (source.id, source.short):
            key = (name or "").strip().casefold()
            if not key or not written.startswith(key):
                continue
            after = written[len(key) : len(key) + 2]
            # A word goes on, or a point and a digit carry on a number: "SDD v2" is not
            # cited by "SDD v2.3".
            if after[:1] and _WORD.match(after[:1]) or (after[:1] == "." and after[1:].isdigit()):
                continue
            if best is None or len(key) > best[0]:
                best = (len(key), source)
    return best[1] if best else None


def _label(item: Any) -> str:
    """A fact by its kind and name: "Offering component CPE device"."""
    kind = re.sub(r"(?<!^)(?=[A-Z])", " ", type(item).__name__).capitalize()
    name = next(
        (
            getattr(item, attribute)
            for attribute in ("name", "pref_label", "title", "statement", "trigger", "id", "number")
            if isinstance(getattr(item, attribute, None), str)
        ),
        "",
    )
    return f"{kind} {name}".strip()


def _facts(value: Any) -> list[Any]:
    """Every dataclass in a value that carries a source, depth first."""
    found: list[Any] = []
    if isinstance(value, (tuple, list)):
        for item in value:
            found.extend(_facts(item))
    elif is_dataclass(value) and not isinstance(value, type):
        if isinstance(getattr(value, "source", None), str):
            found.append(value)
        for field in fields(value):
            found.extend(_facts(getattr(value, field.name)))
    return found


def unregistered_citations(release: ArchitectureKnowledge) -> tuple[UnregisteredCitation, ...]:
    """Each thing the version's facts cite that is not in its source register, most cited
    first."""
    grouped: dict[str, list[str]] = {}
    for field in fields(release):
        if field.name in _NOT_FACTS:
            continue
        for fact in _facts(getattr(release, field.name)):
            source: str = fact.source
            if cited_source(source, release.sources) is not None:
                continue
            cited = source.split(SEPARATOR)[0].strip()
            grouped.setdefault(cited, []).append(_label(fact))
    return tuple(
        UnregisteredCitation(cited, len(labels), tuple(labels[:_EXAMPLES]))
        for cited, labels in sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0]))
    )
