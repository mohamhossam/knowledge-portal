"""Who is calling, and whether they may use the knowledge portal at all."""

from __future__ import annotations

from smb_kernel.identity.ports import IdentityCredential, IdentityProviderPort

from knowledge_portal.application.ports.actor_directory import ActorDirectoryPort
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.domain.identity.errors import AuthorizationDeniedError

KNOWLEDGE_ADMIN = "knowledge_admin"


class ResolveCurrentActor:
    """Authenticate, admit knowledge admins only, and remember who signed in.

    The directory holds only admitted actors, so a document can be handed over
    only to someone who can use the portal (requirement-portal ADR-0099).
    """

    def __init__(self, identity: IdentityProviderPort, actors: ActorDirectoryPort) -> None:
        self._identity = identity
        self._actors = actors

    def execute(self, credential: IdentityCredential) -> ActorProfile:
        actor = self._identity.authenticate(credential)
        if KNOWLEDGE_ADMIN not in actor.roles:
            raise AuthorizationDeniedError("The knowledge portal is for knowledge admins.")
        self._actors.record(actor)
        return actor


class ResolveSignedInActor:
    """Authenticate anyone signed in, admin or not, for what every signed-in person may read.

    Only the product architecture explorer uses it (requirement-portal ADR-0101). It admits
    no one to curation and remembers no one: the directory holds admitted admins only.
    """

    def __init__(self, identity: IdentityProviderPort) -> None:
        self._identity = identity

    def execute(self, credential: IdentityCredential) -> ActorProfile:
        return self._identity.authenticate(credential)


class SearchKnownActors:
    def __init__(self, actors: ActorDirectoryPort) -> None:
        self._actors = actors

    def execute(self, query: str | None, limit: int) -> tuple[ActorProfile, ...]:
        return tuple(self._actors.search(query, limit))
