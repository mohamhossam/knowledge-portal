"""Retiring a system, concept or vocabulary term without deleting it (ADR-0121).

A deprecated entity stays in every release and reads everywhere; selection and matching
leave it out. ``replaced_by`` names the entity of the same type that takes its place, so a
reference to the old one can be forwarded instead of flagged as gone.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from typing import Protocol

from knowledge_portal.domain.architecture.invariants import InvalidKnowledgeError, optional


class Retirable(Protocol):
    @property
    def id(self) -> str: ...

    @property
    def deprecated(self) -> bool: ...

    @property
    def replaced_by(self) -> str | None: ...


def check_retirement(item: Retirable, name: str) -> None:
    """One entity: a successor is never itself, and naming one retires it."""
    object.__setattr__(item, "replaced_by", optional(item.replaced_by, "Replaced by"))
    if item.replaced_by == item.id:
        raise InvalidKnowledgeError(f"{name} cannot replace itself.")
    if item.replaced_by is not None:
        object.__setattr__(item, "deprecated", True)


def check_replacements[T: Retirable](
    items: Sequence[T], noun: str, alike: Callable[[T, T], bool] = lambda _a, _b: True
) -> None:
    """Across a release: each successor is one of ``items`` and ``alike`` the one it
    replaces, and no chain of replacements comes back round."""
    by_id = {item.id: item for item in items}
    for item in items:
        if item.replaced_by is None:
            continue
        replacement = by_id.get(item.replaced_by)
        if replacement is None:
            raise InvalidKnowledgeError(
                f"{noun} {item.id!r} is replaced by {item.replaced_by!r}, which is not in the "
                "catalogue."
            )
        if not alike(item, replacement):
            raise InvalidKnowledgeError(
                f"{noun} {item.id!r} can only be replaced by one of its own kind, not "
                f"{replacement.id!r}."
            )
    for item in items:
        seen, current = {item.id}, item
        while current.replaced_by is not None:
            current = by_id[current.replaced_by]
            if current.id in seen:
                raise InvalidKnowledgeError(f"{noun} {item.id!r} ends up replaced by itself.")
            seen.add(current.id)


def in_service[T: Retirable](items: Iterable[T]) -> tuple[T, ...]:
    """What selection and matching may choose: everything not deprecated."""
    return tuple(item for item in items if not item.deprecated)


def successor[T: Retirable](items: Sequence[T], item_id: str) -> T | None:
    """What stands in the place of ``item_id`` now: itself while in service, else the last
    of its replacements that is in service; None when it is gone or retired for good."""
    by_id = {item.id: item for item in items}
    current = by_id.get(item_id)
    while current is not None and current.deprecated:
        current = by_id.get(current.replaced_by) if current.replaced_by else None
    return current
