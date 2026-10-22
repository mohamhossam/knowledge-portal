"""Write the app API's OpenAPI contract, the one apps build against (ADR-0126)."""

from __future__ import annotations

import json
from pathlib import Path

from knowledge_portal.interfaces.api.routes.apps import contract_openapi

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "contracts" / "knowledge-apps.openapi.json"


def main() -> None:
    OUTPUT.write_text(
        json.dumps(contract_openapi(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
