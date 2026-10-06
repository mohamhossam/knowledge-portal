"""Re-confirming knowledge on a cycle, and reminding whoever answers for it (Knowledge Center D).

A library document is confirmed by its owner, a catalogue system by any catalogue maintainer,
and either by a knowledge admin on their behalf with a reason. Approving a document's version
counts as a review; a system never confirmed counts from when the version in service was
published. Being due or overdue never takes anything out of use: it is only flagged.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from smb_kernel.time.clock import ClockPort

from knowledge_portal.application.errors import DocumentNotFoundError, DocumentVersionConflictError
from knowledge_portal.application.ports.actor_directory import ActorLookupPort
from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.architecture_rag import EvidenceChunk
from knowledge_portal.application.ports.document_library import DocumentLibraryPort
from knowledge_portal.application.ports.library_admin import LibraryAdminAction
from knowledge_portal.application.ports.system_reviews import SystemReviewsPort
from knowledge_portal.application.ports.transaction_manager import TransactionManagerPort
from knowledge_portal.application.use_cases.identity_access import KNOWLEDGE_ADMIN
from knowledge_portal.application.use_cases.library_admin import LibraryStewardship
from knowledge_portal.domain.architecture.knowledge import ArchitectureKnowledge
from knowledge_portal.domain.document.errors import InvalidDocumentError
from knowledge_portal.domain.document.library import LibraryDocument
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile, ActorSnapshot
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError
from knowledge_portal.domain.shared.review import (
    AdminOverride,
    ReviewConfirmation,
    ReviewStanding,
    ReviewState,
    standing,
)

KNOWLEDGE_MAINTAINER = "knowledge_maintainer"
# A system's own catalogue record is located as "system <id>" or "system <id>, <part>".
_SYSTEM_RECORD = re.compile(r"^system (.+?)(?:,|$)")
PAGE = 200
HISTORY_LIMIT = 50
NEVER = datetime(2000, 1, 1, tzinfo=UTC)


def _clean(text: str | None) -> str | None:
    return text.strip() if text and text.strip() else None


def _confirmation(
    actor: ActorProfile, now: datetime, note: str | None, reason: str | None, may_answer: bool
) -> ReviewConfirmation:
    """The actor's own confirmation, or an admin's for whoever answers for it, with a reason."""
    if may_answer:
        return ReviewConfirmation(now, actor.snapshot(), _clean(note))
    if KNOWLEDGE_ADMIN not in actor.roles:
        raise AuthorizationDeniedError("Only a knowledge admin can confirm a review for someone.")
    if not _clean(reason):
        raise InvalidDocumentError("Say why you confirm it on their behalf.")
    return ReviewConfirmation(
        now, actor.snapshot(), _clean(note), AdminOverride(actor.snapshot(), (reason or "").strip())
    )


def library_standing(
    document: LibraryDocument, cycle: timedelta, now: datetime
) -> ReviewStanding | None:
    last = document.last_review()
    return None if last is None else standing(last[0], last[1], cycle, now)


class ConfirmLibraryReview:
    """The owner, or an admin for them with a reason, confirms a document is still right."""

    def __init__(
        self,
        documents: DocumentLibraryPort,
        stewardship: LibraryStewardship,
        transactions: TransactionManagerPort,
        clock: ClockPort,
    ) -> None:
        self._documents, self._stewardship = documents, stewardship
        self._transactions, self._clock = transactions, clock

    def execute(
        self,
        document_id: str,
        actor: ActorProfile,
        note: str | None = None,
        reason: str | None = None,
    ) -> LibraryDocument:
        with self._transactions.transaction():
            document = self._documents.get(document_id)
            if document is None:
                raise DocumentNotFoundError("Library document was not found.")
            if document.in_service() is None:
                raise DocumentVersionConflictError(
                    "Nothing of it is in service, so there is nothing to confirm."
                )
            confirmation = _confirmation(
                actor, self._clock.now(), note, reason, document.owner.id == actor.id
            )
            updated = document.confirm_review(confirmation)
            self._documents.save(updated, document.version)
            if confirmation.on_behalf is not None:
                self._stewardship.record(
                    LibraryAdminAction.CONFIRM_REVIEW,
                    actor,
                    confirmation.on_behalf.reason,
                    (document.id,),
                    document,
                    updated,
                )
            return updated


@dataclass(frozen=True)
class SystemStanding:
    system_id: str
    name: str
    standing: ReviewStanding
    note: str | None = None
    on_behalf: AdminOverride | None = None


class _InService:
    """The systems of the version in service, with their last confirmation or its publication."""

    def __init__(
        self,
        releases: ArchitectureKnowledgeRepositoryPort,
        reviews: SystemReviewsPort,
        actors: ActorLookupPort,
        clock: ClockPort,
        cycle: timedelta,
    ) -> None:
        self._releases, self._reviews, self._actors = releases, reviews, actors
        self._clock, self.cycle = clock, cycle

    def release(self) -> ArchitectureKnowledge:
        return self._releases.active()

    def _publisher(self, release: ArchitectureKnowledge) -> ActorSnapshot:
        actor_id = release.published_by or "unknown"
        known = self._actors.get(ActorId(actor_id))
        return ActorSnapshot(ActorId(actor_id), known.display_name if known else "its publisher")

    def standings(self) -> tuple[SystemStanding, ...]:
        release = self.release()
        # A version in service always has a publication date; without one, nothing is reviewed.
        published = release.published_at or NEVER
        publisher = self._publisher(release)
        now = self._clock.now()
        latest = self._reviews.latest(tuple(system.id for system in release.systems))
        result = []
        for system in release.systems:
            confirmation = latest.get(system.id)
            if confirmation is not None and confirmation.reviewed_at >= published:
                result.append(
                    SystemStanding(
                        system.id,
                        system.name,
                        standing(confirmation.reviewed_at, confirmation.reviewer, self.cycle, now),
                        confirmation.note,
                        confirmation.on_behalf,
                    )
                )
            else:
                # Publishing the version counts as reviewing what it holds.
                result.append(
                    SystemStanding(
                        system.id, system.name, standing(published, publisher, self.cycle, now)
                    )
                )
        return tuple(result)


class SystemReviews:
    """Every system in service, where its review stands, and confirming systems."""

    def __init__(
        self,
        releases: ArchitectureKnowledgeRepositoryPort,
        reviews: SystemReviewsPort,
        actors: ActorLookupPort,
        transactions: TransactionManagerPort,
        clock: ClockPort,
        cycle: timedelta,
    ) -> None:
        self._in_service = _InService(releases, reviews, actors, clock, cycle)
        self._reviews, self._transactions, self._clock = reviews, transactions, clock

    def standings(self) -> tuple[SystemStanding, ...]:
        with self._transactions.transaction():
            return self._in_service.standings()

    def with_review(self, chunk: EvidenceChunk) -> EvidenceChunk:
        """A system's own evidence record, with when that system falls due for review."""
        match = _SYSTEM_RECORD.match(chunk.location)
        if chunk.document_version_id is not None or match is None:
            return chunk
        due = next(
            (item.standing.due_on for item in self.standings() if item.system_id == match[1]),
            None,
        )
        return replace(chunk, system_review_due_on=due)

    def history(self, system_id: str) -> tuple[ReviewConfirmation, ...]:
        with self._transactions.transaction():
            return self._reviews.history(system_id, HISTORY_LIMIT)

    def confirm(
        self,
        system_ids: tuple[str, ...] | None,
        actor: ActorProfile,
        note: str | None = None,
        reason: str | None = None,
    ) -> tuple[SystemStanding, ...]:
        """Confirm the named systems of the version in service, or all of them (None)."""
        with self._transactions.transaction():
            release = self._in_service.release()
            known = {system.id for system in release.systems}
            chosen = (
                tuple(sorted(known)) if system_ids is None else tuple(dict.fromkeys(system_ids))
            )
            missing = [system_id for system_id in chosen if system_id not in known]
            if not chosen or missing:
                raise DocumentNotFoundError(
                    "Confirm systems of the version in service: "
                    + (", ".join(missing[:5]) if missing else "none were named")
                    + "."
                )
            confirmation = _confirmation(
                actor, self._clock.now(), note, reason, KNOWLEDGE_MAINTAINER in actor.roles
            )
            self._reviews.add(chosen, confirmation)
            return tuple(
                item for item in self._in_service.standings() if item.system_id in set(chosen)
            )


class ReminderKind(StrEnum):
    DOCUMENT = "document"
    SYSTEM = "system"


@dataclass(frozen=True)
class Reminder:
    kind: ReminderKind
    id: str
    title: str
    standing: ReviewStanding


@dataclass(frozen=True)
class Reminders:
    """What the signed-in person should confirm: overdue first, then by due date."""

    overdue: int
    due_soon: int
    items: tuple[Reminder, ...]


class ReviewReminders:
    """Library documents a person owns, and, for a maintainer, every system in service."""

    def __init__(
        self,
        documents: DocumentLibraryPort,
        systems: SystemReviews,
        transactions: TransactionManagerPort,
        clock: ClockPort,
        cycle: timedelta,
    ) -> None:
        self._documents, self._systems = documents, systems
        self._transactions, self._clock, self._cycle = transactions, clock, cycle

    def for_actor(self, actor: ActorProfile) -> Reminders:
        now = self._clock.now()
        items: list[Reminder] = []
        with self._transactions.transaction():
            offset = 0
            while page := self._documents.list_all(offset, PAGE):
                for document in page:
                    if document.owner.id != actor.id:
                        continue
                    found = library_standing(document, self._cycle, now)
                    if found is not None and found.state is not ReviewState.CURRENT:
                        items.append(
                            Reminder(ReminderKind.DOCUMENT, document.id, document.title, found)
                        )
                offset += PAGE
        if KNOWLEDGE_MAINTAINER in actor.roles:
            items.extend(
                Reminder(ReminderKind.SYSTEM, item.system_id, item.name, item.standing)
                for item in self._systems.standings()
                if item.standing.state is not ReviewState.CURRENT
            )
        items.sort(
            key=lambda item: (
                item.standing.state is not ReviewState.OVERDUE,
                item.standing.due_at,
                item.title,
            )
        )
        overdue = sum(item.standing.state is ReviewState.OVERDUE for item in items)
        return Reminders(overdue, len(items) - overdue, tuple(items))
