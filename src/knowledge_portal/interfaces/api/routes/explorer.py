"""The product architecture explorer: open to anyone signed in (requirement-portal ADR-0101).

These are the only public routes that do not require ``knowledge_admin``. They read the
catalogue version in service, an offering's plans and prices from the product catalog, and
who is reading; nothing here writes, and drafts, documents and history stay behind the
admin gate.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from knowledge_portal.application.use_cases.architecture_explorer import ExploreArchitecture
from knowledge_portal.application.use_cases.catalog_plans import ReadCatalogPlans
from knowledge_portal.interfaces.api.dependencies import (
    SignedInActorDep,
    get_catalog_plans,
    get_explore_architecture,
)
from knowledge_portal.interfaces.api.routes.identity import actor_response
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (
    CatalogPlansResponse,
    ExplorerReleaseResponse,
)
from knowledge_portal.interfaces.api.schemas.identity import ActorResponse

router = APIRouter(prefix="/explorer", tags=["explorer"])
ExploreDep = Annotated[ExploreArchitecture, Depends(get_explore_architecture)]
PlansDep = Annotated[ReadCatalogPlans, Depends(get_catalog_plans)]


@router.get("/me", response_model=ActorResponse)
def reader(actor: SignedInActorDep) -> ActorResponse:
    """Who is reading, admin or not."""
    return actor_response(actor)


@router.get("/release", response_model=ExplorerReleaseResponse)
def release_in_service(explore: ExploreDep, actor: SignedInActorDep) -> ExplorerReleaseResponse:
    """The catalogue version in service, as the explorer reads it."""
    return ExplorerReleaseResponse.from_domain(explore.in_service())


@router.get("/offerings/{offering_id}/plans", response_model=CatalogPlansResponse)
def offering_plans(
    offering_id: Annotated[str, Path(max_length=200)], plans: PlansDep, actor: SignedInActorDep
) -> CatalogPlansResponse:
    """An offering's plans and prices, read live from the product catalog by its code."""
    return CatalogPlansResponse.from_domain(plans.for_offering(offering_id))
