"""Identity selection: who is calling, and which admins the directory knows up front."""

from __future__ import annotations

from contextlib import ExitStack
from time import monotonic

import httpx as httpx
from smb_kernel.http.service_auth import (
    ServiceCallerVerifier,
    ServiceJwtVerifier,
    ServiceTokenVerifier,
    ServiceVerifierChain,
)
from smb_kernel.identity.oidc import OidcIdentityProvider, OidcSigningKeys
from smb_kernel.identity.ports import IdentityProviderPort

from knowledge_portal.application.ports.actor_directory import ActorDirectoryPort
from knowledge_portal.application.use_cases.identity_access import KNOWLEDGE_ADMIN
from knowledge_portal.infrastructure.config.options import IdentityProvider
from knowledge_portal.infrastructure.config.settings import Settings
from knowledge_portal.infrastructure.identity.fake_identity import (
    FAKE_ACTORS,
    FakeIdentityProvider,
)

# The audience a token the OIDC issuer grants requirement work must carry to reach
# this service's internal API. Requirement work's service client adds it.
INTERNAL_AUDIENCE = "knowledge-internal"


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


def build_internal_verifier(
    settings: Settings, resources: ExitStack
) -> ServiceCallerVerifier | None:
    """Who may call /internal: requirement work, named "requirements" (ADR-0099).

    It proves itself with the shared REQUIREMENT_SERVICE_TOKEN, with a token the
    OIDC issuer granted its client REQUIREMENT_SERVICE_CLIENT_ID
    (requirement-portal ADR-0104), or with either while a deployment moves over.
    With neither configured there is no caller, and the internal API is not served.
    """
    verifiers: list[ServiceCallerVerifier] = []
    if settings.requirement_service_token is not None:
        verifiers.append(ServiceTokenVerifier({"requirements": settings.requirement_service_token}))
    if settings.requirement_service_client_id is not None:
        keys = OidcSigningKeys(
            settings.oidc_issuer_url,
            resources.enter_context(httpx.Client(timeout=10)),
            monotonic,
            jwks_ttl_seconds=settings.oidc_jwks_ttl_seconds,
            unknown_key_ttl_seconds=settings.oidc_unknown_key_ttl_seconds,
            unknown_key_cache_size=settings.oidc_unknown_key_cache_size,
        )
        verifiers.append(
            ServiceJwtVerifier(
                keys,
                INTERNAL_AUDIENCE,
                {settings.requirement_service_client_id: "requirements"},
                allowed_algorithms=settings.oidc_allowed_algorithms,
            )
        )
    if not verifiers:
        return None
    return verifiers[0] if len(verifiers) == 1 else ServiceVerifierChain(*verifiers)
