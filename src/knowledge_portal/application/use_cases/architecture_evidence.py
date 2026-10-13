"""The evidence a mapping reasons over: named systems first, then search results."""

from __future__ import annotations

import re

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    EvidenceChunk,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    SystemDefinition,
)

EVIDENCE_LIMIT = 8
MIN_SEARCH_RESULTS = 6


# A label this short matches only as written or in capitals: "IN" is the system, "in" a word.
SHORT_LABEL = 3


def _labels(system: SystemDefinition) -> tuple[str, ...]:
    """Its name, Arabic name and aliases, and its id when the id is not one of them."""
    labels = tuple(item for item in (system.name, system.name_ar or "", *system.aliases) if item)
    if system.id.casefold() not in {item.casefold() for item in labels}:
        labels = (*labels, system.id)
    return labels


def _names(label: str, text: str) -> bool:
    if len(label.strip()) <= SHORT_LABEL:
        return any(
            re.search(rf"(?<!\w){re.escape(form)}(?!\w)", text) is not None
            for form in {label.strip(), label.strip().upper()}
        )
    return re.search(rf"(?<!\w){re.escape(label.casefold())}(?!\w)", text.casefold()) is not None


def named_systems(release: ArchitectureKnowledge, text: str) -> tuple[SystemDefinition, ...]:
    """Catalogue systems whose id, name, Arabic name or alias appears as a whole word.

    A label of three characters or fewer matches only as written or in capitals, so the
    English word "in" never names the system IN.
    """
    return tuple(
        system
        for system in release.systems
        if any(_names(label, text) for label in _labels(system))
    )


def gather_evidence(
    index: ArchitectureEvidenceIndexPort,
    release: ArchitectureKnowledge,
    index_id: str,
    text: str,
) -> tuple[EvidenceChunk, ...]:
    """The record of every system the text names, then the best search results.

    Search alone can rank a named system's own record below document passages
    and drop it; the catalogue is authoritative, so a system named outright is
    always backed by its record. At least six slots stay open for search.
    """
    named = tuple(
        chunk
        for system in named_systems(release, text)
        if (chunk := index.system_chunk(index_id, system.id)) is not None
    )
    searched = tuple(
        chunk
        for chunk in index.retrieve(index_id, text, EVIDENCE_LIMIT + len(named))
        if chunk.id not in {item.id for item in named}
    )
    room = max(MIN_SEARCH_RESULTS, EVIDENCE_LIMIT - len(named))
    return (*named, *searched[:room])
