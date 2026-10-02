"""Persistence boundary for the actors this service has seen sign in."""

from typing import Protocol

from knowledge_portal.domain.identity.entities import ActorId, ActorProfile


class ActorLookupPort(Protocol):
    """Who an actor is, by id."""

    def get(self, actor_id: ActorId) -> ActorProfile | None: ...


class ActorDirectoryPort(ActorLookupPort, Protocol):
    def record(self, actor: ActorProfile) -> None: ...

    def search(self, query: str | None, limit: int) -> list[ActorProfile]: ...
