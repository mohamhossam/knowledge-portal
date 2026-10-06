"""Confirmations that catalogue systems are still right (Knowledge Center D)."""

from typing import Protocol

from knowledge_portal.domain.shared.review import ReviewConfirmation


class SystemReviewsPort(Protocol):
    def latest(self, system_ids: tuple[str, ...]) -> dict[str, ReviewConfirmation]:
        """Each system's most recent confirmation; systems never confirmed are absent."""
        ...

    def add(self, system_ids: tuple[str, ...], confirmation: ReviewConfirmation) -> None: ...

    def history(self, system_id: str, limit: int) -> tuple[ReviewConfirmation, ...]:
        """Newest first."""
        ...
