"""A drafted offering and journey for a new-offering verdict (ontology plan Phase 9).

When a requirement is assessed as a new offering, in a family or as a new product line, the
assessment drafts what the catalogue would hold: an offering and the journey that fulfils
it. The draft is built by fixed rules from the release, never by a model, so the same
requirement against the same release always gives the same draft:

1. Start from the nearest offering. Keep its components that deliver a needed capability
   concept, and its order types.
2. For each needed concept they leave uncovered, reuse a component of another offering that
   delivers it; else add a component, delivered by each system that realises the concept;
   else, when nothing realises it, add the component with no system and an open question
   for architecture review.
3. Start the journey from the nearest offering's journey for the order the requirement
   names (else its first). Keep the steps that serve a kept component or none, and add a
   step for each added component, performed by its system.

Nothing here reaches the catalogue: requirement-portal sends the draft with the approved
backlog, and a curator edits and accepts it as two suggestions, the offering first.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, replace

from knowledge_portal.domain.architecture.drafts import OfferingDraft
from knowledge_portal.domain.architecture.governance import OpenQuestion
from knowledge_portal.domain.architecture.impact_graph import realisers
from knowledge_portal.domain.architecture.invariants import (
    required,
)
from knowledge_portal.domain.architecture.journeys import (
    MAIN_TRACK,
    Activity,
    Journey,
    activity_order,
)
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.architecture.products import (
    ComponentResponsibility,
    OfferingComponent,
    ProductOffering,
    SourceConfidence,
)

# How long a drafted offering's name may be: the requirement's title, cut at a word.
NAME_LIMIT = 80
# The role a drafted responsibility gives a realising system.
DELIVERS = "DELIVERS"
STEP = 10
SLUG_LIMIT = 48


def slug(value: str) -> str:
    """An id from a name, cut at a word to fit: "Cloud video surveillance" gives
    "cloud-video-surveillance"."""
    text = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    if len(text) <= SLUG_LIMIT:
        return text
    return text[: SLUG_LIMIT + 1].rsplit("-", 1)[0]


def _free(base: str, taken: Iterable[str]) -> str:
    used = {item.casefold() for item in taken}
    candidate, number = base, 2
    while candidate.casefold() in used:
        candidate, number = f"{base}-{number}", number + 1
    return candidate


def _free_name(base: str, taken: Iterable[str]) -> str:
    used = {item.casefold().strip() for item in taken}
    candidate, number = base, 2
    while candidate.casefold() in used:
        candidate, number = f"{base} ({number})", number + 1
    return candidate


def draft_name(text: Iterable[str]) -> str:
    """The requirement's title, its first line, cut at a word to fit."""
    first = next((line.strip() for item in text for line in item.splitlines() if line.strip()), "")
    name = " ".join(first.split()).rstrip(" ,.;:-") or "New offering"
    if len(name) <= NAME_LIMIT:
        return name
    cut = name[: NAME_LIMIT - 1].rsplit(" ", 1)[0].rstrip(" ,.;:-")
    return f"{cut}…"


def _label(release: ArchitectureKnowledge, concept_id: str) -> str:
    return next(
        (item.pref_label for item in release.business_capabilities if item.id == concept_id),
        concept_id,
    )


def _ordered(release: ArchitectureKnowledge, concept_id: str) -> tuple[str, ...]:
    """The systems that realise the concept by their own capability first, each once."""
    found = realisers(release, concept_id)
    own = [item.system_id for item in found if len(item.steps) == 2]
    return tuple(dict.fromkeys([*own, *(item.system_id for item in found)]))


def _reusable(
    release: ArchitectureKnowledge, concept_id: str, nearest: ProductOffering | None
) -> OfferingComponent | None:
    """A component of another offering that delivers the concept, with a responsible system."""
    for offering in release.products:
        if nearest is not None and offering.id == nearest.id:
            continue
        for part in offering.components:
            if concept_id in part.capability_ids and part.responsibilities:
                return part
    return None


def _within(part: OfferingComponent, codes: set[str]) -> OfferingComponent:
    """The component with its responsibilities' order types kept to the draft's own."""
    return replace(
        part,
        responsibilities=tuple(
            replace(
                duty,
                order_types=tuple(item for item in duty.order_types if item.casefold() in codes),
            )
            for duty in part.responsibilities
        ),
    )


@dataclass(frozen=True)
class _Added:
    """A component the draft adds, and the concept it was added for."""

    component: OfferingComponent
    concept_id: str
    label: str


def _components(
    release: ArchitectureKnowledge,
    needed: tuple[str, ...],
    nearest: ProductOffering | None,
    codes: set[str],
    source: str,
) -> tuple[tuple[OfferingComponent, ...], tuple[_Added, ...], tuple[OpenQuestion, ...]]:
    wanted = set(needed)
    kept = tuple(
        _within(replace(part, confidence=SourceConfidence.INFERRED, source=source), codes)
        for part in (nearest.components if nearest else ())
        if wanted & set(part.capability_ids)
    )
    covered = {concept for part in kept for concept in part.capability_ids}
    ids = [part.id for part in kept]
    added: list[_Added] = []
    questions: list[OpenQuestion] = []
    for concept_id in needed:
        if concept_id in covered:
            continue
        label = _label(release, concept_id)
        reused = _reusable(release, concept_id, nearest)
        if reused is not None:
            part = _within(
                replace(
                    reused,
                    id=_free(reused.id, ids),
                    confidence=SourceConfidence.INFERRED,
                    source=source,
                ),
                codes,
            )
            covered.update(part.capability_ids)
        else:
            systems = _ordered(release, concept_id)
            part = OfferingComponent(
                id=_free(slug(label) or "component", ids),
                name=label,
                description=f"Delivers {label}.",
                responsibilities=tuple(
                    ComponentResponsibility(
                        system_id=system_id,
                        role=DELIVERS,
                        description=f"Realises {label}.",
                        confidence=SourceConfidence.INFERRED,
                        source=source,
                    )
                    for system_id in systems
                ),
                confidence=SourceConfidence.INFERRED if systems else SourceConfidence.GAP,
                source=source,
                capability_ids=(concept_id,),
            )
            covered.add(concept_id)
            if not systems:
                questions.append(
                    OpenQuestion(
                        id=_free(
                            f"realise-{slug(label) or 'capability'}", (q.id for q in questions)
                        ),
                        text=f"Which system will realise {label}?",
                        impact="No system in the release realises it, so architecture review "
                        "decides before the offering can be delivered.",
                        confidence=SourceConfidence.GAP,
                        source=source,
                    )
                )
        ids.append(part.id)
        added.append(_Added(part, concept_id, label))
    return kept, tuple(added), tuple(questions)


def _base_journey(
    release: ArchitectureKnowledge, nearest: ProductOffering | None, order_code: str | None
) -> Journey | None:
    if nearest is None:
        return None
    journeys = [item for item in release.journeys if item.product_id == nearest.id]
    named = next(
        (
            item
            for item in journeys
            if order_code is not None
            and (item.order_type_code or "").casefold() == order_code.casefold()
        ),
        None,
    )
    return named or (journeys[0] if journeys else None)


def _next_numbers(activities: Iterable[Activity], count: int) -> tuple[str, ...]:
    """Numbers after the last numbered step, in tens."""
    numbers = [activity_order(item.number) for item in activities]
    last = max((int(value) for rank, value, _ in numbers if rank == 0), default=0)
    start = (last // STEP + 1) * STEP
    return tuple(str(start + STEP * index) for index in range(count))


def _journey(
    release: ArchitectureKnowledge,
    offering: ProductOffering,
    base: Journey | None,
    kept: tuple[OfferingComponent, ...],
    added: tuple[_Added, ...],
    source: str,
) -> Journey:
    keep = {part.id for part in kept}
    steps = tuple(
        replace(
            item,
            component_ids=tuple(part for part in item.component_ids if part in keep),
            confidence=SourceConfidence.INFERRED,
            source=source,
        )
        for item in (base.ordered if base else ())
        if not item.component_ids or keep & set(item.component_ids)
    )
    numbers = {item.number for item in steps}
    rules = tuple(
        rule
        for rule in (base.flow_rules if base else ())
        if {rule.from_activity, rule.to_activity, rule.rejoin_at or rule.to_activity} <= numbers
    )
    links = tuple(
        link
        for link in (base.integrations if base else ())
        if {link.from_activity, link.to_activity} <= numbers
    )
    new = tuple(
        Activity(
            number=number,
            name=item.label,
            track=MAIN_TRACK,
            performing_system_id=systems[0] if systems else None,
            supporting_system_ids=systems[1:],
            description=f"Delivers {item.label}."
            if systems
            else f"No system realises {item.label} yet; see the offering's open question.",
            component_ids=(item.component.id,),
            confidence=SourceConfidence.INFERRED if systems else SourceConfidence.GAP,
            source=source,
        )
        for item, number in zip(added, _next_numbers(steps, len(added)), strict=True)
        for systems in (
            tuple(dict.fromkeys(duty.system_id for duty in item.component.responsibilities)),
        )
    )
    order = base.order_type_code if base else None
    if order is None and offering.order_types:
        order = offering.order_types[0].code
    order_name = next(
        (item.name for item in offering.order_types if order and item.code == order), None
    )
    name = base.name if base else (order_name or "Fulfilment")
    return Journey(
        id=_free(
            f"{offering.id}-{slug(order or 'journey') or 'journey'}",
            (item.id for item in release.journeys),
        ),
        name=name,
        product_id=offering.id,
        order_type_code=order,
        description=f"Drafted from {base.name}." if base else None,
        activities=(*steps, *new),
        flow_rules=rules,
        integrations=links,
        confidence=SourceConfidence.INFERRED,
        source=source,
    )


def draft_offering(
    release: ArchitectureKnowledge,
    *,
    name: str,
    needed: tuple[str, ...],
    nearest: ProductOffering | None,
    in_family: bool,
    source: str,
    order_code: str | None = None,
) -> OfferingDraft:
    """The offering and journey a new-offering verdict proposes, by the rules above.

    ``needed`` is in the order the requirement names its capabilities; ``in_family`` keeps
    the nearest offering's family and portfolio node, which a new product line leaves for a
    curator to place.
    """
    source = required(source, "Source")
    base_name = _free_name(
        required(name, "Offering name"), (item.name for item in release.products)
    )
    codes = {item.code.casefold() for item in (nearest.order_types if nearest else ())}
    kept, added, questions = _components(release, needed, nearest, codes, source)
    offering = ProductOffering(
        id=_free(slug(base_name) or "new-offering", (item.id for item in release.products)),
        name=base_name,
        family=nearest.family if nearest and in_family else None,
        lifecycle="Proposed",
        order_types=tuple(
            replace(item, confidence=SourceConfidence.INFERRED, source=source)
            for item in (nearest.order_types if nearest else ())
        ),
        components=(*kept, *(item.component for item in added)),
        confidence=SourceConfidence.INFERRED,
        source=source,
        questions=questions,
        portfolio_node_id=nearest.portfolio_node_id if nearest and in_family else None,
    )
    journey = (
        _journey(
            release,
            offering,
            _base_journey(release, nearest, order_code),
            kept,
            added,
            source,
        )
        if offering.components
        else None
    )
    return OfferingDraft(offering, journey, nearest.id if nearest else None)
