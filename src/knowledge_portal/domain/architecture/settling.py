"""Settling what waiting suggestions name: a channel or an order type said to be one the draft
has, so each suggestion that names it is said again in the draft's terms (Decide, dead ends).

A suggestion names a channel in an offering's order types, its order tracking and its
lifecycle notes, and in a journey's steps and flow rules; a journey names one order type of
its offering. Names are compared by their words alone, as the draft finds a channel.
"""

from __future__ import annotations

import re
from dataclasses import replace

from knowledge_portal.domain.architecture.candidates import CandidateContent
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.products import ProductOffering


def _key(value: str) -> str:
    return re.sub(r"[^0-9a-z]+", "", value.casefold())


def _swapped(values: tuple[str, ...], reference: str, replacement: str) -> tuple[str, ...]:
    wanted = _key(reference)
    return tuple(dict.fromkeys(replacement if _key(item) == wanted else item for item in values))


def channel_references(content: CandidateContent) -> tuple[str, ...]:
    """The channels a suggestion names, as it names them."""
    names: list[str] = []
    if content.product is not None:
        offering = content.product
        names.extend(name for item in offering.order_types for name in item.channels)
        if offering.tracking is not None:
            names.extend(item.channel_id for item in offering.tracking.channels)
        names.extend(name for item in offering.lifecycle_notes for name in item.channels)
    if content.journey is not None:
        names.extend(name for step in content.journey.activities for name in step.channels)
        names.extend(rule.channel_id for rule in content.journey.flow_rules if rule.channel_id)
    return tuple(names)


def names_channel(content: CandidateContent, reference: str) -> bool:
    wanted = _key(reference)
    return any(_key(item) == wanted for item in channel_references(content))


def _offering_with_channel(
    offering: ProductOffering, reference: str, channel_id: str
) -> ProductOffering:
    tracking = offering.tracking
    if tracking is not None:
        wanted = _key(reference)
        tracking = replace(
            tracking,
            channels=tuple(
                replace(item, channel_id=channel_id) if _key(item.channel_id) == wanted else item
                for item in tracking.channels
            ),
        )
    return replace(
        offering,
        order_types=tuple(
            replace(item, channels=_swapped(item.channels, reference, channel_id))
            for item in offering.order_types
        ),
        tracking=tracking,
        lifecycle_notes=tuple(
            replace(item, channels=_swapped(item.channels, reference, channel_id))
            for item in offering.lifecycle_notes
        ),
    )


def _journey_with_channel(journey: Journey, reference: str, channel_id: str) -> Journey:
    wanted = _key(reference)
    return replace(
        journey,
        activities=tuple(
            replace(step, channels=_swapped(step.channels, reference, channel_id))
            for step in journey.activities
        ),
        flow_rules=tuple(
            replace(rule, channel_id=channel_id)
            if rule.channel_id is not None and _key(rule.channel_id) == wanted
            else rule
            for rule in journey.flow_rules
        ),
    )


def with_channel(content: CandidateContent, reference: str, channel_id: str) -> CandidateContent:
    """The suggestion naming the channel ``channel_id`` wherever it named ``reference``."""
    return replace(
        content,
        product=(
            _offering_with_channel(content.product, reference, channel_id)
            if content.product is not None
            else None
        ),
        journey=(
            _journey_with_channel(content.journey, reference, channel_id)
            if content.journey is not None
            else None
        ),
    )


def names_order_type(content: CandidateContent, offering: ProductOffering, reference: str) -> bool:
    """Whether a journey suggestion is for ``reference``, an order type of ``offering``."""
    journey = content.journey
    if journey is None or journey.order_type_code is None or journey.product_id is None:
        return False
    named = {_key(offering.id), _key(offering.name), _key(offering.code or "")}
    return _key(journey.product_id) in named and _key(journey.order_type_code) == _key(reference)


def with_order_type(content: CandidateContent, code: str) -> CandidateContent:
    """The journey suggestion for the order type ``code`` instead."""
    if content.journey is None:
        return content
    return replace(content, journey=replace(content.journey, order_type_code=code))


def order_type_code(name: str, taken: tuple[str, ...]) -> str:
    """A code for a new order type from its name, as codes are written: "Modify Password"
    gives "MODIFY_PASSWORD", with a number when an order type already has it."""
    base = re.sub(r"[^0-9A-Z]+", "_", name.upper()).strip("_") or "ORDER_TYPE"
    held = {_key(item) for item in taken}
    code, number = base, 2
    while _key(code) in held:
        code, number = f"{base}_{number}", number + 1
    return code
