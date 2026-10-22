"""Controlled vocabularies: the closed lists behind fields that were free text (ADR-0114).

Seven schemes are built in, because code reads them: eTOM process, channel kind,
component kind, responsibility role, TM Forum Open API, information entity (the SID's
aggregate business entities: Customer, Product, Order) and document type. Curators add
more as release data (``ConceptScheme``, review recommendation 9), each bound to the
free-text fields its terms name, such as an offering's NFR quality or a portfolio level,
so a new list needs no deploy. A term has a preferred label, other labels people write,
an optional code (such as "TMF622"), and a broader term in its own scheme, on the SKOS
base it shares with business capability concepts (``skos.py``).

The text a source wrote stays where it is. Beside it, a field gains the id of the
term it means, set only by a maintainer or by a clean-up suggestion a maintainer
accepts, so a release pins its vocabulary as it pins its systems.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum

from knowledge_portal.domain.architecture.deprecation import check_retirement, successor
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.provenance import AcceptedFrom
from knowledge_portal.domain.architecture.skos import (
    check_entry,
    check_tree,
    label_key,
    label_words,
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
    # What kind of document a library document is: a solution design, a contract (ADR-0123).
    DOCUMENT_TYPE = "document_type"


SCHEME_NAMES: dict[str, str] = {
    VocabularyScheme.ETOM_PROCESS: "eTOM process",
    VocabularyScheme.CHANNEL_KIND: "channel kind",
    VocabularyScheme.COMPONENT_KIND: "component kind",
    VocabularyScheme.RESPONSIBILITY_ROLE: "role",
    VocabularyScheme.OPEN_API: "Open API",
    VocabularyScheme.INFORMATION_ENTITY: "information entity",
    VocabularyScheme.DOCUMENT_TYPE: "document type",
}

_ID_PREFIXES: dict[str, str] = {
    VocabularyScheme.ETOM_PROCESS: "etom",
    VocabularyScheme.CHANNEL_KIND: "channel",
    VocabularyScheme.COMPONENT_KIND: "component",
    VocabularyScheme.RESPONSIBILITY_ROLE: "role",
    VocabularyScheme.OPEN_API: "api",
    VocabularyScheme.INFORMATION_ENTITY: "entity",
    VocabularyScheme.DOCUMENT_TYPE: "doctype",
}


# A scheme a curator defines: lower case letters, digits and underscores, as the built-in ones.
_SCHEME_ID = re.compile(r"^[a-z][a-z0-9_]*$")


def vocabulary_scheme(value: VocabularyScheme | str) -> VocabularyScheme:
    """A built-in scheme, by its id; refused for any other."""
    try:
        return VocabularyScheme(str(value).strip().casefold())
    except ValueError as exc:
        names = ", ".join(item.value for item in VocabularyScheme)
        raise InvalidKnowledgeError(f"A vocabulary is one of {names}, not {value!r}.") from exc


def scheme_id(value: str) -> str:
    """A term's scheme as the model keeps it: a built-in scheme as its member, so code can
    compare it by identity, and a curated one by its id. Whether a curated id is a scheme
    of the release is checked with the release (``check_vocabulary``)."""
    text = required(str(value), "Vocabulary").casefold()
    if text in _BUILT_IN_IDS:
        return VocabularyScheme(text)
    if not _SCHEME_ID.match(text):
        raise InvalidKnowledgeError(
            f"A vocabulary id is lower case letters, digits and underscores, not {value!r}."
        )
    return text


_BUILT_IN_IDS = frozenset(item.value for item in VocabularyScheme)


def scheme_name(scheme: str, names: Mapping[str, str] | None = None) -> str:
    """What a scheme is called in a message: its name, or its id when it has none."""
    return (names or SCHEME_NAMES).get(scheme) or SCHEME_NAMES.get(scheme) or str(scheme)


class VocabularyField(StrEnum):
    """Where the catalogue writes a value a vocabulary covers.

    The first six are bound to built-in schemes. The rest are free text until a curator
    binds a scheme of their own to them (``ConceptScheme.fields``).
    """

    ACTIVITY_ETOM = "activity_etom"
    ACTIVITY_ROLE = "activity_role"
    CHANNEL_KIND = "channel_kind"
    COMPONENT_KIND = "component_kind"
    RESPONSIBILITY_ROLE = "responsibility_role"
    INTEGRATION_OPEN_API = "integration_open_api"
    # An offering's NFR quality, family and lifecycle stage, and its business rules' kind.
    NFR_QUALITY = "nfr_quality"
    OFFERING_FAMILY = "offering_family"
    OFFERING_LIFECYCLE = "offering_lifecycle"
    RULE_KIND = "rule_kind"
    # A journey activity's mode ("Automated") and phase ("Order capture").
    ACTIVITY_MODE = "activity_mode"
    ACTIVITY_PHASE = "activity_phase"
    # A portfolio node's level ("Segment", "Family").
    PORTFOLIO_LEVEL = "portfolio_level"
    # A system component's technology ("Microservice", "Batch job").
    COMPONENT_TECHNOLOGY = "component_technology"


FIELD_SCHEMES: dict[VocabularyField, str] = {
    VocabularyField.ACTIVITY_ETOM: VocabularyScheme.ETOM_PROCESS,
    VocabularyField.ACTIVITY_ROLE: VocabularyScheme.RESPONSIBILITY_ROLE,
    VocabularyField.CHANNEL_KIND: VocabularyScheme.CHANNEL_KIND,
    VocabularyField.COMPONENT_KIND: VocabularyScheme.COMPONENT_KIND,
    VocabularyField.RESPONSIBILITY_ROLE: VocabularyScheme.RESPONSIBILITY_ROLE,
    VocabularyField.INTEGRATION_OPEN_API: VocabularyScheme.OPEN_API,
}
# The fields a curator's scheme may take.
OPEN_FIELDS = tuple(item for item in VocabularyField if item not in FIELD_SCHEMES)


@dataclass(frozen=True)
class ConceptScheme:
    """A vocabulary a curator defines with the release, such as "NFR quality" (review
    recommendation 9): its terms are release data like any other, and ``fields`` are the
    free-text fields it covers, each linked to one of its terms beside the text."""

    id: str
    name: str
    definition: str | None = None
    fields: tuple[VocabularyField, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", scheme_id(self.id))
        if self.id in _BUILT_IN_IDS:
            raise InvalidKnowledgeError(
                f"{self.id!r} is a built-in vocabulary; a curated one takes another id."
            )
        object.__setattr__(self, "name", required(self.name, "Vocabulary name"))
        object.__setattr__(self, "definition", optional(self.definition, "Vocabulary definition"))
        try:
            fields = tuple(VocabularyField(str(item).strip().casefold()) for item in self.fields)
        except ValueError as exc:
            names = ", ".join(item.value for item in OPEN_FIELDS)
            raise InvalidKnowledgeError(
                f"{self.name}: a vocabulary covers fields among {names}."
            ) from exc
        object.__setattr__(self, "fields", fields)
        if len(set(fields)) != len(fields):
            raise InvalidKnowledgeError(f"{self.name} names a field more than once.")
        bound = [item.value for item in fields if item in FIELD_SCHEMES]
        if bound:
            raise InvalidKnowledgeError(
                f"{self.name}: {', '.join(bound)} already has its built-in vocabulary."
            )


def check_schemes(schemes: tuple[ConceptScheme, ...]) -> dict[str, str]:
    """Curated schemes with unique ids and names, none named like a built-in one, and each
    field covered by one scheme at most. Returns every scheme's name by id, built-in first."""
    names: dict[str, str] = dict(SCHEME_NAMES)
    owners = {label_key(name): scheme for scheme, name in SCHEME_NAMES.items()}
    fields: dict[VocabularyField, ConceptScheme] = {}
    for scheme in schemes:
        if scheme.id in names:
            raise InvalidKnowledgeError("Vocabulary ids must be unique.")
        owner = owners.setdefault(label_key(scheme.name), scheme.id)
        if owner != scheme.id:
            raise InvalidKnowledgeError(
                f"{scheme.name!r} already names the vocabulary {owner!r}; each vocabulary "
                "has its own name."
            )
        for field in scheme.fields:
            other = fields.setdefault(field, scheme)
            if other is not scheme:
                raise InvalidKnowledgeError(
                    f"{field.value} is covered by {other.name} already, so {scheme.name} "
                    "cannot cover it too."
                )
        names[scheme.id] = scheme.name
    return names


def field_schemes(schemes: Iterable[ConceptScheme]) -> dict[VocabularyField, str]:
    """The scheme each field's terms come from: built in, or bound by a curator."""
    bound: dict[VocabularyField, str] = dict(FIELD_SCHEMES)
    for scheme in schemes:
        for field in scheme.fields:
            bound.setdefault(field, scheme.id)
    return bound


@dataclass(frozen=True)
class VocabularyTerm:
    """One term, such as the eTOM process "Order Handling" or the Open API "TMF622"."""

    id: str
    # A built-in scheme, or the id of a curated one (``ConceptScheme``).
    scheme: str
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
    # Retired, with the term of the same type that takes its place if any (ADR-0121):
    # it stays readable everywhere but selection and matching leave it out.
    deprecated: bool = False
    replaced_by: str | None = None
    # The accepted suggestions that created or extended it, oldest first (ADR-0120).
    accepted: tuple[AcceptedFrom, ...] = ()
    # Outside references near enough to read across, though not the same (SKOS closeMatch).
    close_match: tuple[str, ...] = ()
    # Its place among its scheme's terms, 1 first, where their order means something: roles
    # run from strongest to weakest, so a system that plays several is named by its strongest
    # (review recommendation 10). None leaves it after the ranked ones.
    rank: int | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Term id"))
        if self.rank is not None and (isinstance(self.rank, bool) or self.rank < 1):
            raise InvalidKnowledgeError(f"{self.pref_label}: a rank is a whole number from 1.")
        object.__setattr__(self, "scheme", scheme_id(self.scheme))
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
        check_retirement(self, self.pref_label)
        check_entry(self, "label and code")

    @property
    def labels(self) -> tuple[str, ...]:
        """Every way it is written: its labels, then its code."""
        code = (self.notation,) if self.notation else ()
        return (self.pref_label, *self.alt_labels, *code)


def check_vocabulary(
    terms: tuple[VocabularyTerm, ...], names: Mapping[str, str] | None = None
) -> dict[str, VocabularyTerm]:
    """Each term in a scheme of the release, unique ids, each label or code naming one term
    of its scheme, broader terms in the same scheme, no cycles, and at most MAX_TERM_DEPTH
    levels. ``names`` are the release's schemes by id (``check_schemes``); the built-in ones
    when not given.

    Returns the terms by id, for checking what fields name.
    """
    known = names or SCHEME_NAMES
    ranked: dict[tuple[str, int], VocabularyTerm] = {}
    for term in terms:
        if term.scheme not in known:
            raise InvalidKnowledgeError(
                f"{term.pref_label} is in the vocabulary {term.scheme!r}, which is not in the "
                "catalogue."
            )
        if term.rank is not None:
            other = ranked.setdefault((term.scheme, term.rank), term)
            if other is not term:
                raise InvalidKnowledgeError(
                    f"{other.pref_label} and {term.pref_label} both rank {term.rank} among the "
                    f"{scheme_name(term.scheme, known)} terms; each rank names one."
                )
    return check_tree(
        terms,
        kind="term",
        max_depth=MAX_TERM_DEPTH,
        scheme=lambda term: term.scheme,
        owned_by=lambda term: f"the {scheme_name(term.scheme, known)} {term.pref_label}",
        outside=lambda term: f"in the {scheme_name(term.scheme, known)} vocabulary",
    )


def check_terms(
    term_ids: Iterable[str],
    scheme: str | None,
    terms: dict[str, VocabularyTerm],
    where: str,
    names: Mapping[str, str] | None = None,
) -> None:
    """The terms a field names exist, each once, in the field's own scheme; a field no
    scheme covers names none."""
    ids = tuple(term_ids)
    if ids and scheme is None:
        raise InvalidKnowledgeError(f"{where} names a term, but no vocabulary covers it.")
    name = scheme_name(scheme or "", names)
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError(f"{where} names one {name} more than once.")
    for term_id in ids:
        term = terms.get(term_id)
        if term is None or term.scheme != scheme:
            raise InvalidKnowledgeError(
                f"{where} names {term_id!r}, which is not in the {name} vocabulary."
            )


def term_id_for(scheme: str, label: str, taken: Iterable[str]) -> str:
    """A new term id from its scheme and label, such as ``etom-order-handling``; a curated
    scheme's id names its terms (``nfr-quality-availability``)."""
    used = set(taken)
    words = label_words(label)
    prefix = _ID_PREFIXES.get(scheme) or str(scheme).replace("_", "-")
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
    terms: Iterable[VocabularyTerm], scheme: str, reference: str
) -> VocabularyTerm | None:
    """The term of the scheme a reference means now (ADR-0121): one retired forwards to what
    replaced it, and one retired for good matches nothing. ``term_named`` sees every term."""
    every = tuple(terms)
    found = term_named(every, scheme, reference)
    return successor(every, found.id) if found is not None else None


def term_named(
    terms: Iterable[VocabularyTerm], scheme: str, reference: str
) -> VocabularyTerm | None:
    """A term of the scheme named by id, or by one of its labels or its code, ignoring case
    and punctuation, retired or not: whether a label is taken."""
    candidates = [item for item in terms if item.scheme == scheme]
    exact = next((item for item in candidates if item.id == reference), None)
    key = label_key(reference)
    if exact is not None or not key:
        return exact
    return next(
        (item for item in candidates if key in {label_key(label) for label in item.labels}),
        None,
    )


def match_value(
    terms: tuple[VocabularyTerm, ...], scheme: str, value: str
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
