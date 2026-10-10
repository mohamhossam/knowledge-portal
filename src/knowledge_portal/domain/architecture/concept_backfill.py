"""Proposing a concept scheme from the capabilities a catalogue already lists (ADR-0114).

Systems name their capabilities in their own words, so one business capability is
often listed by several systems. The backfill proposes one concept per distinct
capability name, merging the systems that share it, with the capabilities'
matching phrases as other labels. It only proposes: a maintainer reviews each
concept, and each merge, before anything is linked.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from knowledge_portal.domain.architecture.concepts import (
    BusinessCapability,
    CapabilityRef,
    concept_id_for,
    label_key,
)
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    KnowledgeCapability,
    SystemDefinition,
)


@dataclass(frozen=True)
class ConceptProposal:
    concept: BusinessCapability
    # The unlinked capabilities it covers, in catalogue order.
    capabilities: tuple[CapabilityRef, ...]
    # True when the concept is already in the draft and the proposal links more to it.
    existing: bool = False


def _unlinked(
    release: ArchitectureKnowledge,
) -> dict[str, list[tuple[SystemDefinition, KnowledgeCapability]]]:
    """Capabilities nobody has linked or marked as having no concept, by their name's words."""
    groups: dict[str, list[tuple[SystemDefinition, KnowledgeCapability]]] = {}
    for system in release.systems:
        for capability in system.capabilities:
            if capability.concept_id is None and capability.unlinked_reason is None:
                groups.setdefault(label_key(capability.name), []).append((system, capability))
    return groups


def propose_concepts(release: ArchitectureKnowledge) -> tuple[ConceptProposal, ...]:
    """One proposal per distinct unlinked capability name.

    A name that is already a concept's label links to that concept. Otherwise a new
    concept takes the first spelling as its label and is placed in the capabilities'
    domain when they all share one. Matching phrases become other labels unless
    another concept, or another proposal's name, already uses them.
    """
    owners = {
        label_key(label): concept
        for concept in release.business_capabilities
        for label in concept.labels
    }
    groups = _unlinked(release)
    # Every proposal's own name first, so a phrase never takes another proposal's name.
    claimed = set(owners) | set(groups)
    taken = {concept.id for concept in release.business_capabilities}
    proposals: list[ConceptProposal] = []
    for key, members in groups.items():
        refs = tuple(CapabilityRef(system.id, capability.id) for system, capability in members)
        phrases: list[str] = []
        for _, capability in members:
            for phrase in capability.triggers:
                phrase_key = label_key(phrase)
                if phrase_key and phrase_key not in claimed:
                    claimed.add(phrase_key)
                    phrases.append(phrase.strip())
        existing = owners.get(key)
        if existing is not None:
            proposals.append(
                ConceptProposal(
                    replace(existing, alt_labels=(*existing.alt_labels, *phrases)), refs, True
                )
            )
            continue
        label = members[0][1].name.strip()
        domains = {capability.domain_id for _, capability in members}
        concept_id = concept_id_for(label, taken)
        taken.add(concept_id)
        proposals.append(
            ConceptProposal(
                BusinessCapability(
                    concept_id,
                    label,
                    tuple(phrases),
                    domain_id=next(iter(domains)) if len(domains) == 1 else None,
                ),
                refs,
            )
        )
    return tuple(proposals)
