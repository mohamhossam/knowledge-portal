"""The app API matches its committed contract (ADR-0126).

`contracts/knowledge-apps.openapi.json` is what apps build their HTTP adapters against;
each release publishes it.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from knowledge_portal.interfaces.api.routes.apps import contract_openapi

CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "knowledge-apps.openapi.json"


def test_the_app_api_matches_its_committed_contract() -> None:
    committed = json.loads(CONTRACT.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(contract_openapi(), sort_keys=True)), (
        "contracts/knowledge-apps.openapi.json is stale; regenerate it from "
        "routes.apps.contract_openapi() and review the change with the apps that call it."
    )


def test_the_contract_covers_every_route_apps_use() -> None:
    paths = json.loads(CONTRACT.read_text(encoding="utf-8"))["paths"]
    assert set(paths) == {
        "/apps/v2/architecture/match",
        # A whole requirement's verdict, systems, gaps and owners (ontology plan Phase 3).
        "/apps/v2/architecture/assess",
        "/apps/v2/library/published",
        "/apps/v2/library/search",
        "/apps/v2/library/retrieve",
        "/apps/v2/events",
        "/apps/v2/library/passages",
        "/apps/v2/architecture/releases/{release_id}/evidence/{chunk_id}",
        # An app delivers an approved backlog here.
        "/apps/v2/change-requests",
        # An app sends each closed or removed Epic here (ontology plan Phase 7).
        "/apps/v2/change-requests/deliveries",
        # An app sends each verdict decision here (ontology plan Phase 5).
        "/apps/v2/architecture/precedents",
        # A published historic requirement's content, a page at a time (ADR-0102).
        "/apps/v2/historic-requirements/{historic_requirement_id}/passages",
        "/apps/v2/historic-requirements/{historic_requirement_id}/items",
    }


def test_the_app_routes_stay_out_of_the_public_openapi(client: TestClient) -> None:
    public = client.get("/openapi.json").json()["paths"]
    assert not any(path.startswith("/apps") for path in public)
