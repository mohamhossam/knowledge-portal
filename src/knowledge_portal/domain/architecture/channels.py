"""The ways an order reaches the business: a web storefront, an app, a shop, a care desk.

A channel is where an order is placed. Its entry system, when the catalogue knows it, is the
catalogued system that takes the order in. A journey step can say it is performed by the
channel's entry system: then it is performed by whichever channel the order came through
(requirement-portal ADR-0101, step 3).
"""

from __future__ import annotations

from dataclasses import dataclass

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
