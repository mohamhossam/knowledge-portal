"""The committed public contract must match the running API."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from knowledge_portal.interfaces.api.main import app

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / "contracts" / "knowledge-public.openapi.json"


def test_openapi_snapshot_matches_application() -> None:
    committed: dict[str, Any] = json.loads(SNAPSHOT.read_text(encoding="utf-8"))

    assert committed == app.openapi(), (
        "contracts/knowledge-public.openapi.json is stale; run "
        ".venv/Scripts/python scripts/dump_openapi.py and review the change."
    )
