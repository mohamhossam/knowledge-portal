"""Build immutable architecture evidence from a draft release."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from uuid import uuid4

from smb_kernel.documents.ports import DocumentStoragePort

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    EvidenceChunk,
)
from knowledge_portal.application.ports.architecture_tokenizer import ArchitectureTokenizerPort
from knowledge_portal.application.ports.located_document_extractor import (
    LocatedDocumentExtractorPort,
    LocatedText,
)
from knowledge_portal.application.use_cases.architecture_knowledge import (
    ManageArchitectureKnowledge,
)
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeConflictError,
    KnowledgeReleaseStatus,
    RelationshipKind,
    SystemRelationship,
)
from knowledge_portal.domain.architecture.products import ProductOffering, RealisationLayer
from knowledge_portal.domain.document.value_objects import DocumentVersionId

SECTION_TOKENS = 400
_NUMBERED = re.compile(r"^(?P<unit>[a-z]+) (?P<number>\d+)$")
_LINES = re.compile(r"^lines? (?P<start>\d+)(?:-(?P<end>\d+))?$")
_SHEET_ROW = re.compile(r"^sheet (?P<sheet>\d+), row (?P<row>\d+)$")


def _span(first: str, last: str) -> str:
    """ "paragraph 12" and "paragraph 15" read as "paragraphs 12–15", and likewise rows."""
    if first == last:
        return first
    lines = _LINES.match(first), _LINES.match(last)
    if lines[0] and lines[1]:
        # Markdown passages mix "line 4" (a table row) with "lines 6-9" (a paragraph).
        return f"lines {lines[0]['start']}-{lines[1]['end'] or lines[1]['start']}"
    start, end = _NUMBERED.match(first), _NUMBERED.match(last)
    if start and end and start["unit"] == end["unit"]:
        return f"{start['unit']}s {start['number']}–{end['number']}"
    rows = _SHEET_ROW.match(first), _SHEET_ROW.match(last)
    if rows[0] and rows[1] and rows[0]["sheet"] == rows[1]["sheet"]:
        return f"sheet {rows[0]['sheet']}, rows {rows[0]['row']}–{rows[1]['row']}"
    return f"{first} – {last}"


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


def _offering_text(offering: ProductOffering, names: dict[str, str]) -> str:
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
            for item in component.realisation
        )
    lines.extend(
        f"Non-functional requirement {item.quality} ({item.coverage.value})"
        + (f": {item.statement}" if item.statement else "")
        for item in offering.nfrs
    )
    lines.extend(_tracking_lines(offering, names))
    lines.extend(_lifecycle_lines(offering))
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


def _kind(item: SystemRelationship) -> str:
    words = _KIND_WORDS.get(item.kind)
    return f" ({words})" if words else ""


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
                location = _span(first.location, group[-1].location)
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
        chunks: list[EvidenceChunk] = []
        names = {system.id: system.name for system in release.systems}
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
                        f"Depends on: {names[item.target_system_id]}{_kind(item)}"
                        f" — {item.description}"
                        for item in release.relationships
                        if item.source_system_id == system.id
                    ),
                    *(
                        f"Used by: {names[item.source_system_id]}{_kind(item)} — {item.description}"
                        for item in release.relationships
                        if item.target_system_id == system.id
                    ),
                )
                if line
            )
            for location, text in self._windows(content, f"system {system.id}"):
                chunks.append(
                    EvidenceChunk(
                        self._chunk_id(system.id, location, text), system.name, location, text
                    )
                )
        for offering in release.products:
            content = _offering_text(offering, names)
            for location, text in self._windows(content, f"product {offering.id}"):
                chunks.append(
                    EvidenceChunk(
                        self._chunk_id(f"product:{offering.id}", location, text),
                        offering.name,
                        location,
                        text,
                    )
                )
        offerings = {item.id: item for item in release.products}
        for journey in release.journeys:
            content = _journey_text(journey, names, offerings)
            for location, text in self._windows(content, f"journey {journey.id}"):
                chunks.append(
                    EvidenceChunk(
                        self._chunk_id(f"journey:{journey.id}", location, text),
                        journey.name,
                        location,
                        text,
                    )
                )
        for document in release.documents:
            document_bytes = self._storage.get(DocumentVersionId(document.storage_key))
            segments = self._extractor.extract(document.mime_type, document_bytes)
            for header, location, body in self._sections(document.title, segments):
                for part_location, part in self._windows(body, location):
                    text = f"{header}\n{part}"
                    chunks.append(
                        EvidenceChunk(
                            self._chunk_id(document.id, part_location, text),
                            document.title,
                            part_location,
                            text,
                            document.id,
                        )
                    )
        index_id = uuid4().hex
        fence()
        self._index.store(release.id, index_id, tuple(chunks))
        content_hash = hashlib.sha256(
            "".join(f"{chunk.id}:{chunk.text}\n" for chunk in chunks).encode("utf-8")
        ).hexdigest()
        profile = self._index.profile
        fence()
        return self._knowledge.mark_built(
            release_id, expected_revision, profile, content_hash, actor_id, index_id
        )
