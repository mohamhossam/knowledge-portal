"""Change requests from Requirement AI (requirement-portal ADR-0101, step 7).

When a breakdown's final approval is recorded, requirement-portal sends its approved
backlog here. It waits in an inbox as an incoming change request until a knowledge admin
reads it into a draft, where each approved feature becomes a suggested open question on
the offering it names, or dismisses it. Nothing it carries reaches the catalogue without
a person accepting it.

Accepting from a change request registers it as a source (level L2, its approval trace as
its authority) and records it in the version's change history, as the original explorer
recorded an applied change request.
"""

from __future__ import annotations

import re
from collections.abc import Collection
from dataclasses import dataclass, replace
from datetime import date, datetime
from enum import StrEnum

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)


class ChangeOrigin(StrEnum):
    """Where a change request came from."""

    # Sent by requirement-portal when a breakdown's final approval was recorded.
    REQUIREMENT_AI = "requirement-ai"
    # Drafted in the original explorer and carried over with its model.
    EXPLORER = "explorer"


class ChangeItemStatus(StrEnum):
    """What became of one item of a change request, as the original explorer said it."""

    RECORDED = "recorded"
    INFERRED = "inferred"
    GAP = "gap"
    CONFLICT = "conflict"


@dataclass(frozen=True)
class TracedFeature:
    id: str
    name: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Feature id"))
        object.__setattr__(self, "name", required(self.name, "Feature name"))


@dataclass(frozen=True)
class RequirementTrace:
    """The approved requirement a change request comes from. Only the approver's name is
    kept, never their email."""

    requirement_id: str
    breakdown_revision: int
    approval_id: str
    epic_id: str
    epic_name: str
    approved_by: str | None = None
    approved_at: datetime | None = None
    features: tuple[TracedFeature, ...] = ()
    export_schema: str | None = None
    # The catalogue version the requirement was mapped against.
    knowledge_version: str | None = None

    def __post_init__(self) -> None:
        for field, label in (
            ("requirement_id", "Requirement"),
            ("approval_id", "Approval"),
            ("epic_id", "Epic id"),
            ("epic_name", "Epic"),
        ):
            object.__setattr__(self, field, required(getattr(self, field), label))
        for field, label in (
            ("approved_by", "Approved by"),
            ("export_schema", "Export schema"),
            ("knowledge_version", "Catalogue version"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        if self.breakdown_revision < 1:
            raise InvalidKnowledgeError("A breakdown revision is numbered from 1.")

    def sentence(self) -> str:
        """ "Requirement AI requirement REQ-2026-0412, revision 3, approved by Layla Haddad
        on 3 October 2026"."""
        parts = [
            f"Requirement AI requirement {self.requirement_id}, revision {self.breakdown_revision}"
        ]
        if self.approved_by or self.approved_at:
            when = ""
            if self.approved_at:
                # The day goes in by hand: "%-d" is glibc-only and fails on Windows.
                when = f" on {self.approved_at.day} {self.approved_at:%B %Y}"
            who = f" by {self.approved_by}" if self.approved_by else ""
            parts.append(f"approved{who}{when}")
        return ", ".join(parts)


@dataclass(frozen=True)
class ChangeItem:
    """One thing a change request asked for, and what became of it."""

    kind: str
    summary: str
    status: ChangeItemStatus = ChangeItemStatus.RECORDED
    # The approved feature it comes from, for a change request from Requirement AI.
    feature_id: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "kind", required(self.kind, "Change kind"))
        object.__setattr__(self, "summary", required(self.summary, "Change"))
        object.__setattr__(self, "status", ChangeItemStatus(self.status))
        object.__setattr__(self, "feature_id", optional(self.feature_id, "Feature"))


@dataclass(frozen=True)
class ChangeRequestRecord:
    """A change request applied to a version: who asked, why, and what it changed."""

    id: str
    title: str
    origin: ChangeOrigin = ChangeOrigin.REQUIREMENT_AI
    # The offering it changes.
    product_id: str | None = None
    requester: str | None = None
    reason: str | None = None
    priority: str | None = None
    target_date: str | None = None
    created_at: datetime | None = None
    applied_at: datetime | None = None
    trace: RequirementTrace | None = None
    items: tuple[ChangeItem, ...] = ()
    # What it asked that no one could map, in words.
    gaps: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Change request id"))
        object.__setattr__(self, "title", required(self.title, "Change request title"))
        object.__setattr__(self, "origin", ChangeOrigin(self.origin))
        for field, label in (
            ("product_id", "Offering"),
            ("requester", "Requester"),
            ("reason", "Reason"),
            ("priority", "Priority"),
            ("target_date", "Target date"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        object.__setattr__(self, "gaps", tuple(required(item, "Gap") for item in self.gaps))

    def with_item(self, item: ChangeItem, at: datetime) -> ChangeRequestRecord:
        """The record with this item added, or replacing the one from the same feature."""
        kept = tuple(
            each
            for each in self.items
            if item.feature_id is None
            or each.feature_id != item.feature_id
            or each.kind != item.kind
        )
        return replace(self, items=(*kept, item), applied_at=at)


def check_change_history(history: tuple[ChangeRequestRecord, ...]) -> None:
    """Each change request is recorded once. Nothing else is checked: history never blocks a
    version."""
    ids = [item.id.casefold() for item in history]
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError("Each change request is recorded once in the history.")


def change_request_id(day: date, name: str, taken: Collection[str] = ()) -> str:
    """The original explorer's id: "CR-20261004-Business_Pro_Plus", "-2" when one is taken."""
    slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "Change"
    base = f"CR-{day:%Y%m%d}-{slug}"
    used = {item.casefold() for item in taken}
    candidate, number = base, 2
    while candidate.casefold() in used:
        candidate, number = f"{base}-{number}", number + 1
    return candidate


class IncomingStatus(StrEnum):
    WAITING = "waiting"
    READ = "read"
    DISMISSED = "dismissed"


@dataclass(frozen=True)
class IncomingContext:
    """An offering a feature's architecture mapping names, as the export names it."""

    product_id: str | None = None
    product_name: str | None = None
    # A name, not a code: the export says "New Activation".
    order_type: str | None = None

    def __post_init__(self) -> None:
        for field, label in (
            ("product_id", "Offering id"),
            ("product_name", "Offering"),
            ("order_type", "Order type"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        if self.product_id is None and self.product_name is None:
            raise InvalidKnowledgeError("An offering is named by its id or its name.")


@dataclass(frozen=True)
class IncomingSystem:
    """A system a feature's mapping names: its catalogue id when it had one."""

    name: str
    id: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", required(self.name, "System"))
        object.__setattr__(self, "id", optional(self.id, "System id"))


@dataclass(frozen=True)
class IncomingFeature:
    """One approved feature, with what its architecture mapping (and its stories') names."""

    id: str
    sequence: int
    name: str
    outcome: str | None = None
    contexts: tuple[IncomingContext, ...] = ()
    systems: tuple[IncomingSystem, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Feature id"))
        object.__setattr__(self, "name", required(self.name, "Feature name"))
        object.__setattr__(self, "outcome", optional(self.outcome, "Outcome"))

    def asks(self) -> str:
        """The question a feature puts to the catalogue: its name and outcome."""
        return f"{self.name}: {self.outcome}" if self.outcome else self.name


class ChangeRequestStateError(Exception):
    """The incoming change request cannot do that now, such as reading a dismissed one."""


@dataclass(frozen=True)
class IncomingChangeRequest:
    """An approved backlog as delivered, waiting for a knowledge admin."""

    id: str
    approval_id: str
    # What the approval attests; a second delivery of the same approval must match it.
    subject_fingerprint: str
    title: str
    trace: RequirementTrace
    features: tuple[IncomingFeature, ...]
    received_at: datetime
    reason: str | None = None
    status: IncomingStatus = IncomingStatus.WAITING
    read_into: str | None = None
    read_by: str | None = None
    read_at: datetime | None = None
    dismissed_by: str | None = None
    dismissed_at: datetime | None = None
    dismissal_reason: str | None = None

    def __post_init__(self) -> None:
        for field, label in (
            ("id", "Change request id"),
            ("approval_id", "Approval"),
            ("subject_fingerprint", "Approval fingerprint"),
            ("title", "Change request title"),
        ):
            object.__setattr__(self, field, required(getattr(self, field), label))
        object.__setattr__(self, "reason", optional(self.reason, "Reason"))
        object.__setattr__(self, "status", IncomingStatus(self.status))
        if not self.features:
            raise InvalidKnowledgeError("A change request carries at least one approved feature.")
        ids = [item.id for item in self.features]
        if len(set(ids)) != len(ids):
            raise InvalidKnowledgeError("Each approved feature is carried once.")

    def read(self, release_id: str, actor: str, at: datetime) -> IncomingChangeRequest:
        if self.status is IncomingStatus.DISMISSED:
            raise ChangeRequestStateError(
                f"{self.id} was dismissed, so it cannot be read into a draft."
            )
        return replace(
            self,
            status=IncomingStatus.READ,
            read_into=required(release_id, "Draft"),
            read_by=actor,
            read_at=at,
        )

    def dismiss(self, reason: str, actor: str, at: datetime) -> IncomingChangeRequest:
        if self.status is IncomingStatus.DISMISSED:
            raise ChangeRequestStateError(f"{self.id} was already dismissed; a dismissal stays.")
        return replace(
            self,
            status=IncomingStatus.DISMISSED,
            dismissed_by=actor,
            dismissed_at=at,
            dismissal_reason=required(reason, "Why it is dismissed"),
        )

    def record(self) -> ChangeRequestRecord:
        """How the version's change history first records it."""
        return ChangeRequestRecord(
            id=self.id,
            title=self.title,
            origin=ChangeOrigin.REQUIREMENT_AI,
            requester=self.trace.approved_by,
            reason=self.reason,
            created_at=self.received_at,
            trace=self.trace,
        )
