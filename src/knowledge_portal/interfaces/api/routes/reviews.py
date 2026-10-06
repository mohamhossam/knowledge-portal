"""Re-confirming knowledge on a cycle, and the signed-in person's reminders (Knowledge Center D)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from knowledge_portal.application.use_cases.document_library import DocumentLibrary, LibraryView
from knowledge_portal.application.use_cases.knowledge_reviews import (
    ConfirmLibraryReview,
    Reminders,
    ReviewReminders,
    SystemReviews,
    SystemStanding,
)
from knowledge_portal.domain.shared.review import (
    ADMIN_REASON_MAX,
    NOTE_MAX,
    ReviewConfirmation,
)
from knowledge_portal.interfaces.api.dependencies import (
    CurrentActorDep,
    get_document_library,
    get_library_review,
    get_review_reminders,
    get_system_reviews,
    require_authenticated_actor,
)

router = APIRouter(tags=["reviews"], dependencies=[Depends(require_authenticated_actor)])
LibraryDep = Annotated[DocumentLibrary, Depends(get_document_library)]
ConfirmDep = Annotated[ConfirmLibraryReview, Depends(get_library_review)]
SystemsDep = Annotated[SystemReviews, Depends(get_system_reviews)]
RemindersDep = Annotated[ReviewReminders, Depends(get_review_reminders)]

# One confirmation names at most this many systems; "all" names none.
MAX_SYSTEMS = 1000


class ReviewRequest(BaseModel):
    """Confirming it is still right: an optional note, and why when it is not yours."""

    note: str | None = Field(None, min_length=1, max_length=NOTE_MAX)
    reason: str | None = Field(None, min_length=1, max_length=ADMIN_REASON_MAX)


class SystemReviewRequest(ReviewRequest):
    # The systems to confirm; null confirms every system of the version in service.
    system_ids: list[Annotated[str, Field(min_length=1, max_length=200)]] | None = Field(
        None, min_length=1, max_length=MAX_SYSTEMS
    )


@router.post("/library/documents/{document_id}/review")
def confirm_document_review(
    document_id: str,
    data: ReviewRequest,
    confirm: ConfirmDep,
    library: LibraryDep,
    actor: CurrentActorDep,
) -> LibraryView:
    """Its owner, or an admin for them with a reason, confirms it is still right."""
    confirm.execute(document_id, actor, data.note, data.reason)
    return library.get(document_id, actor)


@router.get("/architecture-knowledge/systems/reviews")
def system_review_standings(service: SystemsDep) -> tuple[SystemStanding, ...]:
    """Where each system of the version in service stands for review."""
    return service.standings()


@router.post("/architecture-knowledge/systems/reviews")
def confirm_system_reviews(
    data: SystemReviewRequest, service: SystemsDep, actor: CurrentActorDep
) -> tuple[SystemStanding, ...]:
    """A catalogue maintainer, or an admin with a reason, confirms systems still right."""
    chosen = None if data.system_ids is None else tuple(data.system_ids)
    return service.confirm(chosen, actor, data.note, data.reason)


@router.get("/architecture-knowledge/systems/{system_id}/reviews")
def system_review_history(system_id: str, service: SystemsDep) -> tuple[ReviewConfirmation, ...]:
    """Who confirmed this system, newest first."""
    return service.history(system_id)


@router.get("/reviews/reminders")
def review_reminders(service: RemindersDep, actor: CurrentActorDep) -> Reminders:
    """What the signed-in person should confirm: overdue, then due within 14 days."""
    return service.for_actor(actor)
