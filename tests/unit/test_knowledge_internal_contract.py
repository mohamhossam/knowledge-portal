"""This service's internal API matches its committed contract (requirement-portal ADR-0099).

`contracts/knowledge-internal.openapi.json` is what requirement work's HTTP
adapters are built against; requirement-portal keeps the same file and tests
its adapters against it.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from knowledge_portal.interfaces.api.routes.internal import contract_openapi

CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "knowledge-internal.openapi.json"


def test_the_internal_api_matches_its_committed_contract() -> None:
    committed = json.loads(CONTRACT.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(contract_openapi(), sort_keys=True)), (
        "contracts/knowledge-internal.openapi.json is stale; regenerate it from "
        "routes.internal.contract_openapi() and review the change with both services."
    )


def test_the_contract_covers_every_seam_requirement_work_uses() -> None:
    paths = json.loads(CONTRACT.read_text(encoding="utf-8"))["paths"]
    assert set(paths) == {
        "/internal/architecture/match",
        "/internal/library/published",
        "/internal/library/search",
        "/internal/library/retrieve",
        "/internal/events",
        "/internal/library/passages",
        "/internal/architecture/releases/{release_id}/evidence/{chunk_id}",
        # requirement-portal delivers an approved backlog here (ADR-0101, step 7).
        "/internal/change-requests",
    }


def test_the_internal_routes_stay_out_of_the_public_openapi(client: TestClient) -> None:
    public = client.get("/openapi.json").json()["paths"]
    assert not any(path.startswith("/internal") for path in public)
