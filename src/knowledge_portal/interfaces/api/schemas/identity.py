"""HTTP schemas for authenticated actors."""

from pydantic import BaseModel, Field

from knowledge_portal.infrastructure.config.options import IdentityProvider


class ActorResponse(BaseModel):
    id: str
    display_name: str
    email: str | None
    roles: list[str] = Field(default_factory=list)


class LoginChoiceResponse(BaseModel):
    id: str
    label: str
    authorization_parameters: dict[str, str]


class IdentityConfigResponse(BaseModel):
    mode: IdentityProvider
    authority: str | None
    audience: str | None
    client_id: str | None
    scopes: str | None
    fake_actors: list[ActorResponse]
    login_choices: list[LoginChoiceResponse]
