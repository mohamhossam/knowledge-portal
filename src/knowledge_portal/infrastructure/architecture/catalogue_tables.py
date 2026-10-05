"""Catalogue tables read without a model: systems, offerings and journeys (ADR-0093).

A landscape document's tables already say exactly what the catalogue needs: a
system row names the system, its ID and aliases and the systems it integrates
with; an integration-details row links two activities whose performing systems
another table names. Reading those cells directly gives every row, cited by its
own line, the same way each time. The model still reads everything else, and the
system rows' Function cells for capabilities, which need wording.

A product section's details are read the same way (requirement-portal ADR-0101, step 4):
its realisation and NFR tables, the tables and notes under its "Order tracking" heading,
and each "Lifecycle: <title>" section as one lifecycle note, its paragraphs, lists and
tables in the order the document sets them out.

Only rows that carry their cells are read here (Markdown tables, ADR-0090).
Nothing is decided: every result is a suggestion a maintainer reviews.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import Any

from knowledge_portal.application.ports.catalogue_extractor import (
    CatalogueExtractionError,
    CatalogueExtractorPort,
    CatalogueProposal,
    ExtractionRequest,
    ExtractionSegment,
    ProposedChange,
)
from knowledge_portal.domain.architecture.candidates import (
    CandidateBasis,
    CandidateContent,
    CandidateKind,
)
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.journeys import (
    Activity,
    ActivityIntegration,
    FlowRule,
    Journey,
    flow_rule_kind,
)
from knowledge_portal.domain.architecture.knowledge import (
    InvalidKnowledgeError,
    RelationshipKind,
)
from knowledge_portal.domain.architecture.lifecycle import (
    LifecycleNote,
    NoteBlock,
    NoteBlockKind,
)
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
    OfferingComponent,
    OfferingNfr,
    OfferingPoint,
    OrderType,
    ProductOffering,
    Realisation,
    SourceConfidence,
    find_offering_component,
    find_order_type,
    nfr_coverage,
    realisation_layer,
)
from knowledge_portal.domain.architecture.tracking import (
    FalloutCase,
    OrderTracking,
    TrackingChannel,
    TrackingEvent,
    TrackingFlow,
)
from knowledge_portal.infrastructure.llm.catalogue_extraction import plain_name, slug

READER = "catalogue-table-reader"
READER_VERSION = "catalogue-tables-v6"
# An Integrations entry longer than this is a phrase ("Same service context as
# B2B Web"), not the name of a system.
_MAX_ENTRY_WORDS = 4

# Column names as they are compared: lower case, words only ("Interface / API / event"
# reads "interface api event"); "#" is kept as a word.
_SYSTEM = frozenset({"system", "system name", "application"})
_ID = frozenset({"id", "system id"})
_FUNCTION = frozenset({"function", "purpose"})
_INTEGRATIONS = frozenset({"integrations", "integrates with", "interfaces"})
_ALIASES = frozenset({"aliases", "alias", "also known as", "other names"})
_EVIDENCE = frozenset({"evidence"})
_NUMBER = frozenset({"#", "no", "step"})
_ACTIVITY = frozenset({"activity"})
_PERFORMER = frozenset({"performing system", "performed by"})
_FROM = frozenset({"from"})
_TO = frozenset({"to"})
_INTERACTION = frozenset({"interaction", "interaction type"})
_INTERFACE = frozenset({"interface", "interface api event"})
_PAYLOAD = frozenset({"payload"})
_DOMAIN = frozenset({"domain", "domain name", "landscape domain"})
_CODE = frozenset({"code"})
_SUBDOMAIN = frozenset({"sub domain", "subdomain"})
# Channels (requirement-portal ADR-0101): a Channels table, and the channels an order type
# or an activity names.
_CHANNEL = frozenset({"channel", "channel name"})
_CHANNELS = frozenset({"channels", "channel", "ordered through", "available channels"})
_ENTRY = frozenset({"entry system", "orders enter through", "enters through", "system"})
_CHANNEL_KIND = frozenset({"kind", "type", "channel kind", "channel type"})
_CHANNEL_ENTRY = frozenset({"channel entry"})
# A performer written as the ordering channel itself rather than a system.
_BY_CHANNEL = frozenset(
    {"channel", "the channel", "channel entry system", "entry system", "ordering channel", "entry"}
)
_NOTHING = frozenset({"", "-", "—", "–"})
_VIA = re.compile(r"\s+via\s+", re.IGNORECASE)
_QUALIFIER = re.compile(r"\s*\([^()]*\)\s*$")


def _column(name: str) -> str:
    return " ".join(re.findall(r"[\w#]+", name.casefold()))


@dataclass(frozen=True)
class _Row:
    segment: ExtractionSegment
    values: dict[str, str]

    def get(self, names: frozenset[str]) -> str:
        return next((self.values[name] for name in sorted(names) if self.values.get(name)), "")

    @property
    def shape(self) -> str | None:
        columns = frozenset(self.values)
        if columns & _FROM and columns & _TO and columns & _INTERACTION:
            return "integration"
        if columns & _NUMBER and columns & _ACTIVITY and columns & _PERFORMER:
            return "activity"
        # Before "system": a Channels table names the system its orders enter through.
        if (
            columns & _CHANNEL
            and columns & (_ENTRY | _CHANNEL_KIND)
            and not columns & (_FUNCTION | _INTEGRATIONS | _ALIASES)
        ):
            return "channel"
        if columns & _SYSTEM and columns & (_ID | _FUNCTION | _INTEGRATIONS | _ALIASES):
            return "system"
        if columns & _DOMAIN and columns & (_ID | _CODE):
            return "domain"
        return None

    @property
    def basis(self) -> tuple[CandidateBasis, str | None]:
        if self.get(_EVIDENCE).upper() == "INFERRED":
            return CandidateBasis.INFERRED, "The document marks this row INFERRED."
        return CandidateBasis.STATED, None

    @property
    def gap(self) -> bool:
        return self.get(_EVIDENCE).upper() == "GAP"


def _row(segment: ExtractionSegment) -> _Row:
    values: dict[str, str] = {}
    for name, value in segment.cells:
        cleaned = value.strip()
        values.setdefault(_column(name), "" if cleaned in _NOTHING else cleaned)
    return _Row(segment, values)


def _entries(cell: str) -> list[str]:
    return [item.strip() for item in re.split(r"[,;]", cell) if item.strip()]


class _Names:
    """A document's names for its systems, and the catalogue's, as ids."""

    def __init__(self, request: ExtractionRequest) -> None:
        self._ids: dict[str, str] = {}
        # "ECM (catalog)" is written "ECM" elsewhere: a name without its trailing
        # parenthesis answers too, while only one system has that base (None after).
        self._bases: dict[str, str | None] = {}
        for system in request.known_systems:
            self.add(system.id, system.id, system.name, *system.aliases)

    def add(self, system_id: str, *labels: str) -> None:
        for label in labels:
            if label.strip():
                self._ids.setdefault(label.casefold().strip(), system_id)
                base = _QUALIFIER.sub("", label).casefold().strip()
                if base and base != label.casefold().strip():
                    owner = self._bases.setdefault(base, system_id)
                    if owner != system_id:
                        self._bases[base] = None

    def known(self, name: str) -> bool:
        return name.casefold().strip() in self._ids

    def resolve(self, name: str) -> str:
        key = name.casefold().strip()
        return self._ids.get(key) or self._bases.get(key) or slug(name)


class _Landscape:
    """The document's landscape domains, and each proposed once (ADR-0094)."""

    def __init__(self) -> None:
        self._by_key: dict[str, str] = {}
        self._codes: dict[str, str] = {}
        self.proposed: set[str] = set()

    def add(self, domain_id: str, name: str, code: str = "") -> None:
        for key in (domain_id, name):
            self._by_key.setdefault(key.casefold().strip(), domain_id)
        if code:
            self._codes.setdefault(code.casefold().strip(), domain_id)

    def find(self, reference: str) -> str | None:
        key = reference.casefold().strip()
        return self._by_key.get(key) or self._codes.get(key) or self._by_key.get(slug(reference))

    def heading(self, section: tuple[str, ...]) -> str | None:
        """The domain a table sits under: its heading is the domain's name, or "Name (Code)"."""
        for heading in reversed(section):
            base = _QUALIFIER.sub("", heading).strip()
            qualifier = heading[len(base) :].strip().strip("()").strip()
            found = self.find(base) or (self.find(qualifier) if qualifier else None)
            if found:
                return found
        return None


@dataclass
class TableReading:
    """What the tables gave, and which rows the model need not see, or need only partly."""

    changes: list[ProposedChange] = field(default_factory=list)
    # Rows the model has nothing left to read in.
    consumed: set[int] = field(default_factory=set)
    # Rows whose systems and dependencies were taken; the model reads the rest.
    read: set[int] = field(default_factory=set)
    # What could not be read, in words for the reading's notes.
    notes: list[str] = field(default_factory=list)


def _proposed(
    row: _Row, content: CandidateContent, source: str, target: str = ""
) -> ProposedChange:
    basis, rationale = row.basis
    return ProposedChange(
        content,
        (row.segment.location,),
        row.segment.text,
        source_name=source,
        target_name=target,
        basis=basis,
        rationale=rationale,
        reader=(READER, READER_VERSION),
    )


class CatalogueTableReader:
    def read(self, request: ExtractionRequest) -> TableReading:
        # A product's tracking and lifecycle tables are its own: their "Channel" or "From"
        # columns never make a channel or a dependency.
        details = {item.number for item in request.segments if _detail(item) is not None}
        rows = [
            row
            for row in map(_row, request.segments)
            if row.values and row.segment.number not in details
        ]
        names = _Names(request)
        reading = TableReading()
        landscape = _Landscape()
        for row in rows:
            if row.shape == "domain":
                reading.consumed.add(row.segment.number)
                if not row.gap:
                    reading.changes.extend(self._domain(row, landscape))
        systems: list[tuple[_Row, str, str]] = []
        for row in rows:
            name = plain_name(row.get(_SYSTEM)) if row.shape == "system" else ""
            if not name:
                continue
            reading.read.add(row.segment.number)
            if row.gap:
                continue
            system_id = names.resolve(name)
            aliases = [plain_name(item) for item in _entries(row.get(_ALIASES))]
            aliases.append(row.get(_ID))
            names.add(system_id, name, *aliases)
            systems.append((row, system_id, name))
            others = tuple(
                dict.fromkeys(
                    item for item in aliases if item and item.casefold() != name.casefold()
                )
            )
            content = CandidateContent(
                CandidateKind.SYSTEM,
                system_id,
                name=name,
                aliases=others,
                description=row.get(_FUNCTION) or None,
            )
            reading.changes.append(_proposed(row, content, name))
            reading.changes.extend(self._placement(row, system_id, name, landscape))
        # A channel names the system its orders enter through, so it is read after them.
        for row in rows:
            if row.shape == "channel":
                reading.consumed.add(row.segment.number)
                if not row.gap:
                    reading.changes.extend(self._channel(row, names))
        # Integrations name systems that may appear in later rows, so they are read last.
        for row, system_id, name in systems:
            for entry in _entries(row.get(_INTEGRATIONS)):
                reading.changes.extend(self._integration(row, system_id, name, entry, names))
        performers = {
            row.get(_NUMBER): plain_name(row.get(_PERFORMER))
            for row in rows
            if row.shape == "activity" and row.get(_NUMBER) and row.get(_PERFORMER)
        }
        for row in rows:
            if row.shape == "integration":
                reading.consumed.add(row.segment.number)
                if not row.gap:
                    reading.changes.extend(self._activity_link(row, performers, names))
        offerings: dict[str, ProductOffering] = {}
        for section in _offering_sections(request.segments):
            offering = section.read_into(reading, names)
            if offering is not None:
                offerings[section.name.casefold()] = offering
        for journey in _journey_sections(request.segments):
            journey.read_into(reading, names, offerings.get((journey.product or "").casefold()))
        return reading

    def _channel(self, row: _Row, names: _Names) -> list[ProposedChange]:
        """A row of a Channels table: where orders are placed, and who takes them in."""
        name = plain_name(row.get(_CHANNEL))
        if not name:
            return []
        entry = plain_name(row.get(_ENTRY))
        channel = Channel(
            slug(row.get(_ID) or name),
            name,
            kind=row.get(_CHANNEL_KIND) or None,
            entry_system_id=names.resolve(entry) if entry else None,
            description=row.get(_DESCRIPTION) or None,
            confidence=_trust(row),
            source=row.get(_SOURCE) or None,
        )
        content = CandidateContent(
            CandidateKind.CHANNEL, channel.id, name=channel.name, channel=channel
        )
        return [_proposed(row, content, name, entry)]

    def _domain(self, row: _Row, landscape: _Landscape) -> list[ProposedChange]:
        """A row of a Domains table: its ID is the domain's key, its code a description."""
        name = row.get(_DOMAIN)
        if not name:
            return []
        domain_id = slug(row.get(_ID) or name)
        code = row.get(_CODE)
        landscape.add(domain_id, name, code)
        landscape.proposed.add(domain_id)
        content = CandidateContent(
            CandidateKind.LANDSCAPE_DOMAIN,
            domain_id,
            name=name,
            landscape_domain_id=domain_id,
            description=code or None,
        )
        return [_proposed(row, content, name)]

    def _placement(
        self, row: _Row, system_id: str, name: str, landscape: _Landscape
    ) -> list[ProposedChange]:
        """Where a system row's system sits: a Domain cell, or the heading of its table,
        and below that its Sub-domain cell, proposed as a sub-domain the first time."""
        changes: list[ProposedChange] = []
        written = row.get(_DOMAIN)
        place = landscape.find(written) if written else landscape.heading(row.segment.section)
        if written and place is None:
            # A domain the Domains table did not list is still where the row says it is.
            place = slug(written)
            landscape.add(place, written)
            landscape.proposed.add(place)
            content = CandidateContent(
                CandidateKind.LANDSCAPE_DOMAIN, place, name=written, landscape_domain_id=place
            )
            changes.append(_proposed(row, content, written))
        if place is None:
            return changes
        sub = row.get(_SUBDOMAIN)
        if sub:
            child = f"{place}-{slug(sub)}"
            if child not in landscape.proposed:
                landscape.proposed.add(child)
                content = CandidateContent(
                    CandidateKind.LANDSCAPE_DOMAIN,
                    child,
                    name=sub,
                    landscape_domain_id=child,
                    parent_domain_id=place,
                )
                changes.append(_proposed(row, content, sub))
            place = child
        content = CandidateContent(CandidateKind.PLACEMENT, system_id, landscape_domain_id=place)
        changes.append(_proposed(row, content, name))
        return changes

    def _integration(
        self, row: _Row, system_id: str, name: str, entry: str, names: _Names
    ) -> list[ProposedChange]:
        """One Integrations entry as dependencies: "A / B" is two systems unless one is named so."""
        parts = _VIA.split(entry, maxsplit=1)
        written, qualifier = parts[0].strip(), parts[1].strip() if len(parts) > 1 else ""
        targets = (
            [written]
            if names.known(written) or "/" not in written
            else [part.strip() for part in written.split("/") if part.strip()]
        )
        changes: list[ProposedChange] = []
        for target in targets:
            target_id = names.resolve(target)
            if (
                len(target.split()) > _MAX_ENTRY_WORDS
                or target_id.casefold() == system_id.casefold()
            ):
                continue
            text = f"Integrates with {target}" + (f" via {qualifier}" if qualifier else "")
            content = CandidateContent(
                CandidateKind.RELATIONSHIP,
                system_id,
                target_system_id=target_id,
                text=text,
                relationship_kind=RelationshipKind.UNSPECIFIED,
            )
            changes.append(_proposed(row, content, name, target))
        return changes

    def _activity_link(
        self, row: _Row, performers: dict[str, str], names: _Names
    ) -> list[ProposedChange]:
        """An integration between two activities, as a dependency between their systems."""
        source, target = performers.get(row.get(_FROM)), performers.get(row.get(_TO))
        if not source or not target:
            return []
        source_id, target_id = names.resolve(source), names.resolve(target)
        if source_id.casefold() == target_id.casefold():
            return []
        interaction = row.get(_INTERACTION)
        details = ", ".join(item for item in (interaction, row.get(_INTERFACE)) if item)
        payload = row.get(_PAYLOAD)
        content = CandidateContent(
            CandidateKind.RELATIONSHIP,
            source_id,
            target_system_id=target_id,
            text=f"{payload} ({details})" if payload and details else payload or details,
            relationship_kind=(
                RelationshipKind.CALLS_API
                if interaction.casefold() == "api"
                else RelationshipKind.UNSPECIFIED
            ),
        )
        return [_proposed(row, content, source, target)]


# What the reader takes from a row it reads; the model's copies of these are duplicates.
_FROM_CELLS = frozenset(
    {
        CandidateKind.SYSTEM,
        CandidateKind.RELATIONSHIP,
        CandidateKind.LANDSCAPE_DOMAIN,
        CandidateKind.PLACEMENT,
        CandidateKind.PRODUCT,
        CandidateKind.JOURNEY,
        CandidateKind.CHANNEL,
    }
)


# Product offerings (ADR-0095) ---------------------------------------------------------------

_PRODUCT_HEADING = re.compile(r"^product\s*:\s*(?P<name>.+)$", re.IGNORECASE)
_RULES = re.compile(r"^\W*product rules\W*:?\W*", re.IGNORECASE)
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")
_FAMILY = frozenset({"family"})
_VERSION = frozenset({"version"})
_LIFECYCLE = frozenset({"lifecycle"})
_SOURCE = frozenset({"source"})
_ORDER_TYPE = frozenset({"order type"})
_ENABLED = frozenset({"enabled", "offered"})
_DESCRIPTION = frozenset({"description"})
_VALUE = frozenset({"value", "customer value"})
_AUDIENCE = frozenset({"fit", "audience", "segment", "who it is for"})
_COMPONENT = frozenset({"component"})
_KIND = frozenset({"type"})
_MANDATORY = frozenset({"mandatory"})
_VISIBLE = frozenset({"customer visible"})
_COMMERCIAL = frozenset({"commercial spec"})
_TECHNICAL = frozenset({"technical spec"})
_DETAILS = frozenset({"technical details"})
_ROLE = frozenset({"role"})
_RESPONSIBILITY = frozenset({"responsibility"})
_ORDER_TYPES = frozenset({"order types"})
_CONFIDENCE = {"CONFIRMED": "confirmed", "INFERRED": "inferred", "GAP": "gap"}
# A component's realisation, and the offering's NFRs (ADR-0101, step 4).
_LAYER = frozenset({"layer", "realisation layer", "realization layer"})
_REALISED = frozenset({"realised as", "realized as", "realisation", "realization"})
_QUALITY = frozenset({"quality", "nfr", "quality attribute", "non functional requirement"})
_COVERAGE = frozenset({"coverage"})
_STATEMENT = frozenset({"statement", "requirement", "target"})


def _product_name(segment: ExtractionSegment) -> str | None:
    """The offering a segment belongs to: the nearest "Product: X" heading above it."""
    for heading in reversed(segment.section):
        if match := _PRODUCT_HEADING.match(plain_name(heading)):
            return match["name"].strip()
    return None


def _yes(value: str) -> bool | None:
    text = value.strip().casefold()
    return True if text in {"yes", "y", "true"} else False if text in {"no", "n", "false"} else None


def _trust(row: _Row) -> SourceConfidence | None:
    found = _CONFIDENCE.get(row.get(_EVIDENCE).upper())
    return SourceConfidence(found) if found else None


@dataclass
class _OfferingSection:
    """One "Product: X" section of a document, read into one offering suggestion."""

    name: str
    heading: ExtractionSegment | None = None
    segments: list[ExtractionSegment] = field(default_factory=list)

    def read_into(self, reading: TableReading, names: _Names) -> ProductOffering | None:
        facts: _Row | None = None
        orders: list[OrderType] = []
        parts: dict[str, OfferingComponent] = {}
        duties: list[tuple[str, ComponentResponsibility]] = []
        values: list[OfferingPoint] = []
        audiences: list[OfferingPoint] = []
        proposition: list[str] = []
        rules: list[str] = []
        order_keys: dict[str, str] = {}
        layers: list[tuple[str, Realisation]] = []
        nfrs: dict[str, OfferingNfr] = {}
        tracking: list[tuple[ExtractionSegment, tuple[str, ...]]] = []
        notes: dict[str, _NoteSection] = {}
        for segment in self.segments:
            detail = _detail(segment)
            if detail is not None:
                reading.consumed.add(segment.number)
                kind, title, below = detail
                if kind == "tracking":
                    tracking.append((segment, below))
                else:
                    notes.setdefault(title.casefold(), _NoteSection(title)).parts.append(
                        (segment, below)
                    )
                continue
            if not segment.cells:
                text = segment.text.strip()
                if _RULES.match(text):
                    rules.extend(
                        item.strip()
                        for item in _SENTENCE.split(_RULES.sub("", text))
                        if item.strip()
                    )
                elif any("proposition" in heading.casefold() for heading in segment.section):
                    proposition.append(text)
                continue
            row = _row(segment)
            columns = frozenset(row.values)
            # An offering keeps a known gap as one, rather than leaving the row out.
            if columns & _COMPONENT and columns & _LAYER:
                reading.consumed.add(segment.number)
                written, layer = row.get(_COMPONENT), row.get(_LAYER)
                realised = row.get(_REALISED) or row.get(_DESCRIPTION)
                if written and layer and realised:
                    try:
                        found = Realisation(
                            realisation_layer(layer),
                            realised,
                            _trust(row),
                            row.get(_SOURCE) or None,
                        )
                    except InvalidKnowledgeError as exc:
                        reading.notes.append(f"{self.name} › {written}: {exc}")
                    else:
                        layers.append((written, found))
            elif columns & _QUALITY and columns & _COVERAGE:
                reading.consumed.add(segment.number)
                quality, coverage = row.get(_QUALITY), row.get(_COVERAGE)
                if quality and coverage and quality.casefold() not in nfrs:
                    try:
                        nfrs[quality.casefold()] = OfferingNfr(
                            quality,
                            nfr_coverage(coverage),
                            row.get(_STATEMENT) or row.get(_DESCRIPTION) or None,
                            _trust(row),
                            row.get(_SOURCE) or None,
                        )
                    except InvalidKnowledgeError as exc:
                        reading.notes.append(f"{self.name} › {quality}: {exc}")
            elif columns & _COMPONENT and columns & _SYSTEM and columns & _ROLE:
                reading.read.add(segment.number)
                system = plain_name(row.get(_SYSTEM))
                delivered = row.get(_COMPONENT)
                if system and delivered and row.get(_ROLE):
                    duties.append(
                        (
                            delivered,
                            ComponentResponsibility(
                                names.resolve(system),
                                row.get(_ROLE),
                                row.get(_RESPONSIBILITY) or row.get(_DESCRIPTION) or delivered,
                                tuple(_entries(row.get(_ORDER_TYPES))),
                                _trust(row),
                                row.get(_SOURCE) or None,
                            ),
                        )
                    )
            elif columns & _COMPONENT and columns & (_KIND | _MANDATORY | _CODE):
                reading.read.add(segment.number)
                name = row.get(_COMPONENT)
                if name:
                    code = row.get(_CODE) or None
                    part_id = slug(code or name)
                    parts.setdefault(
                        part_id,
                        OfferingComponent(
                            part_id,
                            name,
                            code=code,
                            kind=row.get(_KIND) or None,
                            mandatory=_yes(row.get(_MANDATORY)),
                            customer_visible=_yes(row.get(_VISIBLE)),
                            description=row.get(_DESCRIPTION) or None,
                            commercial_spec=row.get(_COMMERCIAL) or None,
                            technical_spec=row.get(_TECHNICAL) or None,
                            technical_details=row.get(_DETAILS) or None,
                            confidence=_trust(row),
                            source=row.get(_SOURCE) or None,
                        ),
                    )
            elif columns & _ORDER_TYPE:
                reading.consumed.add(segment.number)
                name = row.get(_ORDER_TYPE)
                if name:
                    code = row.get(_CODE) or "_".join(name.upper().split())
                    order_keys[name.casefold()] = order_keys[code.casefold()] = code
                    orders.append(
                        OrderType(
                            code,
                            name,
                            _yes(row.get(_ENABLED)) is not False,
                            row.get(_DESCRIPTION) or None,
                            _trust(row),
                            row.get(_SOURCE) or None,
                            channels=tuple(dict.fromkeys(_entries(row.get(_CHANNELS)))),
                        )
                    )
            elif columns & _VALUE or columns & _AUDIENCE:
                reading.consumed.add(segment.number)
                name = row.get(_VALUE) or row.get(_AUDIENCE)
                if name:
                    point = OfferingPoint(
                        name, row.get(_DESCRIPTION) or None, _trust(row), row.get(_SOURCE) or None
                    )
                    (values if columns & _VALUE else audiences).append(point)
            elif columns & _CODE and columns & (_FAMILY | _VERSION | _LIFECYCLE):
                reading.consumed.add(segment.number)
                facts = facts or row
        by_name = {part.name.casefold(): part_id for part_id, part in parts.items()}
        for written, duty in duties:
            part_id = by_name.get(written.casefold()) or slug(written)
            part = parts.get(part_id) or OfferingComponent(part_id, written)
            known = tuple(
                order_keys[item.casefold()]
                for item in duty.order_types
                if item.casefold() in order_keys
            )
            parts[part_id] = replace(
                part, responsibilities=(*part.responsibilities, replace(duty, order_types=known))
            )
        for written, realisation in layers:
            part_id = by_name.get(written.casefold()) or slug(written)
            part = parts.get(part_id) or OfferingComponent(part_id, written)
            key = (realisation.layer, realisation.name.casefold())
            if all((item.layer, item.name.casefold()) != key for item in part.realisation):
                parts[part_id] = replace(part, realisation=(*part.realisation, realisation))
        orders_named = _OrderNames(self.name, order_keys, reading)
        tracked = _tracking(self.name, tracking, names, orders_named, reading)
        noted = _notes(self.name, notes, orders_named, reading)
        code = facts.get(_CODE) if facts else ""
        try:
            offering = ProductOffering(
                id=slug(code or self.name),
                name=self.name,
                code=code or None,
                family=(facts.get(_FAMILY) if facts else "") or None,
                version=(facts.get(_VERSION) if facts else "") or None,
                lifecycle=(facts.get(_LIFECYCLE) if facts else "") or None,
                proposition="\n\n".join(proposition) or None,
                rules=tuple(rules),
                order_types=tuple(orders),
                components=tuple(parts.values()),
                values=tuple(values),
                audiences=tuple(audiences),
                confidence=_trust(facts) if facts else None,
                source=(facts.get(_SOURCE) if facts else "") or None,
                nfrs=tuple(nfrs.values()),
                tracking=tracked,
                lifecycle_notes=noted,
            )
        except InvalidKnowledgeError as exc:
            reading.notes.append(f"The product offering {self.name} could not be read: {exc}")
            return None
        if not (orders or parts or values or audiences or facts or nfrs or tracked or noted):
            return None
        cited = self.heading or (self.segments[0] if self.segments else None)
        if cited is None:
            return None
        reading.changes.append(
            ProposedChange(
                CandidateContent(
                    CandidateKind.PRODUCT, offering.id, name=offering.name, product=offering
                ),
                (cited.location,),
                cited.text,
                source_name=offering.name,
                reader=(READER, READER_VERSION),
            )
        )
        return offering


def _offering_sections(segments: tuple[ExtractionSegment, ...]) -> list[_OfferingSection]:
    sections: dict[str, _OfferingSection] = {}
    for segment in segments:
        heading = _PRODUCT_HEADING.match(plain_name(segment.text)) if not segment.cells else None
        name = _product_name(segment)
        if heading and name is None:
            # The heading itself sits above its section, so its own section does not name it.
            key = heading["name"].strip()
            sections.setdefault(key.casefold(), _OfferingSection(key)).heading = segment
            continue
        if name is not None:
            sections.setdefault(name.casefold(), _OfferingSection(name)).segments.append(segment)
    return list(sections.values())


# Offering details: order tracking and lifecycle notes (ADR-0101, step 4) ------------------

_TRACKING_HEADING = re.compile(r"^(?:order\s+)?tracking\b", re.IGNORECASE)
_NOTE_HEADING = re.compile(r"^lifecycle(?:\s+note)?\s*:\s*(?P<title>\S.*)$", re.IGNORECASE)
_NOTES_HEADING = re.compile(r"^lifecycle(?:\s+notes)?$", re.IGNORECASE)
# A sub-heading saying its content is carried over from another source, to re-verify.
_REVERIFY = re.compile(r"\bre-?verify\b|\bto verify\b|\bcarr(?:y|ied)[- ]over\b", re.IGNORECASE)
# "- **Kind:** Change" or "Applies to: New Activation".
_FACT = re.compile(
    r"^\s*(?:[-*+]\s+)?"
    r"(?:\*\*(?P<bold>[^*]+?)\s*:?\s*\*\*\s*:?|(?P<plain>[A-Za-z][\w /-]{0,30}?)\s*:)"
    r"\s*(?P<value>.*)$"
)
_NOT_DEFINED = re.compile(r"\bnot defined\b|\bundefined\b|^tbd$", re.IGNORECASE)
_ITEM = re.compile(r"^\s*(?:[-+*]|\d{1,9}[.)])\s+(?P<item>.*)$")
_TRACKING_FACTS = frozenset(
    {"applies to", "order types", "scope", "scope note", "not tracked", "not applicable"}
    | {"evidence", "source"}
)
_NOTE_FACTS = frozenset(
    {"kind", "order types", "for order types", "channels", "only in", "evidence", "source"}
    | {"summary"}
)
_WHAT = frozenset({"what", "carries", "event", "events", "label"})
_TRACKED_IN = frozenset({"tracked in", "tracking screen", "tracking ui", "ui", "ui system"})
_READ_FROM = frozenset({"read from", "reads from", "read system"})
_READ_OVER = frozenset({"read over", "read through", "read interface", "read api"})
_STORY = frozenset({"story", "how"})
_UI_NOTE = frozenset({"ui note", "note"})
_MILESTONE = frozenset({"milestone", "customer milestone"})
_STATUS = frozenset({"status", "internal status"})
_FALLOUT = frozenset({"fallout", "trigger", "fallout trigger"})
_HANDLING = frozenset({"handling", "what happens", "then"})
_DETAIL = frozenset({"detail", "description", "shown"})


def _detail(segment: ExtractionSegment) -> tuple[str, str, tuple[str, ...]] | None:
    """The detail of a product section a segment belongs to, with the headings below it:
    ("tracking", "", below) under an "Order tracking" heading, ("note", title, below) in a
    "Lifecycle: <title>" section or under a "Lifecycle notes" heading's own sub-heading."""
    section = tuple(plain_name(heading) for heading in segment.section)
    start = next(
        (index for index, heading in enumerate(section) if _PRODUCT_HEADING.match(heading)), None
    )
    if start is None:
        return None
    for index in range(start + 1, len(section)):
        heading = section[index]
        if match := _NOTE_HEADING.match(heading):
            return "note", match["title"].strip(), section[index + 1 :]
        if _NOTES_HEADING.match(heading) and index + 1 < len(section):
            return "note", section[index + 1], section[index + 2 :]
        if _TRACKING_HEADING.match(heading):
            return "tracking", "", section[index + 1 :]
    return None


def _facts(text: str, known: frozenset[str]) -> dict[str, str] | None:
    """A paragraph of "Key: value" lines, every key one of ``known``; None when it is prose."""
    found: dict[str, str] = {}
    for line in (item for item in text.splitlines() if item.strip()):
        match = _FACT.match(line)
        key = _column(match["bold"] or match["plain"]) if match else ""
        if key not in known:
            return None
        found[key] = match["value"].strip() if match else ""
    return found or None


def _named(value: str) -> list[str]:
    """The names a fact lists, "New Activation; Cessation." as two."""
    return [item.rstrip(".").strip() for item in _entries(value) if item.rstrip(".").strip()]


def _items(text: str) -> list[str] | None:
    """A Markdown list's items, or None when the paragraph is not a list."""
    lines = [line for line in text.splitlines() if line.strip()]
    matches = [_ITEM.match(line) for line in lines]
    if not lines or not matches[0]:
        return None
    items: list[str] = []
    for line, match in zip(lines, matches, strict=True):
        if match:
            items.append(match["item"].strip())
        elif items:
            # A wrapped line continues the item above it.
            items[-1] = f"{items[-1]} {line.strip()}"
    return [item for item in items if item]


def _evidence(value: str) -> tuple[SourceConfidence | None, str | None]:
    """ "CONFIRMED — SDD §10" as a confidence and a source."""
    if not value:
        return None, None
    parts = _DASH.split(value, maxsplit=1)
    found = _CONFIDENCE.get(parts[0].strip().upper())
    if found is None:
        return None, value.strip()
    return SourceConfidence(found), (_value(parts[1]) if len(parts) > 1 else None)


class _OrderNames:
    """The order types a detail names, as the offering's codes; a name it lacks is noted."""

    def __init__(self, offering: str, keys: dict[str, str], reading: TableReading) -> None:
        self._offering = offering
        self._codes = {_order_key(key): code for key, code in keys.items()}
        self._reading = reading

    def codes(self, written: list[str], where: str) -> tuple[str, ...] | None:
        """The codes of the order types written; None when none is the offering's, since
        naming none would mean every one."""
        codes: list[str] = []
        for name in written:
            code = self._codes.get(_order_key(name))
            if code is None:
                self._reading.notes.append(
                    f"{self._offering} › {where} names the order type {name!r}, which the "
                    "offering does not have; it was left out."
                )
            else:
                codes.append(code)
        if written and not codes:
            return None
        return tuple(dict.fromkeys(codes))


def _order_key(value: str) -> str:
    return "".join(re.findall(r"[^\W_]", value.casefold()))


def _tracking(
    offering: str,
    parts: list[tuple[ExtractionSegment, tuple[str, ...]]],
    names: _Names,
    orders: _OrderNames,
    reading: TableReading,
) -> OrderTracking | None:
    """The tables and notes under a product's "Order tracking" heading as its tracking."""
    if not parts:
        return None
    flows: list[TrackingFlow] = []
    channels: dict[str, TrackingChannel] = {}
    milestones: dict[str, TrackingEvent] = {}
    statuses: dict[str, TrackingEvent] = {}
    fallout: list[FalloutCase] = []
    applies: list[str] = []
    scope: list[str] = []
    absent: list[str] = []
    trust: SourceConfidence | None = None
    source: str | None = None
    titles = {below[-1] for _, below in parts if below}

    def system(cell: str) -> str | None:
        name = plain_name(cell)
        return names.resolve(name) if name else None

    for segment, _ in parts:
        if not segment.cells:
            text = segment.text.strip()
            if plain_name(text) in titles:
                continue
            facts = _facts(text, _TRACKING_FACTS)
            if facts is None:
                scope.append(text)
                continue
            for key, value in facts.items():
                if key in {"applies to", "order types"}:
                    applies.extend(_named(value))
                elif key in {"scope", "scope note"}:
                    scope.append(value)
                elif key in {"not tracked", "not applicable"}:
                    absent.append(value)
                elif key == "evidence":
                    trust, source = _evidence(value)
                elif key == "source":
                    source = value or None
            continue
        row = _row(segment)
        columns = frozenset(row.values)
        evidence = (_trust(row), row.get(_SOURCE) or None)
        try:
            if columns & _FROM and columns & _TO:
                start, end, label = system(row.get(_FROM)), system(row.get(_TO)), row.get(_WHAT)
                if start and end and label:
                    flows.append(
                        TrackingFlow(start, end, label, row.get(_INTERFACE) or None, *evidence)
                    )
            elif columns & _CHANNEL:
                channel = plain_name(row.get(_CHANNEL))
                if channel and channel.casefold() not in channels:
                    channels[channel.casefold()] = TrackingChannel(
                        channel,
                        # A key the source says it does not define is no key.
                        correlation_key=(
                            None
                            if _NOT_DEFINED.search(row.get(_CORRELATION))
                            else row.get(_CORRELATION) or None
                        ),
                        ui_system_id=system(row.get(_TRACKED_IN)),
                        story=row.get(_STORY) or None,
                        read_system_id=system(row.get(_READ_FROM)),
                        read_interface=row.get(_READ_OVER) or None,
                        ui_note=row.get(_UI_NOTE) or None,
                        confidence=evidence[0],
                        source=evidence[1],
                    )
            elif columns & _MILESTONE:
                label = row.get(_MILESTONE)
                if label and label.casefold() not in milestones:
                    milestones[label.casefold()] = TrackingEvent(
                        label, row.get(_DETAIL) or None, system(row.get(_SYSTEM)), *evidence
                    )
            elif columns & _FALLOUT:
                trigger = row.get(_FALLOUT)
                if trigger:
                    fallout.append(FalloutCase(trigger, row.get(_HANDLING) or None, *evidence))
            elif columns & _STATUS:
                label = row.get(_STATUS)
                if label and label.casefold() not in statuses:
                    statuses[label.casefold()] = TrackingEvent(
                        label, row.get(_DETAIL) or None, None, *evidence
                    )
        except InvalidKnowledgeError as exc:
            reading.notes.append(f"{offering} › order tracking, {segment.location}: {exc}")
    codes = orders.codes(applies, "order tracking")
    if codes is None:
        reading.notes.append(
            f"{offering} › order tracking was left out: it names none of the offering's "
            "order types."
        )
        return None
    if not (flows or channels or milestones or statuses or fallout or scope or absent):
        return None
    return OrderTracking(
        order_types=codes,
        scope_note="\n\n".join(scope) or None,
        not_applicable_note="\n\n".join(absent) or None,
        flows=tuple(flows),
        channels=tuple(channels.values()),
        milestones=tuple(milestones.values()),
        statuses=tuple(statuses.values()),
        fallout=tuple(fallout),
        confidence=trust,
        source=source,
    )


@dataclass
class _NoteSection:
    """One lifecycle note of a product section, and its segments in document order."""

    title: str
    parts: list[tuple[ExtractionSegment, tuple[str, ...]]] = field(default_factory=list)


def _note_blocks(note: _NoteSection) -> tuple[dict[str, str], str | None, list[NoteBlock]]:
    """A note's facts, its summary, and its parts as the document sets them out.

    Facts and the summary are what sits straight under the note's heading before any
    part. A sub-heading names the first part below it, and one saying its content is
    carried over or to re-verify marks every part below it so. The rows of one table
    are one part.
    """
    facts: dict[str, str] = {}
    summary: str | None = None
    drafts: list[dict[str, Any]] = []
    titles = {below[-1] for _, below in note.parts if below}
    titled: set[tuple[str, ...]] = set()

    def start(below: tuple[str, ...], **values: Any) -> dict[str, Any]:
        title = below[-1] if below and below not in titled else None
        titled.add(below)
        draft = {
            "title": title,
            "to_verify": any(_REVERIFY.search(heading) for heading in below),
            "below": below,
            **values,
        }
        drafts.append(draft)
        return draft

    for segment, below in note.parts:
        if segment.cells:
            columns = tuple(name for name, _ in segment.cells)
            cells = tuple(value.replace("\\|", "|").strip() for _, value in segment.cells)
            last = drafts[-1] if drafts else None
            if (
                last is not None
                and last["kind"] is NoteBlockKind.TABLE
                and (last["below"], last["columns"]) == (below, columns)
            ):
                last["rows"].append(cells)
            else:
                start(below, kind=NoteBlockKind.TABLE, columns=columns, rows=[cells])
            continue
        text = segment.text.strip()
        if plain_name(text) in titles:
            continue
        lead = not below and not drafts
        if lead and summary is None and (found := _facts(text, _NOTE_FACTS)) is not None:
            facts.update(found)
            continue
        items = _items(text)
        if items:
            start(below, kind=NoteBlockKind.LIST, items=items)
        elif lead and summary is None:
            summary = text
        else:
            start(below, kind=NoteBlockKind.TEXT, text=text)
    blocks = [
        NoteBlock(
            draft["kind"],
            title=draft["title"],
            text=draft.get("text"),
            items=tuple(draft.get("items", ())),
            columns=draft.get("columns", ()),
            rows=tuple(draft.get("rows", ())),
            to_verify=draft["to_verify"],
        )
        for draft in drafts
    ]
    return facts, facts.get("summary") or summary, blocks


def _notes(
    offering: str,
    sections: dict[str, _NoteSection],
    orders: _OrderNames,
    reading: TableReading,
) -> tuple[LifecycleNote, ...]:
    """Each "Lifecycle: <title>" section as one note; one that cannot be read is noted."""
    notes: list[LifecycleNote] = []
    ids: set[str] = set()
    for section in sections.values():
        try:
            facts, summary, blocks = _note_blocks(section)
            written = _named(facts.get("order types") or facts.get("for order types") or "")
            codes = orders.codes(written, f"the lifecycle note {section.title}")
            if codes is None:
                reading.notes.append(
                    f"{offering} › the lifecycle note {section.title} was left out: it names "
                    "none of the offering's order types."
                )
                continue
            trust, source = _evidence(facts.get("evidence", ""))
            note_id = slug(section.title)
            while note_id in ids:
                note_id = f"{note_id}-{len(ids) + 1}"
            notes.append(
                LifecycleNote(
                    note_id,
                    section.title,
                    kind=facts.get("kind") or None,
                    summary=summary,
                    order_types=codes,
                    channels=tuple(
                        dict.fromkeys(_named(facts.get("channels") or facts.get("only in") or ""))
                    ),
                    blocks=tuple(blocks),
                    confidence=trust,
                    source=facts.get("source") or source,
                )
            )
            ids.add(note_id)
        except InvalidKnowledgeError as exc:
            reading.notes.append(
                f"{offering} › the lifecycle note {section.title} could not be read: {exc}"
            )
    return tuple(notes)


# Journeys (ADR-0096) -----------------------------------------------------------------------

_JOURNEY_HEADING = re.compile(r"^journey\s*:\s*(?P<name>.+)$", re.IGNORECASE)
# "10. Select Business Pro Plus": an activity's own heading in a journey's details.
_STEP_HEADING = re.compile(r"^(?P<number>\d+(?:\.\d+)?)\.\s+(?P<name>\S.*)$")
# "- **Input → Output:** Selection → Basket"
_BULLET = re.compile(r"^\s*[-*+]\s+\*\*(?P<key>[^*]+?)\s*:?\s*\*\*\s*:?\s*(?P<value>.*)$")
_ARROW = re.compile(r"\s*(?:→|->)\s*")
_DASH = re.compile(r"\s+[—–-]\s+")
_PHASE = frozenset({"phase"})
_TRACK = frozenset({"track"})
_SUPPORTING = frozenset({"supporting systems", "supporting system", "supported by", "supporting"})
_SYSTEM_FUNCTION = frozenset({"system function"})
_MODE = frozenset({"mode"})
_RULE_KIND = frozenset({"rule type", "rule"})
_CONDITION = frozenset({"condition outcome", "condition", "outcome"})
_BRANCH = frozenset({"branch"})
_GROUP = frozenset({"parallel group"})
_REJOIN = frozenset({"rejoin at", "rejoin"})
_TIMING = frozenset({"sync async", "timing"})
_CORRELATION = frozenset({"correlation key"})


def _journey_name(segment: ExtractionSegment) -> str | None:
    """The journey a segment belongs to: the nearest "Journey: X" heading above it."""
    for heading in reversed(segment.section):
        if match := _JOURNEY_HEADING.match(plain_name(heading)):
            return match["name"].strip()
    return None


def _systems(cell: str, names: _Names) -> tuple[str, ...]:
    """The systems a cell names, split at "|", "," and ";", and at "/" unless one is named so."""
    found: list[str] = []
    for entry in re.split(r"[|,;]", cell.replace("\\|", "|")):
        name = plain_name(entry.strip())
        if not name or name in _NOTHING:
            continue
        parts = (
            [name]
            if names.known(name) or "/" not in name
            else [part.strip() for part in name.split("/") if part.strip()]
        )
        found.extend(names.resolve(part) for part in parts)
    return tuple(dict.fromkeys(found))


def _value(text: str) -> str | None:
    cleaned = text.replace("\\|", "|").strip()
    return None if cleaned in _NOTHING else cleaned


@dataclass
class _Details:
    """What an activity's own section says: its description and its "**Key:** value" bullets."""

    title: str
    description: list[str] = field(default_factory=list)
    facts: dict[str, str] = field(default_factory=dict)

    def fill(self, activity: Activity, names: _Names, offering: ProductOffering | None) -> Activity:
        """The activity with the gaps its table row left filled from here."""
        facts = self.facts
        phase, _, track = (facts.get("phase track") or "").partition("/")
        performer, _, supporting = (facts.get("performing system") or "").partition(";")
        supporting = re.sub(r"^\s*supporting\s*:?", "", supporting, flags=re.IGNORECASE)
        performers = _systems(performer, names)
        start, end = [*_ARROW.split(facts.get("input output") or "", maxsplit=1), ""][:2]
        evidence = _DASH.split(facts.get("evidence") or "", maxsplit=1)
        trust = _CONFIDENCE.get(evidence[0].strip().upper())
        components: list[str] = []
        for entry in (facts.get("related components") or facts.get("components") or "").split(","):
            name = _value(entry)
            if name:
                part = find_offering_component(offering, name) if offering else None
                components.append(part.id if part else name)
        return replace(
            activity,
            phase=activity.phase or _value(phase),
            track=activity.track or _value(track),
            performing_system_id=activity.performing_system_id
            or (performers[0] if performers else None),
            supporting_system_ids=activity.supporting_system_ids or _systems(supporting, names),
            system_function=activity.system_function or _value(facts.get("system function", "")),
            mode=activity.mode or _value(facts.get("mode", "")),
            customer_visible=(
                activity.customer_visible
                if activity.customer_visible is not None
                else _yes(facts.get("customer visible", ""))
            ),
            description=activity.description or "\n\n".join(self.description) or None,
            component_ids=activity.component_ids or tuple(dict.fromkeys(components)),
            input=activity.input or _value(start),
            output=activity.output or _value(end),
            etom=activity.etom or _value(facts.get("etom", "")),
            confidence=activity.confidence or (SourceConfidence(trust) if trust else None),
            source=activity.source or (_value(evidence[1]) if len(evidence) > 1 else None),
        )


@dataclass
class _JourneySection:
    """One "Journey: X" section of a document, read into one journey suggestion."""

    name: str
    # The product section it follows or sits in, as the document names it.
    product: str | None = None
    heading: ExtractionSegment | None = None
    segments: list[ExtractionSegment] = field(default_factory=list)

    def read_into(
        self, reading: TableReading, names: _Names, offering: ProductOffering | None
    ) -> None:
        steps: dict[str, Activity] = {}
        rules: list[FlowRule] = []
        links: list[ActivityIntegration] = []
        details: dict[str, _Details] = {}
        # Taken whole, or taken but still worth the model's look for capabilities.
        consumed: set[int] = set()
        read: set[int] = set()
        titles = {segment.section[-1] for segment in self.segments if segment.section} - {self.name}
        try:
            for segment in self.segments:
                if segment.cells:
                    self._row(_row(segment), steps, rules, links, consumed, read, names)
                    continue
                text = segment.text.strip()
                if plain_name(text) in titles and _STEP_HEADING.match(plain_name(text)):
                    consumed.add(segment.number)
                    continue
                step = (
                    _STEP_HEADING.match(plain_name(segment.section[-1]))
                    if segment.section
                    else None
                )
                if step is not None:
                    detail = details.setdefault(step["number"], _Details(step["name"].strip()))
                    bullets = [_BULLET.match(line) for line in text.splitlines()]
                    if any(bullets):
                        consumed.add(segment.number)
                        for bullet in bullets:
                            if bullet:
                                detail.facts[_column(bullet["key"])] = bullet["value"].strip()
                    else:
                        read.add(segment.number)
                        detail.description.append(text)
                elif text.startswith("```") or "-->" in text:
                    # The drawn flow: derived from the activities and rules, never read.
                    consumed.add(segment.number)
            for number, detail in details.items():
                steps[number] = detail.fill(
                    steps.get(number) or Activity(number, detail.title), names, offering
                )
            if not steps:
                return
            order = find_order_type(offering, self.name) if offering else None
            product = offering.id if offering else self.product
            journey = Journey(
                id=slug(f"{product} {self.name}" if product else self.name),
                name=self.name,
                product_id=product,
                order_type_code=order.code if order else None,
                activities=tuple(steps.values()),
                flow_rules=tuple(rules),
                integrations=tuple(links),
            )
        except InvalidKnowledgeError as exc:
            reading.notes.append(f"The journey {self.name} could not be read: {exc}")
            return
        reading.consumed |= consumed
        reading.read |= read - consumed
        cited = self.heading or self.segments[0]
        reading.changes.append(
            ProposedChange(
                CandidateContent(
                    CandidateKind.JOURNEY, journey.id, name=journey.name, journey=journey
                ),
                (cited.location,),
                cited.text,
                source_name=journey.name,
                reader=(READER, READER_VERSION),
            )
        )

    @staticmethod
    def _row(
        row: _Row,
        steps: dict[str, Activity],
        rules: list[FlowRule],
        links: list[ActivityIntegration],
        consumed: set[int],
        read: set[int],
        names: _Names,
    ) -> None:
        """One table row of the journey: an activity, a flow rule or an integration."""
        columns = frozenset(row.values)
        number = row.segment.number
        source = row.get(_SOURCE) or None
        if row.shape == "activity":
            read.add(number)
            step, name = row.get(_NUMBER), row.get(_ACTIVITY)
            if step and name and step not in steps:
                by_channel = (
                    _column(row.get(_PERFORMER)) in _BY_CHANNEL
                    or _yes(row.get(_CHANNEL_ENTRY)) is True
                )
                performers = () if by_channel else _systems(row.get(_PERFORMER), names)
                steps[step] = Activity(
                    step,
                    name,
                    phase=row.get(_PHASE) or None,
                    track=row.get(_TRACK) or None,
                    performing_system_id=performers[0] if performers else None,
                    supporting_system_ids=_systems(row.get(_SUPPORTING), names),
                    system_function=row.get(_SYSTEM_FUNCTION) or None,
                    mode=row.get(_MODE) or None,
                    customer_visible=_yes(row.get(_VISIBLE)),
                    confidence=_trust(row),
                    source=source,
                    channels=tuple(dict.fromkeys(_entries(row.get(_CHANNELS)))),
                    channel_entry=by_channel and not performers,
                )
        elif row.shape == "integration":
            if row.get(_FROM) and row.get(_TO):
                links.append(
                    ActivityIntegration(
                        row.get(_FROM),
                        row.get(_TO),
                        interaction=row.get(_INTERACTION) or None,
                        interface=row.get(_INTERFACE) or None,
                        payload=row.get(_PAYLOAD) or None,
                        timing=row.get(_TIMING) or None,
                        correlation_key=row.get(_CORRELATION) or None,
                        confidence=_trust(row),
                        source=source,
                    )
                )
        elif columns & _RULE_KIND and columns & _FROM and columns & _TO:
            consumed.add(number)
            if row.get(_RULE_KIND) and row.get(_FROM) and row.get(_TO):
                rules.append(
                    FlowRule(
                        flow_rule_kind(row.get(_RULE_KIND)),
                        row.get(_FROM),
                        row.get(_TO),
                        condition=row.get(_CONDITION) or None,
                        branch=row.get(_BRANCH) or None,
                        parallel_group=row.get(_GROUP) or None,
                        rejoin_at=row.get(_REJOIN) or None,
                        confidence=_trust(row),
                        source=source,
                    )
                )


def _journey_sections(segments: tuple[ExtractionSegment, ...]) -> list[_JourneySection]:
    """Each journey's segments, and the product section it follows or sits in."""
    sections: dict[str, _JourneySection] = {}
    product: str | None = None
    for segment in segments:
        text = plain_name(segment.text) if not segment.cells else ""
        heading = _PRODUCT_HEADING.match(text)
        if heading and _product_name(segment) is None:
            product = heading["name"].strip()
        journey = _JOURNEY_HEADING.match(text)
        name = _journey_name(segment)
        if journey and name is None:
            key = journey["name"].strip()
            section = sections.setdefault(key.casefold(), _JourneySection(key))
            section.heading = segment
            section.product = _product_name(segment) or product
            continue
        if name is not None:
            sections.setdefault(name.casefold(), _JourneySection(name)).segments.append(segment)
    return [item for item in sections.values() if item.segments]


class TableFirstCatalogueExtractor:
    """Tables read exactly first; the model reads what is left (ADR-0093).

    Rows the reader takes whole are not sent; system rows are sent marked
    ``read`` so the model gives only their capabilities, and any system or
    dependency it proposes from them anyway is dropped as a duplicate.
    """

    def __init__(self, model: CatalogueExtractorPort, reader: CatalogueTableReader) -> None:
        self._model = model
        self._reader = reader

    @property
    def supports_images(self) -> bool:
        return self._model.supports_images

    @property
    def model(self) -> str:
        return self._model.model

    @property
    def prompt_version(self) -> str:
        return f"{self._model.prompt_version}+{READER_VERSION}"

    def propose(self, request: ExtractionRequest) -> CatalogueProposal:
        reading = self._reader.read(request)
        rest = tuple(
            replace(segment, read=segment.number in reading.read)
            for segment in request.segments
            if segment.number not in reading.consumed
        )
        warnings: list[str] = list(reading.notes)
        taken = len(reading.read | reading.consumed)
        if taken:
            warnings.append(f"{taken} table row(s) were read directly, without the model.")
        changes: list[ProposedChange] = []
        if rest:
            try:
                proposal = self._model.propose(replace(request, segments=rest))
            except CatalogueExtractionError as exc:
                if not reading.changes:
                    raise
                warnings.append(f"The model could not read the rest of the document. {exc}")
            else:
                warnings[:0] = proposal.warnings
                read_rows = {item.location for item in rest if item.read}
                changes = [
                    change
                    for change in proposal.changes
                    if change.content.kind not in _FROM_CELLS
                    or not set(change.locations) <= read_rows
                ]
        return CatalogueProposal(
            (*reading.changes, *changes), self.model, self.prompt_version, tuple(warnings)
        )
