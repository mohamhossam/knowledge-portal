"""A historic Requirement's delivered Azure DevOps breakdown, read-only (Knowledge Center E).

Only the Agile hierarchy is imported: Epic → Feature → User Story. Work items of other types
found beneath it (Task, Bug) are counted, never imported. Nothing here is ever written back to
Azure DevOps (ADR-0102).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

# Bounds on what one work item may carry, so one import stays a reasonable size.
TITLE_MAX = 512
TEXT_MAX = 20_000
TAGS_MAX = 50


class WorkItemType(StrEnum):
    EPIC = "epic"
    FEATURE = "feature"
    USER_STORY = "user_story"


# Azure DevOps' Agile type names, and the level each sits at.
AGILE_TYPES: dict[str, WorkItemType] = {
    "Epic": WorkItemType.EPIC,
    "Feature": WorkItemType.FEATURE,
    "User Story": WorkItemType.USER_STORY,
}
_LEVEL = {WorkItemType.EPIC: 0, WorkItemType.FEATURE: 1, WorkItemType.USER_STORY: 2}


@dataclass(frozen=True)
class WorkItem:
    """One work item as Azure DevOps held it at `revision`."""

    id: int
    type: WorkItemType
    title: str
    state: str
    revision: int
    url: str
    description: str = ""
    acceptance_criteria: str = ""
    area_path: str = ""
    iteration_path: str = ""
    tags: tuple[str, ...] = ()
    parent_id: int | None = None
    child_ids: tuple[int, ...] = ()

    def __post_init__(self) -> None:
        if self.id < 1 or self.revision < 1:
            raise ValueError("A work item has a positive id and revision.")
        if not self.title.strip() or len(self.title) > TITLE_MAX:
            raise ValueError(f"Work item {self.id} has no usable title.")
        for text in (self.description, self.acceptance_criteria):
            if len(text) > TEXT_MAX:
                raise ValueError(f"Work item {self.id} carries more text than an import keeps.")
        if len(self.tags) > TAGS_MAX:
            raise ValueError(f"Work item {self.id} carries too many tags.")


# The fields a refresh compares, in the order a change is described.
COMPARED = (
    "title",
    "state",
    "description",
    "acceptance_criteria",
    "area_path",
    "iteration_path",
    "tags",
    "parent_id",
    "child_ids",
    "type",
)


class ItemProblem(StrEnum):
    NOT_FOUND = "not_found"
    NOT_PERMITTED = "not_permitted"
    UNSUPPORTED_TYPE = "unsupported_type"
    OVER_LIMIT = "over_limit"


@dataclass(frozen=True)
class ItemError:
    """A root or child that could not be imported, and why."""

    work_item_id: int
    problem: ItemProblem
    detail: str = ""


@dataclass(frozen=True)
class LineageNode:
    item: WorkItem
    children: tuple[LineageNode, ...] = ()


@dataclass(frozen=True)
class Breakdown:
    """The roots a BRD was delivered as, and everything under them, as read at `fetched_at`."""

    root_ids: tuple[int, ...]
    items: tuple[WorkItem, ...]
    fetched_at: datetime
    # Other types beneath the hierarchy, by their Azure DevOps name, with how many there were.
    not_imported: tuple[tuple[str, int], ...] = ()
    errors: tuple[ItemError, ...] = ()

    def __post_init__(self) -> None:
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("A breakdown lists each work item once.")

    def item(self, work_item_id: int) -> WorkItem | None:
        return next((item for item in self.items if item.id == work_item_id), None)

    def count(self, kind: WorkItemType) -> int:
        return sum(item.type is kind for item in self.items)

    def lineage(self) -> tuple[LineageNode, ...]:
        """The roots that were read, each with its imported descendants, in Azure DevOps order."""
        by_id = {item.id: item for item in self.items}

        def node(item: WorkItem, seen: frozenset[int]) -> LineageNode:
            children = tuple(
                node(by_id[child], seen | {item.id})
                for child in item.child_ids
                if child in by_id and child not in seen and _below(by_id[child], item)
            )
            return LineageNode(item, children)

        return tuple(node(by_id[root], frozenset()) for root in self.root_ids if root in by_id)

    @property
    def reachable(self) -> bool:
        return bool(self.lineage())


def _below(child: WorkItem, parent: WorkItem) -> bool:
    return _LEVEL[child.type] > _LEVEL[parent.type]


def not_imported_counts(type_names: list[str]) -> tuple[tuple[str, int], ...]:
    return tuple(sorted(Counter(type_names).items()))


class ChangeKind(StrEnum):
    ADDED = "added"
    REMOVED = "removed"
    CHANGED = "changed"


@dataclass(frozen=True)
class ItemChange:
    kind: ChangeKind
    work_item_id: int
    title: str
    # The fields that changed, by name, for a changed item.
    fields: tuple[str, ...] = field(default=())


def breakdown_diff(before: Breakdown, after: Breakdown) -> tuple[ItemChange, ...]:
    """What a refresh would change: items added, removed, and changed field by field."""
    old = {item.id: item for item in before.items}
    new = {item.id: item for item in after.items}
    changes: list[ItemChange] = []
    for item in after.items:
        previous = old.get(item.id)
        if previous is None:
            changes.append(ItemChange(ChangeKind.ADDED, item.id, item.title))
            continue
        changed = tuple(name for name in COMPARED if getattr(previous, name) != getattr(item, name))
        if changed:
            changes.append(ItemChange(ChangeKind.CHANGED, item.id, item.title, changed))
    changes.extend(
        ItemChange(ChangeKind.REMOVED, item.id, item.title)
        for item in before.items
        if item.id not in new
    )
    return tuple(changes)
