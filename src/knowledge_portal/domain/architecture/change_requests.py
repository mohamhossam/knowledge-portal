"""Change requests apps send (ADR-0126; first built for requirement work, its ADR-0101, step 7).

When a breakdown's final approval is recorded, an app sends its approved backlog here, and
the change request keeps the app's name. It waits in an inbox as an incoming change request
until a knowledge admin reads it into a draft, where each approved feature becomes a
suggested open question on the offering it names, or dismisses it. Nothing it carries
reaches the catalogue without a person accepting it.

Accepting from a change request registers it as a source (level L2, its approval trace as
its authority) and records it in the version's change history, as the original explorer
recorded an applied change request.

A delivered change (ontology plan Phase 7) lands in the same inbox. When the Epic a
requirement was published as closes in the work-item tracker, the app sends what
was delivered: the Features closed as done, the catalogue changes the decided product impact
implies for them, and the systems the assessment predicted. It is read into a draft as
suggestions like any other, and a removed Epic withdraws one still waiting.

An approved backlog whose decided product impact is a new offering (ontology plan Phase 9)
also carries the offering and journey the assessment drafted. Reading it suggests both,
the offering first, for a curator to edit and accept.
"""

from __future__ import annotations

import re
from collections.abc import Collection
from dataclasses import dataclass, replace
from datetime import date, datetime
from enum import StrEnum

from knowledge_portal.domain.architecture.drafts import OfferingDraft
from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)


class ChangeOrigin(StrEnum):
    """Where a change request came from."""

    # Sent by an app, through the app API, when a breakdown's final approval was recorded
    # (ADR-0126).
    APP = "app"
    # Sent by requirement work before apps were named; kept as recorded.
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
        """ "Requirement REQ-2026-0412, revision 3, approved by Layla Haddad on 3 October
        2026"."""
        parts = [f"Requirement {self.requirement_id}, revision {self.breakdown_revision}"]
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
    # The approved feature it comes from, for a change request an app sent.
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


class ChangeRequestKind(StrEnum):
    # An approved backlog, sent when its final approval is recorded (ADR-0101, step 7).
    APPROVED_BACKLOG = "approved_backlog"
    # What a closed Epic delivered, and the catalogue changes it implies (Phase 7).
    CATALOGUE_CHANGE = "catalogue_change"


class DeliveredChangeKind(StrEnum):
    """A change to the catalogue a delivered requirement implies."""

    # A delivered system now realises a capability concept the requirement needed.
    REALISE_CONCEPT = "realise_concept"
    # The offering now delivers a capability concept it did not cover.
    OFFER_CONCEPT = "offer_concept"


@dataclass(frozen=True)
class DeliveredChange:
    """One catalogue change, with the delivered Features it comes from."""

    kind: DeliveredChangeKind
    concept_id: str
    concept_label: str
    feature_ids: tuple[str, ...]
    system_id: str | None = None
    system_name: str | None = None
    offering_id: str | None = None
    offering_name: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "kind", DeliveredChangeKind(self.kind))
        object.__setattr__(self, "concept_id", required(self.concept_id, "Concept"))
        object.__setattr__(self, "concept_label", required(self.concept_label, "Concept label"))
        for field, label in (
            ("system_id", "System id"),
            ("system_name", "System"),
            ("offering_id", "Offering id"),
            ("offering_name", "Offering"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        object.__setattr__(
            self,
            "feature_ids",
            tuple(dict.fromkeys(required(item, "Feature id") for item in self.feature_ids)),
        )
        if not self.feature_ids:
            raise InvalidKnowledgeError("A delivered change names the Features that delivered it.")
        if self.kind is DeliveredChangeKind.REALISE_CONCEPT and self.system_id is None:
            raise InvalidKnowledgeError("A capability is realised by a named system.")
        if self.kind is DeliveredChangeKind.OFFER_CONCEPT and self.offering_id is None:
            raise InvalidKnowledgeError("A capability is offered by a named offering.")


@dataclass(frozen=True)
class UndeliveredFeature:
    """A Feature of the Epic that was not delivered, and its state in the tracker."""

    id: str
    name: str
    state: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Feature id"))
        object.__setattr__(self, "name", required(self.name, "Feature name"))
        object.__setattr__(self, "state", required(self.state, "Feature state"))


@dataclass(frozen=True)
class PredictedSystem:
    """A system the decided product impact named, with why and how it would change."""

    id: str
    name: str
    role: str | None = None
    change_type: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "System id"))
        object.__setattr__(self, "name", required(self.name, "System"))
        object.__setattr__(self, "role", optional(self.role, "Role"))
        object.__setattr__(self, "change_type", optional(self.change_type, "Change type"))


@dataclass(frozen=True)
class DeliveryTrace:
    """Where a delivered change comes from: the closed Epic in the tracker, and the product
    impact decided for its requirement."""

    delivery_id: str
    epic_external_id: str
    closed_at: datetime
    # The release the product impact was assessed against.
    release_id: str
    # The decision, as `analysis id@version`, so the promise can be traced.
    impact_version: str
    decision: str
    epic_url: str | None = None
    suggested_verdict: str | None = None
    verdict: str | None = None
    offering_id: str | None = None
    offering_name: str | None = None
    predicted: tuple[PredictedSystem, ...] = ()
    not_delivered: tuple[UndeliveredFeature, ...] = ()
    changes: tuple[DeliveredChange, ...] = ()

    def __post_init__(self) -> None:
        for field, label in (
            ("delivery_id", "Delivery"),
            ("epic_external_id", "Tracker Epic"),
            ("release_id", "Catalogue release"),
            ("impact_version", "Product impact"),
            ("decision", "Decision"),
        ):
            object.__setattr__(self, field, required(getattr(self, field), label))
        for field, label in (
            ("epic_url", "Epic link"),
            ("suggested_verdict", "Suggested verdict"),
            ("verdict", "Verdict"),
            ("offering_id", "Offering id"),
            ("offering_name", "Offering"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        ids = [item.id for item in self.predicted]
        if len(set(ids)) != len(ids):
            raise InvalidKnowledgeError("Each predicted system is named once.")


@dataclass(frozen=True)
class DeliveryHits:
    """How the systems the assessment predicted compare with the systems delivered."""

    # Delivered systems the assessment had predicted.
    predicted: tuple[str, ...]
    # Delivered systems it had not.
    unpredicted: tuple[str, ...]
    # Predicted systems no delivered Feature changed.
    undelivered: tuple[str, ...]

    @property
    def delivered(self) -> int:
        return len(self.predicted) + len(self.unpredicted)


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


# Who dismisses a catalogue change whose Epic was removed, when the app that sent it has no
# name: one kept before apps were named (ADR-0126).
WITHDRAWN_BY = "the app that sent it"


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
    kind: ChangeRequestKind = ChangeRequestKind.APPROVED_BACKLOG
    # What a closed Epic delivered; only on a catalogue change.
    delivery: DeliveryTrace | None = None
    # The offering and journey drafted for a new-offering verdict, as the decided product
    # impact sent them; only on an approved backlog (ontology plan Phase 9).
    draft: OfferingDraft | None = None
    # The app that sent it, by the name it is registered under; None on one kept before apps
    # were named (ADR-0126).
    sent_by: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "kind", ChangeRequestKind(self.kind))
        object.__setattr__(self, "sent_by", optional(self.sent_by, "Sent by"))
        if self.draft is not None and self.kind is not ChangeRequestKind.APPROVED_BACKLOG:
            raise InvalidKnowledgeError("Only an approved backlog carries a drafted offering.")
        if (self.delivery is None) != (self.kind is ChangeRequestKind.APPROVED_BACKLOG):
            raise InvalidKnowledgeError("Only a catalogue change carries what was delivered.")
        if self.delivery is not None:
            known = {item.id for item in self.features}
            if any(
                feature not in known
                for change in self.delivery.changes
                for feature in change.feature_ids
            ):
                raise InvalidKnowledgeError("A delivered change comes from a delivered Feature.")
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

    def withdraw(
        self,
        at: datetime,
        reason: str = "Its Epic was removed in the work-item tracker, so it was not delivered.",
    ) -> IncomingChangeRequest:
        """A catalogue change its app took back: its Epic was removed, or closed again later."""
        return self.dismiss(reason, self.sent_by or WITHDRAWN_BY, at)

    def hits(self) -> DeliveryHits | None:
        """The delivery hit rate's counts; None for an approved backlog."""
        if self.delivery is None:
            return None
        delivered = list(
            dict.fromkeys(
                (system.id or system.name).casefold()
                for feature in self.features
                for system in feature.systems
            )
        )
        predicted = [item.id.casefold() for item in self.delivery.predicted]
        return DeliveryHits(
            predicted=tuple(item for item in delivered if item in predicted),
            unpredicted=tuple(item for item in delivered if item not in predicted),
            undelivered=tuple(item for item in predicted if item not in delivered),
        )

    def record(self) -> ChangeRequestRecord:
        """How the version's change history first records it."""
        return ChangeRequestRecord(
            id=self.id,
            title=self.title,
            origin=ChangeOrigin.APP,
            requester=self.trace.approved_by,
            reason=self.reason,
            created_at=self.received_at,
            trace=self.trace,
        )


@dataclass(frozen=True)
class ReleaseDeliveries:
    """The delivery hit rate of one catalogue release: what its assessments predicted, set
    against what closed Epics delivered."""

    release_id: str
    # Closed Epics counted: the latest closure of each, unless dismissed.
    deliveries: int
    # Delivered systems the assessment had predicted, and those it had not.
    predicted: int
    unpredicted: int
    # Predicted systems no delivered Feature changed.
    undelivered: int
    last_closed_at: datetime

    @property
    def delivered(self) -> int:
        return self.predicted + self.unpredicted


def delivery_summaries(
    items: Collection[IncomingChangeRequest],
) -> tuple[ReleaseDeliveries, ...]:
    """Per release, newest closure first. Each Epic counts once, by its latest closure; a
    dismissed catalogue change is not counted, since a person said it was not a delivery."""
    latest: dict[tuple[str, str], tuple[DeliveryTrace, DeliveryHits]] = {}
    for item in items:
        delivery, hits = item.delivery, item.hits()
        if delivery is None or hits is None or item.status is IncomingStatus.DISMISSED:
            continue
        key = (item.trace.requirement_id, delivery.epic_external_id)
        held = latest.get(key)
        if held is None or held[0].closed_at < delivery.closed_at:
            latest[key] = (delivery, hits)
    releases: dict[str, list[tuple[DeliveryTrace, DeliveryHits]]] = {}
    for delivery, hits in latest.values():
        releases.setdefault(delivery.release_id, []).append((delivery, hits))
    summaries = [
        ReleaseDeliveries(
            release_id=release_id,
            deliveries=len(closed),
            predicted=sum(len(hits.predicted) for _, hits in closed),
            unpredicted=sum(len(hits.unpredicted) for _, hits in closed),
            undelivered=sum(len(hits.undelivered) for _, hits in closed),
            last_closed_at=max(delivery.closed_at for delivery, _ in closed),
        )
        for release_id, closed in releases.items()
    ]
    return tuple(sorted(summaries, key=lambda item: item.last_closed_at, reverse=True))
