"""Where historic Requirements are kept (Knowledge Center E)."""

from __future__ import annotations

from collections.abc import Collection
from typing import Protocol

from knowledge_portal.domain.historic.historic_requirement import (
    HistoricRequirement,
    HistoricStatus,
)


class HistoricRequirementNotFoundError(Exception):
    """No historic requirement has that id."""


class HistoricRequirementConflictError(Exception):
    """It changed since it was read; reload before acting again."""


class HistoricRequirementsPort(Protocol):
    def add(self, item: HistoricRequirement) -> None: ...

    def get(self, historic_id: str) -> HistoricRequirement | None: ...

    def save(self, item: HistoricRequirement, expected_version: int) -> None:
        """Replace the stored record at `expected_version`, or raise the conflict error."""
        ...

    def remove(self, historic_id: str, expected_version: int) -> None:
        """Delete a draft at `expected_version`, or raise the conflict error."""
        ...

    def list(
        self, status: HistoricStatus | None, query: str, offset: int, limit: int
    ) -> tuple[HistoricRequirement, ...]:
        """Newest first; `query` matches the title, case-insensitively."""
        ...

    def holding(self, checksum: str) -> HistoricRequirement | None:
        """The record one of whose BRDs has this checksum, if any."""
        ...

    def counts(self) -> dict[HistoricStatus, int]: ...

    def refresh_waiting(self) -> int:
        """How many published records have a newer read waiting to be accepted or discarded."""
        ...

    def rooted_in(
        self, work_item_ids: Collection[int], limit: int
    ) -> tuple[HistoricRequirement, ...]:
        """Records any of whose root work items is one of these, newest first, at most `limit`."""
        ...
