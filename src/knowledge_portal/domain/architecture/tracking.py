"""How an order is tracked once it is placed (requirement-portal ADR-0101, step 4).

An offering's sources may say how its orders are tracked: the order types tracking is
specified for, the system-to-system flows that carry order and milestone events, how each
channel correlates its own order with the fulfilment order and where the customer sees
progress, the milestones the customer sees, the internal statuses, and what happens when an
order falls out. Each fact keeps its source's confidence, so "the tracking screen is not
named" is a recorded gap rather than silence.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source


@dataclass(frozen=True)
class TrackingFlow:
    """Order or milestone events passing from one system to another; to itself, a log."""

    from_system_id: str
    to_system_id: str
    label: str
    interface: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "from_system_id", required(self.from_system_id, "From system"))
        object.__setattr__(self, "to_system_id", required(self.to_system_id, "To system"))
        object.__setattr__(self, "label", required(self.label, "What the flow carries"))
        object.__setattr__(self, "interface", optional(self.interface, "Interface"))
        check_source(self)

    @property
    def is_log(self) -> bool:
        return self.from_system_id == self.to_system_id


@dataclass(frozen=True)
class TrackingChannel:
    """How one channel tracks its orders: the key that ties its order to the fulfilment
    order, the system the customer follows progress in, and the path that system reads."""

    channel_id: str
    correlation_key: str | None = None
    ui_system_id: str | None = None
    story: str | None = None
    # Where the tracking screen reads progress from, and over what.
    read_system_id: str | None = None
    read_interface: str | None = None
    # What the source says when it does not name the tracking screen.
    ui_note: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "channel_id", required(self.channel_id, "Channel"))
        for field, label in (
            ("correlation_key", "Correlation key"),
            ("ui_system_id", "Tracking screen"),
            ("story", "Story"),
            ("read_system_id", "Read from"),
            ("read_interface", "Read over"),
            ("ui_note", "Note"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        check_source(self)

    @property
    def systems(self) -> tuple[str, ...]:
        return tuple(item for item in (self.ui_system_id, self.read_system_id) if item)


@dataclass(frozen=True)
class TrackingEvent:
    """A milestone the customer sees, or an internal status; a milestone may name the
    system that raises it."""

    label: str
    detail: str | None = None
    system_id: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "label", required(self.label, "Label"))
        object.__setattr__(self, "detail", optional(self.detail, "Detail"))
        object.__setattr__(self, "system_id", optional(self.system_id, "System"))
        check_source(self)


@dataclass(frozen=True)
class FalloutCase:
    """What makes an order fall out, and how it is handled."""

    trigger: str
    handling: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "trigger", required(self.trigger, "Fallout trigger"))
        object.__setattr__(self, "handling", optional(self.handling, "Handling"))
        check_source(self)


def _unique(labels: list[str], what: str) -> None:
    keys = [item.casefold() for item in labels]
    if len(set(keys)) != len(keys):
        raise InvalidKnowledgeError(f"Order tracking: each {what} is named once.")


@dataclass(frozen=True)
class OrderTracking:
    """How an offering's orders are tracked, for the order types its sources specify."""

    # The order types tracking is specified for, by code; none named means every one.
    order_types: tuple[str, ...] = ()
    # What the sources say of tracking's scope, and of the order types it is not
    # specified for.
    scope_note: str | None = None
    not_applicable_note: str | None = None
    flows: tuple[TrackingFlow, ...] = ()
    channels: tuple[TrackingChannel, ...] = ()
    milestones: tuple[TrackingEvent, ...] = ()
    statuses: tuple[TrackingEvent, ...] = ()
    fallout: tuple[FalloutCase, ...] = ()
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "order_types",
            tuple(dict.fromkeys(required(item, "Order type") for item in self.order_types)),
        )
        object.__setattr__(self, "scope_note", optional(self.scope_note, "Scope note"))
        object.__setattr__(self, "not_applicable_note", optional(self.not_applicable_note, "Note"))
        check_source(self)
        channels = [item.channel_id for item in self.channels]
        if len(set(channels)) != len(channels):
            raise InvalidKnowledgeError("Order tracking: a channel is described once.")
        _unique([item.label for item in self.milestones], "milestone")
        _unique([item.label for item in self.statuses], "internal status")

    def applies_to(self, order_code: str) -> bool:
        return not self.order_types or any(
            item.casefold() == order_code.casefold() for item in self.order_types
        )

    @property
    def systems(self) -> tuple[str, ...]:
        """The catalogued systems it names, in first-named order."""
        return tuple(
            dict.fromkeys(
                (
                    *(
                        system
                        for flow in self.flows
                        for system in (flow.from_system_id, flow.to_system_id)
                    ),
                    *(system for channel in self.channels for system in channel.systems),
                    *(item.system_id for item in self.milestones if item.system_id),
                )
            )
        )


def check_tracking(
    offering_name: str,
    tracking: OrderTracking,
    order_codes: Collection[str],
    system_ids: Collection[str] | None = None,
    channel_ids: Collection[str] | None = None,
) -> None:
    """Tracking that names only the offering's order types and, when given, only catalogued
    systems and channels; the message says where the unknown one is named."""
    known = {code.casefold() for code in order_codes}
    unknown = [item for item in tracking.order_types if item.casefold() not in known]
    if unknown:
        raise InvalidKnowledgeError(
            f"{offering_name} › order tracking: order type {unknown[0]!r} is not one of the "
            "offering's order types."
        )
    if system_ids is not None:
        missing = [item for item in tracking.systems if item not in system_ids]
        if missing:
            raise InvalidKnowledgeError(
                f"{offering_name} › order tracking names system {missing[0]!r}, which is not "
                "in the catalogue."
            )
    if channel_ids is not None:
        absent = [
            item.channel_id for item in tracking.channels if item.channel_id not in channel_ids
        ]
        if absent:
            raise InvalidKnowledgeError(
                f"{offering_name} › order tracking names channel {absent[0]!r}, which is not "
                "in the catalogue."
            )
