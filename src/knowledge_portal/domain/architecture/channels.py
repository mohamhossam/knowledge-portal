"""The ways an order reaches the business: a web storefront, an app, a shop, a care desk.

A channel is where an order is placed. Its entry system, when the catalogue knows it, is the
catalogued system that takes the order in. A journey step can say it is performed by the
channel's entry system: then it is performed by whichever channel the order came through
(requirement-portal ADR-0101, step 3).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.products import SourceConfidence, check_source


@dataclass(frozen=True)
class Channel:
    id: str
    name: str
    # As the source says: "Digital", "Assisted", "Care".
    kind: str | None = None
    entry_system_id: str | None = None
    description: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Channel id"))
        object.__setattr__(self, "name", required(self.name, "Channel name"))
        for field, label in (
            ("kind", "Channel kind"),
            ("entry_system_id", "Entry system"),
            ("description", "Description"),
        ):
            object.__setattr__(self, field, optional(getattr(self, field), label))
        check_source(self)


def check_channels(channels: tuple[Channel, ...], system_ids: set[str]) -> set[str]:
    """Channels with one id and one name each, entered through catalogued systems; their ids.

    So a system a channel is entered through cannot be removed: the message says which channel.
    """
    ids = [item.id for item in channels]
    if len(set(ids)) != len(ids):
        raise InvalidKnowledgeError("Channel ids must be unique.")
    names = [item.name.casefold() for item in channels]
    if len(set(names)) != len(names):
        raise InvalidKnowledgeError("Channel names must be unique.")
    for channel in channels:
        if channel.entry_system_id is not None and channel.entry_system_id not in system_ids:
            raise InvalidKnowledgeError(
                f"Channel {channel.name} is entered through system "
                f"{channel.entry_system_id!r}, which is not in the catalogue."
            )
    return set(ids)


def unknown_channels(named: tuple[str, ...], channel_ids: set[str]) -> list[str]:
    return [item for item in named if item not in channel_ids]


def _words(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold()))


def find_channel_among(channels: tuple[Channel, ...], reference: str) -> Channel | None:
    """A channel named by id or, when only one has it, by name, ignoring case and punctuation."""
    key = reference.strip().casefold()
    exact = next((item for item in channels if item.id.casefold() == key), None)
    if exact is not None or not key:
        return exact
    named = [item for item in channels if _words(reference) in {_words(item.name), _words(item.id)}]
    return named[0] if len(named) == 1 else None


def same_channel(first: Channel, second: Channel) -> bool:
    """Whether two channels are one: the same id or the same name."""
    return first.id == second.id or _words(first.name) == _words(second.name)


def merge_channels(first: Channel, second: Channel) -> Channel:
    """Two readings of one channel as one: the first's facts win, the second fills gaps."""
    return replace(
        first,
        kind=first.kind or second.kind,
        entry_system_id=first.entry_system_id or second.entry_system_id,
        description=first.description or second.description,
        confidence=first.confidence or second.confidence,
        source=first.source or second.source,
    )
