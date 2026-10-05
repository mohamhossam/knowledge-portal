"""The product architecture explorer: open to anyone signed in (requirement-portal ADR-0101).

These are the only public routes that do not require ``knowledge_admin``. They read the
catalogue version in service and who is reading it; nothing here writes, and drafts,
documents and history stay behind the admin gate.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from knowledge_portal.application.use_cases.architecture_explorer import ExploreArchitecture
from knowledge_portal.interfaces.api.dependencies import (
    SignedInActorDep,
    get_explore_architecture,
)
from knowledge_portal.interfaces.api.routes.identity import actor_response
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    ExplorerReleaseResponse,
)
from knowledge_portal.interfaces.api.schemas.identity import ActorResponse

router = APIRouter(prefix="/explorer", tags=["explorer"])
ExploreDep = Annotated[ExploreArchitecture, Depends(get_explore_architecture)]


@router.get("/me", response_model=ActorResponse)
def reader(actor: SignedInActorDep) -> ActorResponse:
    """Who is reading, admin or not."""
    return actor_response(actor)


@router.get("/release", response_model=ExplorerReleaseResponse)
def release_in_service(explore: ExploreDep, actor: SignedInActorDep) -> ExplorerReleaseResponse:
    """The catalogue version in service, as the explorer reads it."""
    return ExplorerReleaseResponse.from_domain(explore.in_service())
