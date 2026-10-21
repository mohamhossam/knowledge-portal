"""Write the internal OpenAPI contract requirement work's adapters pin (ADR-0099)."""

from __future__ import annotations

import json
from pathlib import Path

from knowledge_portal.interfaces.api.routes.internal import contract_openapi

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "contracts" / "knowledge-internal.openapi.json"


def main() -> None:
    OUTPUT.write_text(
        json.dumps(contract_openapi(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
