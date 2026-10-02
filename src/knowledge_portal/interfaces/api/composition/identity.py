"""Identity selection: who is calling, and which admins the directory knows up front."""

from __future__ import annotations

from contextlib import ExitStack
from time import monotonic

import httpx as httpx
from smb_kernel.identity.oidc import OidcIdentityProvider
from smb_kernel.identity.ports import IdentityProviderPort

from knowledge_portal.application.ports.actor_directory import ActorDirectoryPort
from knowledge_portal.application.use_cases.identity_access import KNOWLEDGE_ADMIN
from knowledge_portal.infrastructure.config.options import IdentityProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.identity.fake_identity import (
    FAKE_ACTORS,
    FakeIdentityProvider,
)


def build_identity(
    settings: Settings,
    resources: ExitStack,
    actor_directory: ActorDirectoryPort,
    override: IdentityProviderPort | None,
) -> IdentityProviderPort:
    """Select the identity provider; fake identity also seeds its admitted actors."""
    if settings.identity_provider is IdentityProvider.FAKE:
        for fake_actor in FAKE_ACTORS:
            if KNOWLEDGE_ADMIN in fake_actor.roles:
                actor_directory.record(fake_actor)
    if override is not None:
        return override
    if settings.identity_provider is IdentityProvider.FAKE:
        return FakeIdentityProvider()
    return OidcIdentityProvider(
        settings.oidc_issuer_url,
        settings.oidc_audience,
        settings.oidc_allowed_algorithms,
        resources.enter_context(httpx.Client(timeout=10)),
        monotonic,
        jwks_ttl_seconds=settings.oidc_jwks_ttl_seconds,
        unknown_key_ttl_seconds=settings.oidc_unknown_key_ttl_seconds,
        unknown_key_cache_size=settings.oidc_unknown_key_cache_size,
        roles_claim=settings.oidc_roles_claim,
    )
