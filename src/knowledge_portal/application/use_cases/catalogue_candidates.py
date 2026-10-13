"""Build a draft catalogue from documents: AI proposes, a maintainer decides.

Extraction reads one document of a draft, asks the configured model for
catalogue changes with citations, and stores them as undecided suggestions.
Nothing reaches the draft until a maintainer accepts a suggestion; accepting
merges it into the draft under the draft's revision check.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum
from uuid import uuid4

from smb_kernel.documents.ports import DocumentExtractorPort, DocumentStoragePort
from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import (
    DocumentExtractionError,
    DocumentExtractionTimeoutError,
    PersistenceError,
    UnsupportedDocumentError,
)
from knowledge_portal.application.ports.architecture_jobs import (
    JobProgress,
    ProgressReport,
    no_report,
)
from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.catalogue_candidates import (
    CatalogueCandidateRepositoryPort,
    ExtractionRun,
)
from knowledge_portal.application.ports.catalogue_extractor import (
    CatalogueExtractionUnsupportedError,
    CatalogueExtractorPort,
    ExtractionRequest,
    ExtractionSegment,
    KnownSystem,
    ProposedChange,
)
from knowledge_portal.application.ports.change_requests import ChangeRequestInboxPort
from knowledge_portal.application.ports.identity import Actor, require_maintainer
from knowledge_portal.application.ports.located_document_extractor import (
    LocatedDocumentExtractorPort,
    LocatedText,
)
from knowledge_portal.application.ports.system_matcher import (
    MatchableSystem,
    MatchQuery,
    MatchSuggestion,
    SystemMatcherPort,
    SystemMatchingError,
)
from knowledge_portal.application.use_cases.architecture_knowledge import (
    KnowledgeNotFoundError,
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateBasis,
    CandidateCitation,
    CandidateContent,
    CandidateDecisionConflictError,
    CandidateDependencyError,
    CandidateKind,
    CandidateMatch,
    CandidateNotFoundError,
    CandidateStatus,
    CatalogueCandidate,
    MatchRole,
    PossibleMatch,
    accept_from_change_request,
    apply_candidate,
    classify,
    find_system,
    missing_systems,
    needs_one_by_one,
    open_matches,
)
from knowledge_portal.domain.architecture.channels import (
    Channel,
    find_channel_among,
    merge_channels,
    same_channel,
)
from knowledge_portal.domain.architecture.journeys import (
    Journey,
    merge_journeys,
    same_journey,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
    KnowledgeConflictError,
    KnowledgeDocumentVersion,
    KnowledgeReleaseStatus,
    RelationshipKind,
)
from knowledge_portal.domain.architecture.offering_drafts import slug
from knowledge_portal.domain.architecture.products import (
    ProductOffering,
    find_offering,
    find_offering_component,
    find_order_type,
    merge_offerings,
    same_offering,
)
from knowledge_portal.domain.document.value_objects import DocumentVersionId, EvidenceBlockKind

IMAGE_TYPES = frozenset({"image/png", "image/jpeg"})
_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
# How much of a document's text one reading covers. Passages vary from a word to
# a page, so the budget counts characters: a cap on passages stopped a long
# specification a tenth of the way in. It covers a long SDD with its embedded
# documents, decks and workflow books (1.9 million characters); the model reads it
# in calls of at most 48,000 characters, so a full budget is some forty calls.
MAX_READ_CHARACTERS = 2_000_000
# A Word document's figures are each read in a call of their own by a vision model.
MAX_FIGURES = 40
# A Word document's embedded Office files read with it, and the largest read unpacked.
MAX_EMBEDDED = 20
MAX_EMBEDDED_BYTES = 25 * 1024 * 1024
# Read first: an embedded deck or document says more per character than a workbook.
_EMBEDDED_ORDER = (
    _DOCX,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
)
READING_VERSION = "document-reading-v7"
MAX_MATCHES_PER_NAME = 3
_FIGURE = re.compile(r"^image (\d+)\b", re.IGNORECASE)
_JOURNEY = re.compile(r"\bjourneys?\b", re.IGNORECASE)
# "WF-3-B", "WF 3C", "WF-12": a workflow's number and variant letter.
_WORKFLOW = re.compile(r"^[Ww][Ff][\s_-]*(?P<number>\d+)(?:[\s_-]*(?P<variant>[A-Z])\b)?")
# How much of the shorter workflow's steps the other must share to be the same workflow.
_SAME_STEPS = 0.5
# Headings over text with nothing architectural in it, after any numbering ("1.2 ").
_NO_ARCHITECTURE = re.compile(
    r"(?i)^(?:document |table of )?contents$|^(?:list of )?(?:figures|tables)$"
    r"|^(?:revision|version|document|change|amendment) history$"
    r"|^sign[- ]?offs?$|^approvals?$|^distribution(?: list)?$"
)
_NUMBERING = re.compile(r"^[\d.\s]+(?=\D)")
# A pasted payload is long and mostly braces, quotes and separators.
_MIN_PAYLOAD = 200
_PAYLOAD_SHARE = 0.12
_PAYLOAD_MARKS = frozenset('{}[]<>":,=/')
# A passage this short ("Yes", "N/A", a code) repeats without being a copied block.
_MIN_REPEATED = 80
_OWN_SECTION = re.compile(r"(?i)^\s*(?:product|journey)\s*:")
_SHEET_ROW = re.compile(r"(?:^|, )sheet \d+")
_CITED_PART = re.compile(r"^(?P<place>.*?)(?P<part> \(part \d+ of \d+\))?$")
_TITLE_SEPARATOR = re.compile(r"\s*[|—–:]\s*|\s+-\s+|^\s*-\s*")
# A combined system name ("OM-E2ESO") is split only into parts this short, like acronyms;
# "b2b-portal" is one name.
_MAX_ACRONYM = 5


def _new_sheets(
    passages: tuple[LocatedText, ...], seen: set[tuple[str, int]]
) -> tuple[tuple[LocatedText, ...], int]:
    """A workbook's passages without the sheets an earlier embedded workbook had word for word,
    and how many sheets were left out.

    An SDD embedded five versions of one workflow book; read whole, they spent most of
    the reading's budget on the same sheets. A sheet is its heading passage ("sheet 3")
    and its rows; one is the same as another when its name and every row's text are.
    Passages of other formats carry no sheets and are kept as they are.
    """
    sheets: dict[str, list[LocatedText]] = {}
    for item in passages:
        sheet = item.location.split(",", 1)[0]
        if sheet.startswith("sheet "):
            sheets.setdefault(sheet, []).append(item)
    keep: set[str] = set()
    for sheet, items in sheets.items():
        key = (items[0].text, hash(tuple(item.text for item in items)))
        if key not in seen:
            seen.add(key)
            keep.add(sheet)
    kept = tuple(
        item
        for item in passages
        if not item.location.startswith("sheet ") or item.location.split(",", 1)[0] in keep
    )
    return kept, len(sheets) - len(keep)


def _not_architecture(heading: str) -> bool:
    """A heading over text with no architecture in it: contents, history, sign-off."""
    return bool(_NO_ARCHITECTURE.match(" ".join(_NUMBERING.sub("", heading).split())))


def _payload(text: str) -> bool:
    """A sample message pasted into the document: JSON or XML, mostly punctuation."""
    stripped = text.strip()
    if len(stripped) < _MIN_PAYLOAD or stripped[0] not in "{[<":
        return False
    marks = sum(1 for character in stripped if character in _PAYLOAD_MARKS)
    return marks / len(stripped) >= _PAYLOAD_SHARE


def _architectural(
    passages: tuple[LocatedText, ...], warnings: list[str]
) -> tuple[LocatedText, ...]:
    """The passages with something architectural to say.

    A document's table of contents, lists of figures and tables, revision history,
    sign-off and distribution tables, and the sample payloads pasted into an
    interface section cost the reading's budget and gave it names to mistake for
    systems ("P4", "ADO"); they are left out. Nothing a heading does not mark so,
    and no payload shorter than a few lines, is.
    """
    kept = tuple(
        item
        for item in passages
        if not any(_not_architecture(heading) for heading in item.heading_path)
        and not (item.heading and _not_architecture(item.text))
        and not _payload(item.text)
    )
    if left := len(passages) - len(kept):
        warnings.append(
            f"{left} passage(s) with no architecture in them were left out: contents, "
            "revision history, sign-off and sample payloads."
        )
    return kept


def _once_each(
    passages: tuple[LocatedText, ...], warnings: list[str]
) -> tuple[tuple[LocatedText, ...], dict[str, tuple[str, ...]]]:
    """Each passage a document repeats word for word, read once, and where else it appears.

    An SDD copies whole blocks under each impacted system (the Backup GSM tables
    four times, the exit charges, the faulty device replacement); read every time,
    they cost calls and gave the same suggestions again. A suggestion read from the
    first is cited at every copy (``_cited_where_repeated``). Headings, short
    passages, spreadsheet rows and what sits under a "Product: X" or "Journey: X"
    heading are always kept: a row means something in its own table, which may be
    another workflow's, and the table reader reads such a section as its own.
    """
    first: dict[str, str] = {}
    repeats: dict[str, list[str]] = {}
    kept: list[LocatedText] = []
    for item in passages:
        if (
            item.heading
            or len(item.text) < _MIN_REPEATED
            or _SHEET_ROW.search(item.location)
            or any(_OWN_SECTION.match(heading) for heading in item.heading_path)
        ):
            kept.append(item)
            continue
        key = " ".join(item.text.casefold().split())
        if key in first:
            repeats.setdefault(first[key], []).append(item.location)
            continue
        first[key] = item.location
        kept.append(item)
    if repeated := sum(len(places) for places in repeats.values()):
        warnings.append(
            f"{repeated} repeated passage(s) were read once and cited wherever they appear."
        )
    return tuple(kept), {place: tuple(others) for place, others in repeats.items()}


def _cited_where_repeated(
    change: ProposedChange, repeats: dict[str, tuple[str, ...]]
) -> ProposedChange:
    """The change cited at every copy of the passages it was read from, with the same quote."""
    extra = tuple(
        (f"{other}{part['part'] or ''}", quote)
        for location, quote in change.citations
        if (part := _CITED_PART.match(location)) is not None
        for other in repeats.get(part["place"], ())
    )
    return replace(change, also_cited=(*change.also_cited, *extra)) if extra else change


def _figure_number(label: str) -> int | None:
    """N in the extractor's "Image N" (or "Image N — cell") label."""
    match = _FIGURE.match(label)
    return int(match.group(1)) if match else None


def _within_budget(
    located: tuple[LocatedText, ...], warnings: list[str]
) -> tuple[LocatedText, ...]:
    """The passages a reading covers: all of them, unless the text runs past the budget."""
    total = sum(len(item.text) for item in located)
    if total <= MAX_READ_CHARACTERS:
        return located
    size = 0
    for count, item in enumerate(located):
        size += len(item.text)
        if size > MAX_READ_CHARACTERS:
            kept = located[:count]
            last = kept[-1].location if kept else "the start"
            warnings.append(
                f"Only the first {size - len(item.text):,} of {total:,} characters were read, "
                f"up to {last}."
            )
            return kept
    return located


# Accepted in this order, so what a suggestion refers to is in the draft first.
_ORDER = (
    CandidateKind.LANDSCAPE_DOMAIN,
    CandidateKind.SYSTEM,
    CandidateKind.PLACEMENT,
    CandidateKind.COMPONENT,
    CandidateKind.CAPABILITY,
    CandidateKind.CONSTRAINT,
    CandidateKind.RELATIONSHIP,
    # A channel names the system its orders enter through,
    CandidateKind.CHANNEL,
    # then an offering names systems and channels that must be in the draft first,
    CandidateKind.PRODUCT,
    # its rules belong to it,
    CandidateKind.OFFERING_RULE,
    # a question is asked of an offering,
    CandidateKind.QUESTION,
    # and a journey names systems and the offering it fulfils.
    CandidateKind.JOURNEY,
    # A concept covers capabilities the draft must hold first,
    CandidateKind.CONCEPT,
    # and a component is linked to concepts and belongs to an offering.
    CandidateKind.COMPONENT_LINK,
    # A vocabulary term links values written in channels, offerings and journeys.
    CandidateKind.VOCABULARY_TERM,
)

CommitFence = Callable[[], None]


@dataclass(frozen=True)
class CandidateView:
    candidate: CatalogueCandidate
    match: CandidateMatch
    # The possible matches still to decide against the draft as it is now.
    open_matches: tuple[PossibleMatch, ...] = ()
    # The draft systems its references resolve to now, by name; None when not in the draft.
    system_name: str | None = None
    target_name: str | None = None
    # The system references it makes that no draft system answers to yet.
    missing_systems: tuple[str, ...] = ()


def _view(candidate: CatalogueCandidate, release: ArchitectureKnowledge) -> CandidateView:
    # A channel's subject is the channel, not a system that may share its id; likewise a
    # concept's, and a component link's offering.
    channel = candidate.content.kind in {
        CandidateKind.CHANNEL,
        CandidateKind.QUESTION,
        CandidateKind.CONCEPT,
        CandidateKind.COMPONENT_LINK,
        CandidateKind.VOCABULARY_TERM,
    }
    source = None if channel else find_system(release, candidate.content.system_id)
    target = None if channel else find_system(release, candidate.content.target_system_id or "")
    return CandidateView(
        candidate,
        classify(candidate.content, release),
        open_matches(candidate, release),
        source.name if source else None,
        target.name if target else None,
        missing_systems(candidate.content, release),
    )


class SubjectKind(StrEnum):
    """What a name suggestions wait for really is, as a person says it on Decide."""

    SYSTEM = "system"
    OFFERING = "offering"


@dataclass(frozen=True)
class SettledSubject:
    # Waiting suggestions now said of it as what it is, and suggestions added for it.
    retyped: int
    added: int


@dataclass(frozen=True)
class CandidateOverview:
    release: ArchitectureKnowledge
    candidates: tuple[CandidateView, ...]
    runs: tuple[ExtractionRun, ...]


@dataclass
class _Proposal:
    """Identical proposals from one document, merged; a stated one outweighs an inference."""

    citations: list[CandidateCitation]
    quote: str
    source_name: str
    target_name: str
    basis: CandidateBasis
    rationale: str | None
    # What proposed it, when not the reading's model (the table reader, ADR-0093).
    reader: tuple[str, str] | None = None


def _references(
    content: CandidateContent, proposal: _Proposal, release: ArchitectureKnowledge
) -> tuple[tuple[MatchRole, str], ...]:
    """The system names in a proposal that no draft system answers to, as written."""
    if content.kind in {
        CandidateKind.LANDSCAPE_DOMAIN,
        CandidateKind.PRODUCT,
        CandidateKind.OFFERING_RULE,
        CandidateKind.JOURNEY,
        CandidateKind.CHANNEL,
    }:
        return ()
    if content.kind is CandidateKind.SYSTEM:
        unknown = classify(content, release) is CandidateMatch.NEW
        return ((MatchRole.SYSTEM, content.name),) if unknown else ()
    found: list[tuple[MatchRole, str]] = []
    if find_system(release, content.system_id) is None:
        found.append((MatchRole.SYSTEM, proposal.source_name or content.system_id))
    target = content.target_system_id
    if target is not None and find_system(release, target) is None:
        found.append((MatchRole.TARGET, proposal.target_name or target))
    return tuple(found)


def _canonical(
    changes: tuple[ProposedChange, ...], release: ArchitectureKnowledge
) -> tuple[ProposedChange, ...]:
    """Every proposal naming its systems by the id they will have once suggested systems exist.

    A document read in many calls names one system several ways: "CBCM / CRMGW"
    in its own row and "CRM GW" in another system's integrations. Against the
    draft with the suggested systems added, each name resolves to one id, so the
    same dependency is suggested once and never as a system linked to itself.

    A product is not a system: a "system" the draft does not have, named like an
    offering the draft has or the document suggests, is left out, and the
    constraints said of it become that offering's rules.
    """
    # The draft's offerings and those suggested beside it, which a journey may name.
    offerings = (
        *release.products,
        *(item.content.product for item in changes if item.content.product is not None),
    )

    def offering_named(*references: str) -> ProductOffering | None:
        if any(find_system(release, item) is not None for item in references if item):
            return None
        return next(
            (found for item in references if item and (found := find_offering(offerings, item))),
            None,
        )

    changes = tuple(
        change
        for change in changes
        if change.content.kind is not CandidateKind.SYSTEM
        or offering_named(change.content.system_id, change.content.name) is None
    )
    provisional = release
    for change in changes:
        if change.content.kind is CandidateKind.SYSTEM:
            try:
                provisional = apply_candidate(change.content, provisional)
            except (InvalidKnowledgeError, CandidateDependencyError):
                continue

    def resolved(reference: str) -> str:
        found = find_system(provisional, reference)
        return found.id if found is not None else reference

    # Likewise the channels an order type or a step may name.
    channels = (
        *release.channels,
        *(item.content.channel for item in changes if item.content.channel is not None),
    )

    def channel_ids(references: tuple[str, ...]) -> tuple[str, ...]:
        found = (find_channel_among(channels, item) for item in references)
        return tuple(
            dict.fromkeys(
                item.id if item is not None else reference
                for item, reference in zip(found, references, strict=True)
            )
        )

    result: list[ProposedChange] = []
    # Channels an offering's order types name that nothing suggests: "Applicable Channels:
    # BCRM, B2B, SMB App" read into the order types only left the offering waiting for
    # channels nobody could accept.
    named: dict[str, ProposedChange] = {}
    # Likewise the systems a stated dependency names that nothing suggests.
    unsuggested: dict[str, ProposedChange] = {}
    for change in changes:
        content = change.content
        if content.kind is CandidateKind.LANDSCAPE_DOMAIN:
            # Its subject is a domain, not a system.
            result.append(change)
            continue
        ruled = (
            offering_named(content.system_id, change.source_name)
            if content.kind in {CandidateKind.OFFERING_RULE, CandidateKind.CONSTRAINT}
            and find_system(provisional, content.system_id) is None
            else None
        )
        if ruled is not None or content.kind is CandidateKind.OFFERING_RULE:
            subject = ruled.id if ruled is not None else content.system_id
            rule = CandidateContent(CandidateKind.OFFERING_RULE, subject, text=content.text)
            result.append(replace(change, content=rule))
            continue
        if content.kind is CandidateKind.CHANNEL and content.channel is not None:
            entry = content.channel.entry_system_id
            channel = replace(content.channel, entry_system_id=resolved(entry) if entry else None)
            result.append(replace(change, content=replace(content, channel=channel)))
            continue
        if content.kind is CandidateKind.PRODUCT and content.product is not None:
            offering = content.product
            parts = tuple(
                replace(
                    part,
                    responsibilities=tuple(
                        replace(duty, system_id=resolved(duty.system_id))
                        for duty in part.responsibilities
                    ),
                )
                for part in offering.components
            )
            orders = tuple(
                replace(item, channels=channel_ids(item.channels)) for item in offering.order_types
            )
            for reference in (name for item in offering.order_types for name in item.channels):
                key = " ".join(reference.casefold().split())
                if not key or key in named or find_channel_among(channels, reference):
                    continue
                enters = find_system(provisional, reference)
                channel = Channel(
                    slug(reference),
                    reference.strip(),
                    entry_system_id=enters.id if enters is not None else None,
                )
                named[key] = replace(
                    change,
                    content=CandidateContent(
                        CandidateKind.CHANNEL, channel.id, name=channel.name, channel=channel
                    ),
                    source_name=channel.name,
                    target_name="",
                    rationale=None,
                    reader=None,
                )
            result.append(
                replace(
                    change,
                    content=replace(
                        content,
                        product=replace(offering, components=parts, order_types=orders),
                    ),
                )
            )
            continue
        if content.kind is CandidateKind.JOURNEY and content.journey is not None:
            journey = _canonical_journey(content.journey, resolved, offerings)
            journey = replace(
                journey,
                activities=tuple(
                    replace(item, channels=channel_ids(item.channels))
                    for item in journey.activities
                ),
            )
            result.append(replace(change, content=replace(content, journey=journey)))
            continue
        target = content.target_system_id
        content = replace(
            content,
            system_id=resolved(content.system_id),
            target_system_id=resolved(target) if target else target,
        )
        result.append(replace(change, content=content))
        if content.kind is CandidateKind.RELATIONSHIP and change.basis is CandidateBasis.STATED:
            ends = (
                (content.system_id, change.source_name),
                (content.target_system_id or "", change.target_name),
            )
            for reference, written in ends:
                system = _named_system(reference, written, provisional, offering_named)
                if system is not None and system.system_id not in unsuggested:
                    unsuggested[system.system_id] = replace(
                        change,
                        content=system,
                        source_name=system.name,
                        target_name="",
                        rationale=None,
                        reader=None,
                    )
    return (*result, *named.values(), *unsuggested.values())


# Words a table writes where it has no system's name.
_NO_SYSTEM = frozenset(
    {"system", "systems", "unknown", "n/a", "na", "tbd", "tbc", "none", "other", "others"}
)


def _named_system(
    reference: str,
    written: str,
    provisional: ArchitectureKnowledge,
    offering_named: Callable[..., ProductOffering | None],
) -> CandidateContent | None:
    """The system a stated dependency names that neither the draft nor a suggestion adds.

    An interface table names both its ends as systems: "vCPE DO | FortiGuard" read
    into eleven dependencies left all of them waiting for a "vCPE DO" nothing
    suggested. A blank, placeholder or offering's name is not one.
    """
    name = " ".join(written.split())
    if (
        not reference
        or not name
        or name.casefold() in _NO_SYSTEM
        or find_system(provisional, reference) is not None
        or offering_named(reference, name) is not None
    ):
        return None
    return CandidateContent(CandidateKind.SYSTEM, reference, name=name)


def _canonical_journey(
    journey: Journey,
    resolved: Callable[[str], str],
    offerings: tuple[ProductOffering, ...],
) -> Journey:
    """A journey naming its systems, offering, order type and components by the ids they
    will have; what is not found stays as written, for the review to show."""
    offering = find_offering(offerings, journey.product_id or "")
    order = find_order_type(offering, journey.order_type_code or "") if offering else None

    def component(reference: str) -> str:
        found = find_offering_component(offering, reference) if offering else None
        return found.id if found is not None else reference

    def systems(reference: str) -> tuple[str, ...]:
        """A system a step names, or the systems a combined name joins: a workflow book
        writes "OM-E2ESO" for a stage more than one system takes part in. A name
        nothing answers to is split at its hyphens when each part is short, like an
        acronym; the parts that are systems stand for it, the first performing the
        step and the others supporting it. Otherwise it stays as written."""
        found = resolved(reference)
        if found != reference:
            return (found,)
        parts = [part for part in re.split(r"[-–]", reference) if part]
        if len(parts) < 2 or any(len(part) > _MAX_ACRONYM for part in parts):
            return (reference,)
        known = [resolved(part) for part in parts if resolved(part) != part]
        return tuple(dict.fromkeys(known)) or (reference,)

    activities = []
    for item in journey.activities:
        performers = systems(item.performing_system_id) if item.performing_system_id else ()
        supporting = [name for ref in item.supporting_system_ids for name in systems(ref)]
        activities.append(
            replace(
                item,
                performing_system_id=performers[0] if performers else None,
                supporting_system_ids=tuple(
                    name
                    for name in dict.fromkeys((*performers[1:], *supporting))
                    if name != (performers[0] if performers else None)
                ),
                component_ids=tuple(dict.fromkeys(component(name) for name in item.component_ids)),
            )
        )
    return replace(
        journey,
        product_id=offering.id if offering is not None else journey.product_id,
        order_type_code=order.code if order is not None else journey.order_type_code,
        activities=tuple(activities),
    )


def _workflow(name: str) -> tuple[str, str] | None:
    """A workflow journey's number and what its name says after it: "WF-3-B Order
    fulfillment — GPON" gives ("3B", "order fulfillment — gpon"); None for other names."""
    match = _WORKFLOW.match(name.strip())
    if match is None:
        return None
    rest = name.strip()[match.end() :]
    # "—", "|", ":" and a spaced "-" separate a title's parts however it was written: the
    # reader writes "WF-3A Order fulfillment — Business Pro", a model "... | Business Pro".
    rest = _TITLE_SEPARATOR.sub(" ", rest)
    return f"{match['number']}{match['variant'] or ''}", " ".join(rest.casefold().split())


def _same_workflow(first: Journey, second: Journey) -> bool:
    """Whether two journeys are one workflow read twice: the same WF number, one name the
    start of the other, and most of the shorter one's steps in the longer one.

    An SDD embeds versions of one workflow book: "WF-3-B" in one and "WF-3B" in
    another, or a model naming only "WF-3A Order fulfillment" from a table the
    reader read whole. "WF-1 Order fulfillment" and "WF-1 Up/Downgrade" are two.
    """
    one, other = _workflow(first.name), _workflow(second.name)
    if one is None or other is None or one[0] != other[0]:
        return False
    if not (one[1].startswith(other[1]) or other[1].startswith(one[1])):
        return False
    steps = [
        {" ".join(item.name.casefold().split()) for item in journey.activities}
        for journey in (first, second)
    ]
    shorter = min(len(steps[0]), len(steps[1]))
    return shorter > 0 and len(steps[0] & steps[1]) / shorter >= _SAME_STEPS


def _one_journey_each(changes: tuple[ProposedChange, ...]) -> tuple[ProposedChange, ...]:
    """Every reading of one journey as one suggestion (ADR-0096).

    A journey section read in several calls, or by the table reader and the
    model, gives one journey in parts; they merge as offerings do. So do two
    readings of one workflow (``_same_workflow``).
    """
    result: list[ProposedChange] = []
    journeys: list[Journey | None] = []
    for change in changes:
        journey = change.content.journey
        index = next(
            (
                number
                for number, kept in enumerate(journeys)
                if journey is not None
                and kept is not None
                and (same_journey(kept, journey) or _same_workflow(kept, journey))
            ),
            None,
        )
        first_journey = journeys[index] if index is not None else None
        if index is None or journey is None or first_journey is None:
            result.append(change)
            journeys.append(journey)
            continue
        first = result[index]
        merged = merge_journeys(first_journey, journey)
        journeys[index] = merged
        result[index] = replace(
            first,
            content=replace(first.content, journey=merged),
            also_cited=(*first.also_cited, *change.citations),
            basis=(
                CandidateBasis.STATED
                if CandidateBasis.STATED in {first.basis, change.basis}
                else first.basis
            ),
        )
    return tuple(result)


def _one_channel_each(changes: tuple[ProposedChange, ...]) -> tuple[ProposedChange, ...]:
    """Every reading of one channel as one suggestion: the first's facts win, with every
    reading's citations."""
    result: list[ProposedChange] = []
    channels: list[Channel | None] = []
    for change in changes:
        channel = change.content.channel
        index = next(
            (
                number
                for number, kept in enumerate(channels)
                if channel is not None and kept is not None and same_channel(kept, channel)
            ),
            None,
        )
        first_channel = channels[index] if index is not None else None
        if index is None or channel is None or first_channel is None:
            result.append(change)
            channels.append(channel)
            continue
        first = result[index]
        merged = merge_channels(first_channel, channel)
        channels[index] = merged
        result[index] = replace(
            first,
            content=replace(first.content, channel=merged),
            also_cited=(*first.also_cited, *change.citations),
            basis=(
                CandidateBasis.STATED
                if CandidateBasis.STATED in {first.basis, change.basis}
                else first.basis
            ),
        )
    return tuple(result)


def _one_offering_each(changes: tuple[ProposedChange, ...]) -> tuple[ProposedChange, ...]:
    """Every reading of one product offering as one suggestion (ADR-0095).

    A product section read in several calls, or by the table reader and the
    model, gives one offering in parts; they merge, the first reading's facts
    winning, with every part's citations.
    """
    result: list[ProposedChange] = []
    # Each kept change's offering, beside it, so a later reading can find and merge into it.
    offerings: list[ProductOffering | None] = []
    for change in changes:
        offering = change.content.product
        index = next(
            (
                number
                for number, kept in enumerate(offerings)
                if offering is not None and kept is not None and same_offering(kept, offering)
            ),
            None,
        )
        first_offering = offerings[index] if index is not None else None
        if index is None or offering is None or first_offering is None:
            result.append(change)
            offerings.append(offering)
            continue
        first = result[index]
        merged = merge_offerings(first_offering, offering)
        offerings[index] = merged
        result[index] = replace(
            first,
            content=replace(first.content, product=merged),
            also_cited=(*first.also_cited, *change.citations),
            basis=(
                CandidateBasis.STATED
                if CandidateBasis.STATED in {first.basis, change.basis}
                else first.basis
            ),
        )
    return tuple(result)


def _subject(content: CandidateContent) -> tuple[object, ...] | None:
    """What a suggestion is about, when one suggestion should say all of it; None otherwise.

    A long document mentions CWOM in thirty places, each reading worded a little
    differently; offered thirty times, the system buries the review. Offerings,
    journeys and channels are merged whole as they are read (``_one_offering_each``).
    """
    kind = content.kind
    if kind is CandidateKind.SYSTEM:
        return (kind, content.system_id)
    if kind is CandidateKind.COMPONENT:
        return (kind, content.system_id, content.component_id)
    if kind is CandidateKind.CAPABILITY:
        return (kind, content.system_id, content.capability_id)
    if kind in {CandidateKind.CONSTRAINT, CandidateKind.OFFERING_RULE}:
        return (kind, content.system_id, " ".join(content.text.casefold().split()))
    if kind is CandidateKind.RELATIONSHIP:
        return (kind, content.system_id, content.target_system_id, content.relationship_kind)
    return None


def _labels(*groups: Sequence[str]) -> tuple[str, ...]:
    """Names in order, each once whatever its case."""
    seen: dict[str, str] = {}
    for group in groups:
        for label in group:
            if label.strip():
                seen.setdefault(label.strip().casefold(), label.strip())
    return tuple(seen.values())


def _first[T](values: Sequence[T | None]) -> T | None:
    return next((value for value in values if value), None)


def _merged_content(lead: CandidateContent, others: list[CandidateContent]) -> CandidateContent:
    """One suggestion's content from several about the same thing: the lead's facts,
    and what only the others say added, never replacing the lead's."""
    every = [lead, *others]
    if lead.kind in {CandidateKind.SYSTEM, CandidateKind.COMPONENT}:
        names = _labels(*([item.name or "", *item.aliases] for item in every))
        name = (lead.name or "").casefold()
        return replace(
            lead,
            aliases=tuple(label for label in names if label.casefold() != name),
            name_ar=_first([item.name_ar for item in every]),
            description=_first([item.description for item in every]),
            technology=_first([item.technology for item in every]),
        )
    if lead.kind is CandidateKind.CAPABILITY:
        return replace(
            lead,
            triggers=_labels(*(item.triggers for item in every)),
            concept_ids=tuple(dict.fromkeys(cid for item in every for cid in item.concept_ids)),
            component_id=_first([item.component_id for item in every]),
        )
    return lead


def _one_each(
    proposed: dict[CandidateContent, _Proposal],
) -> tuple[dict[CandidateContent, _Proposal], dict[CandidateKind, int]]:
    """One suggestion per system, component, capability, constraint and dependency, and how
    many were merged into others, by kind.

    The lead is what the table reader read, else the first stated reading, else the
    first; every reading's citations stay, each with its own quote. A stated
    reading outweighs an inference.
    """
    groups: dict[object, list[tuple[CandidateContent, _Proposal]]] = {}
    for content, item in proposed.items():
        key = _subject(content)
        groups.setdefault(content if key is None else key, []).append((content, item))
    kept: dict[CandidateContent, _Proposal] = {}
    merged: dict[CandidateKind, int] = {}
    for group in groups.values():
        if len(group) == 1:
            kept[group[0][0]] = group[0][1]
            continue
        lead_content, lead = next(
            (pair for pair in group if pair[1].reader is not None),
            next((pair for pair in group if pair[1].basis is CandidateBasis.STATED), group[0]),
        )
        others = [pair for pair in group if pair[0] != lead_content]
        stated = any(item.basis is CandidateBasis.STATED for _, item in group)
        item = replace(
            lead,
            citations=[
                *lead.citations,
                *(cited for _, other in others for cited in other.citations),
            ],
            basis=CandidateBasis.STATED if stated else lead.basis,
            rationale=None if stated else lead.rationale,
        )
        content = _merged_content(lead_content, [other for other, _ in others])
        kept[content] = item
        merged[content.kind] = merged.get(content.kind, 0) + len(others)
    return kept, merged


def _one_way(
    proposed: dict[CandidateContent, _Proposal],
) -> tuple[dict[CandidateContent, _Proposal], int]:
    """A dependency listed from both ends as one suggestion, and how many were merged.

    An integrations column lists BCRM under CBCM and CBCM under BCRM. When
    neither says how they depend, the second is the same link read from its
    other end; connected systems are found both ways (ADR-0087). A typed
    dependency keeps its direction and is never merged.
    """
    kept: dict[CandidateContent, _Proposal] = {}
    seen: dict[tuple[str, str], CandidateContent] = {}
    merged = 0
    for content, item in proposed.items():
        if (
            content.kind is CandidateKind.RELATIONSHIP
            and content.relationship_kind is RelationshipKind.UNSPECIFIED
        ):
            source = content.system_id.casefold()
            target = (content.target_system_id or "").casefold()
            first = seen.get((target, source))
            if first is not None:
                kept[first].citations.extend(item.citations)
                if item.basis is CandidateBasis.STATED:
                    kept[first].basis, kept[first].rationale = CandidateBasis.STATED, None
                merged += 1
                continue
            seen.setdefault((source, target), content)
        kept[content] = item
    return kept, merged


def _self_dependency(content: CandidateContent) -> bool:
    """A dependency whose source and target are the same system."""
    return (
        content.kind is CandidateKind.RELATIONSHIP
        and content.system_id.casefold() == (content.target_system_id or "").casefold()
    )


def _linked(content: CandidateContent, release: ArchitectureKnowledge) -> bool:
    """The draft already has some dependency between these two systems."""
    source = find_system(release, content.system_id)
    target = find_system(release, content.target_system_id or "")
    return (
        source is not None
        and target is not None
        and any(
            item.source_system_id == source.id and item.target_system_id == target.id
            for item in release.relationships
        )
    )


def _accepted(
    release: ArchitectureKnowledge, merged: ArchitectureKnowledge
) -> ArchitectureKnowledge:
    """The draft once, with what accepting suggestions changed: one revision, however many."""
    return release.updated(
        systems=merged.systems,
        relationships=merged.relationships,
        landscape_domains=merged.landscape_domains,
        products=merged.products,
        journeys=merged.journeys,
        channels=merged.channels,
        sources=merged.sources,
        change_history=merged.change_history,
        business_capabilities=merged.business_capabilities,
        vocabulary=merged.vocabulary,
    )


def _draft(knowledge: ManageArchitectureKnowledge, release_id: str) -> ArchitectureKnowledge:
    release = knowledge.get(release_id)
    if release.status is not KnowledgeReleaseStatus.DRAFT:
        raise KnowledgeConflictError("Suggestions apply to drafts only.")
    return release


class ProposeCatalogueChanges:
    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        storage: DocumentStoragePort,
        located: LocatedDocumentExtractorPort,
        documents: DocumentExtractorPort,
        extractor: CatalogueExtractorPort,
        matcher: SystemMatcherPort,
        candidates: CatalogueCandidateRepositoryPort,
        clock: ClockPort,
    ) -> None:
        self._knowledge = knowledge
        self._storage = storage
        self._located = located
        self._documents = documents
        self._extractor = extractor
        self._matcher = matcher
        self._candidates = candidates
        self._clock = clock

    @property
    def profile(self) -> str:
        # How a document is cut into passages is part of its reading, as the prompt is:
        # a change to it reads a document again rather than reusing the last reading.
        return f"{self._extractor.model}:{self._extractor.prompt_version}+{READING_VERSION}"

    def document(self, release_id: str, version_id: str, actor: Actor) -> KnowledgeDocumentVersion:
        """The draft document to read, refused up front if the model cannot read it."""
        require_maintainer(actor)
        release = _draft(self._knowledge, release_id)
        version = next((item for item in release.documents if item.id == version_id), None)
        if version is None:
            raise KnowledgeNotFoundError("This document is not part of the draft.")
        if version.mime_type in IMAGE_TYPES and not self._extractor.supports_images:
            raise CatalogueExtractionUnsupportedError(
                "The configured model cannot read images; upload the content as Word, PDF or Excel."
            )
        return version

    def _embedded(self, stored: bytes, warnings: list[str]) -> tuple[LocatedText, ...]:
        """The passages of the Office files a Word document embeds, after its own.

        An annex's workflows or a solution deck often sit in embedded files. Each is
        read with the same checks and limits as an upload, cited "embedded N, slide 3",
        and sits under the headings it is embedded at and its file name. One that
        cannot be read is counted, never fatal.
        """
        found = self._located.embedded(_DOCX, stored, MAX_EMBEDDED_BYTES)
        passages: list[LocatedText] = []
        unread = found.others
        # Word documents and decks before workbooks, each kind in document order, so
        # the character budget is spent on what says most.
        ordered = sorted(
            found.parts,
            key=lambda part: (
                _EMBEDDED_ORDER.index(part.mime_type)
                if part.mime_type in _EMBEDDED_ORDER
                else len(_EMBEDDED_ORDER),
                part.number,
            ),
        )
        seen_sheets: set[tuple[str, int]] = set()
        repeated = 0
        for count, part in enumerate(ordered):
            if count == MAX_EMBEDDED:
                unread += len(found.parts) - MAX_EMBEDDED
                break
            try:
                inner = self._located.extract(part.mime_type, part.content)
            except (
                DocumentExtractionError,
                DocumentExtractionTimeoutError,
                UnsupportedDocumentError,
            ):
                unread += 1
                continue
            inner, skipped = _new_sheets(inner, seen_sheets)
            repeated += skipped
            passages.extend(
                replace(
                    item,
                    location=f"embedded {part.number}, {item.location}",
                    heading_path=(*part.headings, part.filename, *item.heading_path),
                    block=f"embedded {part.number}, {item.block}" if item.block else None,
                )
                for item in inner
            )
        if unread:
            warnings.append(
                f"{unread} embedded object(s) were not read: only Word, PowerPoint and Excel "
                "files are, each within the upload limits."
            )
        if repeated:
            warnings.append(
                f"{repeated} embedded sheet(s) were left out: an embedded workbook read before "
                "has the same sheet, word for word."
            )
        return tuple(passages)

    def _figures(
        self, stored: bytes, numbered: int, warnings: list[str]
    ) -> tuple[ExtractionSegment, ...]:
        """A Word document's figures, for a vision model: diagrams often say what text does not.

        The extractor sanitises each image and leaves out decorative ones (logos,
        icons); a figure repeated on many pages is read once. Each figure keeps
        the headings it sits under and is cited as "image N", its place among
        the document's images.
        """
        extracted = self._documents.extract_structured(_DOCX, stored)
        assets = {item.block_id: item for item in extracted.assets}
        found = [
            (number, assets[block.id])
            for block in extracted.evidence_blocks
            if block.kind is EvidenceBlockKind.IMAGE
            and block.id in assets
            and (number := _figure_number(block.label)) is not None
        ]
        if not found:
            return ()
        headings = self._located.figure_headings(_DOCX, stored)
        if not self._extractor.supports_images:
            warnings.append(
                f"{len(found)} figure(s) were not read: the configured model cannot read images."
            )
            return ()
        figures: list[ExtractionSegment] = []
        seen: set[str] = set()
        for number, asset in found:
            if asset.checksum_sha256 in seen:
                continue
            seen.add(asset.checksum_sha256)
            if len(figures) == MAX_FIGURES:
                warnings.append(f"Only the first {MAX_FIGURES} figures were read.")
                break
            figures.append(
                ExtractionSegment(
                    numbered + len(figures) + 1,
                    f"image {number}",
                    image_mime_type=asset.mime_type,
                    image=self._documents.extract_asset(_DOCX, stored, asset.package_path),
                    section=headings.get(asset.package_path, ()),
                )
            )
        return tuple(figures)

    def execute(
        self,
        release_id: str,
        version_id: str,
        fence: CommitFence,
        report: ProgressReport = no_report,
    ) -> ExtractionRun:
        report(JobProgress("opening"))
        release = _draft(self._knowledge, release_id)
        version = next((item for item in release.documents if item.id == version_id), None)
        if version is None:
            raise KnowledgeNotFoundError("This document is no longer part of the draft.")
        stored = self._storage.get(DocumentVersionId(version.storage_key))
        warnings: list[str] = []
        # Where each passage read once also appears, word for word.
        repeats: dict[str, tuple[str, ...]] = {}
        if version.mime_type in IMAGE_TYPES:
            image = self._documents.extract_asset(version.mime_type, stored, "image")
            segments: tuple[ExtractionSegment, ...] = (
                ExtractionSegment(1, "image", image_mime_type=version.mime_type, image=image),
            )
        else:
            located = self._located.extract(version.mime_type, stored)
            if version.mime_type == _DOCX:
                located += self._embedded(stored, warnings)
            located = _architectural(located, warnings)
            located, repeats = _once_each(located, warnings)
            located = _within_budget(located, warnings)
            segments = tuple(
                ExtractionSegment(
                    number,
                    item.location,
                    item.text,
                    section=item.heading_path,
                    cells=item.cells,
                )
                for number, item in enumerate(located, start=1)
            )
            if version.mime_type == _DOCX:
                segments += self._figures(stored, len(segments), warnings)
        known = tuple(
            KnownSystem(
                item.id, item.name, item.aliases, tuple(part.name for part in item.components)
            )
            for item in release.systems
        )

        def still_in_draft() -> None:
            """Stop between calls once the document left the draft, freeing the worker."""
            current = self._knowledge.get(release_id)
            if current.status is not KnowledgeReleaseStatus.DRAFT or all(
                item.id != version_id for item in current.documents
            ):
                raise KnowledgeConflictError("This document is no longer part of the draft.")

        def reading(done: int, total: int) -> None:
            report(JobProgress("reading", done, total))

        proposal = self._extractor.propose(
            ExtractionRequest(version.title, segments, known, still_in_draft, reading)
        )
        model, prompt_version = proposal.model, proposal.prompt_version
        warnings.extend(proposal.warnings)
        proposed: dict[CandidateContent, _Proposal] = {}
        kinds: dict[CandidateContent, list[tuple[bool, RelationshipKind | None]]] = {}
        self_linked = 0
        read = tuple(_cited_where_repeated(change, repeats) for change in proposal.changes)
        canonical = _canonical(read, release)
        for change in _one_journey_each(_one_offering_each(_one_channel_each(canonical))):
            if _self_dependency(change.content):
                # A table row naming one system twice is not a dependency, and
                # accepting it would fail; it is left out rather than offered.
                self_linked += 1
                continue
            citations = [CandidateCitation(location, quote) for location, quote in change.citations]
            key = _identity(change.content)
            kinds.setdefault(key, []).append(
                (change.basis is CandidateBasis.STATED, change.content.relationship_kind)
            )
            current = proposed.get(key)
            if current is None:
                proposed[key] = _Proposal(
                    citations,
                    change.quote,
                    change.source_name,
                    change.target_name,
                    change.basis,
                    change.rationale,
                    change.reader,
                )
                continue
            current.citations.extend(citations)
            if change.basis is CandidateBasis.STATED:
                current.basis, current.rationale = CandidateBasis.STATED, None
        proposed, same = _one_each(
            {_settled(key, kinds[key]): item for key, item in proposed.items()}
        )
        proposed, both_ways = _one_way(proposed)
        skipped = linked = 0
        kept: dict[CandidateContent, _Proposal] = {}
        for content, item in proposed.items():
            if classify(content, release) is CandidateMatch.ALREADY_PRESENT:
                skipped += 1
            elif item.basis is CandidateBasis.INFERRED and _linked(content, release):
                linked += 1
            else:
                kept[content] = item
        report(JobProgress("matching"))
        matches, matched = self._matches(kept, release, warnings)
        now = self._clock.now()
        candidates = [
            CatalogueCandidate(
                uuid4().hex,
                release.id,
                version.id,
                content,
                tuple(dict.fromkeys(item.citations)),
                *(item.reader or (model, prompt_version)),
                now,
                basis=item.basis,
                rationale=item.rationale,
                possible_matches=tuple(
                    PossibleMatch(role, written, match.system_id, match.reason)
                    for role, written in _references(content, item, release)
                    for match in matches.get(written.casefold(), ())
                ),
            )
            for content, item in kept.items()
        ]
        if self_linked:
            warnings.append(
                f"{self_linked} dependency suggestion(s) were left out because they linked a "
                "system to itself."
            )
        if same:
            merged = ", ".join(
                f"{count} {kind.value.replace('_', ' ')}" for kind, count in same.items()
            )
            warnings.append(f"Suggestions about the same thing were merged into one: {merged}.")
        if both_ways:
            warnings.append(
                f"{both_ways} dependency suggestion(s) listed from both systems were merged "
                "into one."
            )
        if skipped:
            warnings.append(f"{skipped} suggestion(s) already in the draft were left out.")
        if linked:
            warnings.append(
                f"{linked} inferred dependency suggestion(s) were left out because the draft "
                "already links those systems."
            )
        if not proposed:
            warnings.append("No catalogue content was found in this document.")
        elif not any(content.kind is CandidateKind.JOURNEY for content in proposed) and any(
            _JOURNEY.search(" ".join((*item.section, item.text))) for item in segments
        ):
            warnings.append(
                "The document mentions journeys, but none was read: a journey is read where "
                "the document sets out the activities of an order type in order."
            )
        run = ExtractionRun(
            uuid4().hex,
            release.id,
            version.id,
            model,
            prompt_version,
            len(candidates),
            tuple(dict.fromkeys(warnings)),
            now,
            self._matcher.model if matched else None,
            self._matcher.prompt_version if matched else None,
        )
        report(JobProgress("saving"))
        fence()
        self._candidates.replace_proposals(run, tuple(candidates))
        return run

    def _matches(
        self,
        proposals: dict[CandidateContent, _Proposal],
        release: ArchitectureKnowledge,
        warnings: list[str],
    ) -> tuple[dict[str, tuple[MatchSuggestion, ...]], bool]:
        """Existing systems that unmatched names may mean, by name; and whether a model ran."""
        queries: dict[str, MatchQuery] = {}
        for content, item in proposals.items():
            for _, written in _references(content, item, release):
                queries.setdefault(written.casefold(), MatchQuery(written, item.quote))
        if not queries or not release.systems:
            return {}, False
        systems = tuple(
            MatchableSystem(
                system.id,
                system.name,
                system.name_ar,
                system.aliases,
                tuple(capability.name for capability in system.capabilities),
            )
            for system in release.systems
        )
        known = {system.id for system in release.systems}
        try:
            result = self._matcher.match(tuple(queries.values()), systems)
        except SystemMatchingError:
            warnings.append(
                "Similar existing systems could not be checked; names the catalogue does not "
                "know yet are suggested as new systems."
            )
            return {}, True
        warnings.extend(result.warnings)
        found: dict[str, list[MatchSuggestion]] = {}
        for suggestion in result.suggestions:
            options = found.setdefault(suggestion.written_as.casefold(), [])
            if (
                suggestion.system_id in known
                and len(options) < MAX_MATCHES_PER_NAME
                and all(option.system_id != suggestion.system_id for option in options)
            ):
                options.append(suggestion)
        return {name: tuple(options) for name, options in found.items() if options}, True


class DecideCatalogueCandidate:
    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        repository: ArchitectureKnowledgeRepositoryPort,
        candidates: CatalogueCandidateRepositoryPort,
        inbox: ChangeRequestInboxPort | None = None,
    ) -> None:
        self._knowledge = knowledge
        self._repository = repository
        self._candidates = candidates
        self._inbox = inbox

    def _applied(
        self,
        candidate: CatalogueCandidate,
        content: CandidateContent,
        release: ArchitectureKnowledge,
        at: datetime,
    ) -> ArchitectureKnowledge:
        """The draft with one suggestion accepted; one from a change request also registers
        the change request as a source and records it in the change history."""
        cited = candidate.change_request
        if cited is None:
            return apply_candidate(content, release)
        incoming = self._inbox.get(cited.change_request_id) if self._inbox else None
        if incoming is None:
            raise CandidateDependencyError(
                f"The change request {cited.change_request_id} this suggestion comes from is "
                "no longer kept, so it cannot be accepted."
            )
        return accept_from_change_request(release, content, incoming, cited.feature_id, at)

    def overview(self, release_id: str, actor: Actor) -> CandidateOverview:
        require_maintainer(actor)
        release = self._knowledge.get(release_id)
        return CandidateOverview(
            release,
            tuple(_view(item, release) for item in self._candidates.list(release_id)),
            self._candidates.runs(release_id),
        )

    def _candidate(self, release_id: str, candidate_id: str) -> CatalogueCandidate:
        candidate = self._candidates.get(candidate_id)
        if candidate is None or candidate.release_id != release_id:
            raise CandidateNotFoundError("This suggestion was not found for the draft.")
        return candidate

    def decide(
        self,
        release_id: str,
        candidate_id: str,
        expected_revision: int,
        accept: bool,
        actor: Actor,
        at: datetime,
        content: CandidateContent | None = None,
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        release = _draft(self._knowledge, release_id)
        if release.revision != expected_revision:
            raise KnowledgeConflictError("The draft changed; reload before deciding.")
        decided = self._candidate(release_id, candidate_id).decide(accept, actor.id, at, content)
        if not accept:
            self._candidates.save_decision(decided)
            return release
        merged = self._applied(decided, decided.content, release, at)
        updated = _accepted(release, merged)
        self._save(updated, expected_revision, actor, (decided,))
        return updated

    def accept_all(
        self, release_id: str, expected_revision: int, actor: Actor, at: datetime
    ) -> tuple[ArchitectureKnowledge, int]:
        """Accept every undecided suggestion that can apply; returns how many were left.

        Inferred dependencies and suggestions that may name an existing system
        are left for a one-by-one decision.
        """
        require_maintainer(actor)
        release = _draft(self._knowledge, release_id)
        if release.revision != expected_revision:
            raise KnowledgeConflictError("The draft changed; reload before deciding.")
        pending = sorted(
            (
                item
                for item in self._candidates.list(release_id)
                if item.status is CandidateStatus.PROPOSED
            ),
            # A domain before the sub-domains inside it.
            key=lambda item: (
                _ORDER.index(item.content.kind),
                item.content.parent_domain_id is not None,
            ),
        )
        merged = release
        accepted: list[CatalogueCandidate] = []
        for candidate in pending:
            if needs_one_by_one(candidate, merged):
                continue
            try:
                merged = self._applied(candidate, candidate.content, merged, at)
            except (CandidateDependencyError, InvalidKnowledgeError):
                # Left undecided for a one-by-one look; the rest still apply.
                continue
            accepted.append(candidate.decide(True, actor.id, at))
        if not accepted:
            return release, len(pending)
        updated = _accepted(release, merged)
        self._save(updated, expected_revision, actor, tuple(accepted))
        return updated, len(pending) - len(accepted)

    def reject_many(
        self,
        release_id: str,
        expected_revision: int,
        candidate_ids: tuple[str, ...],
        actor: Actor,
        at: datetime,
    ) -> int:
        """Reject the listed suggestions still waiting; returns how many were rejected.

        Suggestions already decided, by this person or someone else meanwhile,
        are left as they are rather than failing the whole request.
        """
        require_maintainer(actor)
        release = _draft(self._knowledge, release_id)
        if release.revision != expected_revision:
            raise KnowledgeConflictError("The draft changed; reload before deciding.")
        wanted = set(candidate_ids)
        rejected = 0
        for candidate in self._candidates.list(release_id):
            if candidate.id not in wanted or candidate.status is not CandidateStatus.PROPOSED:
                continue
            try:
                self._candidates.save_decision(candidate.decide(False, actor.id, at))
            except CandidateDecisionConflictError:
                continue
            rejected += 1
        return rejected

    def settle_subject(
        self,
        release_id: str,
        reference: str,
        name: str,
        kind: SubjectKind,
        actor: Actor,
        at: datetime,
    ) -> SettledSubject:
        """Say what a name that suggestions wait for is, so they can be decided.

        A reading can name a system no suggestion adds, or take a product for a
        system. As a system, it is suggested, citing what waits for it. As an
        offering, the suggestion of it as a system becomes one of an offering (or
        is rejected when the draft or a suggestion already has the offering), its
        constraints become the offering's rules, and the offering is suggested
        when nothing has it yet.
        """
        require_maintainer(actor)
        release = _draft(self._knowledge, release_id)
        name = name.strip() or reference
        if find_system(release, reference) is not None:
            raise InvalidKnowledgeError(f"The draft already has the system {name}.")
        wanted = reference.casefold().strip()
        pending = [
            item
            for item in self._candidates.list(release_id)
            if item.status is CandidateStatus.PROPOSED
        ]
        about = [item for item in pending if item.content.system_id.casefold() == wanted]
        waiting = [
            item
            for item in pending
            if item.content.kind is not CandidateKind.SYSTEM
            and wanted
            in {item.content.system_id.casefold(), (item.content.target_system_id or "").casefold()}
        ]
        if not about and not waiting:
            raise CandidateNotFoundError(f"No suggestion waiting in the draft names {name}.")

        def suggested(content: CandidateContent) -> CatalogueCandidate:
            cited = waiting or about
            first = cited[0]
            return CatalogueCandidate(
                uuid4().hex,
                release.id,
                first.document_version_id,
                content,
                tuple(dict.fromkeys(c for item in cited for c in item.citations))[:10],
                first.model,
                first.prompt_version,
                at,
            )

        if kind is SubjectKind.SYSTEM:
            if any(item.content.kind is CandidateKind.SYSTEM for item in about):
                return SettledSubject(0, 0)
            system = suggested(CandidateContent(CandidateKind.SYSTEM, reference, name=name))
            self._candidates.revise((system,))
            return SettledSubject(0, 1)

        offerings = (
            *release.products,
            *(item.content.product for item in pending if item.content.product is not None),
        )
        held = find_offering(offerings, reference) or find_offering(offerings, name)
        revised: list[CatalogueCandidate] = []
        rejected: list[CatalogueCandidate] = []
        subject = held.id if held is not None else reference
        for item in about:
            if item.content.kind is not CandidateKind.SYSTEM:
                continue
            if held is not None:
                rejected.append(item.decide(False, actor.id, at))
                continue
            offering = ProductOffering(reference, item.content.name or name)
            held = offering
            revised.append(
                replace(
                    item,
                    content=CandidateContent(
                        CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
                    ),
                    possible_matches=(),
                )
            )
        for item in waiting:
            if item.content.kind is CandidateKind.CONSTRAINT and (
                item.content.system_id.casefold() == wanted
            ):
                text = item.content.text
                rule = CandidateContent(CandidateKind.OFFERING_RULE, subject, text=text)
                revised.append(replace(item, content=rule, possible_matches=()))
        added = 0
        if held is None:
            offering = ProductOffering(reference, name)
            revised.append(
                suggested(
                    CandidateContent(
                        CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
                    )
                )
            )
            added = 1
        self._candidates.revise(tuple(revised))
        for item in rejected:
            self._candidates.save_decision(item)
        return SettledSubject(len(revised) - added + len(rejected), added)

    def _save(
        self,
        updated: ArchitectureKnowledge,
        expected_revision: int,
        actor: Actor,
        decided: tuple[CatalogueCandidate, ...],
    ) -> None:
        """Mark decisions first, then save the draft; undo the marks if the draft moved on."""
        saved: list[str] = []
        try:
            for item in decided:
                self._candidates.save_decision(item)
                saved.append(item.id)
            self._repository.save(updated, expected_revision, actor.id, "accept_suggestion")
        except (CandidateDecisionConflictError, KnowledgeConflictError, PersistenceError):
            for candidate_id in saved:
                self._candidates.reopen(candidate_id)
            raise


def _identity(content: CandidateContent) -> CandidateContent:
    """What makes two proposals the same suggestion: a dependency's kind is not part of it."""
    if content.kind is CandidateKind.RELATIONSHIP:
        return replace(content, relationship_kind=None)
    return content


def _settled(
    content: CandidateContent, kinds: list[tuple[bool, RelationshipKind | None]]
) -> CandidateContent:
    """The kind of a merged dependency: a stated kind first, then any other one.

    Proposals that disagree leave the kind unspecified rather than pick one.
    """
    if content.kind is not CandidateKind.RELATIONSHIP:
        return content
    for stated_only in (True, False):
        found = {
            kind
            for stated, kind in kinds
            if (stated or not stated_only)
            and kind is not None
            and kind is not RelationshipKind.UNSPECIFIED
        }
        if found:
            only = found.pop() if len(found) == 1 else RelationshipKind.UNSPECIFIED
            return replace(content, relationship_kind=only)
    return replace(content, relationship_kind=RelationshipKind.UNSPECIFIED)
