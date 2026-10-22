"""A fact's source line, read once against the source register.

A fact cites its source as one line: the source as it is cited ("SDD v2.3"), then where in
it and any note, separated by " · ". This module is the one place that line is read
(review recommendation 5): ``source_reference`` names the registered source and where in
it, every version the API sends carries those readings, and the screens look a line up
rather than matching it themselves. A citation that names no registered source can't be
read that way, so before publishing a curator sees each one, grouped by what it cites, and
either registers the source or corrects the citation.
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
_NOT_FACTS = frozenset({"sources", "documents", "change_history"})
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
    named = _cited(text, sources)
    return named[1] if named else None


def _cited(
    text: str | None, sources: tuple[KnowledgeSource, ...]
) -> tuple[int, KnowledgeSource] | None:
    """How long the name a citation starts with is, and the source it names."""
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
    return best


@dataclass(frozen=True)
class SourceReference:
    """A fact's source line as the register reads it.

    ``source_id`` is the registered source it names, if any; ``cited`` the words that name
    it, as written; ``rest`` everything after them, as written ("· §4.1 · a note"); and
    ``where`` that rest without its leading separator ("§4.1 · a note"): where in the
    source, then any note. A line that names no registered source has ``where`` alone.
    """

    text: str
    source_id: str | None = None
    cited: str | None = None
    rest: str | None = None
    where: str | None = None


def source_reference(text: str, sources: tuple[KnowledgeSource, ...]) -> SourceReference:
    """A source line read against the register, by the one rule ``cited_source`` keeps."""
    written = text.strip()
    named = _cited(written, sources)
    if named is None:
        return SourceReference(written, where=written or None)
    length, source = named
    rest = written[length:].strip()
    where = rest.removeprefix(SEPARATOR.strip()).strip()
    return SourceReference(written, source.id, written[:length], rest or None, where or None)


def source_references(release: ArchitectureKnowledge) -> tuple[SourceReference, ...]:
    """Every distinct source line the version's facts write, each read once, in the order
    first written."""
    seen: dict[str, SourceReference] = {}
    for field in fields(release):
        if field.name in _NOT_FACTS:
            continue
        for fact in _facts(getattr(release, field.name)):
            text: str = fact.source.strip()
            if text and text not in seen:
                seen[text] = source_reference(text, release.sources)
    return tuple(seen.values())


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
    first. Citations that differ only in case are one thing ("SDD V2.3", "sdd v2.3"), as the
    register reads them, shown as first written."""
    written: dict[str, str] = {}
    grouped: dict[str, list[str]] = {}
    for field in fields(release):
        if field.name in _NOT_FACTS:
            continue
        for fact in _facts(getattr(release, field.name)):
            source: str = fact.source
            if cited_source(source, release.sources) is not None:
                continue
            cited = source.split(SEPARATOR)[0].strip()
            key = cited.casefold()
            written.setdefault(key, cited)
            grouped.setdefault(key, []).append(_label(fact))
    return tuple(
        UnregisteredCitation(written[key], len(labels), tuple(labels[:_EXAMPLES]))
        for key, labels in sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0]))
    )
