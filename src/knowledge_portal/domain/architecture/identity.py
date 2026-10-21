"""Stable identity for offerings and journeys across releases.

An offering or journey keeps the ids it had before a rename (`former_ids`), so anything
that still names an old id — a precedent, a change request, a delivery, requirement
work's saved assessment — finds the entity it meant. A rename moves every reference in
the release to the new id and records the old one. Renaming back to an earlier id takes it
out of the former ids, so a rename can be undone.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import replace

from knowledge_portal.domain.architecture.governance import SourceConflict
from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, required
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.products import ProductOffering


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
