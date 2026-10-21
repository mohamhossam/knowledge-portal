"""Build immutable architecture evidence from a draft release."""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Callable
from uuid import uuid4

from smb_kernel.documents.ports import DocumentStoragePort

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    ChunkRole,
    EvidenceChunk,
    IndexVersion,
    LinkedEntity,
)
from knowledge_portal.application.ports.architecture_tokenizer import ArchitectureTokenizerPort
from knowledge_portal.application.ports.located_document_extractor import (
    LocatedDocumentExtractorPort,
    LocatedText,
)
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.application.use_cases.index_links import (
    IndexedRecord,
    build_links,
    record_concepts,
    texts_to_embed,
)
from knowledge_portal.application.use_cases.section_chunking import (
    plan_document,
    record_windows,
    span,
)
from knowledge_portal.domain.architecture.interfaces import SystemInterface
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeConflictError,
    KnowledgeDocumentVersion,
    KnowledgeReleaseStatus,
    RelationshipKind,
    SystemDefinition,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.links import connections
from knowledge_portal.domain.architecture.products import (
    ProductOffering,
    Realisation,
    RealisationLayer,
)
from knowledge_portal.domain.architecture.realisations import RealisationRecord
from knowledge_portal.domain.document.value_objects import DocumentVersionId

SECTION_TOKENS = 400

_LOGGER = logging.getLogger(__name__)


# How a relationship reads in evidence text. An unspecified kind adds nothing, so
# chunks built before kinds existed keep their exact text and content hash.
_KIND_WORDS = {
    RelationshipKind.CALLS_API: "API call",
    RelationshipKind.PUBLISHES_EVENTS_TO: "events",
    RelationshipKind.TRANSFERS_DATA_TO: "data transfer",
    RelationshipKind.ORCHESTRATES: "orchestration",
}


def _domain(release: ArchitectureKnowledge, domain_id: str | None) -> str:
    """A capability's domain path in evidence text; nothing when it is not placed, so
    chunks built before domains existed keep their exact text (ADR-0089)."""
    path = release.domain_path(domain_id)
    return f" ({' › '.join(item.name for item in path)})" if path else ""


def _landscape(release: ArchitectureKnowledge, domain_id: str | None) -> str:
    """Where a system sits, as an evidence line; empty when it is not placed (ADR-0094)."""
    path = release.landscape_path(domain_id)
    return f"Landscape: {' › '.join(item.name for item in path)}" if path else ""


_LAYERS = {
    RealisationLayer.CFS: "customer-facing service",
    RealisationLayer.RFS: "resource-facing service",
    RealisationLayer.RESOURCE: "resource",
}


def _realised_text(
    item: Realisation, records: dict[str, RealisationRecord], names: dict[str, str]
) -> str:
    """What a linked record adds to a realisation (ontology plan Phase 8): the systems that
    deliver it, and what realises it one layer down, with theirs."""
    if item.record_id is None:
        return ""

    def held(record: RealisationRecord) -> str:
        systems = ", ".join(names[system] for system in record.system_ids)
        return f" ({systems})" if systems else ""

    record = records[item.record_id]
    below = [records[other] for other in record.realised_by]
    return held(record) + "".join(
        f", on the {_LAYERS[other.layer]} {other.name}{held(other)}" for other in below
    )


def _offering_text(
    offering: ProductOffering,
    names: dict[str, str],
    records: dict[str, RealisationRecord] | None = None,
) -> str:
    """An offering as evidence: what it is, how it is ordered, and which system delivers
    each component in which role, so a requirement about a product finds its systems."""
    title = offering.name + (f" ({offering.code})" if offering.code else "")
    orders = "; ".join(
        item.name + ("" if item.enabled else " (not offered)") for item in offering.order_types
    )
    lines = [
        f"Product offering: {title}" + (f", {offering.family} family" if offering.family else ""),
        offering.proposition or "",
        *offering.rules,
        f"Order types: {orders}" if orders else "",
    ]
    for component in offering.components:
        facts = ", ".join(
            fact
            for fact in (
                (component.kind or "").casefold(),
                "mandatory" if component.mandatory else "",
            )
            if fact
        )
        lines.append(
            f"Component {component.name}"
            + (f" ({facts})" if facts else "")
            + (f": {component.description}" if component.description else "")
        )
        lines.extend(
            f"{component.name} — {names.get(item.system_id, item.system_id)} "
            f"({item.role.replace('_', ' ').casefold()}): {item.description}"
            for item in component.responsibilities
        )
        lines.extend(
            f"{component.name} is realised by the {_LAYERS[item.layer]} {item.name}"
            + _realised_text(item, records or {}, names)
            for item in component.realisation
        )
    lines.extend(
        f"Non-functional requirement {item.quality} ({item.coverage.value})"
        + (f": {item.statement}" if item.statement else "")
        for item in offering.nfrs
    )
    lines.extend(_tracking_lines(offering, names))
    lines.extend(_lifecycle_lines(offering))
    # Its governance (ADR-0101, step 5), so a requirement touching an open question or a
    # decision finds it.
    lines.extend(
        f"Open question {item.id} for {offering.name}: {item.text}"
        + (f" Impact: {item.impact}" if item.impact else "")
        for item in offering.questions
    )
    lines.extend(
        f"Architecture decision {item.id} for {offering.name}: {item.title}"
        + (f". {item.text}" if item.text else "")
        for item in offering.decisions
    )
    lines.extend(f"{offering.name} source boundary: {item}" for item in offering.boundaries)
    return "\n".join(line for line in lines if line)


def _lifecycle_lines(offering: ProductOffering) -> list[str]:
    """Each lifecycle note as evidence, so a requirement about an up/downgrade, a renewal
    or cessation finds what the sources say of it."""
    lines = []
    for note in offering.lifecycle_notes:
        lines.append(
            f"Lifecycle of {offering.name}: {note.title}" + (f" ({note.kind})" if note.kind else "")
        )
        lines.append(note.summary or "")
        for block in note.blocks:
            lines.extend((block.title or "", block.text or "", *block.items, block.caption or ""))
            if block.columns:
                lines.append(" · ".join(item for item in block.columns if item))
            lines.extend(" · ".join(cell for cell in row if cell) for row in block.rows)
    return lines


def _tracking_lines(offering: ProductOffering, names: dict[str, str]) -> list[str]:
    """How the offering's orders are tracked, so a requirement about order status or
    milestones finds the systems that carry them."""
    tracking = offering.tracking
    if tracking is None:
        return []

    def name(system_id: str | None) -> str:
        return names.get(system_id or "", system_id or "")

    lines = [f"Order tracking of {offering.name}", tracking.scope_note or ""]
    lines.extend(
        (
            f"{name(flow.from_system_id)} logs {flow.label}"
            if flow.is_log
            else f"{name(flow.from_system_id)} sends {flow.label} to {name(flow.to_system_id)}"
        )
        + (f" over {flow.interface}" if flow.interface else "")
        for flow in tracking.flows
    )
    lines.extend(
        f"Channel {channel.channel_id}: tracked in {name(channel.ui_system_id)}"
        + (f", reading from {name(channel.read_system_id)}" if channel.read_system_id else "")
        + (f"; correlation key {channel.correlation_key}" if channel.correlation_key else "")
        for channel in tracking.channels
        if channel.ui_system_id
    )
    lines.extend(
        f"Milestone {item.label}"
        + (f" ({name(item.system_id)})" if item.system_id else "")
        + (f": {item.detail}" if item.detail else "")
        for item in tracking.milestones
    )
    lines.extend(
        f"Fallout: {case.trigger}" + (f" — {case.handling}" if case.handling else "")
        for case in tracking.fallout
    )
    return lines


def _journey_text(
    journey: Journey, names: dict[str, str], offerings: dict[str, ProductOffering]
) -> str:
    """A journey as evidence: each activity in order with the system that performs it, so a
    requirement about a step of an order finds the systems around it (ADR-0096)."""
    offering = offerings.get(journey.product_id or "")
    order = next(
        (
            item.name
            for item in (offering.order_types if offering else ())
            if item.code == journey.order_type_code
        ),
        journey.order_type_code,
    )
    whose = " › ".join(part for part in (offering.name if offering else None, order) if part)
    title = f"Journey: {journey.name}" + (f" ({whose})" if whose else "")
    lines = [title, journey.description or ""]
    for step in journey.ordered:
        performer = names.get(step.performing_system_id or "", step.performing_system_id or "")
        helpers = ", ".join(names.get(item, item) for item in step.supporting_system_ids)
        what = step.system_function or step.description or ""
        lines.append(
            f"{step.number}. {step.name}"
            + (f" — {performer}" if performer else "")
            + (f" (with {helpers})" if helpers else "")
            + (f": {what}" if what else "")
        )
    lines.extend(
        f"{link.from_activity} → {link.to_activity}: "
        + ", ".join(part for part in (link.interaction, link.interface, link.payload) if part)
        for link in journey.integrations
        if link.interaction or link.interface or link.payload
    )
    return "\n".join(line for line in lines if line)


# How a catalogue record's chunks are located: "system rtf", "product bpp", "journey bpp-new".
_LOCATION = {
    LinkedEntity.SYSTEM: "system",
    LinkedEntity.OFFERING: "product",
    LinkedEntity.JOURNEY: "journey",
}


def _header(release: ArchitectureKnowledge, entity: LinkedEntity, entity_id: str, name: str) -> str:
    """The line every window of a catalogue record starts with, so a window cut from the
    middle of a long record still says whose it is and which capabilities it realises."""
    labels = {item.id: item.pref_label for item in release.business_capabilities}
    concepts = "; ".join(labels[item] for item in record_concepts(release, entity, entity_id))
    header = f"Catalogue {entity.value}: {name}"
    return header + (f" · capabilities: {concepts}" if concepts else "")


def _data_lines(
    release: ArchitectureKnowledge, system: SystemDefinition, names: dict[str, str]
) -> tuple[str, ...]:
    """What a system masters and reads, and the interfaces it exposes and consumes
    (ontology plan Phase 8); none for a system that records none, so its text stays."""
    labels = {item.id: item.pref_label for item in release.vocabulary}
    by_id = {item.id: item for item in release.interfaces}

    def carried(interface: SystemInterface) -> str:
        said = [labels[item] for item in (*interface.open_api_ids, *interface.entity_ids)]
        return f" ({', '.join(said)})" if said else ""

    return (
        *(
            (f"Masters: {', '.join(labels[item] for item in system.masters)}",)
            if system.masters
            else ()
        ),
        *((f"Reads: {', '.join(labels[item] for item in system.reads)}",) if system.reads else ()),
        *(
            f"Exposes: {item.name}{carried(item)}"
            + (
                f" to {', '.join(names[other] for other in item.consumer_ids)}"
                if item.consumer_ids
                else ""
            )
            + "".join(
                f", relaying {by_id[other].name} from {names[by_id[other].system_id]}"
                for other in item.relays
            )
            for item in release.interfaces
            if item.system_id == system.id
        ),
        *(
            f"Consumes: {item.name}{carried(item)} from {names[item.system_id]}"
            for item in release.interfaces
            if system.id in item.consumer_ids
        ),
    )


def _kind(item: SystemRelationship) -> str:
    words = _KIND_WORDS.get(item.kind)
    return f" ({words})" if words else ""


def _set_key(kind: str, profile: str, *parts: str) -> str:
    """A chunk set's key: what kind it is, then a hash of how and what it was cut from."""
    digest = hashlib.sha256("\0".join((profile, *parts)).encode("utf-8")).hexdigest()
    return f"{kind}:{digest[:40]}"


class BuildArchitectureIndex:
    def __init__(
        self,
        knowledge: ManageArchitectureKnowledge,
        index: ArchitectureEvidenceIndexPort,
        storage: DocumentStoragePort,
        extractor: LocatedDocumentExtractorPort,
        tokenizer: ArchitectureTokenizerPort,
    ) -> None:
        self._knowledge = knowledge
        self._index = index
        self._storage = storage
        self._extractor = extractor
        self._tokenizer = tokenizer

    @property
    def profile(self) -> str:
        return self._index.profile

    @staticmethod
    def _chunk_id(source: str, location: str, content: str) -> str:
        return hashlib.sha256(f"{source}\0{location}\0{content}".encode()).hexdigest()[:24]

    def _windows(self, content: str, location: str) -> tuple[tuple[str, str], ...]:
        spans = self._tokenizer.spans(content)
        if not spans:
            return ()
        if len(spans) <= 500:
            return ((location, content),)
        windows: list[tuple[str, str]] = []
        start = 0
        while start < len(spans):
            end = min(start + 500, len(spans))
            text = content[spans[start][0] : spans[end - 1][1]]
            windows.append((f"{location}, tokens {start + 1}-{end}", text))
            if end == len(spans):
                break
            start = end - 75
        return tuple(windows)

    def _tokens(self, text: str) -> int:
        return len(self._tokenizer.spans(text))

    def _parents_and_children(
        self, document_id: str, title: str, segments: tuple[LocatedText, ...]
    ) -> list[IndexedRecord]:
        """A document's section-v4 chunks (ADR section-v4): each parent, read with its full
        heading path, then its children, searched with a compact header."""
        records: list[IndexedRecord] = []
        for parent in plan_document(segments, self._tokens):
            text = f"{' / '.join((title, *parent.headings))}\n{parent.body}"
            parent_id = self._chunk_id(document_id, parent.location, text)
            records.append(
                IndexedRecord(
                    EvidenceChunk(
                        parent_id,
                        title,
                        parent.location,
                        text,
                        document_id,
                        role=ChunkRole.PARENT,
                        aliases=parent.aliases,
                    )
                )
            )
            compact = f"{title} › {parent.headings[-1]}" if parent.headings else title
            for child in parent.children:
                lines = (compact, *((child.context,) if child.context else ()), child.text)
                embedded = "\n".join(lines)
                records.append(
                    IndexedRecord(
                        EvidenceChunk(
                            self._chunk_id(document_id, child.location, embedded),
                            title,
                            child.location,
                            embedded,
                            document_id,
                            role=ChunkRole.CHILD,
                            parent_id=parent_id,
                            aliases=child.aliases,
                        )
                    )
                )
        return records

    def _sections(
        self, title: str, segments: tuple[LocatedText, ...]
    ) -> tuple[tuple[str, str, str], ...]:
        """(header, location, body) per chunk: passages packed under their headings.

        A single Word paragraph rarely says enough on its own, so consecutive
        passages under the same headings are packed up to SECTION_TOKENS and every
        chunk starts with "title / heading / subheading". The cells of one table
        row become one chunk. Headings only prefix their section.
        """
        result: list[tuple[str, str, str]] = []
        group: list[LocatedText] = []

        def flush() -> None:
            if not group:
                return
            first = group[0]
            header = " / ".join((title, *first.heading_path))
            if first.block is not None:
                result.append((header, first.block, " | ".join(item.text for item in group)))
            else:
                location = span(first.location, group[-1].location)
                result.append((header, location, "\n".join(item.text for item in group)))
            group.clear()

        for segment in segments:
            if segment.heading:
                flush()
                continue
            if group:
                same_block = segment.block is not None and segment.block == group[0].block
                packable = (
                    segment.block is None
                    and group[0].block is None
                    and segment.heading_path == group[0].heading_path
                    and self._tokens("\n".join((*(item.text for item in group), segment.text)))
                    <= SECTION_TOKENS
                )
                if not (same_block or packable):
                    flush()
            group.append(segment)
        flush()
        return tuple(result)

    def execute(
        self,
        release_id: str,
        expected_revision: int,
        actor_id: str,
        *,
        fence: Callable[[], None],
    ) -> ArchitectureKnowledge:
        """Build and record the release's evidence index.

        `fence` runs before each write, so a job attempt that lost its lease
        stops before storing an index or marking the release built.
        """
        release = self._knowledge.get(release_id)
        if (
            release.status is not KnowledgeReleaseStatus.DRAFT
            or release.revision != expected_revision
        ):
            raise KnowledgeConflictError("The build no longer matches this draft.")
        records: list[IndexedRecord] = []
        sectioned = self._index.version is IndexVersion.SECTION_V4

        def record(
            entity: LinkedEntity, entity_id: str, source: str, name: str, content: str
        ) -> None:
            header = _header(release, entity, entity_id, name)
            located = f"{_LOCATION[entity]} {entity_id}"
            windows = (
                record_windows(content, located, self._tokens)
                if sectioned
                else self._windows(content, located)
            )
            for location, part in windows:
                text = f"{header}\n{part}"
                chunk = EvidenceChunk(self._chunk_id(source, location, text), name, location, text)
                records.append(IndexedRecord(chunk, entity, entity_id))

        names = {system.id: system.name for system in release.systems}
        # Every link, stated or read from interfaces and journeys, so a system's record names
        # what it depends on even where no connection is stated.
        connected = connections(release)
        for system in release.systems:
            content = "\n".join(
                line
                for line in (
                    system.name,
                    system.name_ar or "",
                    *system.aliases,
                    # Lines only when present, so chunks of older systems keep their text.
                    system.description or "",
                    _landscape(release, system.landscape_domain_id),
                    *(
                        f"{item.name}{_domain(release, item.domain_id)}: {', '.join(item.triggers)}"
                        for item in system.capabilities
                    ),
                    *system.constraints,
                    *(
                        f"Depends on: {names.get(item.target_system_id, item.target_system_id)}"
                        f"{_kind(item)} — {item.description}"
                        for item in connected
                        if item.source_system_id == system.id
                    ),
                    *(
                        f"Used by: {names.get(item.source_system_id, item.source_system_id)}"
                        f"{_kind(item)} — {item.description}"
                        for item in connected
                        if item.target_system_id == system.id
                    ),
                    *_data_lines(release, system, names),
                )
                if line
            )
            record(LinkedEntity.SYSTEM, system.id, system.id, system.name, content)
        for offering in release.products:
            record(
                LinkedEntity.OFFERING,
                offering.id,
                f"product:{offering.id}",
                offering.name,
                _offering_text(offering, names, {item.id: item for item in release.realisations}),
            )
        offerings = {item.id: item for item in release.products}
        for journey in release.journeys:
            record(
                LinkedEntity.JOURNEY,
                journey.id,
                f"journey:{journey.id}",
                journey.name,
                _journey_text(journey, names, offerings),
            )
        profile = self._index.profile
        # The catalogue's records are one chunk set, reused while the catalogue is unchanged.
        records_key = _set_key(
            "records", profile, *(f"{r.chunk.id}:{r.chunk.text}" for r in records)
        )
        self._index.store_set(records_key, tuple(item.chunk for item in records))
        members = [records_key]
        reused = cut_count = 0
        for document in release.documents:
            # A document version's chunks depend only on its file, its title and how it is
            # cut, so they are cut and embedded once and shared by every build.
            key = _set_key("document", profile, document.id, document.checksum, document.title)
            stored = self._index.chunk_set(key)
            if stored is None:
                cut = self._document_records(document, sectioned)
                self._index.store_set(key, tuple(item.chunk for item in cut))
                records.extend(cut)
                cut_count += 1
            else:
                records.extend(IndexedRecord(chunk) for chunk in stored)
                reused += 1
            members.append(key)
        chunks = [item.chunk for item in records]
        # Embedded before storing, through the index's cache, so nothing is embedded twice.
        texts = texts_to_embed(release, tuple(records))
        vectors = dict(zip(texts, self._index.vectors(texts), strict=True))
        links = build_links(release, tuple(records), vectors, mentions=sectioned)
        index_id = uuid4().hex
        fence()
        # Passages a curator marked outdated stay readable but are never searched.
        marked = {(item.version_id, item.location) for item in release.outdated_passages}
        outdated = tuple(
            chunk.id for chunk in chunks if (chunk.document_version_id, chunk.location) in marked
        )
        self._index.store(release.id, index_id, (), tuple(dict.fromkeys(members)), outdated)
        fence()
        self._index.link(index_id, links)
        content_hash = hashlib.sha256(
            "".join(f"{chunk.id}:{chunk.text}\n" for chunk in chunks).encode("utf-8")
        ).hexdigest()
        fence()
        built = self._knowledge.mark_built(
            release_id, expected_revision, profile, content_hash, actor_id, index_id
        )
        # The draft's earlier builds are never read again, nor the sets only they read.
        self._index.prune(release.id, index_id)
        collected = self._index.collect()
        # One line per build, so what a build reused and what it cut can be watched.
        _LOGGER.info(
            "Architecture index %s built for %s: %d chunks, %d texts to embed; "
            "documents reused %d, cut %d; %d unread chunk sets collected",
            index_id,
            release.id,
            len(chunks),
            len(texts),
            reused,
            cut_count,
            collected,
        )
        return built

    def _document_records(
        self, document: KnowledgeDocumentVersion, sectioned: bool
    ) -> list[IndexedRecord]:
        """A document version's chunks, cut from its stored file."""
        document_id, title = document.id, document.title
        document_bytes = self._storage.get(DocumentVersionId(document.storage_key))
        segments = self._extractor.extract(document.mime_type, document_bytes)
        if sectioned:
            return self._parents_and_children(document_id, title, segments)
        records: list[IndexedRecord] = []
        for header, location, body in self._sections(title, segments):
            for part_location, part in self._windows(body, location):
                text = f"{header}\n{part}"
                records.append(
                    IndexedRecord(
                        EvidenceChunk(
                            self._chunk_id(document_id, part_location, text),
                            title,
                            part_location,
                            text,
                            document_id,
                        )
                    )
                )
        return records
