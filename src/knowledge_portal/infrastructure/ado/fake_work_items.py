"""An offline Azure DevOps: a packaged Agile backlog, read the way the REST adapter will read.

It walks down from the roots in batches, reporting progress, and keeps Epic, Feature and User
Story items while counting other types beneath them. Some ids are forbidden and unknown ids are
not found, so the import's error report has something to show. Items with a "later" entry move
on after the first read, so a refresh has something to compare (ADR-0102).
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from threading import Lock
from typing import Any

from knowledge_portal.application.ports.ado_work_items import Progress, WorkItemTree
from knowledge_portal.domain.historic.work_items import (
    AGILE_TYPES,
    ItemError,
    ItemProblem,
    WorkItem,
    not_imported_counts,
)
from knowledge_portal.infrastructure.ado.html_text import plain_text

FIXTURE = Path(__file__).parent / "fixtures" / "agile_backlog.json"
BATCH = 5
URL = "https://dev.azure.com/example/SMB/_workitems/edit/{}"


def _item(raw: dict[str, Any], later: bool) -> tuple[WorkItem | None, str]:
    data = {**raw, **(raw.get("later", {}) if later else {})}
    kind = AGILE_TYPES.get(str(data["type"]))
    if kind is None:
        return None, str(data["type"])
    item = WorkItem(
        id=int(data["id"]),
        type=kind,
        title=str(data["title"]),
        state=str(data["state"]),
        revision=int(data["revision"]),
        url=URL.format(data["id"]),
        description=plain_text(data.get("description")),
        acceptance_criteria=plain_text(data.get("acceptance")),
        area_path=str(data.get("area", "")),
        iteration_path=str(data.get("iteration", "")),
        tags=tuple(str(tag) for tag in data.get("tags", ())),
        parent_id=None if data.get("parent") is None else int(data["parent"]),
        child_ids=tuple(int(child) for child in data.get("children", ())),
    )
    return item, str(data["type"])


class FakeAdoWorkItemSource:
    def __init__(self, fixture: Path = FIXTURE) -> None:
        document = json.loads(fixture.read_text(encoding="utf-8"))
        self._raw: dict[int, dict[str, Any]] = {int(item["id"]): item for item in document["items"]}
        self._forbidden = frozenset(int(item) for item in document.get("forbidden", ()))
        self._reads: dict[int, int] = {}
        self._lock = Lock()

    def read_tree(
        self, root_ids: tuple[int, ...], max_items: int, progress: Progress
    ) -> WorkItemTree:
        with self._lock:
            later = {root: self._reads.get(root, 0) > 0 for root in root_ids}
            for root in root_ids:
                self._reads[root] = self._reads.get(root, 0) + 1
        items: list[WorkItem] = []
        others: list[str] = []
        errors: list[ItemError] = []
        seen: set[int] = set()
        # Breadth first from each root, as a WIQL tree query returns links.
        queue: list[tuple[int, bool, bool]] = [(root, later[root], True) for root in root_ids]
        while queue:
            batch, queue = queue[:BATCH], queue[BATCH:]
            for work_item_id, moved_on, is_root in batch:
                if work_item_id in seen:
                    continue
                seen.add(work_item_id)
                if work_item_id in self._forbidden:
                    errors.append(
                        ItemError(work_item_id, ItemProblem.NOT_PERMITTED, "No access to it.")
                    )
                    continue
                raw = self._raw.get(work_item_id)
                if raw is None:
                    errors.append(ItemError(work_item_id, ItemProblem.NOT_FOUND))
                    continue
                item, type_name = _item(raw, moved_on)
                if item is None:
                    if is_root:
                        errors.append(
                            ItemError(work_item_id, ItemProblem.UNSUPPORTED_TYPE, type_name)
                        )
                    else:
                        others.append(type_name)
                    continue
                if len(items) >= max_items:
                    errors.append(
                        ItemError(
                            work_item_id,
                            ItemProblem.OVER_LIMIT,
                            f"Only {max_items} work items are read in one import.",
                        )
                    )
                    queue = []
                    break
                items.append(item)
                queue.extend((child, moved_on, False) for child in item.child_ids)
            progress(len(items), len(items) + len(queue))
        # A child of a type that is not imported is not a child the lineage can show.
        kept = {item.id for item in items}
        items = [
            replace(item, child_ids=tuple(child for child in item.child_ids if child in kept))
            for item in items
        ]
        return WorkItemTree(tuple(items), not_imported_counts(others), tuple(errors))
