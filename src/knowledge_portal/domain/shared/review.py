"""Re-confirming knowledge on a cycle (Knowledge Center D), and acting for its owner (C).

A library document or a catalogue system is confirmed as still right by whoever answers for
it, or by a knowledge admin on their behalf with a reason. It falls due again a set number
of days later. Being due never takes it out of use: it is only flagged.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum

from smb_kernel.documents.model import InvalidDocumentError

from knowledge_portal.domain.identity.entities import ActorSnapshot
from knowledge_portal.domain.shared.staleness import require_aware

# Long enough to say why; short enough to show beside the action it explains.
ADMIN_REASON_MAX = 500
NOTE_MAX = 500
# Reminders start this long before a review falls due.
REMINDER_WINDOW = timedelta(days=14)


@dataclass(frozen=True)
class AdminOverride:
    """A knowledge admin acting for the owner of what they act on, and why (Knowledge Center C)."""

    admin: ActorSnapshot
    reason: str

    def __post_init__(self) -> None:
        if not self.reason.strip() or len(self.reason) > ADMIN_REASON_MAX:
            raise InvalidDocumentError(
                f"Acting as admin requires a reason up to {ADMIN_REASON_MAX} characters."
            )


@dataclass(frozen=True)
class ReviewConfirmation:
    """Someone confirmed the knowledge is still right, on this day."""

    reviewed_at: datetime
    reviewer: ActorSnapshot
    note: str | None = None
    on_behalf: AdminOverride | None = None

    def __post_init__(self) -> None:
        require_aware(self.reviewed_at, "review time")
        if self.note is not None and (not self.note.strip() or len(self.note) > NOTE_MAX):
            raise InvalidDocumentError(f"A review note is up to {NOTE_MAX} characters.")
        if self.on_behalf is not None and self.on_behalf.admin.id != self.reviewer.id:
            raise InvalidDocumentError("An admin's confirmation names the admin who made it.")


class ReviewState(StrEnum):
    CURRENT = "current"
    # Falls due within the reminder window.
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"


@dataclass(frozen=True)
class ReviewStanding:
    """When it was last confirmed, by whom, and when it falls due."""

    last_reviewed_at: datetime
    reviewer: ActorSnapshot
    due_at: datetime
    state: ReviewState

    @property
    def due_on(self) -> date:
        return self.due_at.date()


def standing(
    last_reviewed_at: datetime, reviewer: ActorSnapshot, cycle: timedelta, now: datetime
) -> ReviewStanding:
    """Where a review stands now; due on the day the cycle ends, overdue once it has passed."""
    require_aware(last_reviewed_at, "review time")
    due_at = last_reviewed_at + cycle
    if now >= due_at:
        state = ReviewState.OVERDUE
    elif now >= due_at - REMINDER_WINDOW:
        state = ReviewState.DUE_SOON
    else:
        state = ReviewState.CURRENT
    return ReviewStanding(last_reviewed_at, reviewer, due_at, state)
