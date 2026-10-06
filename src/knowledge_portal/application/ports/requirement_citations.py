"""How many Requirements cite each library document, from requirement work (C)."""

from typing import Protocol


class RequirementCitationCountsPort(Protocol):
    def counts(self, document_ids: tuple[str, ...]) -> dict[str, int]:
        """Requirements citing each document now, across the portfolio; 0 when none do.

        Fails as `ServiceUnavailableError` when requirement work cannot answer.
        """
        ...
