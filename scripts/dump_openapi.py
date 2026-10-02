"""Write the public OpenAPI contract the knowledge portal's browser client is built from."""

from __future__ import annotations

import json
from pathlib import Path

from knowledge_portal.interfaces.api.main import app

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "contracts" / "knowledge-public.openapi.json"


def main() -> None:
    OUTPUT.write_text(
        json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
