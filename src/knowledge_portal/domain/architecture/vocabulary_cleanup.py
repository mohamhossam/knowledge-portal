"""The clean-up: mapping the values a catalogue already writes onto its vocabularies.

Each eTOM process, channel kind, component kind, role and Open API value is read as
it is written. A value one of a term's labels or codes names is proposed as a link to
that term. A value no term names is proposed as a new term, which flags it: a
maintainer decides each new term alone, and may edit it into an existing one. It only
proposes; nothing is linked until a maintainer accepts.
"""

from __future__ import annotations

from dataclasses import dataclass

from knowledge_portal.domain.architecture.concepts import label_key
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.vocabularies import (
    VocabularyScheme,
    VocabularyTerm,
    api_codes,
    api_name,
    find_term,
    match_value,
    path_segments,
    term_id_for,
)
from knowledge_portal.domain.architecture.vocabulary_links import (
    VocabularyRef,
    WrittenValue,
    written_values,
)


@dataclass(frozen=True)
class TermProposal:
    term: VocabularyTerm
    # The places it would be linked to, in catalogue order.
    refs: tuple[VocabularyRef, ...]
    # True when the term is already in the draft and the proposal only links to it.
    existing: bool


def _written(value: str) -> str:
    """A code such as CUSTOMER_DATA as words a label can hold: "CUSTOMER DATA"."""
    return " ".join(value.replace("_", " ").split())


@dataclass
class _Group:
    term: VocabularyTerm
    existing: bool
    refs: list[VocabularyRef]


def _matches(
    found: WrittenValue, terms: tuple[VocabularyTerm, ...]
) -> list[tuple[VocabularyTerm | None, str]]:
    """What each part of a value means: a term, or None with the text a new term takes."""
    scheme = found.ref.scheme
    value = found.ref.value
    codes = api_codes(value) if scheme is VocabularyScheme.OPEN_API else ()
    if codes:
        return [(find_term(terms, scheme, code), code) for code in codes]
    matched = match_value(terms, scheme, value)
    if matched:
        return [(matched[0], value)]
    segments = path_segments(value)
    return [(None, segments[-1] if segments else value)]


def propose_terms(release: ArchitectureKnowledge) -> tuple[TermProposal, ...]:
    """One proposal per term the draft's unmapped values mean, or would need.

    A place is unmapped while no term is linked to it; an Open API value stays open
    while one of the APIs it names is not linked. Proposals run scheme by scheme, in
    catalogue order.
    """
    terms = release.vocabulary
    taken = {item.id for item in terms}
    groups: dict[tuple[VocabularyScheme, bool, str], _Group] = {}
    for found in written_values(release.products, release.journeys, release.channels):
        scheme = found.ref.scheme
        if found.term_ids and scheme is not VocabularyScheme.OPEN_API:
            continue
        for term, text in _matches(found, terms):
            if term is not None:
                if term.id in found.term_ids:
                    continue
                key = (scheme, True, term.id)
                group = groups.setdefault(key, _Group(term, True, []))
            else:
                key = (scheme, False, label_key(text))
                if key not in groups:
                    groups[key] = _Group(_new_term(found, text, terms, taken), False, [])
                group = groups[key]
            if found.ref not in group.refs:
                group.refs.append(found.ref)
    order = list(VocabularyScheme)
    ranked = sorted(groups.items(), key=lambda pair: order.index(pair[0][0]))
    return tuple(TermProposal(group.term, tuple(group.refs), group.existing) for _, group in ranked)


def _new_term(
    found: WrittenValue,
    text: str,
    terms: tuple[VocabularyTerm, ...],
    taken: set[str],
) -> VocabularyTerm:
    """A term for a value no term names: its last part as the label, under the term its
    part before names, when there is one; an Open API code keeps its code."""
    scheme = found.ref.scheme
    notation: str | None
    if scheme is VocabularyScheme.OPEN_API and api_codes(text):
        label, notation = api_name(found.ref.value, text), text
        if label_key(label) == label_key(notation):
            label = notation
            notation = None
    else:
        label, notation = _written(text), None
    segments = path_segments(found.ref.value)
    broader = find_term(terms, scheme, segments[-2]) if len(segments) > 1 else None
    term_id = term_id_for(scheme, notation or label, taken)
    taken.add(term_id)
    return VocabularyTerm(
        term_id,
        scheme,
        label,
        notation=notation,
        broader_id=broader.id if broader is not None else None,
    )
