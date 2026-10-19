"""The Golden set report: start a run of the impact mapper over the golden set, read them.

Every route is a knowledge admin's. A run scores the mapper with the configured models on a
throwaway copy of the golden set's catalogue; it never touches the live catalogue.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from knowledge_portal.application.use_cases.golden_runs import GoldenSetRuns
from knowledge_portal.interfaces.api.dependencies import (
    KnowledgeActorDep,
    get_golden_set_runs,
    limit_provider_calls,
    require_authenticated_actor,
)
from knowledge_portal.interfaces.api.schemas.golden_runs import (
    GoldenRunListResponse,
    GoldenRunRequest,
    GoldenRunResponse,
    GoldenRunSummaryResponse,
    GoldenSetInfoResponse,
)

router = APIRouter(
    prefix="/evaluation",
    tags=["golden set report"],
    dependencies=[Depends(require_authenticated_actor)],
)
RunsDep = Annotated[GoldenSetRuns, Depends(get_golden_set_runs)]


@router.get("/golden-set", response_model=GoldenSetInfoResponse)
def golden_set(runs: RunsDep, actor: KnowledgeActorDep) -> GoldenSetInfoResponse:
    """What a run would score and with which model, and the floors scores are held to."""
    return GoldenSetInfoResponse.from_domain(runs.info(actor))


@router.get("/golden-runs", response_model=GoldenRunListResponse)
def list_runs(runs: RunsDep, actor: KnowledgeActorDep) -> GoldenRunListResponse:
    """Newest first, with scores and without every case's answer."""
    return GoldenRunListResponse(
        runs=[GoldenRunSummaryResponse.from_domain(view) for view in runs.list(actor)]
    )


@router.post(
    "/golden-runs",
    status_code=202,
    response_model=GoldenRunResponse,
    dependencies=[Depends(limit_provider_calls)],
)
def start_run(body: GoldenRunRequest, runs: RunsDep, actor: KnowledgeActorDep) -> GoldenRunResponse:
    """Queue a run; it scores in the background and the page follows its progress."""
    return GoldenRunResponse.from_domain(runs.start(body.options(), actor))


@router.get("/golden-runs/{run_id}", response_model=GoldenRunResponse)
def read_run(run_id: str, runs: RunsDep, actor: KnowledgeActorDep) -> GoldenRunResponse:
    return GoldenRunResponse.from_domain(runs.read(run_id, actor))
