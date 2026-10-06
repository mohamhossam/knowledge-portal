"""Reading a delivered breakdown from Azure DevOps, read-only (Knowledge Center E, ADR-0102).

There is no write here, by design: an import never changes Azure DevOps. An architecture test
holds every implementation of this port to that.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from knowledge_portal.domain.historic.work_items import ItemError, WorkItem

# Called as items are read: how many so far, and how many are known to exist.
Progress = Callable[[int, int], None]


@dataclass(frozen=True)
class WorkItemTree:
    """What one read found under the roots: the Agile items, the rest counted, and the misses."""

    items: tuple[WorkItem, ...]
    not_imported: tuple[tuple[str, int], ...] = ()
    errors: tuple[ItemError, ...] = ()


class AdoNotConfiguredError(Exception):
    """No Azure DevOps connection is configured, so no breakdown can be read."""


class AdoUnavailableError(Exception):
    """Azure DevOps did not answer, or answered with something unusable."""


class AdoWorkItemSourcePort(Protocol):
    def read_tree(
        self, root_ids: tuple[int, ...], max_items: int, progress: Progress
    ) -> WorkItemTree:
        """The roots and every Epic, Feature and User Story beneath them, up to `max_items`."""
        ...
