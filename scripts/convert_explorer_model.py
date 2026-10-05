"""Convert the Product Architecture Explorer's model into a catalogue file. One-off seed.

The explorer in smb-ai-requirement-agent kept its architecture in
``tools/architecture-explorer/src/data/model.json`` (schema 6). This writes the same
facts as a JSON catalogue file. An admin then imports that file into a draft release
(Catalogue › draft › Catalogue file: preview, then import), reviews it, and publishes it
like any other draft. After that the explorer's facts live in the catalogue and are
kept there, by document extraction or by hand (requirement-portal ADR-0101).

    uv run python scripts/convert_explorer_model.py \\
        --model ../smb-ai-requirement-agent/tools/architecture-explorer/src/data/model.json \\
        --out explorer-catalogue.json

The report lists what the catalogue cannot hold yet. Nothing is invented to fill it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from knowledge_portal.infrastructure.architecture.explorer_model import (  # noqa: E402
    read_explorer_model,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", type=Path, required=True, help="the explorer's model.json")
    parser.add_argument("--out", type=Path, required=True, help="the catalogue file to write")
    args = parser.parse_args(argv)
    seed = read_explorer_model(json.loads(args.model.read_text(encoding="utf-8")))
    args.out.write_text(json.dumps(seed.mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}.")
    for line in seed.report:
        print(f"- {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
