"""The lanes of a requirement assessment: terms, shortlists, offering fit, graph and passages.

Each lane reads the pinned release (and its evidence index) only. What a model said is
checked before it reaches here; what leaves here carries release ids alone.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    EvidenceChunk,
)
from knowledge_portal.application.ports.requirement_assessment import (
    CatalogueTerm,
    CatalogueTerms,
    ConceptBasis,
    ConceptOption,
    LinkedFacet,
    SystemCandidate,
)
from knowledge_portal.application.use_cases.architecture_evidence import named_systems
from knowledge_portal.application.use_cases.capability_domain_fallback import (
    contains,
    normalise,
)
from knowledge_portal.application.use_cases.index_links import concept_path
from knowledge_portal.domain.architecture.assessment import (
    ChangeType,
    Facet,
    FacetKind,
    PathKind,
    PathStep,
    SystemRole,
    speeds_in,
)
from knowledge_portal.domain.architecture.concepts import label_key, labels_in
from knowledge_portal.domain.architecture.impact_graph import (
    composes,
    delivering_systems,
    realisers,
    serves,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.products import OfferingComponent, ProductOffering
from knowledge_portal.domain.architecture.verdicts import OfferingFit, ProductVerdict

SHORTLIST_LIMIT = 10
PASSAGES_PER_FACET = 3
EVIDENCE_LIMIT = 24


def component_labels(part: OfferingComponent) -> tuple[str, ...]:
    """A component's name, its name without what is in brackets, each bracketed name and its
    code: "Access point (FortiAP)" goes by "Access point" and "FortiAP" too."""
    bare = " ".join(re.sub(r"\([^)]*\)", " ", part.name).split())
    inner = tuple(item.strip() for item in re.findall(r"\(([^)]*)\)", part.name))
    return tuple(
        dict.fromkeys(item for item in (part.name, bare, *inner, part.code or "") if item.strip())
    )


def _segment_level(level: str) -> bool:
    return "segment" in level.casefold()


def order_type_id(offering: ProductOffering, code: str) -> str:
    return f"{offering.id}/{code}"


def catalogue_terms(release: ArchitectureKnowledge) -> CatalogueTerms:
    """The release's offerings, segments, families, channels and order types, by id."""
    return CatalogueTerms(
        offerings=tuple(
            CatalogueTerm(item.id, tuple(label for label in (item.name, item.code) if label))
            for item in release.products
        ),
        segments=tuple(
            CatalogueTerm(item.id, (item.name,))
            for item in release.portfolio
            if _segment_level(item.level)
        ),
        families=tuple(
            CatalogueTerm(item.id, (item.name,))
            for item in release.portfolio
            if not _segment_level(item.level)
        ),
        channels=tuple(CatalogueTerm(item.id, (item.name,)) for item in release.channels),
        order_types=tuple(
            CatalogueTerm(order_type_id(offering, order.code), (order.name, order.code))
            for offering in release.products
            for order in offering.order_types
        ),
    )


def named_components(
    release: ArchitectureKnowledge, text: str
) -> tuple[tuple[ProductOffering, OfferingComponent], ...]:
    corpus = normalise(text)
    return tuple(
        (offering, part)
        for offering in release.products
        for part in offering.components
        if any(contains(corpus, label) for label in component_labels(part))
    )


def shortlist(
    release: ArchitectureKnowledge,
    index: ArchitectureEvidenceIndexPort,
    index_id: str,
    need: Facet,
) -> tuple[ConceptOption, ...]:
    """The concepts a need could mean: by label, by a component it names, then by the index."""
    concepts = {item.id: item for item in release.business_capabilities}
    found: dict[str, ConceptBasis] = {}
    for concept_id in labels_in(need.text, release.business_capabilities):
        found.setdefault(concept_id, ConceptBasis.LABEL)
    for _, part in named_components(release, need.text):
        for concept_id in part.capability_ids:
            found.setdefault(concept_id, ConceptBasis.COMPONENT)
    for match in index.match_concepts(index_id, need.text, SHORTLIST_LIMIT):
        found.setdefault(match.concept_id, ConceptBasis.INDEX)
    return tuple(
        ConceptOption(
            concept_id,
            concepts[concept_id].pref_label,
            concepts[concept_id].labels,
            concept_path(release, concept_id),
            basis,
            concepts[concept_id].definition,
        )
        for concept_id, basis in list(found.items())[:SHORTLIST_LIMIT]
        if concept_id in concepts
    )


def portfolio_ancestry(release: ArchitectureKnowledge, node_id: str | None) -> tuple[str, ...]:
    by_id = {item.id: item for item in release.portfolio}
    path: list[str] = []
    current = by_id.get(node_id or "")
    while current is not None and current.id not in path:
        path.append(current.id)
        current = by_id.get(current.parent_id or "")
    return tuple(path)


def _plan_words(offering: ProductOffering) -> tuple[tuple[str, ...], tuple[float, ...]]:
    """Every plan's words, and the speeds its tiers are named by (else every speed stated)."""
    texts = [
        text
        for plan in offering.plans
        for text in (
            plan.name,
            *(f"{item.name} {item.value}" for item in plan.characteristics),
        )
    ]
    tiers = tuple(speed for plan in offering.plans for speed in speeds_in(plan.name))
    return tuple(label_key(item) for item in texts), tiers or tuple(
        speed for item in texts for speed in speeds_in(item)
    )


def new_values(offering: ProductOffering, facets: Iterable[Facet]) -> tuple[str, ...]:
    """The characteristic values the requirement sets that none of the offering's plans has.

    A speed is compared in Mbps with the speeds the plans' tiers are named by, so a 100 Mbps
    plan is new even where a faster plan uploads at 100 Mbps; anything else by its words.
    """
    keys, speeds = _plan_words(offering)
    found: list[str] = []
    for facet in facets:
        if facet.kind is not FacetKind.CHARACTERISTIC:
            continue
        stated = speeds_in(facet.text)
        if stated:
            if not any(abs(value - known) < 0.5 for value in stated for known in speeds):
                found.append(facet.text)
        elif not any(label_key(facet.text) in key for key in keys):
            found.append(facet.text)
    return tuple(dict.fromkeys(found))


def excluded_components(
    release: ArchitectureKnowledge, offering: ProductOffering, facets: Iterable[Facet]
) -> tuple[str, ...]:
    """The offering's mandatory components an "excluded" facet leaves out, by name or concept."""
    found: list[str] = []
    for facet in facets:
        if facet.kind is not FacetKind.EXCLUDED:
            continue
        concepts = set(labels_in(facet.text, release.business_capabilities))
        corpus = normalise(facet.text)
        found.extend(
            part.id
            for part in offering.components
            if part.mandatory
            and (
                concepts & set(part.capability_ids)
                or any(contains(corpus, label) for label in component_labels(part))
            )
        )
    return tuple(dict.fromkeys(found))


def excluded_concepts(release: ArchitectureKnowledge, facets: Iterable[Facet]) -> frozenset[str]:
    found: set[str] = set()
    for facet in facets:
        if facet.kind is FacetKind.EXCLUDED:
            found.update(labels_in(facet.text, release.business_capabilities))
            for _, part in named_components(release, facet.text):
                found.update(part.capability_ids)
    return frozenset(found)


def _fit(
    release: ArchitectureKnowledge,
    offering: ProductOffering,
    named: bool,
    needed: frozenset[str],
    facets: tuple[Facet, ...],
) -> OfferingFit:
    ancestry = set(portfolio_ancestry(release, offering.portfolio_node_id))
    segments = [item for item in facets if item.kind is FacetKind.SEGMENT]
    return OfferingFit(
        offering.id,
        named,
        composes(offering, needed),
        serves(release, offering, needed),
        excluded_components(release, offering, facets),
        new_values(offering, facets),
        any(item.ref_id is None or item.ref_id not in ancestry for item in segments),
    )


def offering_fit(
    release: ArchitectureKnowledge, needed: frozenset[str], facets: tuple[Facet, ...]
) -> OfferingFit | None:
    """The offering in question: the one the requirement names (or names an order type of),
    else the one covering most of what it needs, composing first. None when it names none
    and none covers anything."""
    named = {item.ref_id for item in facets if item.kind is FacetKind.OFFERING and item.ref_id}
    # An order type is its offering's own, so naming one names the offering.
    named.update(
        offering.id
        for offering in release.products
        for item in facets
        if item.kind is FacetKind.ORDER_TYPE
        and item.ref_id
        and item.ref_id.startswith(f"{offering.id}/")
    )
    fits = [
        _fit(release, offering, offering.id in named, needed, facets)
        for offering in release.products
    ]
    ranked = sorted(
        (item for item in fits if item.named or item.covered),
        key=lambda item: (not item.named, -len(item.covered), -len(item.composed)),
    )
    return ranked[0] if ranked else None


def new_family(facets: Iterable[Facet]) -> bool:
    """The requirement names a product family or line of business the portfolio lacks."""
    return any(item.kind is FacetKind.FAMILY and item.ref_id is None for item in facets)


@dataclass
class _Candidate:
    name: str
    role: SystemRole
    paths: list[tuple[PathStep, ...]] = field(default_factory=list)


_ROLE_RANK = {SystemRole.PRIMARY: 0, SystemRole.CHANNEL: 1, SystemRole.NAMED: 2}


def facet_step(position: int, facet: LinkedFacet) -> PathStep:
    return PathStep(PathKind.FACET, f"{facet.kind.value}-{position}", facet.text)


def graph_lane(
    release: ArchitectureKnowledge,
    facets: tuple[LinkedFacet, ...],
    offering_id: str | None,
    text: str,
    declared: Iterable[str] = (),
) -> tuple[SystemCandidate, ...]:
    """Every system a curated link reaches from the requirement, with its paths.

    From each need's concepts to the systems that realise them, keeping those the offering
    in question already uses when some do, and dropping the entry systems of channels the
    requirement does not name when it names one. Then each named channel's entry system,
    then the systems the text or the caller names.
    """
    names = {item.id: item.name for item in release.systems}
    channels = {item.id: item for item in release.channels}
    named_channels = {
        item.ref_id for item in facets if item.kind is FacetKind.CHANNEL and item.ref_id
    }
    other_entries = {
        item.entry_system_id
        for item in release.channels
        if item.id not in named_channels and item.entry_system_id
    } - {channels[item].entry_system_id for item in named_channels if item in channels}
    offering = next((item for item in release.products if item.id == offering_id), None)
    used = delivering_systems(release, offering) if offering else frozenset()
    found: dict[str, _Candidate] = {}

    def add(system_id: str, role: SystemRole, path: tuple[PathStep, ...] = ()) -> None:
        candidate = found.setdefault(system_id, _Candidate(names[system_id], role))
        if _ROLE_RANK[role] < _ROLE_RANK[candidate.role]:
            candidate.role = role
        if path and path not in candidate.paths:
            candidate.paths.append(path)

    for position, facet in enumerate(facets, start=1):
        if facet.kind is FacetKind.NEED:
            for concept in facet.concepts:
                reached = [
                    item
                    for item in realisers(release, concept.concept_id)
                    if not (named_channels and item.system_id in other_entries)
                ]
                preferred = [item for item in reached if item.system_id in used]
                for item in preferred or reached:
                    add(
                        item.system_id,
                        SystemRole.PRIMARY,
                        (facet_step(position, facet), *item.steps),
                    )
        elif facet.kind is FacetKind.CHANNEL and facet.ref_id in channels:
            channel = channels[facet.ref_id]
            if channel.entry_system_id in names:
                add(
                    channel.entry_system_id,
                    SystemRole.CHANNEL,
                    (
                        facet_step(position, facet),
                        PathStep(PathKind.CHANNEL, channel.id, channel.name),
                        PathStep(
                            PathKind.SYSTEM,
                            channel.entry_system_id,
                            names[channel.entry_system_id],
                        ),
                    ),
                )
    for system in named_systems(release, text):
        add(system.id, SystemRole.NAMED)
    for raw in declared:
        key = raw.strip().casefold()
        known = next(
            (
                system
                for system in release.systems
                if key
                and key
                in {
                    value.casefold()
                    for value in (system.id, system.name, system.name_ar or "", *system.aliases)
                }
            ),
            None,
        )
        if known is not None:
            add(known.id, SystemRole.NAMED)
    return tuple(
        SystemCandidate(system_id, item.name, item.role, tuple(item.paths))
        for system_id, item in found.items()
    )


def passage_lane(
    index: ArchitectureEvidenceIndexPort,
    index_id: str,
    facets: tuple[LinkedFacet, ...],
    candidates: tuple[SystemCandidate, ...],
) -> tuple[EvidenceChunk, ...]:
    """The candidates' own records, then for each need the passages about its concepts (any
    passage when it links to none), each passage once."""
    chunks: dict[str, EvidenceChunk] = {}
    for candidate in candidates:
        record = index.system_chunk(index_id, candidate.system_id)
        if record is not None:
            chunks.setdefault(record.id, record)
    for facet in facets:
        if facet.kind is not FacetKind.NEED:
            continue
        ids = tuple(item.concept_id for item in facet.concepts)
        found = (
            index.concept_chunks(index_id, facet.text, ids, PASSAGES_PER_FACET)
            if ids
            else index.retrieve(index_id, facet.text, PASSAGES_PER_FACET)
        )
        for chunk in found:
            chunks.setdefault(chunk.id, chunk)
    return tuple(chunks.values())[:EVIDENCE_LIMIT]


def suggested_change_type(
    facets: Iterable[LinkedFacet], verdict: ProductVerdict | None
) -> ChangeType:
    """The change type to start from: the requirement's own, else configure for a new plan
    (a catalogue change), else modify."""
    stated = next(
        (item.ref_id for item in facets if item.kind is FacetKind.CHANGE_TYPE and item.ref_id),
        None,
    )
    if stated is not None:
        return ChangeType(stated)
    return ChangeType.CONFIGURE if verdict is ProductVerdict.NEW_PLAN else ChangeType.MODIFY


def concept_reach(
    release: ArchitectureKnowledge, text: str
) -> dict[str, tuple[tuple[PathStep, ...], ...]]:
    """For one backlog item's text, each system a curated link reaches, with its paths.

    From the concepts whose labels the text holds, or that a component it names links to,
    to the systems that realise them; and from each channel it names to its entry system.
    Per-item mapping uses it to explain the systems it selected, never to select more.
    """
    concepts = dict.fromkeys(labels_in(text, release.business_capabilities))
    for _, part in named_components(release, text):
        concepts.update(dict.fromkeys(part.capability_ids))
    found: dict[str, list[tuple[PathStep, ...]]] = {}
    for concept_id in concepts:
        for item in realisers(release, concept_id):
            paths = found.setdefault(item.system_id, [])
            if item.steps not in paths:
                paths.append(item.steps)
    names = {item.id: item.name for item in release.systems}
    corpus = normalise(text)
    for channel in release.channels:
        if channel.entry_system_id in names and contains(corpus, channel.name):
            found.setdefault(channel.entry_system_id, []).append(
                (
                    PathStep(PathKind.CHANNEL, channel.id, channel.name),
                    PathStep(
                        PathKind.SYSTEM, channel.entry_system_id, names[channel.entry_system_id]
                    ),
                )
            )
    return {system_id: tuple(paths) for system_id, paths in found.items()}
