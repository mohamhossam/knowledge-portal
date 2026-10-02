"""The actors this service has seen sign in, in memory or in PostgreSQL (`actor_profiles`)."""

from __future__ import annotations

from copy import deepcopy
from threading import RLock
from typing import Any

from psycopg.types.json import Jsonb

from knowledge_portal.application.errors import PersistenceError
from knowledge_portal.domain.identity.entities import ActorId, ActorProfile
from knowledge_portal.infrastructure.persistence.postgres_session import PostgresSession


class InMemoryActorDirectory:
    """Actors seen at sign-in.

    Every request records its actor outside any unit of work, so the directory
    takes the shared graph lock itself. A write from another thread must never
    land inside a transaction that thread does not own: the transaction would
    count it as its own write and roll it back.
    """

    def __init__(self, actors: tuple[ActorProfile, ...] = (), *, lock: RLock | None = None) -> None:
        self._actors = {actor.id: actor for actor in actors}
        self._lock = lock or RLock()

    def snapshot_state(self) -> Any:
        return deepcopy((self._actors,))

    def restore_state(self, state: Any) -> None:
        (self._actors,) = deepcopy(state)

    def record(self, actor: ActorProfile) -> None:
        with self._lock:
            self._actors[actor.id] = actor

    def get(self, actor_id: ActorId) -> ActorProfile | None:
        with self._lock:
            return self._actors.get(actor_id)

    def search(self, query: str | None, limit: int) -> list[ActorProfile]:
        needle = (query or "").strip().casefold()
        with self._lock:
            actors = tuple(self._actors.values())
        matches = [
            actor
            for actor in actors
            if not needle
            or needle in actor.display_name.casefold()
            or (actor.email is not None and needle in actor.email.casefold())
        ]
        return sorted(matches, key=lambda actor: actor.display_name.casefold())[:limit]


class PostgresActorDirectory:
    def __init__(self, store: PostgresSession) -> None:
        self._store = store

    def record(self, actor: ActorProfile) -> None:
        with self._store.connection() as connection:
            connection.execute(
                """
                INSERT INTO actor_profiles (actor_id, payload) VALUES (%s, %s)
                ON CONFLICT (actor_id) DO UPDATE
                SET payload = EXCLUDED.payload, last_seen_at = now()
                """,
                (actor.id.value, Jsonb(_to_payload(actor))),
            )

    def get(self, actor_id: ActorId) -> ActorProfile | None:
        with self._store.connection() as connection:
            row = connection.execute(
                "SELECT payload FROM actor_profiles WHERE actor_id = %s", (actor_id.value,)
            ).fetchone()
        return _from_payload(row[0]) if row is not None else None

    def search(self, query: str | None, limit: int) -> list[ActorProfile]:
        needle = f"%{(query or '').strip()}%"
        with self._store.connection() as connection:
            rows = connection.execute(
                """
                SELECT payload FROM actor_profiles
                WHERE %s = '%%' OR payload->>'display_name' ILIKE %s
                    OR COALESCE(payload->>'email', '') ILIKE %s
                ORDER BY lower(payload->>'display_name') LIMIT %s
                """,
                (needle, needle, needle, limit),
            ).fetchall()
        return [_from_payload(row[0]) for row in rows]


def _to_payload(actor: ActorProfile) -> dict[str, object]:
    # Roles are never stored: they come from the identity provider on each request.
    return {"id": actor.id.value, "display_name": actor.display_name, "email": actor.email}


def _from_payload(value: object) -> ActorProfile:
    if not isinstance(value, dict):
        raise PersistenceError("Stored actor profile must be a JSON object.")
    actor_id, name, email = value.get("id"), value.get("display_name"), value.get("email")
    if not isinstance(actor_id, str) or not isinstance(name, str):
        raise PersistenceError("Stored actor profile needs an id and a display name.")
    if email is not None and not isinstance(email, str):
        raise PersistenceError("Stored actor email must be text.")
    return ActorProfile(ActorId(actor_id), name, email)
