"""What an evidence index links each chunk to: catalogue entities and capability concepts.

A catalogue record's links are exact: the record is that system's, offering's or
journey's own, and the catalogue says which concepts its capabilities and components
realise. A passage's concept links come from the text: a concept's label is in it,
and the embedding check agrees the passage is about that concept (ADR-0114).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from knowledge_portal.application.ports.architecture_rag import (
    ChunkConceptLink,
    ChunkEntityLink,
    ConceptBasis,
    EntityRole,
    EvidenceChunk,
    IndexedConcept,
    IndexLinks,
    LinkedEntity,
)
from knowledge_portal.domain.architecture.concepts import BusinessCapability, labels_in
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge

# A label link stands only when the concept is among the passage's nearest concepts by
# embedding. A rank, not a similarity threshold, so it means the same for every model.
NEAREST_CONCEPTS = 3


@dataclass(frozen=True)
class IndexedRecord:
    """A chunk and the catalogue entity whose record it is; None for a document passage."""

    chunk: EvidenceChunk
    entity: LinkedEntity | None = None
    entity_id: str | None = None


def concept_path(release: ArchitectureKnowledge, concept_id: str) -> str:
    """ "Service › Managed Wi-Fi access points": its domain, then the concepts down to it."""
    domain = release.concept_domain(concept_id)
    names = [item.pref_label for item in release.concept_path(concept_id)]
    return " › ".join([domain.name, *names] if domain else names)


def _indexed(release: ArchitectureKnowledge, concept: BusinessCapability) -> IndexedConcept:
    path = concept_path(release, concept.id)
    text = "\n".join(
        line
        for line in (
            concept.pref_label,
            "; ".join(concept.alt_labels),
            path,
            concept.definition or "",
        )
        if line
    )
    domain = release.concept_domain(concept.id)
    return IndexedConcept(
        concept.id, concept.pref_label, concept.labels, path, domain.id if domain else None, text
    )


def concept_scheme(release: ArchitectureKnowledge) -> tuple[IndexedConcept, ...]:
    return tuple(_indexed(release, item) for item in release.business_capabilities)


def record_concepts(
    release: ArchitectureKnowledge, entity: LinkedEntity | None, entity_id: str | None
) -> tuple[str, ...]:
    """The concepts the catalogue links a record to: a system's capabilities' concepts,
    an offering's components' concepts. A journey and a passage have none of their own."""
    if entity is LinkedEntity.SYSTEM:
        system = next(item for item in release.systems if item.id == entity_id)
        found = (item.concept_id for item in system.capabilities if item.concept_id)
    elif entity is LinkedEntity.OFFERING:
        offering = next(item for item in release.products if item.id == entity_id)
        found = (concept for part in offering.components for concept in part.capability_ids)
    else:
        return ()
    return tuple(dict.fromkeys(found))


def _entities(release: ArchitectureKnowledge, record: IndexedRecord) -> tuple[ChunkEntityLink, ...]:
    if record.entity is None or record.entity_id is None:
        return ()
    chunk_id = record.chunk.id
    named: list[tuple[LinkedEntity, str]] = []
    if record.entity is LinkedEntity.OFFERING:
        offering = next(item for item in release.products if item.id == record.entity_id)
        named.extend(
            (LinkedEntity.SYSTEM, item.system_id)
            for part in offering.components
            for item in part.responsibilities
        )
    elif record.entity is LinkedEntity.JOURNEY:
        journey = next(item for item in release.journeys if item.id == record.entity_id)
        if journey.product_id:
            named.append((LinkedEntity.OFFERING, journey.product_id))
        for step in journey.ordered:
            if step.performing_system_id:
                named.append((LinkedEntity.SYSTEM, step.performing_system_id))
            named.extend((LinkedEntity.SYSTEM, item) for item in step.supporting_system_ids)
    return (
        ChunkEntityLink(chunk_id, record.entity, record.entity_id, EntityRole.RECORD),
        *(
            ChunkEntityLink(chunk_id, entity, entity_id, EntityRole.NAMES)
            for entity, entity_id in dict.fromkeys(named)
        ),
    )


def _cosine(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return sum(a * b for a, b in zip(left, right, strict=True)) / norm if norm else 0.0


def build_links(
    release: ArchitectureKnowledge,
    records: tuple[IndexedRecord, ...],
    vectors: dict[str, tuple[float, ...]],
) -> IndexLinks:
    """Every chunk's links. `vectors` holds the embedding of each concept's indexed text
    and of each chunk text a label was found in (see `texts_to_embed`)."""
    scheme = concept_scheme(release)
    entities: list[ChunkEntityLink] = []
    concepts: list[ChunkConceptLink] = []
    for record in records:
        entities.extend(_entities(release, record))
        exact = record_concepts(release, record.entity, record.entity_id)
        concepts.extend(
            ChunkConceptLink(record.chunk.id, item, ConceptBasis.CATALOGUE, 1.0) for item in exact
        )
        found = [
            item
            for item in labels_in(record.chunk.text, release.business_capabilities)
            if item not in exact
        ]
        if not found:
            continue
        text = vectors[record.chunk.text]
        nearness = sorted(
            ((_cosine(text, vectors[item.text]), item.concept_id) for item in scheme),
            reverse=True,
        )
        nearest = {concept_id: score for score, concept_id in nearness[:NEAREST_CONCEPTS]}
        concepts.extend(
            ChunkConceptLink(record.chunk.id, item, ConceptBasis.LABEL, round(nearest[item], 4))
            for item in found
            if item in nearest
        )
    return IndexLinks(tuple(entities), tuple(concepts), scheme)


def texts_to_embed(
    release: ArchitectureKnowledge, records: tuple[IndexedRecord, ...]
) -> tuple[str, ...]:
    """The concept texts, and the chunk texts that name a concept, for the embedding check."""
    if not release.business_capabilities:
        return ()
    named = (
        record.chunk.text
        for record in records
        if labels_in(record.chunk.text, release.business_capabilities)
    )
    return tuple(dict.fromkeys((*(item.text for item in concept_scheme(release)), *named)))
