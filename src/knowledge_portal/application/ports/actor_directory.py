"""Persistence boundary for provider-neutral actors seen by the workspace."""

from typing import Protocol

from knowledge_portal.domain.identity.entities import ActorId, ActorProfile


class ActorLookupPort(Protocol):
    """Who an actor is, by id: all the knowledge service needs (ADR-0099)."""

    def get(self, actor_id: ActorId) -> ActorProfile | None: ...
