"""Who is signed in, how to sign in, and which knowledge admins this service knows."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from knowledge_portal.application.use_cases.identity_access import SearchKnownActors
from knowledge_portal.domain.identity.entities import ActorProfile
from knowledge_portal.interfaces.api.dependencies import (
    ContainerDep,
    CurrentActorDep,
    get_search_known_actors,
    require_authenticated_actor,
)
from knowledge_portal.interfaces.api.schemas.identity import (
    ActorResponse,
    IdentityConfigResponse,
    LoginChoiceResponse,
)

public_router = APIRouter(prefix="/identity", tags=["identity"])
router = APIRouter(
    prefix="/identity", tags=["identity"], dependencies=[Depends(require_authenticated_actor)]
)


def actor_response(actor: ActorProfile) -> ActorResponse:
    return ActorResponse(
        id=actor.id.value,
        display_name=actor.display_name,
        email=actor.email,
        roles=sorted(actor.roles),
    )


@public_router.get("/config", response_model=IdentityConfigResponse)
def identity_config(container: ContainerDep) -> IdentityConfigResponse:
    settings = container.settings
    offline = settings.identity_provider.value == "fake"
    # Every offline persona, admitted or not, so the sign-in picker can show both.
    fake_actors = [actor_response(item) for item in container.offline_personas]
    login_choices: list[LoginChoiceResponse] = []
    if not offline:
        if settings.oidc_company_sso_enabled:
            login_choices.append(
                LoginChoiceResponse(
                    id="microsoft",
                    label="Continue with Microsoft",
                    authorization_parameters={"kc_idp_hint": settings.oidc_company_sso_alias},
                )
            )
        if settings.oidc_password_login_enabled:
            login_choices.append(
                LoginChoiceResponse(
                    id="password",
                    label="Continue with email and password",
                    authorization_parameters={},
                )
            )
    return IdentityConfigResponse(
        mode=settings.identity_provider,
        authority=settings.oidc_issuer_url or None,
        audience=settings.oidc_audience or None,
        client_id=settings.oidc_client_id or None,
        scopes=None if offline else settings.oidc_scopes,
        fake_actors=fake_actors,
        login_choices=login_choices,
    )


@router.get("/me", response_model=ActorResponse)
def current_actor(actor: CurrentActorDep) -> ActorResponse:
    return actor_response(actor)


@router.get("/actors", response_model=list[ActorResponse])
def search_actors(
    use_case: Annotated[SearchKnownActors, Depends(get_search_known_actors)],
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[ActorResponse]:
    """Knowledge admins who have signed in: the people a document can be handed to."""
    return [actor_response(item) for item in use_case.execute(q, limit)]
