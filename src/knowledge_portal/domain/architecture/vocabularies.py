"""Controlled vocabularies: the closed lists behind fields that were free text (ADR-0114).

Six schemes, each a small SKOS-style list curated with the release: eTOM process,
channel kind, component kind, responsibility role, TM Forum Open API and information
entity (the SID's aggregate business entities: Customer, Product, Order). A term has
a preferred label, other labels people write, an optional code (such as "TMF622"),
and a broader term in its own scheme.

The text a source wrote stays where it is. Beside it, a field gains the id of the
term it means, set only by a maintainer or by a clean-up suggestion a maintainer
accepts, so a release pins its vocabulary as it pins its systems.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.domain.architecture.concepts import label_key, label_words
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source

# eTOM's own levels 1 to 3; the other schemes are flat or nearly so.
MAX_TERM_DEPTH = 3


class VocabularyScheme(StrEnum):
    ETOM_PROCESS = "etom_process"
    CHANNEL_KIND = "channel_kind"
    COMPONENT_KIND = "component_kind"
    # What a system does for a component or an activity: orchestrate, activate, bill.
    RESPONSIBILITY_ROLE = "responsibility_role"
    OPEN_API = "open_api"
    # What systems master or read, and interfaces carry: Customer, Product order.
    INFORMATION_ENTITY = "information_entity"


SCHEME_NAMES = {
    VocabularyScheme.ETOM_PROCESS: "eTOM process",
    VocabularyScheme.CHANNEL_KIND: "channel kind",
    VocabularyScheme.COMPONENT_KIND: "component kind",
    VocabularyScheme.RESPONSIBILITY_ROLE: "role",
    VocabularyScheme.OPEN_API: "Open API",
    VocabularyScheme.INFORMATION_ENTITY: "information entity",
}

_ID_PREFIXES = {
    VocabularyScheme.ETOM_PROCESS: "etom",
    VocabularyScheme.CHANNEL_KIND: "channel",
    VocabularyScheme.COMPONENT_KIND: "component",
    VocabularyScheme.RESPONSIBILITY_ROLE: "role",
    VocabularyScheme.OPEN_API: "api",
    VocabularyScheme.INFORMATION_ENTITY: "entity",
}


def vocabulary_scheme(value: VocabularyScheme | str) -> VocabularyScheme:
    try:
        return VocabularyScheme(str(value).strip().casefold())
    except ValueError as exc:
        names = ", ".join(item.value for item in VocabularyScheme)
        raise InvalidKnowledgeError(f"A vocabulary is one of {names}, not {value!r}.") from exc


@dataclass(frozen=True)
class VocabularyTerm:
    """One term, such as the eTOM process "Order Handling" or the Open API "TMF622"."""

    id: str
    scheme: VocabularyScheme
    pref_label: str
    alt_labels: tuple[str, ...] = ()
    # The code people write for it, such as "TMF622"; None when it has none.
    notation: str | None = None
    definition: str | None = None
    # The broader term in the same scheme; None for a top term.
    broader_id: str | None = None
    # The same term in an outside reference, such as an eTOM process number.
    exact_match: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Term id"))
        object.__setattr__(self, "scheme", vocabulary_scheme(self.scheme))
        object.__setattr__(self, "pref_label", required(self.pref_label, "Term label"))
        object.__setattr__(
            self, "alt_labels", tuple(required(item, "Other label") for item in self.alt_labels)
        )
        for field, label in (
            ("notation", "Term code"),
            ("definition", "Term definition"),
            ("broader_id", "Broader term"),
            ("exact_match", "Outside match"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        check_source(self)
        keys = [label_key(item) for item in self.labels]
        if any(not key for key in keys):
            raise InvalidKnowledgeError(f"{self.pref_label}: a label needs a letter or digit.")
        if len(set(keys)) != len(keys):
            raise InvalidKnowledgeError(
                f"{self.pref_label}: each label and code must differ from the rest."
            )
        if self.broader_id == self.id:
            raise InvalidKnowledgeError(f"{self.pref_label} cannot be broader than itself.")

    @property
    def labels(self) -> tuple[str, ...]:
        """Every way it is written: its labels, then its code."""
        code = (self.notation,) if self.notation else ()
        return (self.pref_label, *self.alt_labels, *code)


def check_vocabulary(terms: tuple[VocabularyTerm, ...]) -> dict[str, VocabularyTerm]:
    """Unique ids, each label or code naming one term of its scheme, broader terms in the
    same scheme, no cycles, and at most MAX_TERM_DEPTH levels.

    Returns the terms by id, for checking what fields name.
    """
    by_id = {item.id: item for item in terms}
    if len(by_id) != len(terms):
        raise InvalidKnowledgeError("Vocabulary term ids must be unique.")
    owners: dict[tuple[VocabularyScheme, str], VocabularyTerm] = {}
    for term in terms:
        for label in term.labels:
            owner = owners.setdefault((term.scheme, label_key(label)), term)
            if owner.id != term.id:
                raise InvalidKnowledgeError(
                    f"{label!r} already names the {SCHEME_NAMES[term.scheme]} "
                    f"{owner.pref_label}, so it cannot also name {term.pref_label}. Each label "
                    "must identify one term."
                )
        broader = by_id.get(term.broader_id or "")
        if term.broader_id is not None and (broader is None or broader.scheme is not term.scheme):
            raise InvalidKnowledgeError(
                f"{term.pref_label} narrows {term.broader_id!r}, which is not in the "
                f"{SCHEME_NAMES[term.scheme]} vocabulary."
            )
        depth, seen, current = 1, {term.id}, term
        while current.broader_id is not None:
            current = by_id[current.broader_id]
            if current.id in seen:
                raise InvalidKnowledgeError(f"{term.pref_label} is narrower than itself.")
            seen.add(current.id)
            depth += 1
        if depth > MAX_TERM_DEPTH:
            raise InvalidKnowledgeError(
                f"Terms are at most {MAX_TERM_DEPTH} levels deep; {term.pref_label!r} is deeper."
            )
    return by_id


def check_terms(
    term_ids: Iterable[str],
    scheme: VocabularyScheme,
    terms: dict[str, VocabularyTerm],
    where: str,
) -> None:
    """The terms a field names exist, each once, in the field's own scheme."""
    ids = tuple(term_ids)
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError(f"{where} names one {SCHEME_NAMES[scheme]} more than once.")
    for term_id in ids:
        term = terms.get(term_id)
        if term is None or term.scheme is not scheme:
            raise InvalidKnowledgeError(
                f"{where} names {term_id!r}, which is not in the {SCHEME_NAMES[scheme]} vocabulary."
            )


def term_id_for(scheme: VocabularyScheme, label: str, taken: Iterable[str]) -> str:
    """A new term id from its scheme and label, such as ``etom-order-handling``."""
    used = set(taken)
    words = label_words(label)
    prefix = _ID_PREFIXES[scheme]
    base = f"{prefix}-{'-'.join(words)}" if words else prefix
    candidate, number = base, 2
    while candidate in used:
        candidate, number = f"{base}-{number}", number + 1
    return candidate


# Parts of a path such as "Fulfillment · Order Handling" or "CRM › Selling".
_SEGMENTS = re.compile(r"\s*[›·>|]\s*")
# A TM Forum Open API code, such as "TMF622" or "TMF 622".
_API_CODE = re.compile(r"\bTMF[\s-]?(\d{3,4})\b", re.IGNORECASE)


def path_segments(value: str) -> tuple[str, ...]:
    """A written value's parts, outermost first: "Fulfillment · Order Handling" has two."""
    return tuple(item for item in _SEGMENTS.split(value.strip()) if label_key(item))


def api_codes(value: str) -> tuple[str, ...]:
    """The Open API codes a value names, such as ("TMF629", "TMF637"), each once."""
    return tuple(dict.fromkeys(f"TMF{match}" for match in _API_CODE.findall(value)))


def api_name(value: str, code: str) -> str:
    """What a value calls one API: "TMF622 Product Ordering (GET)" names TMF622
    "Product Ordering"; the code alone when it says nothing more."""
    for segment in path_segments(value):
        if code in api_codes(segment):
            name = _API_CODE.sub("", re.sub(r"\(.*?\)", "", segment)).strip(" -:")
            return name or code
    return code


def find_term(
    terms: Iterable[VocabularyTerm], scheme: VocabularyScheme, reference: str
) -> VocabularyTerm | None:
    """A term of the scheme named by id, or by one of its labels or its code, ignoring case
    and punctuation."""
    candidates = [item for item in terms if item.scheme is scheme]
    exact = next((item for item in candidates if item.id == reference), None)
    key = label_key(reference)
    if exact is not None or not key:
        return exact
    return next(
        (item for item in candidates if key in {label_key(label) for label in item.labels}),
        None,
    )


def match_value(
    terms: tuple[VocabularyTerm, ...], scheme: VocabularyScheme, value: str
) -> tuple[VocabularyTerm, ...]:
    """The terms a written value means, or none when the scheme has no term for all of it.

    An Open API value means a term per code it names. Any other value means the term one
    of whose labels it is, or, written as a path, the term its last part names.
    """
    if scheme is VocabularyScheme.OPEN_API:
        codes = api_codes(value)
        if codes:
            found = [find_term(terms, scheme, code) for code in codes]
            return tuple(item for item in found if item is not None) if all(found) else ()
    whole = find_term(terms, scheme, value)
    if whole is not None:
        return (whole,)
    segments = path_segments(value)
    if len(segments) > 1:
        last = find_term(terms, scheme, segments[-1])
        if last is not None:
            return (last,)
    return ()
