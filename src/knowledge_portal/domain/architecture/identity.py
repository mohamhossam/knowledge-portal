"""Stable identity across releases: renamed and retired entities, followed one way.

An offering or journey keeps the ids it had before a rename (`former_ids`, ADR-0124), so
anything that still names an old id — a precedent, a change request, a delivery, requirement
work's saved assessment — finds the entity it meant. A rename moves every reference in
the release to the new id and records the old one. Renaming back to an earlier id takes it
out of the former ids, so a rename can be undone.

A system, offering, portfolio node, concept or term can instead be retired with the one
that replaces it (`deprecated`, `replaced_by`, ADR-0121). ``resolve`` follows both, so every
register outside a version that holds one of these ids — the organisation catalogue,
precedents, an assessment — reaches what the id names now (review recommendation 7).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import replace
from typing import Protocol

from knowledge_portal.domain.architecture.governance import SourceConflict
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, required
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.products import ProductOffering


class Identified(Protocol):
    @property
    def id(self) -> str: ...


def resolve[T: Identified](items: Iterable[T], any_id: str | None) -> T | None:
    """What an id names now: the entity holding it as its id or a former id, then, while that
    one is retired, the one that replaced it; None when nothing holds it or it was retired
    with nothing in its place."""
    if not any_id:
        return None
    pool = tuple(items)
    by_id = {item.id: item for item in pool}
    found = by_id.get(any_id) or next(
        (item for item in pool if any_id in getattr(item, "former_ids", ())), None
    )
    seen: set[str] = set()
    while found is not None and getattr(found, "deprecated", False):
        if found.id in seen:
            return None
        seen.add(found.id)
        successor_id = getattr(found, "replaced_by", None)
        found = by_id.get(successor_id) if successor_id else None
    return found


def resolved_id[T: Identified](items: Iterable[T], any_id: str | None) -> str | None:
    """The id of what ``any_id`` names now; see ``resolve``."""
    found = resolve(items, any_id)
    return found.id if found is not None else None


def forwards[T: Identified](items: Iterable[T]) -> dict[str, tuple[str, bool]]:
    """Every id that no longer names an entity in service but leads to one: the id it leads
    to, and whether it is the same entity renamed (True) or another that replaced it."""
    pool = tuple(items)
    held = {item.id for item in pool} | {
        old for item in pool for old in getattr(item, "former_ids", ())
    }
    found: dict[str, tuple[str, bool]] = {}
    for any_id in sorted(held):
        target = resolve(pool, any_id)
        if target is None or target.id == any_id:
            continue
        found[any_id] = (target.id, any_id in getattr(target, "former_ids", ()))
    return found


def check_former_ids(kind: str, items: Iterable[ProductOffering | Journey]) -> None:
    """Within one kind, an id is held, current or former, by one entity only."""
    seen: dict[str, str] = {}
    for item in items:
        for held in (item.id, *item.former_ids):
            if held in seen and seen[held] != item.id:
                raise InvalidKnowledgeError(
                    f"The {kind} id {held!r} is held by both {seen[held]!r} and {item.id!r}."
                )
            seen[held] = item.id


def current_id(items: Iterable[ProductOffering | Journey], any_id: str | None) -> str | None:
    """The current id of the entity an id names, current or former; None when none does."""
    if any_id is None:
        return None
    for item in items:
        if item.id == any_id or any_id in item.former_ids:
            return item.id
    return None


def _formerly(former_ids: tuple[str, ...], old_id: str, new_id: str) -> tuple[str, ...]:
    """The former ids after a rename from ``old_id`` to ``new_id``."""
    return tuple(item for item in (*former_ids, old_id) if item != new_id)


def renamed_offering(
    products: tuple[ProductOffering, ...],
    journeys: tuple[Journey, ...],
    conflicts: tuple[SourceConflict, ...],
    old_id: str,
    new_id: str,
) -> tuple[tuple[ProductOffering, ...], tuple[Journey, ...], tuple[SourceConflict, ...]]:
    """The offerings, journeys and conflicts after an offering's id changes."""
    new_id = required(new_id, "New id")
    if not any(item.id == old_id for item in products):
        raise InvalidKnowledgeError(f"No offering has the id {old_id!r}.")
    if new_id == old_id:
        raise InvalidKnowledgeError("The new id is the offering's id already.")
    return (
        tuple(
            replace(item, id=new_id, former_ids=_formerly(item.former_ids, old_id, new_id))
            if item.id == old_id
            else item
            for item in products
        ),
        tuple(
            replace(item, product_id=new_id) if item.product_id == old_id else item
            for item in journeys
        ),
        tuple(
            replace(
                conflict,
                scope=tuple(
                    replace(scope, product_id=new_id) if scope.product_id == old_id else scope
                    for scope in conflict.scope
                ),
            )
            for conflict in conflicts
        ),
    )


def renamed_journey(journeys: tuple[Journey, ...], old_id: str, new_id: str) -> tuple[Journey, ...]:
    """The journeys after one's id changes; nothing else in a version names a journey."""
    new_id = required(new_id, "New id")
    if not any(item.id == old_id for item in journeys):
        raise InvalidKnowledgeError(f"No journey has the id {old_id!r}.")
    if new_id == old_id:
        raise InvalidKnowledgeError("The new id is the journey's id already.")
    return tuple(
        replace(item, id=new_id, former_ids=_formerly(item.former_ids, old_id, new_id))
        if item.id == old_id
        else item
        for item in journeys
    )
