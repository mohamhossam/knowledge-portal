"""Write the catalogue lab's bundled sample from the committed catalogue file.

`frontend/src/architecture/fixtures/smb-release.json` is the draft a fake-identity API
holds after importing `catalogues/smb-architecture.yaml`, as the API's read schema sends
it: every field the screens read, the derived flows (`edges`, `channel_edges`,
`shared_edges`) and the vocabulary among them. The lab's "Sample JSON" and the frontend
tests read it; `tests/unit/test_catalogue_fixture.py` fails when it is stale.

    uv run python scripts/dump_catalogue_fixture.py           # rewrite the sample
    uv run python scripts/dump_catalogue_fixture.py --check   # exit 1 when it is stale
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from knowledge_portal.infrastructure.architecture.knowledge_yaml import (  # noqa: E402
    knowledge_from_yaml,
)
from knowledge_portal.interfaces.api.schemas.architecture_knowledge import (  # noqa: E402
    KnowledgeReleaseResponse,
)
from scripts._catalogue_seed import FULL_CATALOGUE_FILE, ROOT  # noqa: E402

FIXTURE = ROOT / "frontend" / "src" / "architecture" / "fixtures" / "smb-release.json"

# The draft as the frontend tests have always known it: these never come from the file.
DRAFT_ID = "smb-architecture-draft"
DRAFT_NAME = "SMB architecture: Business Pro Plus"
DRAFT_REVISION = 2
DRAFT_CREATED_BY = "fake-owner"


def sample_release(catalogue: Path = FULL_CATALOGUE_FILE) -> dict[str, Any]:
    knowledge = knowledge_from_yaml(catalogue.read_text(encoding="utf-8"))
    draft = replace(
        knowledge,
        id=DRAFT_ID,
        name=DRAFT_NAME,
        revision=DRAFT_REVISION,
        created_by=DRAFT_CREATED_BY,
    )
    return KnowledgeReleaseResponse.from_domain(draft).model_dump(mode="json")


def render(release: dict[str, Any]) -> str:
    return json.dumps(release, indent=1, ensure_ascii=False) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="exit 1 when the sample is stale")
    arguments = parser.parse_args()
    text = render(sample_release())
    if arguments.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            raise SystemExit(
                f"{FIXTURE.relative_to(ROOT)} is stale: run scripts/dump_catalogue_fixture.py."
            )
        return
    FIXTURE.write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {FIXTURE.relative_to(ROOT)} ({len(text) // 1024} KB).")


if __name__ == "__main__":
    main()
